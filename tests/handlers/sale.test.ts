import { beforeEach, describe, expect, it } from "bun:test";
import request from "supertest";
import { amend, createTestContext, sale } from "../helpers";

let ctx: ReturnType<typeof createTestContext>;

beforeEach(() => {
  ctx = createTestContext();
});

describe("PATCH /sale", () => {
  it("accepts an amendment for a sale that doesn't exist yet", async () => {
    await request(ctx.app)
      .patch("/sale")
      .send(amend("nope", "x", "2024-01-01T00:00:00Z", 1, 0.1))
      .expect(202);
  });

  it("trims whitespace around ids", async () => {
    ctx.sales.ingestSale(
      sale("inv-1", "2024-01-01T00:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }])
    );
    await request(ctx.app)
      .patch("/sale")
      .send(amend(" inv-1 ", " a ", "2024-01-02T00:00:00Z", 0, 0.2))
      .expect(202);
    expect(ctx.taxPosition.at("2024-01-03T00:00:00Z")).toBe(0);
  });

  it("rejects missing fields with 400", async () => {
    await request(ctx.app).patch("/sale").send({ invoiceId: "i" }).expect(400);
  });
});
