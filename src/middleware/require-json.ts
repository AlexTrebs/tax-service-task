import express, { type RequestHandler } from "express";
import { JSON_BODY_LIMIT } from "../config/constants";

// Rejects requests with a non-JSON body with 415
export const requireJson: RequestHandler = (req, res, next) => {
  // req.is() returns null when there's no body, that case is left to validation
  if (req.is("application/json") === false) {
    res.status(415).json({
      error: "UnsupportedMediaType",
      message: "Content-Type must be application/json"
    });
    return;
  }
  next();
};

// JSON body handling, attached per route rather than app-wide so unknown paths get a 404
export const jsonBody: RequestHandler = express
  .Router()
  .use(requireJson, express.json({ limit: JSON_BODY_LIMIT }));
