import { loadEnv } from "./config/env";
import { createLogger } from "./logger";
import { createMetrics } from "./metrics-registry";
import { createRouter } from "./router";
import { openDatabase, pingDatabase } from "./persistence/database";
import { PaymentsRepository } from "./persistence/payments-repository";
import { SalesRepository } from "./persistence/sales-repository";
import { TaxPositionQuery } from "./persistence/tax-position-query";

const env = loadEnv();
const logger = createLogger(env.logLevel);

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandled promise rejection");
  process.exit(1);
});

let shuttingDown = false;

const db = openDatabase(env.dbPath);

const app = createRouter({
  sales: new SalesRepository(db),
  payments: new PaymentsRepository(db),
  taxPosition: new TaxPositionQuery(db),
  pingDb: () => pingDatabase(db),
  logger,
  metrics: createMetrics(),
  isShuttingDown: () => shuttingDown
});

// Express 5 passes listen errors (e.g. EADDRINUSE) to the callback instead of throwing
const server = app.listen(env.port, (err) => {
  if (err) {
    logger.fatal({ err, port: env.port }, "failed to start HTTP server");
    db.close();
    process.exit(1);
  }
  logger.info({ port: env.port, dbPath: env.dbPath }, "tax service listening");
});

// ---- Graceful shutdown ----------------------------------------------------

/**
 * Fails /health for SHUTDOWN_DELAY_MS so the load balancer stops routing here, then stops
 * accepting connections, drains in-flight requests and closes the database
 */
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal, delayMs: env.shutdownDelayMs }, "shutdown started, failing health checks");

  setTimeout(closeServer, env.shutdownDelayMs);
}

function closeServer() {
  logger.info("draining in-flight requests");

  const forceExit = setTimeout(() => {
    logger.error({ timeoutMs: env.shutdownTimeoutMs }, "shutdown timed out, forcing exit");
    server.closeAllConnections();
    process.exit(1);
  }, env.shutdownTimeoutMs);
  forceExit.unref();

  server.close((err) => {
    db.close();
    if (err) {
      logger.error({ err }, "error while closing HTTP server");
      process.exit(1);
    }
    logger.info("shutdown complete");
    process.exit(0);
  });

  // Idle keep-alive sockets would otherwise hold the server open
  server.closeIdleConnections();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
