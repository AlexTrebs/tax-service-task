import { describe, expect, it } from "bun:test";
import request from "supertest";
import { createTestContext } from "../helpers";

const UUID = /^[0-9a-f-]{36}$/;

describe("requestLogger", () => {
  it("reuses a caller supplied x-request-id", async () => {
    const { app } = createTestContext();
    const res = await request(app).get("/health").set("x-request-id", "abc-123");
    expect(res.headers["x-request-id"]).toBe("abc-123");
  });

  it("generates an id when none is given", async () => {
    const { app } = createTestContext();
    const res = await request(app).get("/health");
    expect(res.headers["x-request-id"]).toMatch(UUID);
  });

  it("replaces unsafe or oversized ids", async () => {
    const { app } = createTestContext();
    for (const bad of ["a".repeat(129), "has spaces", "<script>"]) {
      const res = await request(app).get("/health").set("x-request-id", bad);
      expect(res.headers["x-request-id"]).toMatch(UUID);
    }
  });
});
