/**
 * Copyright (c) 2002-2019 "Neo4j,"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import Result from './result'
import { validateStatementAndParameters } from './internal/util'
import ConnectionHolder, {
  EMPTY_CONNECTION_HOLDER
} from './internal/connection-holder'
import Bookmark from './internal/bookmark'
import TxConfig from './internal/tx-config'

import {
  ResultStreamObserver,
  FailedObserver,
  CompletedObserver
} from './internal/stream-observers'
import { newError } from './error'

/**
 * Represents a transaction in the Neo4j database.
 *
 * @access public
 */
class Transaction {
  /**
   * @constructor
   * @param {ConnectionHolder} connectionHolder - the connection holder to get connection from.
   * @param {function()} onClose - Function to be called when transaction is committed or rolled back.
   * @param {function(bookmark: Bookmark)} onBookmark callback invoked when new bookmark is produced.
   * @param {boolean} reactive whether this transaction generates reactive streams
   */
  constructor ({ connectionHolder, onClose, onBookmark, reactive }) {
    this._connectionHolder = connectionHolder
    this._reactive = reactive
    this._state = _states.ACTIVE
    this._onClose = onClose
    this._onBookmark = onBookmark
    this._onError = this._onErrorCallback.bind(this)
    this._onComplete = this._onCompleteCallback.bind(this)
  }

  _begin (bookmark, txConfig) {
    this._connectionHolder
      .getConnection()
      .then(conn =>
        conn.protocol().beginTransaction({
          bookmark: bookmark,
          txConfig: txConfig,
          mode: this._connectionHolder.mode(),
          database: this._connectionHolder.database(),
          beforeError: this._onError,
          afterComplete: this._onComplete
        })
      )
      .catch(error => this._onError(error))
  }

  /**
   * Run Cypher statement
   * Could be called with a statement object i.e.: `{text: "MATCH ...", parameters: {param: 1}}`
   * or with the statement and parameters as separate arguments.
   * @param {mixed} statement - Cypher statement to execute
   * @param {Object} parameters - Map with parameters to use in statement
   * @return {Result} New Result
   */
  run (statement, parameters) {
    const { query, params } = validateStatementAndParameters(
      statement,
      parameters
    )

    return this._state.run(query, params, {
      connectionHolder: this._connectionHolder,
      onError: this._onError,
      onComplete: this._onComplete,
      reactive: this._reactive
    })
  }

  /**
   * Commits the transaction and returns the result.
   *
   * After committing the transaction can no longer be used.
   *
   * @returns {Result} New Result
   */
  commit () {
    let committed = this._state.commit({
      connectionHolder: this._connectionHolder,
      onError: this._onError,
      onComplete: this._onComplete
    })
    this._state = committed.state
    // clean up
    this._onClose()
    return new Promise((resolve, reject) => {
      committed.result.subscribe({
        onCompleted: () => resolve(),
        onError: error => reject(error)
      })
    })
  }

  /**
   * Rollbacks the transaction.
   *
   * After rolling back, the transaction can no longer be used.
   *
   * @returns {Result} New Result
   */
  rollback () {
    let rolledback = this._state.rollback({
      connectionHolder: this._connectionHolder,
      onError: this._onError,
      onComplete: this._onComplete
    })
    this._state = rolledback.state
    // clean up
    this._onClose()
    return new Promise((resolve, reject) => {
      rolledback.result.subscribe({
        onCompleted: () => resolve(),
        onError: error => reject(error)
      })
    })
  }

  /**
   * Check if this transaction is active, which means commit and rollback did not happen.
   * @return {boolean} `true` when not committed and not rolled back, `false` otherwise.
   */
  isOpen () {
    return this._state === _states.ACTIVE
  }

  _onErrorCallback (err) {
    // error will be "acknowledged" by sending a RESET message
    // database will then forget about this transaction and cleanup all corresponding resources
    // it is thus safe to move this transaction to a FAILED state and disallow any further interactions with it
    this._state = _states.FAILED
    this._onClose()

    // release connection back to the pool
    return this._connectionHolder.releaseConnection()
  }

  _onCompleteCallback (meta) {
    this._onBookmark(new Bookmark(meta.bookmark))
  }
}

