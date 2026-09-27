import { beforeEach, describe, expect, it } from "bun:test";
import request from "supertest";
import { createTestContext, payment, sale } from "../helpers";

let ctx: ReturnType<typeof createTestContext>;

beforeEach(() => {
  ctx = createTestContext();
});

describe("POST /transactions", () => {
  it("accepts a sale with 202 and no body", async () => {
    const res = await request(ctx.app)
      .post("/transactions")
      .send(sale("inv-1", "2024-02-22T17:29:39Z", [{ itemId: "a", cost: 1099, taxRate: 0.2 }]))
      .expect(202);
    expect(res.text).toBe("");
  });

  it("accepts a tax payment with 202", async () => {
    await request(ctx.app)
      .post("/transactions")
      .send(payment("2024-02-23T00:00:00Z", 100))
      .expect(202);
  });

  const invalid: [string, object][] = [
    ["unknown eventType", { eventType: "REFUND", date: "2024-01-01T00:00:00Z" }],
    ["missing date", { eventType: "TAX_PAYMENT", amount: 1 }],
    ["date without timezone", payment("2024-01-01T00:00:00", 1)],
    ["non ISO date", payment("22/02/2024", 1)],
    ["fractional pennies", payment("2024-01-01T00:00:00Z", 1.5)],
    ["negative amount", payment("2024-01-01T00:00:00Z", -1)],
    ["negative cost", sale("i", "2024-01-01T00:00:00Z", [{ itemId: "a", cost: -1, taxRate: 0.2 }])],
    ["empty items", sale("i", "2024-01-01T00:00:00Z", [])],
    ["taxRate > 1", sale("i", "2024-01-01T00:00:00Z", [{ itemId: "a", cost: 1, taxRate: 20 }])],
    [
      "duplicate itemId",
      sale("i", "2024-01-01T00:00:00Z", [
        { itemId: "a", cost: 1, taxRate: 0.2 },
        { itemId: "a", cost: 2, taxRate: 0.2 }
      ])
    ],
    ["empty invoiceId", sale("", "2024-01-01T00:00:00Z", [{ itemId: "a", cost: 1, taxRate: 0.2 }])]
  ];

  it.each(invalid)("rejects %s with 400", async (_name, body) => {
    const res = await request(ctx.app).post("/transactions").send(body).expect(400);
    expect(res.body.error).toBe("ValidationError");
    expect(res.body.details.length).toBeGreaterThan(0);
  });

  it("ignores unknown fields", async () => {
    await request(ctx.app)
      .post("/transactions")
      .send({ ...payment("2024-01-01T00:00:00Z", 50), note: "unexpected" })
      .expect(202);
    expect(ctx.taxPosition.at("2024-01-02T00:00:00Z")).toBe(-50);
  });

  it("stores nothing for an invalid request", async () => {
    await request(ctx.app)
      .post("/transactions")
      .send(payment("2024-01-01T00:00:00Z", -500))
      .expect(400);
    expect(ctx.taxPosition.at("2025-01-01T00:00:00Z")).toBe(0);
  });
});
