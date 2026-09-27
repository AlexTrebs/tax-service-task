import type { Database } from "bun:sqlite";
import type { Amendment, SaleEvent } from "./schemas";
import { toEpochMs } from "./database";

export interface SaleIngestResult {
  replaced: boolean;
}

interface SaleItemRow {
  item_id: string;
  cost: number;
  tax_rate: number;
}

export class SalesRepository {
  private readonly ingestSaleTx: (event: SaleEvent, now: number) => SaleIngestResult;

  constructor(private readonly db: Database) {
    this.ingestSaleTx = db.transaction((event: SaleEvent, now: number): SaleIngestResult => {
      const existing = this.db
        .query<{ date_ms: number }, { invoiceId: string }>(
          "SELECT date_ms FROM sales WHERE invoice_id = :invoiceId"
        )
        .get({ invoiceId: event.invoiceId });

      if (existing) {
        this.archiveSale(event.invoiceId, existing.date_ms, now);
        // sale_items are removed by ON DELETE CASCADE, amendments are kept
        this.db
          .query("DELETE FROM sales WHERE invoice_id = :invoiceId")
          .run({ invoiceId: event.invoiceId });
      }

      this.db
        .query(
          "INSERT INTO sales (invoice_id, date_ms, received_at) VALUES (:invoiceId, :dateMs, :now)"
        )
        .run({ invoiceId: event.invoiceId, dateMs: toEpochMs(event.date), now });

      const insertItem = this.db.query(
        `INSERT INTO sale_items (invoice_id, item_id, cost, tax_rate)
         VALUES (:invoiceId, :itemId, :cost, :taxRate)`
      );
      for (const item of event.items) {
        insertItem.run({ invoiceId: event.invoiceId, ...item });
      }

      return { replaced: existing !== null };
    });
  }

  /**
   * Inserts a sale, or replaces it if the invoiceId already exists
   *
   * @param event - The validated sale event
   * @returns Whether an existing sale was replaced
   */
  ingestSale(event: SaleEvent): SaleIngestResult {
    return this.ingestSaleTx(event, Date.now());
  }

  // Stores an amendment, it is applied to the sale when the tax position is calculated
  amendSale(amendment: Amendment): void {
    this.db
      .query(
        `INSERT INTO amendments (invoice_id, item_id, date_ms, cost, tax_rate, received_at)
         VALUES (:invoiceId, :itemId, :dateMs, :cost, :taxRate, :now)`
      )
      .run({
        invoiceId: amendment.invoiceId,
        itemId: amendment.itemId,
        dateMs: toEpochMs(amendment.date),
        cost: amendment.cost,
        taxRate: amendment.taxRate,
        now: Date.now()
      });
  }

  private archiveSale(invoiceId: string, dateMs: number, now: number): void {
    const items = this.db
      .query<SaleItemRow, { invoiceId: string }>(
        "SELECT item_id, cost, tax_rate FROM sale_items WHERE invoice_id = :invoiceId"
      )
      .all({ invoiceId });

    const payload = JSON.stringify({
      date: new Date(dateMs).toISOString(),
      items: items.map((i) => ({ itemId: i.item_id, cost: i.cost, taxRate: i.tax_rate }))
    });

    this.db
      .query(
        `INSERT INTO sales_audit (invoice_id, previous_payload, replaced_at)
         VALUES (:invoiceId, :payload, :now)`
      )
      .run({ invoiceId, payload, now });
  }
}
