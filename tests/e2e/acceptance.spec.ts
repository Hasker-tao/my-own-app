import { test, expect, type APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function create(request: APIRequestContext, collection: string, payload: Record<string, any>) {
  const response = await request.post(`/api/collections/${collection}`, { data: payload });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data;
}

test("opens locally, uses no external runtime resources, and reaches all nine pages", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) externalRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "liquid");
  await expect(page.getByRole("heading", { name: /从重点开始/ })).toBeVisible();
  const destinations = [
    ["首页总览", /从重点开始/], ["今日计划", "今日计划"], ["自媒体", "自媒体"], ["开发工作", "开发工作"],
    ["学习", "学习工作台"], ["健身计划", "健身计划"], ["饮食计划", "饮食计划"], ["游戏娱乐", "游戏娱乐"], ["数据与设置", "数据与设置"],
  ] as const;
  for (const [link, heading] of destinations) {
    await page.getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  await page.getByRole("link", { name: "首页总览" }).click();
  await page.locator(".summary-tile").filter({ hasText: "自媒体" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "自媒体" })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("closing the browser page leaves the local service available for reuse", async ({ browser, request }) => {
  const context = await browser.newContext();
  const disposablePage = await context.newPage();
  await disposablePage.goto("/");
  await expect(disposablePage.locator(".app-shell")).toBeVisible();
  await disposablePage.close();
  await context.close();
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect((await health.json()).data.status).toBe("ok");
});

test("keeps the Liquid Glass shell readable at both target desktop sizes", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1728, height: 1117 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["/", "/media", "/fitness", "/diet", "/settings"]) {
      await page.goto(path);
      await expect(page.locator(".sidebar")).toBeVisible();
      await expect(page.locator(".topbar")).toBeVisible();
      await expect(page.getByRole("button", { name: "手动保存" })).toBeVisible();
      const layout = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        mainWidth: document.querySelector("main")?.getBoundingClientRect().width ?? 0,
      }));
      expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.mainWidth).toBeGreaterThan(700);
    }
    await page.goto("/");
    const topbarMaterial = await page.locator(".topbar").evaluate((element) => {
      const style = getComputedStyle(element);
      return style.backdropFilter;
    });
    expect(topbarMaterial).toContain("blur");

    // 内容层使用更轻的磨砂，工具栏使用更强的通透模糊；二者都要有真实材质，
    // 但不能把高密度内容做成和控制层一样轻飘。
    await page.locator(".dashboard-primary .section").first().waitFor();
    const surfaces = await page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        const parts = style.backgroundColor.match(/[\d.]+/g) ?? [];
        return { alpha: parts.length >= 4 ? Number(parts[parts.length - 1]) : 1, backdrop: style.backdropFilter };
      };
      return { content: read(".dashboard-primary .section"), chrome: read(".topbar") };
    });
    expect(surfaces.content).not.toBeNull();
    expect(surfaces.content!.alpha).toBeGreaterThan(0.4);
    expect(surfaces.content!.alpha).toBeLessThan(1);
    expect(surfaces.content!.backdrop).toContain("blur");
    expect(surfaces.chrome!.backdrop).toContain("blur");

    const shellGeometry = await page.evaluate(() => {
      const read = (selector: string) => {
        const style = getComputedStyle(document.querySelector(selector)!);
        return { radius: Number.parseFloat(style.borderTopLeftRadius), border: Number.parseFloat(style.borderTopWidth) };
      };
      return { sidebar: read(".sidebar"), topbar: read(".topbar") };
    });
    expect(shellGeometry.sidebar.radius).toBeGreaterThanOrEqual(20);
    expect(shellGeometry.topbar.radius).toBeGreaterThanOrEqual(20);
    expect(shellGeometry.sidebar.border).toBeGreaterThanOrEqual(1);
    expect(shellGeometry.topbar.border).toBeGreaterThanOrEqual(1);

    // 环境层必须真的会动，否则控件层的模糊没有可折射的对象。
    const parallax = await page.evaluate(async () => {
      const read = () => getComputedStyle(document.documentElement).getPropertyValue("--ambient-shift").trim();
      const atTop = read();
      window.scrollTo(0, 600);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const scrolled = read();
      window.scrollTo(0, 0);
      return { atTop, scrolled };
    });
    expect(parallax.scrolled).not.toBe(parallax.atTop);
  }
});

