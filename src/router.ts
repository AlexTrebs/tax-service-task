import express from "express";
import { docsRouter } from "./handlers/docs";
import { healthRouter } from "./handlers/health";
import { metricsRouter } from "./handlers/metrics";
import { saleRouter } from "./handlers/sale";
import { taxPositionRouter } from "./handlers/tax-position";
import { transactionsRouter } from "./handlers/transactions";
import type { Logger } from "./logger";
import type { Metrics } from "./metrics-registry";
import { errorHandler, notFound } from "./middleware/error-handler";
import { httpMetrics } from "./middleware/http-metrics";
import { requestLogger } from "./middleware/request-logger";
import type { PaymentsRepository } from "./persistence/payments-repository";
import type { SalesRepository } from "./persistence/sales-repository";
import type { TaxPositionQuery } from "./persistence/tax-position-query";

export interface RouterDeps {
  sales: SalesRepository;
  payments: PaymentsRepository;
  taxPosition: TaxPositionQuery;
  pingDb: () => void;
  logger: Logger;
  metrics: Metrics;
  isShuttingDown?: () => boolean;
}

// Builds the Express app with all middleware and handlers
export function createRouter(deps: RouterDeps) {
  const app = express();
  app.disable("x-powered-by");

  app.use(requestLogger(deps.logger));
  app.use(httpMetrics(deps.metrics));

  app.use(transactionsRouter(deps));
  app.use(saleRouter(deps));
  app.use(taxPositionRouter(deps));
  app.use(healthRouter(deps));
  app.use(metricsRouter(deps));
  app.use(docsRouter());

  // Must come last
  app.use(notFound);
  app.use(errorHandler(deps.metrics));

  return app;
}
