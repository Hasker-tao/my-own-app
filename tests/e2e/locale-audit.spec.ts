import { expect, test, type APIRequestContext } from "@playwright/test";

async function storedUserText(request: APIRequestContext) {
  const values = new Set<string>();
  const keys = new Set(["title", "name", "content", "notes", "description", "display_title", "platform", "next_goal", "progress", "copy_text", "progress_note", "food_name", "asset_path", "body_part"]);
  const collect = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (keys.has(key) && typeof child === "string") values.add(child);
      if (typeof child === "object") collect(child);
    }
  };
  collect((await (await request.get("/api/state")).json()).data);
  collect((await (await request.get("/api/learning")).json()).data);
  return values;
}

test("English UI has no untranslated interface text on all eight pages", async ({ page, request }, info) => {
  await request.put("/api/settings", { data: { language: "en", appearance: "notebook", theme: "light" } });
  const userText = await storedUserText(request);
  for (const route of ["/", "/media", "/development", "/learning", "/fitness", "/diet", "/entertainment", "/settings"]) {
    await page.goto(route);
    await page.locator(".page-header").waitFor();
    const chinese = await page.evaluate(() => {
      const found: string[] = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const value = walk.currentNode.nodeValue?.trim();
        if (value && /[\u3400-\u9fff]/.test(value)) found.push(value);
      }
      return [...new Set(found)];
    });
    expect(chinese.filter((value) => !userText.has(value)), `untranslated interface text on ${route}`).toEqual([]);
    if (route === "/settings") {
      const iconSource = await page.locator(".page-header-icon img.module-artwork").evaluate((image) => getComputedStyle(image).content);
      expect(iconSource).toContain("/assets/desk-icons/settings.svg");
      await page.screenshot({ path: info.outputPath("desk-light.png"), fullPage: true });
    }
  }
  await request.put("/api/settings", { data: { language: "en", appearance: "notebook", theme: "dark" } });
  await page.goto("/settings");
  await page.locator(".page-header").waitFor();
  await expect(page.getByRole("heading", { name: "Data & Settings" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("desk-dark.png"), fullPage: true });
});

test("audit populated English pages", async ({ page, request }) => {
  await request.put("/api/settings", { data: { language: "en", appearance: "notebook", theme: "light" } });
  const records = [
    ["planItems", { title: "Example Plan", plan_date: "2026-09-14", estimated_minutes: 30 }],
    ["quickMemos", { content: "Example Memo" }],
    ["mediaContents", { title: "Example Content" }],
    ["devProjects", { name: "Example Project" }],
    ["workoutTemplates", { name: "Example Workout" }],
    ["foods", { name: "Example Food" }],
    ["meals", { name: "Example Meal", meal_date: "2026-09-14", meal_type: "lunch" }],
    ["entertainmentItems", { name: "Example Game" }],
  ] as const;
  for (const [collection, data] of records) {
    const response = await request.post(`/api/collections/${collection}`, { data });
    if (!response.ok()) throw new Error(`${collection}: ${await response.text()}`);
  }
  const userText = await storedUserText(request);
  for (const route of ["/", "/media", "/development", "/fitness", "/diet", "/entertainment"]) {
    await page.goto(route);
    await page.locator(".page-header").waitFor();
    const chinese = await page.evaluate(() => {
      const found: string[] = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) { const value = walk.currentNode.nodeValue?.trim(); if (value && /[\u3400-\u9fff]/.test(value)) found.push(value); }
      return [...new Set(found)];
    });
    expect(chinese.filter((value) => !userText.has(value)), `untranslated text on populated ${route}`).toEqual([]);
  }
});
