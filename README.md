# Novabook Tax Service

Ingests sales and tax payment events, accepts amendments to sale items, and returns the tax position
at any point in time.

Bun, TypeScript, Express 5, SQLite (`bun:sqlite`), zod, pino, prom-client.

## Quick start

```bash
bun install
bun start                  # http://localhost:3000, API docs at /docs
```

Or with Docker (also starts Prometheus on :9090):

```bash
docker compose up --build
```

Checks (all run in CI, along with a Docker build and container smoke test):

```bash
bun test
bun run typecheck
bun run lint
bun run format:check
```

### Try it

```bash
curl -X POST localhost:3000/transactions -H 'content-type: application/json' \
  -d '{"eventType":"SALES","date":"2024-02-22T17:29:39Z","invoiceId":"inv-1",
       "items":[{"itemId":"item-1","cost":1099,"taxRate":0.2}]}'

curl -X POST localhost:3000/transactions -H 'content-type: application/json' \
  -d '{"eventType":"TAX_PAYMENT","date":"2024-02-23T00:00:00Z","amount":100}'

curl -X PATCH localhost:3000/sale -H 'content-type: application/json' \
  -d '{"date":"2024-02-24T00:00:00Z","invoiceId":"inv-1","itemId":"item-1","cost":798,"taxRate":0.15}'

curl 'localhost:3000/tax-position?date=2024-02-22T17:29:39Z'   # 220    (1099 * 0.2 = 219.8, rounded)
curl 'localhost:3000/tax-position?date=2024-02-23T12:00:00Z'   # 120    (220 - 100)
curl 'localhost:3000/tax-position?date=2024-02-25T00:00:00Z'   # 20     (798 * 0.15 = 119.7 -> 120, - 100)
```

### Configuration

| Variable              | Default       | Description                                             |
| --------------------- | ------------- | ------------------------------------------------------- |
| `PORT`                | `3000`        | HTTP port                                               |
| `DB_PATH`             | `data/tax.db` | SQLite file, `:memory:` for a throwaway database        |
| `LOG_LEVEL`           | `info`        | pino log level                                          |
| `SHUTDOWN_DELAY_MS`   | `0`           | How long `/health` returns 503 before the server closes |
| `SHUTDOWN_TIMEOUT_MS` | `10000`       | Max time to drain in-flight requests on shutdown        |

Invalid values stop the service at startup with a clear error.

## How it works

```
POST /transactions ──┬── SALES ──────> sales + sale_items ──┐
                     └── TAX_PAYMENT ─> tax_payments ────────┤
PATCH /sale ───────────────────────────> amendments ─────────┤
                                                             │
GET /tax-position?date=D  <── one SQL query over all three ──┘
```

Events are stored as they arrive and never aggregated. The tax position is calculated when it's
queried, so events can arrive in any order (back-dated, future-dated, or an amendment before its
sale) and the answer for any date is still correct.

For a query date `D`:

1. Take the sales dated on or before `D`.
2. Each sale's items are its original items plus any item added by an amendment dated on or before `D`.
3. Each item uses the most recently received amendment dated on or before `D`, otherwise its
   original values.
4. Each item's tax is `cost * taxRate` rounded to the nearest penny, and sales tax is the sum of those.
5. Tax position is sales tax minus the payments dated on or before `D`.

Dates are stored as UTC epoch milliseconds. Comparing ISO strings doesn't work across timezones:
`10:00+02:00` sorts after `09:00Z` as text but happens before it.

The SQL is in `src/persistence/tax-position-query.ts`.

### Project layout

```
src/
  index.ts          entry point, wiring, graceful shutdown
  router.ts         Express app: middleware + handlers
  config/           env validation, constants
  handlers/         one file per endpoint
  middleware/       request logging, metrics, JSON body handling, errors
  errors/           400 response shape
  persistence/      request schemas, SQLite, repositories, tax position query
tests/              mirrors src/
openapi.yaml        API contract, served at /docs
```

## Assumptions

The spec leaves these open. Each one has a test.

1. **Tax is rounded per item** to the nearest penny, with halves rounded up (1099 \* 0.2 = 219.8
   becomes 220), and then summed. This matches how VAT is shown per line on an invoice, so totals
   reconcile with invoices. Rounding once on the total can disagree with the lines: two items of
   0.4p are 0p each but 1p combined. Amended items are rounded the same way, and the tax position is
   always whole pennies.
2. An amendment for an item the sale doesn't have **adds** that item.
3. An amendment dated before its sale applies from the sale's date.
4. An amendment for a sale that hasn't arrived is accepted and stored, and counts once the sale arrives.
5. With several amendments to one item, each starts applying from its own date, and of those in
   effect the **most recently received** wins, even if an earlier one has a later date. An
   amendment is a correction, so the one submitted last is the user's latest intent.
6. A `SALES` event with an existing `invoiceId` **replaces** the sale. The old version is kept in a
   `sales_audit` table, a warning is logged and a metric is incremented. Amendments still apply.
7. Events dated exactly at the query date are included.
8. The response echoes the query `date` as sent.
9. The tax position can be negative (overpaid).
10. Money must be a non-negative integer of pennies, `taxRate` must be between 0 and 1, dates need a
    timezone, `items` can't be empty and `itemId` must be unique per invoice. Anything else is a
    `400` and nothing is stored. Non-JSON bodies get `415`, bodies over 1 MB get `413`.
11. Refunds are out of scope. An amendment to `cost: 0` covers removing an item.
12. Unknown fields in a payload are ignored.
13. An unencoded `+` in `?date=...+01:00` arrives as a space, so spaces in `date` are turned back
    into `+`.
14. Whitespace around `invoiceId` and `itemId` is trimmed.
15. Dates are accepted with sub-millisecond precision but truncated to milliseconds.

## Observability

- **Logs:** JSON (pino), one line per request except `/health` and `/metrics`, plus a line per
  ingested event with its `invoiceId`, `itemId` and `date`. Each request gets an `x-request-id`
  (the caller's, if safe, or a new UUID), which is returned in the response and attached to every
  log line for that request.
- **Metrics:** `GET /metrics` for Prometheus. Request latency by route and status, events ingested
  by type, amendments, duplicate invoices, validation failures and tax position queries.
- **Health:** `GET /health` checks the database. It returns 503 once shutdown starts, for
  `SHUTDOWN_DELAY_MS`, so a load balancer stops sending traffic before the server closes.
- **Failures:** bad config, a port clash or an uncaught exception is logged at `fatal` and the
  process exits 1.

## Trade-offs and next steps

- **Every query scans all events.** Fine for this scale with indexes. For more data I'd store
  periodic snapshots and only replay events after the latest one, invalidating snapshots when a
  back-dated event arrives.
- **SQLite is single-instance.** Only `src/persistence/` touches SQL, so moving to Postgres is
  contained to that folder.
- **Retries double count payments.** Payments have no id in the spec. I'd add an `Idempotency-Key`
  header or an event id.
- **Floating point.** Item tax is calculated as a double and rounded to 6dp before rounding to a
  penny, which is reliable for realistic rates. For strict decimal maths I'd store `taxRate` in
  basis points and use integer arithmetic.
- **Not included:** authentication (per the spec), tracing (OpenTelemetry would be next) and
  versioned migrations (the schema is applied on startup).
