import path from "node:path";
import { chromium, defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // 完整验收包含多尺寸截图、三套外观与九个页面；共享 CI runner 的冷启动
  // 明显慢于本机。断言和页面覆盖保持不变，仅给每个完整用例足够执行时间。
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? chromium.executablePath() },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      MUZI_DATA_DIR: path.resolve(".test-data/e2e"),
      MUZI_PORT: "4327",
    },
  },
});