test("keeps one animated multicolor environment across modules without leaving the local app", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) externalRequests.push(request.url());
  });
  await page.goto("/development");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-ambient", "chromatic");
  await expect(page.locator(".ambient-scene-chromatic.is-current")).toHaveCount(1);
  await page.getByRole("link", { name: "自媒体" }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-ambient", "chromatic");
  await expect(page.locator(".ambient-scene-chromatic.is-current")).toHaveCount(1);
  await expect(page.locator(".ambient-environment__image.is-previous")).toHaveCount(0);
  const materials = await page.locator(".ambient-environment__image.is-current").evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(materials).toContain("chromatic-polymer-light-v1.webp");
  const backgroundMotion = await page.locator(".ambient-environment__image.is-current").evaluate((element) => getComputedStyle(element, "::before").animationName);
  expect(backgroundMotion).toContain("ambient-drift");
  const glassEdge = await page.locator(".topbar").evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(glassEdge.match(/linear-gradient/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  expect(externalRequests).toEqual([]);
});

test("uses a distinct local AI-generated icon for every module in one consistent visual system", async ({ page }) => {
  await page.goto("/");
  const brandIcon = page.locator(".brand-mark img");
  await expect(brandIcon).toBeVisible();
  await expect(page.locator(".brand-mark")).not.toContainText("木");
  const brandState = await brandIcon.evaluate((icon) => ({
    source: (icon as HTMLImageElement).getAttribute("src"),
    loaded: (icon as HTMLImageElement).complete && (icon as HTMLImageElement).naturalWidth >= 64,
  }));
  expect(brandState.source).toBe("/assets/brand/hasker-mark.svg");
  expect(brandState.loaded).toBeTruthy();
  await expect(page.locator(".page-header-icon .module-artwork")).toBeVisible();
  await expect(page.locator(".toolbar-page-icon .module-artwork")).toBeVisible();
  const navigationIcons = page.locator(".nav-link > .module-artwork");
  await expect(navigationIcons).toHaveCount(9);
  const iconState = await navigationIcons.evaluateAll((icons) => ({
    sources: icons.map((icon) => (icon as HTMLImageElement).getAttribute("src")),
    allLoaded: icons.every((icon) => (icon as HTMLImageElement).complete && (icon as HTMLImageElement).naturalWidth > 0),
    radii: icons.map((icon) => Number.parseFloat(getComputedStyle(icon).borderTopLeftRadius)),
  }));
  expect(new Set(iconState.sources).size).toBe(9);
  expect(iconState.sources.every((source) => source === "/assets/brand/learning.svg" || (source?.startsWith("/assets/module-icons/") && source.endsWith("-v1.webp")))).toBeTruthy();
  expect(iconState.allLoaded).toBeTruthy();
  expect(Math.min(...iconState.radii)).toBeGreaterThanOrEqual(9);

  await page.getByRole("button", { name: "快速新建" }).click();
  await expect(page.locator(".quick-option-icon")).toHaveCount(6);
  await expect(page.locator(".quick-option-icon .module-artwork")).toHaveCount(6);
  const iconRadius = await page.locator(".quick-option-icon").first().evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
  );
  expect(iconRadius).toBeGreaterThanOrEqual(10);
});

