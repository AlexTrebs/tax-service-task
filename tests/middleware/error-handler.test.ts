import { describe, expect, it } from "bun:test";
import request from "supertest";
import { createTestContext } from "../helpers";

describe("errorHandler", () => {
  it("returns 400 for malformed JSON", async () => {
    const { app } = createTestContext();
    await request(app)
      .post("/transactions")
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
  });
});

describe("errorHandler client errors", () => {
  it("returns 413 for a body over the size limit", async () => {
    const { app } = createTestContext();
    const res = await request(app)
      .post("/transactions")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "a".repeat(1_100_000) }))
      .expect(413);
    expect(res.body).toEqual({ error: "PayloadTooLarge" });
  });

  it("passes through 4xx errors from the body parser instead of returning 500", async () => {
    const { app } = createTestContext();
    const res = await request(app)
      .post("/transactions")
      .set("Content-Type", "application/json; charset=latin1")
      .send('{"a":1}')
      .expect(415);
    expect(res.body.error).toBe("UnsupportedMediaType");
  });
});

describe("notFound", () => {
  it("returns 404 JSON for unknown routes", async () => {
    const { app } = createTestContext();
    const res = await request(app).get("/nope").expect(404);
    expect(res.body).toEqual({ error: "NotFound" });
  });

  it("returns 404 for bodies sent to unknown routes without leaking paths into metrics", async () => {
    const { app } = createTestContext();

    for (const path of ["/x1", "/x2"]) {
      await request(app)
        .post(path)
        .set("Content-Type", "application/json")
        .send("{bad")
        .expect(404);
    }
    await request(app).post("/x3").set("Content-Type", "text/plain").send("x").expect(404);

    const res = await request(app).get("/metrics");
    expect(res.text).not.toMatch(/route="\/x\d"/);
  });
});
