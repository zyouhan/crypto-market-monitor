import "./env";

import express from "express";
import cookieParser from "cookie-parser";

import { requireAuth } from "./api/auth";
import {
  apiOriginGuard,
  errorHandler,
  notFoundHandler,
  success
} from "./api/middleware";
import { authRouter } from "./api/routes/auth";
import { conditionsRouter } from "./api/routes/conditions";
import { casesRouter } from "./api/routes/cases";
import { monitorsRouter } from "./api/routes/monitors";
import { notesRouter } from "./api/routes/notes";
import { settingsRouter } from "./api/routes/settings";
import { signalsRouter } from "./api/routes/signals";
import { db, resolvedDatabasePath } from "./db";
import {
  getWorkerHealth,
  startWorker,
  stopWorker
} from "./engine/worker";

const app = express();

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";

app.disable("x-powered-by");

app.use(express.json({ limit: "8mb" }));
app.use(cookieParser());

app.use("/api", apiOriginGuard);

/**
 * 健康检查
 */
app.get("/api/health", (_req, res) => {
  res.json(
    success({
      status: "ok",
      timestamp: Date.now(),
      worker: getWorkerHealth()
    })
  );
});

/**
 * 登录 / 退出 / 登录状态
 */
app.use("/api/auth", authRouter);

/**
 * 以下接口全部需要登录
 */
app.use("/api", requireAuth);

app.use("/api/monitors", monitorsRouter);
app.use("/api/conditions", conditionsRouter);
app.use("/api/signals", signalsRouter);
app.use("/api/notes", notesRouter);
app.use("/api/cases", casesRouter);
app.use("/api/settings", settingsRouter);

app.use("/api", notFoundHandler);

app.use(errorHandler);

const server = app.listen(PORT, HOST, () => {
  console.log(
    `[Server] API 服务已启动: http://${HOST}:${PORT}`
  );

  console.log(`[Server] 数据库: ${resolvedDatabasePath}`);

  startWorker();
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(`[Server] 收到 ${signal}，准备关闭`);

  stopWorker();

  server.close(() => {
    db.close();

    console.log("[Server] 服务已关闭");

    process.exit(0);
  });

  setTimeout(() => {
    console.error("[Server] 关闭超时，强制退出");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