test("keeps Neo isolated, multicolor and overflow-free across all pages and target viewports", async ({ page, request }) => {
  test.setTimeout(120_000);
  const pages = ["/", "/today", "/media", "/development", "/learning", "/fitness", "/diet", "/entertainment", "/settings"];
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1728, height: 1117 },
    { width: 390, height: 844 },
  ];

  try {
    expect((await request.put("/api/settings", { data: { appearance: "neo", theme: "light" } })).ok()).toBeTruthy();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const path of pages) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-appearance", "neo");
        await expect(page.locator(".app-shell")).toHaveClass(/neo-shell/);
        await expect(page.locator(".page-header")).toBeVisible();
        await expect(page.locator(".ambient-environment")).toHaveCount(0);
        await expect(page.getByRole("link", { name: "数据与设置" })).toBeVisible();

        const layout = await page.evaluate(() => {
          const shellStyle = getComputedStyle(document.querySelector(".app-shell")!);
          const headerStyle = getComputedStyle(document.querySelector(".page-header")!, "::after");
          const activeBlur = [...document.querySelectorAll("body *")].filter((element) => {
            const value = getComputedStyle(element).backdropFilter;
            return value && value !== "none";
          });
          return {
            viewportWidth: document.documentElement.clientWidth,
            pageWidth: document.documentElement.scrollWidth,
            emblemImage: headerStyle.backgroundImage,
            blurredElements: activeBlur.length,
            palette: ["--mix-a", "--mix-b", "--mix-c", "--mix-d", "--mix-e"].map((name) => shellStyle.getPropertyValue(name).trim()),
          };
        });
        expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewportWidth);
        expect(layout.emblemImage).toContain("module-emblems.png");
        expect(layout.blurredElements).toBe(0);
        expect(new Set(layout.palette).size).toBe(5);
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".neo-nav-emblem")).toHaveCount(8);
    const emblemState = await page.locator(".neo-nav-emblem").evaluateAll((emblems) => ({
      allUseSprite: emblems.every((emblem) => getComputedStyle(emblem).backgroundImage.includes("module-emblems.png")),
      positions: emblems.map((emblem) => getComputedStyle(emblem).backgroundPosition),
    }));
    expect(emblemState.allUseSprite).toBe(true);
    expect(new Set(emblemState.positions).size).toBe(8);

    expect((await request.put("/api/settings", { data: { appearance: "neo", theme: "dark" } })).ok()).toBeTruthy();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-appearance", "neo");
    const darkSurface = await page.evaluate(() => ({
      topbarFilter: getComputedStyle(document.querySelector(".topbar")!).backdropFilter,
      topbarBackground: getComputedStyle(document.querySelector(".topbar")!).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    }));
    expect(darkSurface.topbarFilter).toBe("none");
    expect(darkSurface.topbarBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(darkSurface.bodyBackground).not.toBe("rgba(0, 0, 0, 0)");
  } finally {
    await request.put("/api/settings", { data: { appearance: "liquid", theme: "light" } });
  }

  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "liquid");
  await expect(page.locator(".ambient-environment")).toBeVisible();
  await expect(page.locator(".app-shell")).not.toHaveClass(/neo-shell/);
  await expect(page.locator(".topbar")).toHaveCSS("backdrop-filter", /blur/);
});

test("keeps every module's primary business entry and safe-exit control available in all three appearances", async ({ page, request }) => {
  // 该用例要真实访问 3 套外观下的 9 个页面；云端共享 runner 比本机慢，
  // 保留全部 27 次导航与断言，并为完整验收留出与 Neo 全视口用例相同的时间。
  test.setTimeout(120_000);
  const routes = [
    ["/", "添加今日事项"],
    ["/today", "添加事项"],
    ["/media", "记录内容"],
    ["/development", "新建项目"],
    ["/learning", "导入课程"],
    ["/fitness", "新建训练模板"],
    ["/diet", "记录餐食"],
    ["/entertainment", "添加游戏或活动"],
    ["/settings", "立即备份"],
  ] as const;

  for (const appearance of ["liquid", "notebook", "neo"] as const) {
    expect((await request.put("/api/settings", { data: { appearance, theme: "light" } })).ok()).toBeTruthy();
    for (const [path, action] of routes) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-appearance", appearance);
      await expect(page.getByRole("button", { name: action, exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "保存并退出", exact: true })).toBeVisible();
    }
  }
  await request.put("/api/settings", { data: { appearance: "liquid", theme: "light" } });
});

