import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { browserOpenCommandFor, defaultDataRootFor, npmCommandFor } from "./platform.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.MUZI_PORT ?? 4317);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.resolve(process.env.MUZI_DATA_DIR ?? defaultDataRoot());
const logsDir = path.join(dataRoot, "logs");
const pidFile = path.join(dataRoot, "muzi-workspace.pid");
const startLockFile = path.join(dataRoot, "muzi-workspace.starting");
const serverFile = path.join(projectRoot, "dist-server", "server", "index.js");
const webFile = path.join(projectRoot, "dist", "index.html");

fs.mkdirSync(logsDir, { recursive: true });

if (canReuse(await healthStatus())) {
  maybeOpenBrowser();
  console.log(`hasker工作台已经在运行：${baseUrl}`);
  process.exit(0);
}

const launchLock = await acquireLaunchLock();
if (launchLock === null) {
  maybeOpenBrowser();
  console.log(`hasker工作台已经在运行：${baseUrl}`);
  process.exit(0);
}
const releaseLaunchLock = () => {
  try { fs.closeSync(launchLock); } catch { /* The descriptor may already be closed. */ }
  try { fs.unlinkSync(startLockFile); } catch (error) { if (error?.code !== "ENOENT") throw error; }
};
process.once("exit", releaseLaunchLock);

// 获取启动锁后再检查一次，避免两次双击在健康检查与加锁之间同时启动服务。
const existingStatus = await healthStatus();
if (canReuse(existingStatus)) {
  maybeOpenBrowser();
  console.log(`hasker工作台已经在运行：${baseUrl}`);
  process.exit(0);
}

if (existingStatus) {
  console.log("检测到后台服务使用的是旧版页面资源，正在安全保存并自动更新……");
  await stopStaleService(existingStatus);
}

if (!fs.existsSync(serverFile) || !fs.existsSync(webFile)) {
  console.log("首次启动需要生成本地运行文件……");
  const npmCommand = npmCommandFor(process.platform);
  const build = spawnSync(npmCommand, ["run", "build"], { cwd: projectRoot, stdio: "inherit", env: process.env });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const buildId = currentBuildId();
if (!buildId) {
  console.error("本地运行文件不完整，请重新运行 npm run build。");
  process.exit(1);
}
const instanceId = randomUUID();

const logFile = path.join(logsDir, "app.log");
const logDescriptor = fs.openSync(logFile, "a");
const child = spawn(process.execPath, [serverFile], {
  cwd: projectRoot,
  detached: true,
  env: {
    ...process.env,
    NODE_ENV: "production",
    MUZI_PORT: String(port),
    MUZI_DATA_DIR: dataRoot,
    MUZI_BUILD_ID: buildId,
    MUZI_INSTANCE_ID: instanceId,
  },
  stdio: ["ignore", logDescriptor, logDescriptor],
});
child.unref();
fs.closeSync(logDescriptor);
fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, projectRoot, buildId, instanceId, createdAt: new Date().toISOString() }, null, 2), "utf8");

for (let attempt = 0; attempt < 80; attempt += 1) {
  const status = await healthStatus();
  if (status?.application === "muzi-workspace" && status.buildId === buildId && status.instanceId === instanceId) {
    maybeOpenBrowser();
    console.log(`hasker工作台已启动：${baseUrl}`);
    console.log(`数据目录：${dataRoot}`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}

try { process.kill(child.pid, "SIGTERM"); } catch { /* The child may already have exited. */ }
if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile);
console.error(`启动失败，请查看日志：${logFile}`);
process.exit(1);

async function healthStatus() {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return null;
    const data = (await response.json()).data;
    return data?.status === "ok" ? data : null;
  } catch {
    return null;
  }
}

function canReuse(status) {
  const buildId = currentBuildId();
  return Boolean(
    status
      && buildId
      && status.application === "muzi-workspace"
      && status.buildId === buildId,
  );
}

function currentBuildId() {
  try {
    const server = fs.statSync(serverFile);
    const web = fs.statSync(webFile);
    return `${server.size}-${Math.trunc(server.mtimeMs)}:${web.size}-${Math.trunc(web.mtimeMs)}`;
  } catch {
    return null;
  }
}

async function stopStaleService(status) {
  const record = readPidRecord();
  const recordedProcessMatches = record
    && record.projectRoot === projectRoot
    && Number.isSafeInteger(record.pid)
    && record.pid > 1
    && (
      (record.instanceId && status.instanceId && record.instanceId === status.instanceId)
      || expectedServerProcess(record.pid)
    );

  if (!recordedProcessMatches) {
    console.error(`端口 ${port} 上存在无法确认身份的服务。为保护其他程序，hasker工作台没有结束该进程。`);
    process.exit(1);
  }

  try {
    const response = await fetch(`${baseUrl}/api/system/save-and-exit`, {
      method: "POST",
      signal: AbortSignal.timeout(2_000),
    });
    if (response.ok && await waitForServiceStop()) return;
  } catch {
    // 旧版本没有“保存并退出”接口时，继续使用已验证的 PID 安全退出。
  }

  if (processExists(record.pid)) {
    try {
      process.kill(record.pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
  if (!await waitForServiceStop()) {
    console.error("旧版后台服务未能安全退出，请稍后重试。");
    process.exit(1);
  }
  removePidRecord(record.pid);
}

function readPidRecord() {
  try {
    return JSON.parse(fs.readFileSync(pidFile, "utf8"));
  } catch {
    return null;
  }
}

function expectedServerProcess(pid) {
  const expected = normalizeCommandPath(serverFile);
  let commandLine = "";
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`],
      { encoding: "utf8", windowsHide: true },
    );
    commandLine = result.status === 0 ? result.stdout : "";
  } else {
    const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
    commandLine = result.status === 0 ? result.stdout : "";
  }
  return normalizeCommandPath(commandLine).includes(expected);
}

function normalizeCommandPath(value) {
  return String(value).replaceAll("\\", "/").toLowerCase();
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function waitForServiceStop() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!await healthStatus()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function removePidRecord(pid) {
  try {
    const current = readPidRecord();
    if (current?.pid === pid) fs.unlinkSync(pidFile);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function maybeOpenBrowser() {
  if (process.env.MUZI_NO_OPEN === "1") return;
  const { command, args } = browserOpenCommandFor(process.platform, baseUrl);
  const opener = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  opener.unref();
}

async function acquireLaunchLock() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const descriptor = fs.openSync(startLockFile, "wx");
      fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), "utf8");
      return descriptor;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (canReuse(await healthStatus())) return null;
      try {
        const age = Date.now() - fs.statSync(startLockFile).mtimeMs;
        if (age > 5 * 60_000) {
          fs.unlinkSync(startLockFile);
          continue;
        }
      } catch (statError) {
        if (statError?.code !== "ENOENT") throw statError;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  console.error("另一个hasker工作台启动过程仍在进行，请稍后再试。");
  process.exit(1);
}

function defaultDataRoot() {
  return defaultDataRootFor(process.platform, process.env, os.homedir());
}
