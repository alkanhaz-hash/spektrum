import express, { type Express } from "express";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

app.use("/api", router);

// Serve the web app and API from one published origin. The deployment build
// generates this directory before starting the API server.
const webRoot = path.resolve(process.cwd(), "../spektrum/dist/public");
const webIndex = path.join(webRoot, "index.html");
app.use(express.static(webRoot));
app.get(/^(?!\/api(?:\/|$)).*/, (_req, res, next) => {
  if (!existsSync(webIndex)) {
    next();
    return;
  }
  res.sendFile(webIndex);
});

export default app;
