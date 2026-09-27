import { Router } from "express";
import { formatZodError, respondValidationError } from "../errors/validation-error";
import { jsonBody } from "../middleware/require-json";
import { transactionSchema } from "../persistence/schemas";
import type { RouterDeps } from "../router";

/**
 * POST /transactions
 *
 * Ingests a SALES or TAX_PAYMENT event. Responds 202 with no body.
 */
export function transactionsRouter({ sales, payments, metrics }: RouterDeps): Router {
  const router = Router();

  router.post("/transactions", jsonBody, (req, res) => {
    const parsed = transactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return respondValidationError(req, res, metrics, formatZodError(parsed.error));
    }
    const event = parsed.data;

    if (event.eventType === "SALES") {
      const { replaced } = sales.ingestSale(event);

      if (replaced) {
        // Usually means an upstream system is resending invoices
        metrics.duplicateInvoices.inc();
        req.log.warn(
          { invoiceId: event.invoiceId },
          "duplicate invoiceId, previous sale overwritten and archived to sales_audit"
        );
      }

      req.log.info(
        {
          eventType: event.eventType,
          invoiceId: event.invoiceId,
          date: event.date,
          itemCount: event.items.length
        },
        "sale ingested"
      );
    } else {
      payments.ingestTaxPayment(event);
      req.log.info(
        { eventType: event.eventType, date: event.date, amount: event.amount },
        "tax payment ingested"
      );
    }

    metrics.eventsIngested.inc({ event_type: event.eventType });
    res.status(202).end();
  });

  return router;
}
