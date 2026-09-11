import fs from "node:fs";
import path from "node:path";
import { buildApp } from "./app.js";
import { APP_HOST, APP_PORT, getAppPaths } from "./config.js";

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "正在安全关闭hasker工作台");
  try {
    await app.close();
  } finally {
    removeOwnPidFile();
    process.exit(0);
  }
}

const app = await buildApp({
  logger: true,
  serveStatic: process.env.NODE_ENV === "production",
  requestShutdown: (reason) => void shutdown(reason),
});

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: APP_HOST, port: APP_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

function removeOwnPidFile() {
  const pidFile = path.join(getAppPaths().root, "muzi-workspace.pid");
  try {
    const record = JSON.parse(fs.readFileSync(pidFile, "utf8")) as { pid?: unknown };
    if (Number(record.pid) === process.pid) fs.unlinkSync(pidFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") app.log.warn(error, "无法清理启动记录");
  }
}
