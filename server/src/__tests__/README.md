# Server tests

Characterization tests for the MARS server.

## Running them

Tests need a real MongoDB. The quickest way:

```bash
docker run -d --name mars-test-mongo -p 27018:27017 mongo:7
cd server
npm install
MONGODB_TEST_URI=mongodb://localhost:27018 npm test
```

`MONGODB_TEST_URI` defaults to `mongodb://localhost:27018`. Each run uses its
own database (`mars_test_<pid>`) and drops it afterwards, so it will not touch
development data. CI starts an equivalent `mongo:7` service container.

We deliberately avoid `mongodb-memory-server`: it downloads a `mongod` binary at
run time, which fails on hosts without AVX (5.0+ aborts with `SIGILL`) and on
hosts without OpenSSL 1.1 (4.x cannot resolve `libcrypto.so.1.1`). A container
works anywhere Docker does.

## What "characterization" means here

These tests pin **what MARS does today**, not what it ought to do. Their job is
to make behavioural change *visible* during the V2 work: if a refactor alters an
output, a test fails and we decide, deliberately, whether that change is an
improvement.

Several tests therefore assert behaviour that is arguably wrong. Those are
labelled `CHARACTERIZATION:` with an explanation. Known issues pinned so far:

| Area | Pinned behaviour |
| --- | --- |
| `duration` | Measured as `now - createdAt` *at sync time*, so it records polling lag rather than migration time, and inflates `averageDuration`. |
| `allMigrations` search | The term is interpolated into `$regex` unescaped: metacharacters are interpreted and a malformed pattern such as `(` throws. |
| `allMigrations` pagination | `pageSize: -1` against an empty collection yields `totalPages: NaN`. |
| CSV export | Embedded newlines are not escaped, so a multi-line `failureReason` splits one record across several lines. |
| `formatDate` | Numeric epoch timestamps are *not* parsed; they are echoed back as strings. ISO-looking strings are returned unnormalised. |

**Do not "fix" a failing test to make a change pass.** Change it deliberately,
and call the behavioural change out in the pull request.

## Why `src/pubsub.ts` exists

`index.ts` calls `startServer()` at module load, so importing any resolver used
to open a MongoDB connection and an HTTP/WebSocket listener as a side effect —
which made the server tier untestable. The shared `PubSub` instance and its
channel constants now live in `src/pubsub.ts`; `index.ts` re-exports them, so
existing imports keep working.
