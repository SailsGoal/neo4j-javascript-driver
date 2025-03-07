# Neo4j Driver for JavaScript

A database driver for Neo4j 3.0.0+.

Resources to get you started:

- Detailed docs _Not available yet_
- [Neo4j Manual](https://neo4j.com/docs/)
- [Neo4j Refcard](https://neo4j.com/docs/cypher-refcard/current/)

## What's New

- Upcoming version is now named as `4.0.0` instead of `2.0.0` to better align with server versions.
- Reactive API (built on top of RxJS) is now available with 4.0 version server, which includes reactive protocol improvements.
- Session instances can now be acquired against a specific database against a multi-database server, which is available with 4.0 version server.
- A new `driver.verifyConnectivity()` method is introduced for connectivity verification purposes.
- Driver default configuration for `encrypted` is now `false` (meaning that driver will only attempt clear text connections by default), and when encryption is explicitly enabled the default trust mode is TRUST_SYSTEM_CA_SIGNED_CERTIFICATES which relies upon underlying system's certificate trust settings.

## Breaking Changes

- Driver API is moved from `neo4j.v1` to `neo4j` namespace.
- `driver#session()` method now makes use of object destructuring rather than positional arguments (see [Acquiring a Session](#acquiring-a-session) for examples).
- `session#close()` and `driver#close()` both now return `Promise`s and no more accept callback function arguments.
- `driver.onError` and `driver.onCompleted` callbacks are completely removed. Errors should be monitored on related code paths (i.e. through `Promise#catch`, etc.).
- `bolt+routing` scheme is now renamed to `neo4j`. `neo4j` scheme is designed to work work with all possible 4.0 server deployments, but `bolt` scheme is still available for explicit single instance connections.

## Including the Driver

### In Node.js application

Stable channel:

```shell
npm install neo4j-driver
```

Pre-release channel:

```shell
npm install neo4j-driver@next
```

Please note that `@next` only points to pre-releases that are not suitable for production use.
To get the latest stable release omit `@next` part altogether or use `@latest` instead.

```javascript
var neo4j = require('neo4j-driver')
```

Driver instance should be closed when Node.js application exits:

```javascript
driver.close() // returns a Promise
```

otherwise application shutdown might hang or it might exit with a non-zero exit code.

### In web browser

We build a special browser version of the driver, which supports connecting to Neo4j over WebSockets.
It can be included in an HTML page using one of the following tags:

```html
<!-- Direct reference -->
<script src="lib/browser/neo4j-web.min.js"></script>

<!-- unpkg CDN non-minified -->
<script src="https://unpkg.com/neo4j-driver"></script>
<!-- unpkg CDN minified for production use, version X.Y.Z -->
<script src="https://unpkg.com/neo4j-driver@X.Y.Z/lib/browser/neo4j-web.min.js"></script>

<!-- jsDelivr CDN non-minified -->
<script src="https://cdn.jsdelivr.net/npm/neo4j-driver"></script>
<!-- jsDelivr CDN minified for production use, version X.Y.Z -->
<script src="https://cdn.jsdelivr.net/npm/neo4j-driver@X.Y.Z/lib/browser/neo4j-web.min.js"></script>
```

This will make a global `neo4j` object available, where you can access the driver API at `neo4j`\*:

```javascript
var driver = neo4j.driver(
  'neo4j://localhost',
  neo4j.auth.basic('neo4j', 'neo4j')
)
```

It is not required to explicitly close the driver on a web page. Web browser should gracefully close all open
WebSockets when the page is unloaded. However, driver instance should be explicitly closed when it's lifetime
is not the same as the lifetime of the web page:

```javascript
driver.close() // returns a Promise
```

## Usage examples

### Constructing a Driver

```javascript
// Create a driver instance, for the user neo4j with password neo4j.
// It should be enough to have a single driver per database per application.
var driver = neo4j.driver(
  'neo4j://localhost',
  neo4j.auth.basic('neo4j', 'neo4j')
)

// Close the driver when application exits.
// This closes all used network connections.
await driver.close()
```

### Acquiring a Session

#### Regular Session

```javascript
// Create a session to run Cypher statements in.
// Note: Always make sure to close sessions when you are done using them!
var session = driver.session()
```

##### with a Default Access Mode of `READ`

```javascript
var session = driver.session({ defaultAccessMode: neo4j.session.READ })
```

##### with Bookmarks

```javascript
var session = driver.session({
  bookmarks: [bookmark1FromPreviousSession, bookmark2FromPreviousSession]
})
```

##### against a Database

```javascript
var session = driver.session({
  database: 'foo',
  defaultAccessMode: neo4j.session.WRITE
})
```

#### Reactive Session

```javascript
// Create a reactive session to run Cypher statements in.
// Note: Always make sure to close sessions when you are done using them!
var rxSession = driver.rxSession()
```

##### with a Default Access Mode of `READ`

```javascript
var rxSession = driver.rxSession({ defaultAccessMode: neo4j.session.READ })
```

##### with Bookmarks

```javascript
var rxSession = driver.rxSession({
  bookmarks: [bookmark1FromPreviousSession, bookmark2FromPreviousSession]
})
```

##### against a Database

```javascript
var rxSession = driver.rxSession({
  database: 'foo',
  defaultAccessMode: neo4j.session.WRITE
})
```

### Executing Statements

#### Consuming Records with Streaming API

```javascript
// Run a Cypher statement, reading the result in a streaming manner as records arrive:
session
  .run('MERGE (alice:Person {name : $nameParam}) RETURN alice.name AS name', {
    nameParam: 'Alice'
  })
  .subscribe({
    onKeys: keys => {
      console.log(keys)
    },
    onNext: record => {
      console.log(record.get('name'))
    },
    onCompleted: () => {
      session.close() // returns a Promise
    },
    onError: error => {
      console.log(error)
    }
  })
```

Subscriber API allows following combinations of `onKeys`, `onNext`, `onCompleted` and `onError` callback invocations:

- zero or one `onKeys`,
- zero or more `onNext` followed by `onCompleted` when operation was successful. `onError` will not be invoked in this case
- zero or more `onNext` followed by `onError` when operation failed. Callback `onError` might be invoked after couple `onNext` invocations because records are streamed lazily by the database. `onCompleted` will not be invoked in this case.

#### Consuming Records with Promise API

```javascript
// the Promise way, where the complete result is collected before we act on it:
session
  .run('MERGE (james:Person {name : $nameParam}) RETURN james.name AS name', {
    nameParam: 'James'
  })
  .then(result => {
    result.records.forEach(record => {
      console.log(record.get('name'))
    })
  })
  .catch(error => {
    console.log(error)
  })
  .then(() => session.close())
```

#### Consuming Records with Reactive API

```javascript
rxSession
  .run('MERGE (james:Person {name: $nameParam}) RETURN james.name AS name', {
    nameParam: 'Bob'
  })
  .records()
  .pipe(
    map(record => record.get('name')),
    concat(rxSession.close())
  )
  .subscribe({
    next: data => console.log(data),
    complete: () => console.log('completed'),
    error: err => console.log(err)
  })
```

### Transaction functions

```javascript
// Transaction functions provide a convenient API with minimal boilerplate and
// retries on network fluctuations and transient errors. Maximum retry time is
// configured on the driver level and is 30 seconds by default:
// Applies both to standard and reactive sessions.
neo4j.driver('neo4j://localhost', neo4j.auth.basic('neo4j', 'neo4j'), {
  maxTransactionRetryTime: 30000
})
```

#### Reading with Async Session

```javascript
// It is possible to execute read transactions that will benefit from automatic
// retries on both single instance ('bolt' URI scheme) and Causal Cluster
// ('neo4j' URI scheme) and will get automatic load balancing in cluster deployments
var readTxResultPromise = session.readTransaction(txc => {
  // used transaction will be committed automatically, no need for explicit commit/rollback

  var result = txc.run('MATCH (person:Person) RETURN person.name AS name')
  // at this point it is possible to either return the result or process it and return the
  // result of processing it is also possible to run more statements in the same transaction
  return result
})

// returned Promise can be later consumed like this:
readTxResultPromise
  .then(result => {
    console.log(result.records)
  })
  .catch(error => {
    console.log(error)
  })
  .then(() => session.close())
```

#### Reading with Reactive Session

```javascript
rxSession
  .readTransaction(txc =>
    txc
      .run('MATCH (person:Person) RETURN person.name AS name')
      .records()
      .pipe(map(record => record.get('name')))
  )
  .subscribe({
    next: data => console.log(data),
    complete: () => console.log('completed'),
    error: err => console.log(error)
  })
```

#### Writing with Async Session

```javascript
// It is possible to execute write transactions that will benefit from automatic retries
// on both single instance ('bolt' URI scheme) and Causal Cluster ('neo4j' URI scheme)
var writeTxResultPromise = session.writeTransaction(async txc => {
  // used transaction will be committed automatically, no need for explicit commit/rollback

  var result = await txc.run(
    "MERGE (alice:Person {name : 'Alice' }) RETURN alice.name AS name"
  )
  // at this point it is possible to either return the result or process it and return the
  // result of processing it is also possible to run more statements in the same transaction
  return result.records.map(record => record.get('name'))
})

// returned Promise can be later consumed like this:
writeTxResultPromise
  .then(namesArray => {
    console.log(namesArray)
  })
  .catch(error => {
    console.log(error)
  })
  .then(() => session.close())
```

#### Writing with Reactive Session

```javascript
rxSession
  .writeTransaction(txc =>
    txc
      .run("MERGE (alice:Person {name: 'James'}) RETURN alice.name AS name")
      .records()
      .pipe(map(record => record.get('name')))
  )
  .subscribe({
    next: data => console.log(data),
    complete: () => console.log('completed'),
    error: error => console.log(error)
  })
```

### Explicit Transactions

#### With Async Session

```javascript
// run statement in a transaction
const txc = session.beginTransaction()
try {
  const result1 = await txc.run(
    'MERGE (bob:Person {name: $nameParam}) RETURN bob.name AS name',
    {
      nameParam: 'Bob'
    }
  )
  result1.records.forEach(r => console.log(r.get('name')))
  console.log('First query completed')

  const result2 = await txc.run(
    'MERGE (adam:Person {name: $nameParam}) RETURN adam.name AS name',
    {
      nameParam: 'Adam'
    }
  )
  result2.records.forEach(r => console.log(r.get('name')))
  console.log('Second query completed')

  await txc.commit()
  console.log('committed')
} catch (error) {
  console.log(error)
  await txc.rollback()
  console.log('rolled back')
} finally {
  await session.close()
}
```

#### With Reactive Session

```javascript
rxSession
  .beginTransaction()
  .pipe(
    flatMap(txc =>
      concat(
        txc
          .run(
            'MERGE (bob:Person {name: $nameParam}) RETURN bob.name AS name',
            {
              nameParam: 'Bob'
            }
          )
          .records()
          .pipe(map(r => r.get('name'))),
        of('First query completed'),
        txc
          .run(
            'MERGE (adam:Person {name: $nameParam}) RETURN adam.name AS name',
            {
              nameParam: 'Adam'
            }
          )
          .records()
          .pipe(map(r => r.get('name'))),
        of('Second query completed'),
        txc.commit(),
        of('committed')
      ).pipe(catchError(err => txc.rollback().pipe(throwError(err))))
    )
  )
  .subscribe({
    next: data => console.log(data),
    complete: () => console.log('completed'),
    error: error => console.log(error)
  })
```

### Numbers and the Integer type

The Neo4j type system includes 64-bit integer values.
However, JavaScript can only safely represent integers between `-(2`<sup>`53`</sup>`- 1)` and `(2`<sup>`53`</sup>`- 1)`.
In order to support the full Neo4j type system, the driver will not automatically convert to javascript integers.
Any time the driver receives an integer value from Neo4j, it will be represented with an internal integer type by the driver.

_**Any javascript number value passed as a parameter will be recognized as `Float` type.**_

#### Writing integers

Numbers written directly e.g. `session.run("CREATE (n:Node {age: {age}})", {age: 22})` will be of type `Float` in Neo4j.
To write the `age` as an integer the `neo4j.int` method should be used:

```javascript
var neo4j = require('neo4j-driver')

session.run('CREATE (n {age: {myIntParam}})', { myIntParam: neo4j.int(22) })
```

To write integers larger than can be represented as JavaScript numbers, use a string argument to `neo4j.int`:

```javascript
session.run('CREATE (n {age: {myIntParam}})', {
  myIntParam: neo4j.int('9223372036854775807')
})
```

#### Reading integers

Since Integers can be larger than can be represented as JavaScript numbers, it is only safe to convert to JavaScript numbers if you know that they will not exceed `(2`<sup>`53`</sup>`- 1)` in size.
In order to facilitate working with integers the driver include `neo4j.isInt`, `neo4j.integer.inSafeRange`, `neo4j.integer.toNumber`, and `neo4j.integer.toString`.

```javascript
var aSmallInteger = neo4j.int(123)
if (neo4j.integer.inSafeRange(aSmallInteger)) {
  var aNumber = aSmallInteger.toNumber()
}
```

If you will be handling integers larger than that, you should convert them to strings:

```javascript
var aLargerInteger = neo4j.int('9223372036854775807')
if (!neo4j.integer.inSafeRange(aLargerInteger)) {
  var integerAsString = aLargerInteger.toString()
}
```

#### Enabling native numbers

Starting from 1.6 version of the driver it is possible to configure it to only return native numbers instead of custom `Integer` objects.
The configuration option affects all integers returned by the driver. **Enabling this option can result in a loss of precision and incorrect numeric
values being returned if the database contains integer numbers outside of the range** `[Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]`.
To enable potentially lossy integer values use the driver's configuration object:

```javascript
var driver = neo4j.driver(
  'neo4j://localhost',
  neo4j.auth.basic('neo4j', 'neo4j'),
  { disableLosslessIntegers: true }
)
```

## Building

    npm install
    npm run build

This produces browser-compatible standalone files under `lib/browser` and a Node.js module version under `lib/`.
See files under `examples/` on how to use.

## Testing

Tests **require** latest [Boltkit](https://github.com/neo4j-contrib/boltkit) and [Firefox](https://www.mozilla.org/firefox/) to be installed in the system.

Boltkit is needed to start, stop and configure local test database. Boltkit can be installed with the following command:

    pip3 install --upgrade boltkit

To run tests against "default" Neo4j version:

    ./runTests.sh

To run tests against specified Neo4j version:

./runTests.sh '-e 3.1.3'

Simple `npm test` can also be used if you already have a running version of a compatible Neo4j server.

For development, you can have the build tool rerun the tests each time you change
the source code:

    gulp watch-n-test

### Testing on windows

To run the same test suite, run `.\runTest.ps1` instead in powershell with admin right.
The admin right is required to start/stop Neo4j properly as a system service.
While there is no need to grab admin right if you are running tests against an existing Neo4j server using `npm test`.
