import { createLogger } from "../src/logger";
import { createMetrics } from "../src/metrics-registry";
import { createRouter } from "../src/router";
import { openDatabase, pingDatabase } from "../src/persistence/database";
import { PaymentsRepository } from "../src/persistence/payments-repository";
import { SalesRepository } from "../src/persistence/sales-repository";
import { TaxPositionQuery } from "../src/persistence/tax-position-query";

export function createTestContext(opts: { isShuttingDown?: () => boolean } = {}) {
  const db = openDatabase(":memory:");
  const sales = new SalesRepository(db);
  const payments = new PaymentsRepository(db);
  const taxPosition = new TaxPositionQuery(db);
  const metrics = createMetrics();

  const app = createRouter({
    sales,
    payments,
    taxPosition,
    pingDb: () => pingDatabase(db),
    logger: createLogger("silent"),
    metrics,
    ...opts
  });

  return { db, sales, payments, taxPosition, metrics, app };
}

export const sale = (
  invoiceId: string,
  date: string,
  items: { itemId: string; cost: number; taxRate: number }[]
) => ({ eventType: "SALES" as const, invoiceId, date, items });

export const payment = (date: string, amount: number) => ({
  eventType: "TAX_PAYMENT" as const,
  date,
  amount
});

export const amend = (
  invoiceId: string,
  itemId: string,
  date: string,
  cost: number,
  taxRate: number
) => ({ invoiceId, itemId, date, cost, taxRate });
