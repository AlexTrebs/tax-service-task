import { beforeEach, describe, expect, it } from "bun:test";
import type { PaymentsRepository } from "../../src/persistence/payments-repository";
import type { SalesRepository } from "../../src/persistence/sales-repository";
import type { TaxPositionQuery } from "../../src/persistence/tax-position-query";
import { amend, createTestContext, payment, sale } from "../helpers";

let sales: SalesRepository;
let payments: PaymentsRepository;
let taxPosition: TaxPositionQuery;

beforeEach(() => {
  ({ sales, payments, taxPosition } = createTestContext());
});

describe("TaxPositionQuery", () => {
  it("is zero with no events", () => {
    expect(taxPosition.at("2024-01-01T00:00:00Z")).toBe(0);
  });

  it("sums cost * taxRate across items and invoices", () => {
    sales.ingestSale(
      sale("inv-1", "2024-02-01T00:00:00Z", [
        { itemId: "a", cost: 1000, taxRate: 0.2 },
        { itemId: "b", cost: 500, taxRate: 0.05 }
      ])
    );
    sales.ingestSale(
      sale("inv-2", "2024-02-02T00:00:00Z", [{ itemId: "a", cost: 100, taxRate: 0.1 }])
    );
    expect(taxPosition.at("2024-03-01T00:00:00Z")).toBe(200 + 25 + 10);
  });

  it("subtracts payments and can go negative", () => {
    sales.ingestSale(
      sale("inv-1", "2024-02-01T00:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    payments.ingestTaxPayment(payment("2024-02-05T00:00:00Z", 150));
    expect(taxPosition.at("2024-02-10T00:00:00Z")).toBe(50);

    payments.ingestTaxPayment(payment("2024-02-06T00:00:00Z", 100));
    expect(taxPosition.at("2024-02-10T00:00:00Z")).toBe(-50);
  });

  it("doesn't overflow when payments exceed 64-bit integer range", () => {
    for (let i = 0; i < 1100; i++) {
      payments.ingestTaxPayment(payment("2024-01-01T00:00:00Z", Number.MAX_SAFE_INTEGER));
    }
    expect(() => taxPosition.at("2024-01-02T00:00:00Z")).not.toThrow();
  });

  it("rounds each item's tax to the nearest penny", () => {
    sales.ingestSale(
      sale("inv-1", "2024-02-22T17:29:39Z", [{ itemId: "a", cost: 1099, taxRate: 0.2 }])
    );
    expect(taxPosition.at("2024-02-22T17:29:39Z")).toBe(220);
  });

  it("rounds per item, not on the total", () => {
    // 0.4 + 0.4 rounds to 0 + 0 per item, it would be 1 if rounded on the total
    sales.ingestSale(
      sale("inv-1", "2024-01-01T00:00:00Z", [
        { itemId: "a", cost: 2, taxRate: 0.2 },
        { itemId: "b", cost: 2, taxRate: 0.2 }
      ])
    );
    expect(taxPosition.at("2024-01-02T00:00:00Z")).toBe(0);
  });

  it("rounds halves up despite float noise", () => {
    // 100 * 0.575 is 57.49999999999999 in floating point
    sales.ingestSale(
      sale("inv-1", "2024-01-01T00:00:00Z", [{ itemId: "a", cost: 100, taxRate: 0.575 }])
    );
    expect(taxPosition.at("2024-01-02T00:00:00Z")).toBe(58);
  });
});

describe("point in time", () => {
  it("includes events dated exactly at the query date", () => {
    sales.ingestSale(
      sale("inv-1", "2024-02-01T12:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    payments.ingestTaxPayment(payment("2024-02-10T12:00:00Z", 50));

    expect(taxPosition.at("2024-02-01T11:59:59Z")).toBe(0);
    expect(taxPosition.at("2024-02-01T12:00:00Z")).toBe(200);
    expect(taxPosition.at("2024-02-10T12:00:00Z")).toBe(150);
  });

  it("ignores future dated events for earlier dates", () => {
    sales.ingestSale(
      sale("inv-1", "2099-01-01T00:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    expect(taxPosition.at("2024-01-01T00:00:00Z")).toBe(0);
    expect(taxPosition.at("2099-01-01T00:00:00Z")).toBe(200);
  });

  it("compares instants across timezone offsets, not strings", () => {
    // 10:00+02:00 is 08:00Z, before 09:00Z even though it sorts later as text
    sales.ingestSale(
      sale("inv-1", "2024-02-01T10:00:00+02:00", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    expect(taxPosition.at("2024-02-01T07:59:59Z")).toBe(0);
    expect(taxPosition.at("2024-02-01T09:00:00Z")).toBe(200);
  });

  it("truncates sub-millisecond precision", () => {
    sales.ingestSale(
      sale("inv-1", "2024-02-01T12:00:00.000999Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    expect(taxPosition.at("2024-02-01T12:00:00Z")).toBe(200);
  });

  it("doesn't depend on ingestion order", () => {
    payments.ingestTaxPayment(payment("2024-03-01T00:00:00Z", 100));
    sales.ingestSale(
      sale("inv-1", "2024-01-01T00:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    expect(taxPosition.at("2024-02-01T00:00:00Z")).toBe(200);
    expect(taxPosition.at("2024-03-01T00:00:00Z")).toBe(100);
  });
});

describe("amendments", () => {
  const saleDate = "2024-02-01T00:00:00Z";

  beforeEach(() => {
    sales.ingestSale(
      sale("inv-1", saleDate, [
        { itemId: "a", cost: 1000, taxRate: 0.2 },
        { itemId: "b", cost: 1000, taxRate: 0.1 }
      ])
    );
  });

  it("applies from the amendment date onward", () => {
    sales.amendSale(amend("inv-1", "a", "2024-03-01T00:00:00Z", 500, 0.2));
    expect(taxPosition.at("2024-02-15T00:00:00Z")).toBe(200 + 100);
    expect(taxPosition.at("2024-03-01T00:00:00Z")).toBe(100 + 100);
  });

  it("uses the most recently received amendment once both are in effect", () => {
    // Received first but dated later
    sales.amendSale(amend("inv-1", "a", "2024-04-01T00:00:00Z", 2000, 0.2));
    sales.amendSale(amend("inv-1", "a", "2024-03-01T00:00:00Z", 500, 0.2));

    expect(taxPosition.at("2024-02-15T00:00:00Z")).toBe(300);
    expect(taxPosition.at("2024-03-15T00:00:00Z")).toBe(200);
    expect(taxPosition.at("2024-04-15T00:00:00Z")).toBe(200);
  });

  it("doesn't apply a later received amendment before its own date", () => {
    sales.amendSale(amend("inv-1", "a", "2024-03-01T00:00:00Z", 500, 0.2));
    sales.amendSale(amend("inv-1", "a", "2024-04-01T00:00:00Z", 2000, 0.2));

    expect(taxPosition.at("2024-03-15T00:00:00Z")).toBe(200);
    expect(taxPosition.at("2024-04-15T00:00:00Z")).toBe(500);
  });

  it("uses the last received when dates are equal", () => {
    sales.amendSale(amend("inv-1", "a", "2024-03-01T00:00:00Z", 500, 0.2));
    sales.amendSale(amend("inv-1", "a", "2024-03-01T00:00:00Z", 0, 0.2));
    expect(taxPosition.at("2024-03-02T00:00:00Z")).toBe(100);
  });

  it("only affects the invoice it targets, even with a shared itemId", () => {
    sales.ingestSale(sale("inv-2", saleDate, [{ itemId: "a", cost: 1000, taxRate: 0.2 }]));
    sales.amendSale(amend("inv-1", "a", "2024-03-01T00:00:00Z", 0, 0.2));
    // inv-1: a=0 + b=100, inv-2: a=200
    expect(taxPosition.at("2024-03-01T00:00:00Z")).toBe(100 + 200);
  });

  it("adds an item that isn't in the sale", () => {
    sales.amendSale(amend("inv-1", "c", "2024-03-01T00:00:00Z", 1000, 0.05));
    expect(taxPosition.at("2024-02-15T00:00:00Z")).toBe(300);
    expect(taxPosition.at("2024-03-01T00:00:00Z")).toBe(350);
  });

  it("takes effect from the sale date when dated before the sale", () => {
    sales.amendSale(amend("inv-1", "a", "2024-01-01T00:00:00Z", 500, 0.2));
    expect(taxPosition.at("2024-01-15T00:00:00Z")).toBe(0);
    expect(taxPosition.at(saleDate)).toBe(100 + 100);
  });
});

describe("amendments received before their sale", () => {
  it("don't count until the sale arrives, then apply retroactively", () => {
    sales.amendSale(amend("inv-9", "a", "2024-03-01T00:00:00Z", 500, 0.2));
    expect(taxPosition.at("2024-12-31T00:00:00Z")).toBe(0);

    sales.ingestSale(
      sale("inv-9", "2024-02-01T00:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    expect(taxPosition.at("2024-02-15T00:00:00Z")).toBe(200);
    expect(taxPosition.at("2024-03-15T00:00:00Z")).toBe(100);
  });

  it("count a new item once the sale arrives", () => {
    sales.amendSale(amend("inv-9", "z", "2024-01-01T00:00:00Z", 1000, 0.1));
    expect(taxPosition.at("2024-12-31T00:00:00Z")).toBe(0);

    sales.ingestSale(
      sale("inv-9", "2024-02-01T00:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    expect(taxPosition.at("2024-02-01T00:00:00Z")).toBe(300);
  });
});
