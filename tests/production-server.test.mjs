import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { browserOpenCommandFor, defaultDataRootFor, npmCommandFor } from "../scripts/platform.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("production server serves the built app and API on loopback", async (context) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "muzi-production-"));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(projectRoot, "scripts", "start-server.mjs")], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "production", MUZI_BUILD_ID: "production-test-build", MUZI_DATA_DIR: dataRoot, MUZI_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  context.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dataRoot, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, child, () => output);
  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.data.status, "ok");
  assert.equal(health.data.database, "ok");
  assert.equal(health.data.application, "muzi-workspace");
  assert.equal(health.data.buildId, "production-test-build");

  const home = await fetch(baseUrl).then((response) => response.text());
  assert.match(home, /<div id="root"><\/div>/);
  assert.match(home, /\/assets\/[^"']+\.js/);
  const assetPaths = [...home.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((match) => match[1]);
  assert.equal(assetPaths.some((asset) => asset.endsWith(".js")), true);
  assert.equal(assetPaths.some((asset) => asset.endsWith(".css")), true);
  for (const asset of assetPaths) {
    const response = await fetch(`${baseUrl}${asset}`);
    const contentType = response.headers.get("content-type") ?? "";
    assert.equal(response.ok, true, `${asset} should be served`);
    assert.match(contentType, asset.endsWith(".js") ? /javascript/ : /text\/css/);
    assert.doesNotMatch(await response.text(), /<html/i);
  }
  const missingAsset = await fetch(`${baseUrl}/assets/missing-build-file.js`);
  assert.equal(missingAsset.status, 404);
  assert.doesNotMatch(await missingAsset.text(), /<html/i);
  const clientRoute = await fetch(`${baseUrl}/today`).then((response) => response.text());
  assert.match(clientRoute, /<title>hasker工作台<\/title>/);
});

test("desktop launcher reuses one server and the page exit endpoint saves before stopping it", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "muzi-launcher-"));
  const port = await freePort();
  const env = { ...process.env, MUZI_DATA_DIR: dataRoot, MUZI_PORT: String(port), MUZI_NO_OPEN: "1" };
  try {
    const started = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "start-app.mjs")], { cwd: projectRoot, env, encoding: "utf8", timeout: 30_000 });
    assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
    const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((response) => response.json());
    assert.equal(health.data.status, "ok");
    const pidFile = path.join(dataRoot, "muzi-workspace.pid");
    const record = JSON.parse(fs.readFileSync(pidFile, "utf8"));
    assert.equal(Number.isSafeInteger(record.pid), true);
    assert.equal(record.projectRoot, projectRoot);

    const startedAgain = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "start-app.mjs")], { cwd: projectRoot, env, encoding: "utf8", timeout: 15_000 });
    assert.equal(startedAgain.status, 0, `${startedAgain.stdout}\n${startedAgain.stderr}`);
    assert.match(startedAgain.stdout, /已经在运行/);
    const reusedRecord = JSON.parse(fs.readFileSync(pidFile, "utf8"));
    assert.equal(reusedRecord.pid, record.pid);

    const saved = await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ launcherPersistence: "保存并退出后仍存在" }),
    });
    assert.equal(saved.ok, true);
    const exit = await fetch(`http://127.0.0.1:${port}/api/system/save-and-exit`, { method: "POST" }).then((response) => response.json());
    assert.equal(exit.data.database, "ok");
    assert.equal(exit.data.exiting, true);
    await waitForStopped(`http://127.0.0.1:${port}`);
    await waitForFileRemoval(pidFile);
    assert.equal(fs.existsSync(pidFile), false);

    const restarted = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "start-app.mjs")], { cwd: projectRoot, env, encoding: "utf8", timeout: 30_000 });
    assert.equal(restarted.status, 0, `${restarted.stdout}\n${restarted.stderr}`);
    await waitForHealth(`http://127.0.0.1:${port}`, { exitCode: null }, () => restarted.stdout);
    const settings = await fetch(`http://127.0.0.1:${port}/api/settings`).then((response) => response.json());
    assert.equal(settings.data.launcherPersistence, "保存并退出后仍存在");
    const restartedRecord = JSON.parse(fs.readFileSync(pidFile, "utf8"));
    process.kill(restartedRecord.pid, "SIGTERM");
    await waitForStopped(`http://127.0.0.1:${port}`);
    // Windows 会直接终止进程，无法保证执行 SIGTERM 清理钩子；下次启动器会
    // 安全覆盖同一数据目录里的过期 PID 记录。macOS/Linux 则应主动清理。
    if (process.platform !== "win32") {
      await waitForFileRemoval(pidFile);
      assert.equal(fs.existsSync(pidFile), false);
    }

    const afterSystemShutdown = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "start-app.mjs")], { cwd: projectRoot, env, encoding: "utf8", timeout: 30_000 });
    assert.equal(afterSystemShutdown.status, 0, `${afterSystemShutdown.stdout}\n${afterSystemShutdown.stderr}`);
    await waitForHealth(`http://127.0.0.1:${port}`, { exitCode: null }, () => afterSystemShutdown.stdout);
    const settingsAfterShutdown = await fetch(`http://127.0.0.1:${port}/api/settings`).then((response) => response.json());
    assert.equal(settingsAfterShutdown.data.launcherPersistence, "保存并退出后仍存在");
    await fetch(`http://127.0.0.1:${port}/api/system/save-and-exit`, { method: "POST" });
    await waitForStopped(`http://127.0.0.1:${port}`);
  } finally {
    const pidFile = path.join(dataRoot, "muzi-workspace.pid");
    if (fs.existsSync(pidFile)) {
      try { process.kill(JSON.parse(fs.readFileSync(pidFile, "utf8")).pid, "SIGTERM"); } catch { /* Already stopped. */ }
    }
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("desktop launcher replaces a stale build before opening the page", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "muzi-stale-launcher-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const pidFile = path.join(dataRoot, "muzi-workspace.pid");
  const env = { ...process.env, MUZI_DATA_DIR: dataRoot, MUZI_PORT: String(port), MUZI_NO_OPEN: "1" };
  const staleInstanceId = "stale-instance";
  const stale = spawn(process.execPath, [path.join(projectRoot, "dist-server", "server", "index.js")], {
    cwd: projectRoot,
    env: {
      ...env,
      NODE_ENV: "production",
      MUZI_BUILD_ID: "stale-build",
      MUZI_INSTANCE_ID: staleInstanceId,
    },
    stdio: "ignore",
  });

  try {
    fs.writeFileSync(pidFile, JSON.stringify({
      pid: stale.pid,
      projectRoot,
      buildId: "stale-build",
      instanceId: staleInstanceId,
      createdAt: new Date().toISOString(),
    }), "utf8");
    await waitForHealth(baseUrl, stale, () => "stale server did not start");

    const started = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "start-app.mjs")], {
      cwd: projectRoot,
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(started.status, 0, `${started.stdout}\n${started.stderr}`);
    assert.match(started.stdout, /旧版页面资源/);

    const replacement = JSON.parse(fs.readFileSync(pidFile, "utf8"));
    assert.notEqual(replacement.pid, stale.pid);
    const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
    assert.equal(health.data.application, "muzi-workspace");
    assert.notEqual(health.data.buildId, "stale-build");
    assert.equal(health.data.buildId, replacement.buildId);

    const home = await fetch(baseUrl).then((response) => response.text());
    const scriptPath = home.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    assert.ok(scriptPath);
    const script = await fetch(`${baseUrl}${scriptPath}`);
    assert.equal(script.ok, true);
    assert.match(script.headers.get("content-type") ?? "", /javascript/);
  } finally {
    try { await fetch(`${baseUrl}/api/system/save-and-exit`, { method: "POST" }); } catch { /* Already stopped. */ }
    await waitForStopped(baseUrl).catch(() => {});
    if (stale.exitCode === null) stale.kill("SIGTERM");
    if (fs.existsSync(pidFile)) {
      try { process.kill(JSON.parse(fs.readFileSync(pidFile, "utf8")).pid, "SIGTERM"); } catch { /* Already stopped. */ }
    }
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

test("ships one user-facing launcher per desktop OS and no stop script", () => {
  const macLauncher = path.join(projectRoot, "启动hasker工作台.command");
  const windowsLauncher = path.join(projectRoot, "启动hasker工作台.bat");
  assert.equal(fs.existsSync(macLauncher), true);
  assert.equal(fs.existsSync(windowsLauncher), true);
  assert.match(fs.readFileSync(macLauncher, "utf8"), /npm run app:start/);
  assert.match(fs.readFileSync(macLauncher, "utf8"), /cd -- "\$\{0:A:h\}"/);
  assert.match(fs.readFileSync(windowsLauncher, "utf8"), /call npm run app:start/);
  assert.match(fs.readFileSync(windowsLauncher, "utf8"), /cd \/d "%~dp0"/);
  assert.equal(fs.existsSync(path.join(projectRoot, "停止hasker工作台.command")), false);
  assert.equal(fs.existsSync(path.join(projectRoot, "scripts", "stop-app.mjs")), false);
});

test("desktop platform helpers preserve macOS and Windows paths and commands", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts.start, "node scripts/start-server.mjs");
  assert.doesNotMatch(packageJson.scripts.start, /NODE_ENV=/);
  assert.equal(
    defaultDataRootFor("darwin", {}, "/Users/muzi"),
    "/Users/muzi/Library/Application Support/MuziWorkspace",
  );
  assert.equal(
    defaultDataRootFor("win32", { LOCALAPPDATA: "C:\\Users\\Muzi User\\AppData\\Local" }, "C:\\Users\\Muzi User"),
    "C:\\Users\\Muzi User\\AppData\\Local\\MuziWorkspace",
  );
  assert.equal(npmCommandFor("darwin"), "npm");
  assert.equal(npmCommandFor("win32"), "npm.cmd");
  assert.deepEqual(browserOpenCommandFor("darwin", "http://127.0.0.1:4317"), {
    command: "open",
    args: ["http://127.0.0.1:4317"],
  });
  assert.deepEqual(browserOpenCommandFor("win32", "http://127.0.0.1:4317"), {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", "start", "", "http://127.0.0.1:4317"],
  });
});

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, child, getOutput) {
  // Windows 托管 runner 首次加载原生 SQLite 模块可能超过 10 秒；仍要求
  // 同一个真实生产服务成功响应健康检查，只为冷启动保留最多约 30 秒。
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`生产服务提前退出（${child.exitCode}）：${getOutput()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`生产服务未在限定时间内启动：${getOutput()}`);
}

async function waitForStopped(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(250) });
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("生产服务未在限定时间内退出");
}

async function waitForFileRemoval(file) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (!fs.existsSync(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`文件未在限定时间内移除：${file}`);
}
