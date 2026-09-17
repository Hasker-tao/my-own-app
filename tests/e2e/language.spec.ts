import { expect, test } from "@playwright/test";

test("switches interface language without changing stored record text", async ({ page, request }) => {
  await request.put("/api/settings", { data: { language: "zh-CN", appearance: "notebook", theme: "light" } });
  await request.post("/api/collections/quickMemos", { data: { content: "保留我的中文笔记" } });
  await page.goto("/settings");
  await page.getByLabel("界面语言").selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Data & Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & Exit" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("保留我的中文笔记")).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByLabel("Interface Language")).toHaveValue("en");
  await page.getByLabel("Interface Language").selectOption("zh-CN");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { name: "数据与设置" })).toBeVisible();
});
