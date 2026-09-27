import { beforeEach, describe, expect, it } from "bun:test";
import request from "supertest";
import { amend, createTestContext, payment, sale } from "../helpers";

let ctx: ReturnType<typeof createTestContext>;

beforeEach(() => {
  ctx = createTestContext();
});

const positionAt = async (date: string) =>
  (await request(ctx.app).get("/tax-position").query({ date }).expect(200)).body;

describe("GET /tax-position", () => {
  it("handles the spec example end to end", async () => {
    const invoiceId = "3419027d-960f-4e8f-b8b7-f7b2b4791824";
    const itemId = "02db47b6-fe68-4005-a827-24c6e962f3df";

    await request(ctx.app)
      .post("/transactions")
      .send(sale(invoiceId, "2024-02-22T17:29:39Z", [{ itemId, cost: 1099, taxRate: 0.2 }]))
      .expect(202);
    await request(ctx.app)
      .post("/transactions")
      .send(payment("2024-02-23T00:00:00Z", 100))
      .expect(202);
    await request(ctx.app)
      .patch("/sale")
      .send(amend(invoiceId, itemId, "2024-02-24T00:00:00Z", 798, 0.15))
      .expect(202);

    expect(await positionAt("2024-02-22T17:29:39Z")).toEqual({
      date: "2024-02-22T17:29:39Z",
      taxPosition: 220
    });
    expect((await positionAt("2024-02-23T12:00:00Z")).taxPosition).toBe(120);
    expect((await positionAt("2024-02-24T12:00:00Z")).taxPosition).toBe(20);
  });

  it("echoes the query date as given", async () => {
    expect(await positionAt("2024-02-22T18:29:39+01:00")).toEqual({
      date: "2024-02-22T18:29:39+01:00",
      taxPosition: 0
    });
  });

  it("handles an unencoded '+' offset", async () => {
    await request(ctx.app)
      .post("/transactions")
      .send(sale("i", "2024-02-22T17:00:00Z", [{ itemId: "a", cost: 1000, taxRate: 0.2 }]));

    // Raw URL, '+' would normally decode to a space
    const res = await request(ctx.app)
      .get("/tax-position?date=2024-02-22T18:00:00+01:00")
      .expect(200);
    expect(res.body).toEqual({ date: "2024-02-22T18:00:00+01:00", taxPosition: 200 });
  });

  it("requires a valid date", async () => {
    await request(ctx.app).get("/tax-position").expect(400);
    await request(ctx.app).get("/tax-position").query({ date: "yesterday" }).expect(400);
  });
});
