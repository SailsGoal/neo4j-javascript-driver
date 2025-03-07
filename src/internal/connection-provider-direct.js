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

import PooledConnectionProvider from './connection-provider-pooled'
import DelegateConnection from './connection-delegate'

export default class DirectConnectionProvider extends PooledConnectionProvider {
  constructor ({ id, config, log, address, userAgent, authToken }) {
    super({ id, config, log, userAgent, authToken })

    this._address = address
  }

  /**
   * See {@link ConnectionProvider} for more information about this method and
   * its arguments.
   */
  acquireConnection ({ accessMode, database, bookmarks } = {}) {
    return this._connectionPool
      .acquire(this._address)
      .then(connection => new DelegateConnection(connection, null))
  }
}
