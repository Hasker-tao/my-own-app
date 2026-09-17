import { test, expect, type APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function create(request: APIRequestContext, collection: string, payload: Record<string, any>) {
  const response = await request.post(`/api/collections/${collection}`, { data: payload });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data;
}

test("opens locally, uses no external runtime resources, and reaches all eight pages", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) externalRequests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "liquid");
  await expect(page.getByRole("heading", { name: /从重点开始/ })).toBeVisible();
  const destinations = [
    ["首页总览", /从重点开始/], ["自媒体", "自媒体"], ["开发工作", "开发工作"],
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
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "立即备份" })).toBeVisible();
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
  await expect(page.locator(".toolbar-page-icon")).toHaveCount(0);
  const navigationIcons = page.locator(".nav-link > .module-artwork");
  await expect(navigationIcons).toHaveCount(8);
  const iconState = await navigationIcons.evaluateAll((icons) => ({
    sources: icons.map((icon) => (icon as HTMLImageElement).getAttribute("src")),
    allLoaded: icons.every((icon) => (icon as HTMLImageElement).complete && (icon as HTMLImageElement).naturalWidth > 0),
    radii: icons.map((icon) => Number.parseFloat(getComputedStyle(icon).borderTopLeftRadius)),
  }));
  expect(new Set(iconState.sources).size).toBe(8);
  expect(iconState.sources.every((source) => source === "/assets/brand/learning.svg" || (source?.startsWith("/assets/module-icons/") && source.endsWith("-v1.webp")))).toBeTruthy();
  expect(iconState.allLoaded).toBeTruthy();
  expect(Math.min(...iconState.radii)).toBeGreaterThanOrEqual(9);

  await page.getByRole("button", { name: "快速新增" }).click();
  await expect(page.locator(".quick-option-icon")).toHaveCount(5);
  await expect(page.locator(".quick-option-icon .module-artwork")).toHaveCount(5);
  const iconRadius = await page.locator(".quick-option-icon").first().evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
  );
  expect(iconRadius).toBeGreaterThanOrEqual(10);
});

