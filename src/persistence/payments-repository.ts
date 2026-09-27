import type { Database } from "bun:sqlite";
import type { TaxPaymentEvent } from "./schemas";
import { toEpochMs } from "./database";

export class PaymentsRepository {
  constructor(private readonly db: Database) {}

  // Stores a tax payment
  ingestTaxPayment(event: TaxPaymentEvent): void {
    this.db
      .query(
        "INSERT INTO tax_payments (date_ms, amount, received_at) VALUES (:dateMs, :amount, :now)"
      )
      .run({ dateMs: toEpochMs(event.date), amount: event.amount, now: Date.now() });
  }
}
