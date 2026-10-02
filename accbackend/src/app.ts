import cors from "cors";
import express from "express";
import helmet from "helmet";
import { getConfig } from "./config/env";
import { query } from "./db/pool";
import { requireAuth } from "./middleware/authenticate";
import { blockUntilPasswordChanged } from "./middleware/authorize";
import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import { requestContext } from "./middleware/request-context";
import { apiRouter, authRouter } from "./routes";

export function createApp() {
  const app = express();
  const config = getConfig();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(requestContext);

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
  api.use(requireAuth, blockUntilPasswordChanged, apiRouter());
  app.use("/api/v1", api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
