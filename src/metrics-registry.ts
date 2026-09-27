import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { HTTP_DURATION_BUCKETS } from "./config/constants";

// Creates a Prometheus registry and the service's metrics.
// A new registry per call keeps test instances isolated
export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  return {
    registry,
    httpRequestDuration: new Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request latency",
      labelNames: ["method", "route", "status_code"] as const,
      buckets: HTTP_DURATION_BUCKETS,
      registers: [registry]
    }),
    eventsIngested: new Counter({
      name: "tax_events_ingested_total",
      help: "Transaction events accepted, by event type",
      labelNames: ["event_type"] as const,
      registers: [registry]
    }),
    amendments: new Counter({
      name: "tax_sale_amendments_total",
      help: "Sale amendments accepted",
      registers: [registry]
    }),
    duplicateInvoices: new Counter({
      name: "tax_duplicate_invoices_total",
      help: "SALES events that overwrote an existing invoiceId",
      registers: [registry]
    }),
    validationFailures: new Counter({
      name: "tax_validation_failures_total",
      help: "Requests rejected with 400, by route",
      labelNames: ["route"] as const,
      registers: [registry]
    }),
    taxPositionQueries: new Counter({
      name: "tax_position_queries_total",
      help: "Tax position queries served",
      registers: [registry]
    })
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