test("keeps major panels separated and grid columns aligned in all three appearances", async ({ page, request }) => {
  // 逐套外观检查 5 个高密度页面，不减少覆盖面，只避免云端冷启动误判。
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await create(request, "entertainmentItems", { name: "布局间距验收游戏", platform: "本地", status: "playing" });

  const readGridFlow = async (selector: string) => page.locator(selector).evaluate((grid) => {
    const rect = grid.getBoundingClientRect();
    const previous = grid.previousElementSibling?.getBoundingClientRect();
    const next = grid.nextElementSibling?.getBoundingClientRect();
    const children = Array.from(grid.children).map((child) => child.getBoundingClientRect());
    return {
      before: previous ? Math.round(rect.top - previous.bottom) : null,
      after: next ? Math.round(next.top - rect.bottom) : null,
      firstRowTopDelta: children.length > 1 ? Math.round(children[1].top - children[0].top) : 0,
    };
  });

  try {
    for (const appearance of ["liquid", "notebook", "neo"] as const) {
      expect((await request.put("/api/settings", { data: { appearance, theme: "light" } })).ok()).toBeTruthy();

      await page.goto("/settings");
      const settings = await readGridFlow(".settings-grid");
      expect(settings.before).toBeGreaterThanOrEqual(12);
      expect(settings.after).toBeGreaterThanOrEqual(12);
      expect(Math.abs(settings.firstRowTopDelta)).toBeLessThanOrEqual(1);

      await page.goto("/fitness");
      const fitness = await readGridFlow(".fitness-grid");
      expect(fitness.before).toBeGreaterThanOrEqual(12);
      expect(fitness.after).toBeGreaterThanOrEqual(12);
      expect(Math.abs(fitness.firstRowTopDelta)).toBeLessThanOrEqual(1);

      await page.goto("/diet");
      const nutrition = await readGridFlow(".nutrition-strip");
      const meals = await readGridFlow(".meal-columns");
      expect(nutrition.before).toBeGreaterThanOrEqual(12);
      expect(meals.after).toBeGreaterThanOrEqual(12);

      await page.goto("/entertainment");
      const games = await readGridFlow(".game-grid");
      expect(games.after).toBeGreaterThanOrEqual(12);

      await page.goto("/learning");
      await expect(page.getByRole("heading", { name: "学习工作台" })).toBeVisible();
    }
  } finally {
    await request.put("/api/settings", { data: { appearance: "liquid", theme: "light" } });
  }
});

test("keeps row menus above completed rows and opaque enough to read", async ({ page, request }) => {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const done = await create(request, "planItems", { title: "层叠回归·已完成", plan_date: today, start_time: "08:00", priority: "medium" });
  await request.post(`/api/plan-items/${done.id}/complete`);
  const next = await create(request, "planItems", { title: "层叠回归·后续事项", plan_date: today, start_time: "09:00", priority: "high" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/today");
  const doneRow = page.locator(".plan-table-row.is-done").first();
  await expect(doneRow).toBeVisible();
  await doneRow.locator(".icon-button").click();
  const menu = page.locator(".row-menu");
  await expect(menu).toBeVisible();

  // 已完成行不能用 opacity 变淡：那会建立层叠上下文，把浮出菜单困在行内。
  await expect(doneRow).toHaveCSS("opacity", "1");

  const probe = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    // rgb(...) 为 3 个分量、rgba(...) 与 color(srgb ... / a) 为 4 个，末位即 alpha
    const parts = getComputedStyle(element).backgroundColor.match(/[\d.]+/g) ?? [];
    return {
      menuOnTop: Boolean(hit && element.contains(hit)),
      alpha: parts.length >= 4 ? Number(parts[parts.length - 1]) : 1,
    };
  });
  expect(probe.menuOnTop).toBe(true);
  expect(probe.alpha).toBeGreaterThanOrEqual(0.8);

  // 这些夹具只服务本用例，清理干净以免影响后续用例的今日进度断言
  for (const id of [done.id, next.id]) {
    await request.delete(`/api/collections/planItems/${id}`);
    await request.delete(`/api/collections/planItems/${id}/permanent`);
  }
});

