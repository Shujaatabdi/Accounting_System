import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { getConfig } from "./config";
import { query } from "./db/pool";
import { blockUntilPasswordChanged, requireAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/error-handler";
import { apiRouter, authRouter } from "./routes";

export function createApp() {
  const app = express();
  const config = getConfig();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });

  const api = express.Router();
  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  api.get("/health/ready", (req, res, next) => {
    query("SELECT 1")
      .then(() => res.json({ status: "ok" }))
      .catch(next);
    void req;
  });
  api.use("/auth", authRouter);
  api.use(requireAuth, blockUntilPasswordChanged, apiRouter);
  app.use("/api/v1", api);
  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found." } });
  });
  app.use(errorHandler);
  return app;
}
