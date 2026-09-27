import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Dates are stored as UTC epoch ms, ISO strings with offsets don't sort correctly as text
const SCHEMA = `
CREATE TABLE IF NOT EXISTS sales (
  invoice_id  TEXT    PRIMARY KEY,
  date_ms     INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
  invoice_id TEXT    NOT NULL REFERENCES sales(invoice_id) ON DELETE CASCADE,
  item_id    TEXT    NOT NULL,
  cost       INTEGER NOT NULL,
  tax_rate   REAL    NOT NULL,
  PRIMARY KEY (invoice_id, item_id)
);

CREATE TABLE IF NOT EXISTS tax_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date_ms     INTEGER NOT NULL,
  amount      INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

-- id is the arrival order, the most recently received amendment in effect wins
CREATE TABLE IF NOT EXISTS amendments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id  TEXT    NOT NULL,
  item_id     TEXT    NOT NULL,
  date_ms     INTEGER NOT NULL,
  cost        INTEGER NOT NULL,
  tax_rate    REAL    NOT NULL,
  received_at INTEGER NOT NULL
);

-- Previous version of a sale when a duplicate invoiceId overwrites it
CREATE TABLE IF NOT EXISTS sales_audit (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id       TEXT    NOT NULL,
  previous_payload TEXT    NOT NULL,
  replaced_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sales_date        ON sales(date_ms);
CREATE INDEX IF NOT EXISTS idx_payments_date     ON tax_payments(date_ms);
CREATE INDEX IF NOT EXISTS idx_amendments_lookup ON amendments(invoice_id, item_id, date_ms, id);
`;

// Converts an ISO 8601 date-time to UTC epoch milliseconds
export const toEpochMs = (iso: string): number => Date.parse(iso);

// Throws if the database is unreachable or closed
export function pingDatabase(db: Database): void {
  db.query("SELECT 1").get();
}

/**
 * Opens the SQLite database and applies the schema
 *
 * @param path - File path, or ":memory:" for an in-memory database
 * @returns The open database
 */
export function openDatabase(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA foreign_keys = ON;");
  db.run(SCHEMA);

  return db;
}