test("creates, schedules, displays and completes a daily plan item", async ({ page }) => {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  await page.goto("/today");
  await page.locator("header").getByRole("button", { name: "添加事项" }).click();
  await page.getByLabel(/事项名称/).fill("浏览器验收任务");
  await page.getByLabel(/^日期/).fill(today);
  await page.getByLabel(/开始时间/).fill("10:30");
  await page.getByLabel(/预计分钟/).fill("45");
  await page.getByLabel(/优先级/).selectOption("high");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("浏览器验收任务")).toBeVisible();
  await page.getByRole("link", { name: "首页总览" }).click();
  const row = page.locator(".plan-row").filter({ hasText: "浏览器验收任务" });
  await expect(row).toContainText("10:30");
  await row.getByRole("button", { name: "标记完成" }).click();
  await expect(row).toHaveClass(/is-done/);
  await expect(page.locator(".overview-strip")).toContainText("100");
});

test("creates media content and finds it through global search", async ({ page }) => {
  await page.goto("/media");
  await page.getByRole("button", { name: "记录内容" }).click();
  await page.getByLabel(/内容标题/).fill("可搜索的内容灵感");
  await page.getByLabel(/^平台/).fill("B站");
  await page.getByLabel(/内容形式/).fill("视频");
  await page.getByLabel(/制作阶段/).selectOption("producing");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("可搜索的内容灵感")).toBeVisible();
  await page.getByRole("button", { name: /搜索所有内容/ }).click();
  await page.getByPlaceholder("输入关键词").fill("可搜索");
  await expect(page.getByRole("button", { name: "可搜索的内容灵感", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const card = page.locator(".media-card").filter({ hasText: "可搜索的内容灵感" });
  await card.locator(".icon-button").click();
  await card.locator(".row-menu").getByRole("button", { name: "编辑详情", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel(/制作阶段/).selectOption("published");
  await editor.getByLabel(/实际发布日期/).fill("2026-08-02");
  await editor.getByLabel(/播放或阅读/).fill("1387");
  await editor.getByLabel(/^点赞/).fill("94");
  await editor.getByLabel(/^评论/).fill("17");
  await editor.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("img", { name: "发布后视频数据图表" })).toBeVisible();
  await expect(page.getByText("1,387", { exact: true })).toBeVisible();
  await expect(page.getByText("8.0%", { exact: true })).toBeVisible();
});

test("keeps linked plan titles live and opens the source module", async ({ page, request }) => {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const media = await create(request, "mediaContents", { title: "原始来源标题", stage: "producing" });
  await create(request, "planItems", { title: "旧的副本标题", plan_date: today, source_module: "media", source_entity_type: "media_content", source_entity_id: media.id });
  expect((await request.patch(`/api/collections/mediaContents/${media.id}`, { data: { title: "来源更新后的标题" } })).ok()).toBeTruthy();
  await page.goto("/today");
  const row = page.locator(".plan-table-row").filter({ hasText: "来源更新后的标题" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /打开来源/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "自媒体" })).toBeVisible();
});

test("auto-saves a quick memo across reload and converts it into today's plan", async ({ page }) => {
  await page.goto("/");
  const memo = page.getByLabel("快速备忘");
  await memo.fill("自动保存并转换的备忘");
  await expect(page.getByRole("status")).toContainText("已保存", { timeout: 5_000 });
  await page.reload();
  await expect(page.getByLabel("快速备忘")).toHaveValue("自动保存并转换的备忘");
  await page.getByRole("button", { name: "转为今日事项" }).click();
  await page.getByRole("link", { name: "今日计划" }).click();
  await expect(page.getByText("自动保存并转换的备忘")).toBeVisible();
});

test("manually saves a pending quick memo before the automatic delay", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("快速备忘").fill("手动保存的未提交备忘");
  await page.getByRole("button", { name: "手动保存" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.reload();
  await expect(page.getByLabel("快速备忘")).toHaveValue("手动保存的未提交备忘");
});

test("adds a development work item from the work-item section", async ({ page, request }) => {
  await create(request, "devProjects", { name: "入口验收项目", status: "active" });
  await page.goto("/development");
  const section = page.locator("section.section").filter({ has: page.getByRole("heading", { level: 2, name: "工作项" }) });
  await expect(section.getByRole("button", { name: "添加工作项" })).toBeVisible();
  await section.getByRole("button", { name: "添加工作项" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/标题/).fill("从区块入口新增的 Bug");
  await dialog.getByLabel(/类型/).selectOption("bug");
  await dialog.getByLabel(/优先级/).selectOption("high");
  await dialog.getByLabel(/说明/).fill("验证工作项入口始终可见");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(section.getByText("从区块入口新增的 Bug")).toBeVisible();
});

test("hides consulting navigation while retaining historical data", async ({ page, request }) => {
  const client = await create(request, "clients", { name: "保留的历史客户" });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "咨询工作", exact: true })).toHaveCount(0);
  const rows = (await (await request.get("/api/collections/clients")).json()).data;
  expect(rows.some((row: { id: string }) => row.id === client.id)).toBe(true);
});

test("shows workout and meal details in monthly calendars", async ({ page, request }) => {
  await page.clock.setFixedTime(new Date("2026-08-02T12:00:00"));
  const template = await create(request, "workoutTemplates", { name: "日历力量训练", body_part: "上肢", weekday: 7 });
  const workout = await create(request, "workouts", { template_id: template.id, name: "周日训练", body_part: "上肢", workout_date: "2026-08-02", status: "completed" });
  const exercise = await create(request, "workoutExercises", { workout_id: workout.id, name: "卧推", sort_order: 0 });
  await create(request, "workoutSets", { workout_exercise_id: exercise.id, set_number: 1, reps: 8, weight: 50, completed: 1 });
  await create(request, "workoutSets", { workout_exercise_id: exercise.id, set_number: 2, reps: 8, weight: 50, completed: 1 });
  const meal = await create(request, "meals", { meal_date: "2026-08-02", meal_type: "dinner", name: "日历验收晚餐", entry_kind: "actual" });
  await create(request, "mealItems", { meal_id: meal.id, food_name: "鸡肉饭", quantity: 1, calories: 420, protein: 32 });

  await page.goto("/fitness");
  const workoutDay = page.locator('.month-calendar-day[data-date="2026-08-02"]');
  await expect(page.getByRole("heading", { name: "训练日历" })).toBeVisible();
  await expect(workoutDay).toContainText("上肢");
  await expect(workoutDay).toContainText("卧推 16次");

  await page.goto("/diet");
  const mealDay = page.locator('.month-calendar-day[data-date="2026-08-02"]');
  await expect(page.getByRole("heading", { name: "饮食日历" })).toBeVisible();
  await expect(mealDay).toContainText("实际 · 晚餐");
  await expect(mealDay).toContainText("日历验收晚餐 · 420 kcal");
  await page.locator('.month-calendar-day[data-date="2026-08-03"]').click();
  await expect(page.locator('.diet-toolbar input[type="date"]')).toHaveValue("2026-08-03");
});

test("renders distinct records in every specialized module", async ({ page, request }) => {
  await page.clock.setFixedTime(new Date("2026-08-02T12:00:00"));
  const devProject = await create(request, "devProjects", { name: "验收开发项目", status: "active" });
  const milestone = await create(request, "devMilestones", { project_id: devProject.id, name: "验收里程碑", target_date: "2026-08-20", status: "open" });
  await create(request, "devWorkItems", { project_id: devProject.id, milestone_id: milestone.id, title: "验收 Bug", item_type: "bug", priority: "high", status: "todo" });
  const client = await create(request, "clients", { name: "验收咨询客户" });
  const consult = await create(request, "consultingProjects", { client_id: client.id, name: "验收咨询项目", status: "active" });
  await create(request, "consultingDeliverables", { project_id: consult.id, name: "验收交付物", due_date: "2026-08-10", status: "todo" });
  const template = await create(request, "workoutTemplates", { name: "验收力量训练", weekday: 2 });
  await create(request, "workoutTemplateExercises", { template_id: template.id, name: "验收深蹲", target_sets: 3, target_reps: 5, target_weight: 60 });
  const meal = await create(request, "meals", { meal_date: "2026-08-02", meal_type: "dinner", name: "验收晚餐", entry_kind: "actual" });
  await create(request, "mealItems", { meal_id: meal.id, food_name: "验收食物", quantity: 1, calories: 420, protein: 31 });
  await create(request, "entertainmentItems", { name: "验收游戏", platform: "Steam", status: "playing", next_goal: "完成第一章" });

  for (const [path, text] of [["/development", "验收 Bug"], ["/fitness", "验收深蹲"], ["/diet", "验收晚餐"], ["/entertainment", "验收游戏"]]) {
    await page.goto(path);
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
  }
});

test("restores trash, persists appearance and theme, creates backup and downloads export", async ({ page, request }) => {
  const media = await create(request, "mediaContents", { title: "可恢复验收记录", stage: "idea" });
  expect((await request.delete(`/api/collections/mediaContents/${media.id}`)).ok()).toBeTruthy();
  await page.goto("/settings");
  await expect(page.getByText("app.sqlite", { exact: true })).toBeVisible();
  const trashRow = page.locator(".trash-list article").filter({ hasText: "可恢复验收记录" });
  await expect(trashRow).toBeVisible();
  await trashRow.getByRole("button", { name: "恢复" }).click();
  await expect(trashRow).toHaveCount(0);

  await page.getByRole("button", { name: "深色" }).click();
  await page.getByRole("button", { name: "Notion 笔记" }).click();
  await page.getByLabel("自媒体").uncheck();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "notebook");
  await expect(page.locator(".notebook-environment")).toBeVisible();
  await expect(page.locator(".ambient-environment")).toHaveCount(0);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "notebook");
  await expect(page.getByLabel("自媒体")).not.toBeChecked();

  await page.getByRole("button", { name: "Neo-Brutalism" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "neo");
  await expect(page.locator(".app-shell")).toHaveClass(/neo-shell/);

  await page.getByRole("button", { name: "Liquid Glass" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "liquid");
  await expect(page.locator(".ambient-environment")).toBeVisible();
  await expect(page.locator(".topbar")).toHaveCSS("backdrop-filter", /blur/);

  await page.getByRole("button", { name: "立即备份" }).click();
  const manualBackup = page.locator(".backup-list article").filter({ hasText: "手动" }).first();
  await expect(manualBackup).toBeVisible();
  const backupName = manualBackup.getByRole("textbox");
  await backupName.fill("浏览器验收备份");
  await backupName.blur();
  await expect(backupName).toHaveValue("浏览器验收备份");

  await page.getByRole("link", { name: "首页总览" }).click();
  await expect(page.locator(".summary-tile").filter({ hasText: "自媒体" })).toHaveCount(0);
  await page.getByRole("link", { name: "数据与设置" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 ZIP" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/muzi-export-.*\.zip/);
});
