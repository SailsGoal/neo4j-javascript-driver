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

import Session from './session'
import RxSession from './session-rx'
import { Parameters } from './statement-runner'
import { Neo4jError } from './error'
import { ServerInfo } from './result-summary'

declare interface AuthToken {
  scheme: string
  principal: string
  credentials: string
  realm?: string
  parameters?: Parameters
}

declare type EncryptionLevel = 'ENCRYPTION_ON' | 'ENCRYPTION_OFF'
declare type TrustStrategy =
  | 'TRUST_ALL_CERTIFICATES'
  | 'TRUST_CUSTOM_CA_SIGNED_CERTIFICATES'
  | 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES'

declare type LogLevel = 'error' | 'warn' | 'info' | 'debug'

declare interface LoggingConfig {
  level?: LogLevel
  logger: (level: LogLevel, message: string) => void
}

declare interface Config {
  encrypted?: boolean | EncryptionLevel
  trust?: TrustStrategy
  trustedCertificates?: string[]
  knownHosts?: string
  maxConnectionPoolSize?: number
  maxTransactionRetryTime?: number
  maxConnectionLifetime?: number
  connectionTimeout?: number
  disableLosslessIntegers?: boolean
  logging?: LoggingConfig
}

declare type SessionMode = 'READ' | 'WRITE'

declare const READ: SessionMode
declare const WRITE: SessionMode

declare interface Driver {
  session({
    defaultAccessMode,
    bookmarks,
    database
  }?: {
    defaultAccessMode?: SessionMode
    bookmarks?: string | string[]
    database?: string
  }): Session

  rxSession({
    defaultAccessMode,
    bookmarks,
    database
  }?: {
    defaultAccessMode?: SessionMode
    bookmarks?: string | string[]
    database?: string
  }): RxSession

  close(): Promise<void>

  verifyConnectivity(): Promise<ServerInfo>
}

export {
  Driver,
  READ,
  WRITE,
  AuthToken,
  Config,
  EncryptionLevel,
  TrustStrategy,
  SessionMode
}

export default Driver
