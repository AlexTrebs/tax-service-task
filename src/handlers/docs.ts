import { readFileSync } from "node:fs";
import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { parse as parseYaml } from "yaml";

const openApiSpec = parseYaml(readFileSync(new URL("../../openapi.yaml", import.meta.url), "utf8"));

/**
 * GET /docs
 *
 * Swagger UI for openapi.yaml.
 */
export function docsRouter(): Router {
  const router = Router();
  router.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
  return router;
}
