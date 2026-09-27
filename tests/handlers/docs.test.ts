import { describe, it } from "bun:test";
import request from "supertest";
import { createTestContext } from "../helpers";

describe("GET /docs", () => {
  it("serves Swagger UI", async () => {
    const { app } = createTestContext();
    await request(app).get("/docs/").expect(200);
  });
});
