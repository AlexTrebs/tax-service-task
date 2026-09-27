import { describe, expect, it } from "bun:test";
import request from "supertest";
import { createTestContext } from "../helpers";

describe("requireJson", () => {
  it("rejects non-JSON bodies with 415", async () => {
    const { app } = createTestContext();
    const res = await request(app)
      .post("/transactions")
      .set("Content-Type", "text/plain")
      .send("eventType=SALES")
      .expect(415);
    expect(res.body.error).toBe("UnsupportedMediaType");
  });
});