let _states = {
  // The transaction is running with no explicit success or failure marked
  ACTIVE: {
    commit: ({ connectionHolder, onError, onComplete }) => {
      return {
        result: finishTransaction(true, connectionHolder, onError, onComplete),
        state: _states.SUCCEEDED
      }
    },
    rollback: ({ connectionHolder, onError, onComplete }) => {
      return {
        result: finishTransaction(false, connectionHolder, onError, onComplete),
        state: _states.ROLLED_BACK
      }
    },
    run: (
      statement,
      parameters,
      { connectionHolder, onError, onComplete, reactive }
    ) => {
      // RUN in explicit transaction can't contain bookmarks and transaction configuration
      const observerPromise = connectionHolder
        .getConnection()
        .then(conn =>
          conn.protocol().run(statement, parameters, {
            bookmark: Bookmark.empty(),
            txConfig: TxConfig.empty(),
            mode: connectionHolder.mode(),
            database: connectionHolder.database(),
            beforeError: onError,
            afterComplete: onComplete,
            reactive: reactive
          })
        )
        .catch(error => new FailedObserver({ error, onError }))

      return newCompletedResult(observerPromise, statement, parameters)
    }
  },

  // An error has occurred, transaction can no longer be used and no more messages will
  // be sent for this transaction.
  FAILED: {
    commit: ({ connectionHolder, onError, onComplete }) => {
      return {
        result: newCompletedResult(
          new FailedObserver({
            error: newError(
              'Cannot commit this transaction, because it has been rolled back either because of an error or explicit termination.'
            ),
            onError
          }),
          'COMMIT',
          {}
        ),
        state: _states.FAILED
      }
    },
    rollback: ({ connectionHolder, onError, onComplete }) => {
      return {
        result: newCompletedResult(new CompletedObserver(), 'ROLLBACK', {}),
        state: _states.FAILED
      }
    },
    run: (
      statement,
      parameters,
      { connectionHolder, onError, onComplete, reactive }
    ) => {
      return newCompletedResult(
        new FailedObserver({
          error: newError(
            'Cannot run statement in this transaction, because it has been rolled back either because of an error or explicit termination.'
          ),
          onError
        }),
        statement,
        parameters
      )
    }
  },

  // This transaction has successfully committed
  SUCCEEDED: {
    commit: ({ connectionHolder, onError, onComplete }) => {
      return {
        result: newCompletedResult(
          new FailedObserver({
            error: newError(
              'Cannot commit this transaction, because it has already been committed.'
            ),
            onError
          }),
          'COMMIT',
          {}
        ),
        state: _states.SUCCEEDED
      }
    },
    rollback: ({ connectionHolder, onError, onComplete }) => {
      return {
        result: newCompletedResult(
          new FailedObserver({
            error: newError(
              'Cannot rollback this transaction, because it has already been committed.'
            ),
            onError
          }),
          'ROLLBACK',
          {}
        ),
        state: _states.SUCCEEDED
      }
    },
    run: (
      statement,
      parameters,
      { connectionHolder, onError, onComplete, reactive }
    ) => {
      return newCompletedResult(
        new FailedObserver({
          error: newError(
            'Cannot run statement in this transaction, because it has already been committed.'
          ),
          onError
        }),
        statement,
        parameters
      )
    }
  },

  // This transaction has been rolled back
  ROLLED_BACK: {
    commit: ({ connectionHolder, onError, onComplete }) => {
      return {
        result: newCompletedResult(
          new FailedObserver({
            error: newError(
              'Cannot commit this transaction, because it has already been rolled back.'
            ),
            onError
          }),
          'COMMIT',
          {}
        ),
        state: _states.ROLLED_BACK
      }
    },
    rollback: ({ connectionHolder, onError, onComplete }) => {
      return {
        result: newCompletedResult(
          new FailedObserver({
            error: newError(
              'Cannot rollback this transaction, because it has already been rolled back.'
            )
          }),
          'ROLLBACK',
          {}
        ),
        state: _states.ROLLED_BACK
      }
    },
    run: (
      statement,
      parameters,
      { connectionHolder, onError, onComplete, reactive }
    ) => {
      return newCompletedResult(
        new FailedObserver({
          error: newError(
            'Cannot run statement in this transaction, because it has already been rolled back.'
          ),
          onError
        }),
        statement,
        parameters
      )
    }
  }
}

/**
 *
 * @param {boolean} commit
 * @param {ConnectionHolder} connectionHolder
 * @param {function(err:Error): any} onError
 * @param {function(metadata:object): any} onComplete
 */
function finishTransaction (commit, connectionHolder, onError, onComplete) {
  const observerPromise = connectionHolder
    .getConnection()
    .then(connection => {
      if (commit) {
        return connection.protocol().commitTransaction({
          beforeError: onError,
          afterComplete: onComplete
        })
      } else {
        return connection.protocol().rollbackTransaction({
          beforeError: onError,
          afterComplete: onComplete
        })
      }
    })
    .catch(error => new FailedObserver({ error, onError }))

  // for commit & rollback we need result that uses real connection holder and notifies it when
  // connection is not needed and can be safely released to the pool
  return new Result(
    observerPromise,
    commit ? 'COMMIT' : 'ROLLBACK',
    {},
    connectionHolder
  )
}

/**
 * Creates a {@link Result} with empty connection holder.
 * For cases when result represents an intermediate or failed action, does not require any metadata and does not
 * need to influence real connection holder to release connections.
 * @param {ResultStreamObserver} observer - an observer for the created result.
 * @param {string} statement - the cypher statement that produced the result.
 * @param {Object} parameters - the parameters for cypher statement that produced the result.
 * @return {Result} new result.
 * @private
 */
function newCompletedResult (observerPromise, statement, parameters) {
  return new Result(
    Promise.resolve(observerPromise),
    statement,
    parameters,
    EMPTY_CONNECTION_HOLDER
  )
}

export default Transaction
