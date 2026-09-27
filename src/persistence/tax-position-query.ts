import type { Database } from "bun:sqlite";
import { toEpochMs } from "./database";

/**
 * Sales tax at :at
 *
 * 1. Only sales dated <= :at count
 * 2. A sale's items are its original items plus any added by an amendment dated <= :at
 * 3. Each item uses its most recently received amendment dated <= :at,
 *    otherwise the values from the original sale
 * 4. Each item's tax is rounded to the nearest penny, half up, then summed. Rounding to 6dp
 *    first strips float noise (100 * 0.575 = 57.4999...) that would otherwise round down
 */
const SALES_TAX_AT = `
WITH eligible_sales AS (
  SELECT invoice_id FROM sales WHERE date_ms <= :at
),
effective_amendments AS (
  SELECT a.invoice_id, a.item_id, a.cost, a.tax_rate,
         ROW_NUMBER() OVER (
           PARTITION BY a.invoice_id, a.item_id
           ORDER BY a.id DESC
         ) AS rn
  FROM amendments a
  JOIN eligible_sales s ON s.invoice_id = a.invoice_id
  WHERE a.date_ms <= :at
),
item_keys AS (
  SELECT si.invoice_id, si.item_id
  FROM sale_items si
  JOIN eligible_sales s ON s.invoice_id = si.invoice_id
  UNION
  SELECT invoice_id, item_id FROM effective_amendments
)
SELECT TOTAL(ROUND(ROUND(COALESCE(ea.cost, si.cost) * COALESCE(ea.tax_rate, si.tax_rate), 6))) AS tax
FROM item_keys k
LEFT JOIN sale_items si
  ON si.invoice_id = k.invoice_id AND si.item_id = k.item_id
LEFT JOIN effective_amendments ea
  ON ea.invoice_id = k.invoice_id AND ea.item_id = k.item_id AND ea.rn = 1
`;

// TOTAL() rather than SUM(), SUM() throws on integer overflow
const PAYMENTS_AT = `
SELECT TOTAL(amount) AS paid FROM tax_payments WHERE date_ms <= :at
`;

export class TaxPositionQuery {
  private readonly calculate: (at: number) => number;

  constructor(db: Database) {
    // Single transaction so both reads see the same snapshot
    this.calculate = db.transaction((at: number) => {
      const { tax } = db.query<{ tax: number }, { at: number }>(SALES_TAX_AT).get({ at })!;
      const { paid } = db.query<{ paid: number }, { at: number }>(PAYMENTS_AT).get({ at })!;
      return tax - paid;
    });
  }

  /**
   * Calculates the tax position (sales tax minus payments) at a point in time
   *
   * @param dateIso - ISO 8601 date-time to calculate the position at
   * @returns Tax position in whole pennies, negative if overpaid
   */
  at(dateIso: string): number {
    return this.calculate(toEpochMs(dateIso));
  }
}
