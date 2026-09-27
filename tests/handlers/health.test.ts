import { describe, expect, it } from "bun:test";
import request from "supertest";
import { createTestContext } from "../helpers";

describe("GET /health", () => {
  it("reports ok", async () => {
    const { app } = createTestContext();
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toEqual({ status: "ok", db: "ok" });
  });

  it("returns 503 once shutdown has started", async () => {
    const { app } = createTestContext({ isShuttingDown: () => true });
    const res = await request(app).get("/health").expect(503);
    expect(res.body).toEqual({ status: "shutting_down" });
  });
});
