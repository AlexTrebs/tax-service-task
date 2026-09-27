import { describe, expect, it } from "bun:test";
import { amend, createTestContext, sale } from "../helpers";

describe("SalesRepository duplicate invoiceId", () => {
  it("overwrites the previous sale and reports the replacement", () => {
    const { sales, taxPosition } = createTestContext();

    expect(
      sales.ingestSale(
        sale("inv-1", "2024-02-01T00:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
      )
    ).toEqual({ replaced: false });
    expect(
      sales.ingestSale(
        sale("inv-1", "2024-03-01T00:00:00Z", [{ itemId: "b", cost: 100, taxRate: 0.2 }])
      )
    ).toEqual({ replaced: true });

    expect(taxPosition.at("2024-02-15T00:00:00Z")).toBe(0);
    expect(taxPosition.at("2024-03-15T00:00:00Z")).toBe(20);
  });

  it("archives the replaced sale in sales_audit", () => {
    const { db, sales } = createTestContext();
    sales.ingestSale(
      sale("inv-1", "2024-02-01T00:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    sales.ingestSale(
      sale("inv-1", "2024-03-01T00:00:00Z", [{ itemId: "b", cost: 100, taxRate: 0.2 }])
    );

    const rows = db
      .query<{ invoice_id: string; previous_payload: string }, []>(
        "SELECT invoice_id, previous_payload FROM sales_audit"
      )
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.invoice_id).toBe("inv-1");
    expect(JSON.parse(rows[0]!.previous_payload)).toEqual({
      date: "2024-02-01T00:00:00.000Z",
      items: [{ itemId: "a", cost: 1000, taxRate: 0.2 }]
    });
  });

  it("keeps amendments after an overwrite", () => {
    const { sales, taxPosition } = createTestContext();
    sales.ingestSale(
      sale("inv-1", "2024-02-01T00:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    sales.amendSale(amend("inv-1", "a", "2024-02-10T00:00:00Z", 500, 0.2));
    sales.ingestSale(
      sale("inv-1", "2024-02-01T00:00:00Z", [{ itemId: "a", cost: 2000, taxRate: 0.2 }])
    );

    expect(taxPosition.at("2024-02-05T00:00:00Z")).toBe(400);
    expect(taxPosition.at("2024-02-15T00:00:00Z")).toBe(100);
  });
});