test("keeps Neo isolated, multicolor and overflow-free across all pages and target viewports", async ({ page, request }) => {
  test.setTimeout(120_000);
  const pages = ["/", "/media", "/development", "/learning", "/fitness", "/diet", "/entertainment", "/settings"];
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
    await expect(page.locator(".neo-nav-emblem")).toHaveCount(7);
    const emblemState = await page.locator(".neo-nav-emblem").evaluateAll((emblems) => ({
      allUseSprite: emblems.every((emblem) => getComputedStyle(emblem).backgroundImage.includes("module-emblems.png")),
      positions: emblems.map((emblem) => getComputedStyle(emblem).backgroundPosition),
    }));
    expect(emblemState.allUseSprite).toBe(true);
    expect(new Set(emblemState.positions).size).toBe(7);

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
  // 该用例要真实访问 3 套外观下的 8 个页面；云端共享 runner 比本机慢，
  // 保留全部 24 次导航与断言，并为完整验收留出与 Neo 全视口用例相同的时间。
  test.setTimeout(120_000);
  const routes = [
    ["/", "记录备忘"],
    ["/media", "记录内容"],
    ["/development", "新建项目"],
    ["/learning", "导入课程"],
    ["/fitness", "记录身体数据"],
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

test("auto-saves a quick memo across reload and converts it into a content idea", async ({ page }) => {
  await page.goto("/");
  const memo = page.getByLabel("快速备忘");
  await memo.fill("自动保存并转换的备忘");
  await expect(page.getByRole("status")).toContainText("已保存", { timeout: 5_000 });
  await page.reload();
  await expect(page.getByLabel("快速备忘")).toHaveValue("自动保存并转换的备忘");
  await page.getByRole("button", { name: "转为内容灵感" }).click();
  await page.getByRole("link", { name: "自媒体" }).click();
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

test("edits statuses and safely removes development records", async ({ page, request }) => {
  await request.put("/api/settings", { data: { language: "zh-CN" } });
  const project = await create(request, "devProjects", { name: "开发管理验收项目", description: "编辑前", status: "active" });
  const milestone = await create(request, "devMilestones", { project_id: project.id, name: "待调整里程碑", status: "open" });
  await create(request, "devWorkItems", { project_id: project.id, milestone_id: milestone.id, title: "可调整状态工作项", item_type: "feature", priority: "medium", status: "todo" });
  await create(request, "devLogs", { project_id: project.id, log_date: "2026-09-15", content: "待纠正日志" });
  await page.goto("/development");
  await page.locator(".project-rail > button").filter({ hasText: "开发管理验收项目" }).click();

  await page.getByRole("button", { name: "编辑项目" }).click();
  await page.getByRole("dialog").getByLabel("状态").selectOption("paused");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".detail-hero")).toContainText("暂停");

  await page.getByText("可调整状态工作项", { exact: true }).click();
  await page.getByRole("dialog").getByLabel("状态").selectOption("in_progress");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".work-item").filter({ hasText: "可调整状态工作项" })).toContainText("进行中");

  await page.getByRole("button", { name: "编辑里程碑：待调整里程碑" }).click();
  await page.getByRole("dialog").getByLabel("状态").selectOption("done");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("button", { name: "编辑里程碑：待调整里程碑" })).toContainText("完成");
  await page.getByRole("button", { name: "编辑里程碑：待调整里程碑" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "删除里程碑" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认删除里程碑" }).click();
  await expect(page.getByText("待调整里程碑", { exact: true })).toHaveCount(0);

  await page.locator(".log-list article").filter({ hasText: "待纠正日志" }).getByRole("button", { name: "编辑" }).click();
  await page.getByRole("dialog").getByLabel("日志内容").fill("已经纠正的日志");
  await page.getByRole("dialog").getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("已经纠正的日志", { exact: true })).toBeVisible();
  await page.locator(".log-list article").filter({ hasText: "已经纠正的日志" }).getByRole("button", { name: "编辑" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "删除日志" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认删除日志" }).click();
  await expect(page.getByText("已经纠正的日志", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "编辑项目" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "删除项目" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确认删除项目" }).click();
  await expect(page.locator(".project-rail > button").filter({ hasText: "开发管理验收项目" })).toHaveCount(0);
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
  await expect(workoutDay).toContainText("已完成");

  await page.goto("/diet");
  const mealDay = page.locator('.month-calendar-day[data-date="2026-08-02"]');
  await expect(page.getByRole("heading", { name: "饮食日历" })).toBeVisible();
  await expect(mealDay).toContainText("实际 · 晚餐");
  await expect(mealDay).toContainText("日历验收晚餐 · 420 kcal");
  await page.locator('.month-calendar-day[data-date="2026-08-03"]').click();
  await expect(page.locator('.diet-toolbar input[type="date"]')).toHaveValue("2026-08-03");
});

test("creates a simple recurring workout from the calendar", async ({ page, request }) => {
  await request.put("/api/settings", { data: { language: "zh-CN" } });
  await page.clock.setFixedTime(new Date("2026-09-15T12:00:00"));
  await page.goto("/fitness");
  await page.locator('.month-calendar-day[data-date="2026-09-15"]').click();
  await page.getByRole("button", { name: "在这天添加循环计划" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("计划名称").fill("双周推力训练");
  await dialog.getByLabel("训练内容").fill("胸部 + 手臂");
  await dialog.getByLabel("循环周期（周）").fill("2");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator('.month-calendar-day[data-date="2026-09-22"]')).not.toContainText("胸部 + 手臂");
  await expect(page.locator('.month-calendar-day[data-date="2026-09-29"]')).toContainText("胸部 + 手臂");
  await page.locator('.month-calendar-day[data-date="2026-09-15"]').click();
  await page.locator(".calendar-detail-list article").filter({ hasText: "双周推力训练" }).last().getByRole("button", { name: "标记完成" }).click();
  await expect(page.getByText("双周推力训练", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "记录身体数据" }).click();
  await expect(page.getByRole("dialog").getByLabel("上臂围 cm")).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("腰围 cm")).toHaveCount(0);
});

test("renders distinct records in every specialized module", async ({ page, request }) => {
  await page.clock.setFixedTime(new Date("2026-08-02T12:00:00"));
  const devProject = await create(request, "devProjects", { name: "验收开发项目", status: "active" });
  const milestone = await create(request, "devMilestones", { project_id: devProject.id, name: "验收里程碑", target_date: "2026-08-20", status: "open" });
  await create(request, "devWorkItems", { project_id: devProject.id, milestone_id: milestone.id, title: "验收 Bug", item_type: "bug", priority: "high", status: "todo" });
  const client = await create(request, "clients", { name: "验收咨询客户" });
  const consult = await create(request, "consultingProjects", { client_id: client.id, name: "验收咨询项目", status: "active" });
  await create(request, "consultingDeliverables", { project_id: consult.id, name: "验收交付物", due_date: "2026-08-10", status: "todo" });
  const template = await create(request, "workoutTemplates", { name: "验收力量训练", starts_on: "2026-08-02", repeat_weeks: 1, weekday: 0 });
  await create(request, "workoutTemplateExercises", { template_id: template.id, name: "验收深蹲", target_sets: 3, target_reps: 5, target_weight: 60 });
  const meal = await create(request, "meals", { meal_date: "2026-08-02", meal_type: "dinner", name: "验收晚餐", entry_kind: "actual" });
  await create(request, "mealItems", { meal_id: meal.id, food_name: "验收食物", quantity: 1, calories: 420, protein: 31 });
  await create(request, "entertainmentItems", { name: "验收游戏", platform: "Steam", status: "playing", next_goal: "完成第一章" });

  for (const [path, text] of [["/development", "验收 Bug"], ["/fitness", "验收力量训练"], ["/diet", "验收晚餐"], ["/entertainment", "验收游戏"]]) {
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
  await page.getByRole("button", { name: "桌面 App" }).click();
  await page.getByLabel("自媒体").uncheck();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-appearance", "notebook");
  await expect(page.locator(".notebook-environment")).toBeHidden();
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

test("removes daily planning entry points and redirects old links without deleting history", async ({ page, request }) => {
  const plan = await create(request, "planItems", { title: "仅供历史保留的计划", plan_date: "2020-01-01" });
  await page.goto("/today?new=1");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /从重点开始/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "今日计划" })).toHaveCount(0);
  await expect(page.locator(".overview-strip, .timeline-list, .plan-row")).toHaveCount(0);
  await expect(page.getByText("仅供历史保留的计划")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /新建计划|添加今日事项|转为今日事项/ })).toHaveCount(0);
  await page.getByRole("button", { name: /搜索所有内容/ }).click();
  await page.getByPlaceholder("输入关键词").fill("仅供历史保留的计划");
  await expect(page.getByText("没有找到匹配内容。")).toBeVisible();
  await page.keyboard.press("Escape");
  for (const route of ["/media", "/development", "/entertainment", "/settings"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /加入今日计划|安排时间/ })).toHaveCount(0);
    await expect(page.getByText("每周起始日", { exact: true })).toHaveCount(0);
  }
  const state = (await (await request.get("/api/state")).json()).data;
  expect(state.planItems.find((item: any) => item.id === plan.id)).toMatchObject({ title: "仅供历史保留的计划", status: "todo" });
  await page.goto("/");
  await page.screenshot({ path: "test-results/home-without-daily-plan.png", fullPage: true });
});
