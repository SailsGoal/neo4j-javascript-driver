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

import Connection from '../../src/internal/connection'
import { textChangeRangeIsUnchanged } from 'typescript'

/**
 * This class is like a mock of {@link Connection} that tracks invocations count.
 * It tries to maintain same "interface" as {@link Connection}.
 * It could be replaced with a proper mock by a library like testdouble.
 * At the time of writing such libraries require {@link Proxy} support but browser tests execute in
 * PhantomJS which does not support proxies.
 */
export default class FakeConnection extends Connection {
  constructor () {
    super(null)

    this._open = true
    this._id = 0
    this._databaseId = null
    this.creationTimestamp = Date.now()

    this.resetInvoked = 0
    this.releaseInvoked = 0
    this.seenStatements = []
    this.seenParameters = []
    this.seenProtocolOptions = []
    this._server = {}
  }

  get id () {
    return this._id
  }

  get databaseId () {
    return this._databaseId
  }

  set databaseId (value) {
    this._databaseId = value
  }

  get server () {
    return this._server
  }

  get version () {
    return this._server.version
  }

  set version (value) {
    this._server.version = value
  }

  protocol () {
    // return fake protocol object that simply records seen statements and parameters
    return {
      run: (statement, parameters, protocolOptions) => {
        this.seenStatements.push(statement)
        this.seenParameters.push(parameters)
        this.seenProtocolOptions.push(protocolOptions)
      }
    }
  }

  resetAndFlush () {
    this.resetInvoked++
    return Promise.resolve()
  }

  _release () {
    this.releaseInvoked++
    return Promise.resolve()
  }

  isOpen () {
    return this._open
  }

  isNeverReleased () {
    return this.isReleasedTimes(0)
  }

  isReleasedOnce () {
    return this.isReleasedTimes(1)
  }

  isReleasedTimes (times) {
    return this.resetInvoked === times && this.releaseInvoked === times
  }

  withServerVersion (version) {
    this.version = version
    return this
  }

  withCreationTimestamp (value) {
    this.creationTimestamp = value
    return this
  }

  closed () {
    this._open = false
    return this
  }
}
