import { describe, expect, it } from "bun:test";
import request from "supertest";
import { createTestContext, payment, sale } from "../helpers";

describe("GET /metrics", () => {
  it("exposes domain metrics", async () => {
    const { app } = createTestContext();
    const event = sale("i", "2024-01-01T00:00:00Z", [{ itemId: "a", cost: 1, taxRate: 0.2 }]);

    await request(app).post("/transactions").send(event);
    await request(app).post("/transactions").send(event);
    await request(app).post("/transactions").send(payment("bad", 1));

    const res = await request(app).get("/metrics").expect(200);
    expect(res.text).toContain('tax_events_ingested_total{event_type="SALES"} 2');
    expect(res.text).toContain("tax_duplicate_invoices_total 1");
    expect(res.text).toContain('tax_validation_failures_total{route="/transactions"} 1');
    expect(res.text).toContain(
      'http_request_duration_seconds_count{method="POST",route="/transactions",status_code="202"} 2'
    );
  });
});
