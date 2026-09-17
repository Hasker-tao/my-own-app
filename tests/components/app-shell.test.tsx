import { emptyLearning } from "../../src/features/learning";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/App";
import { useWorkspace, WorkspaceProvider } from "../../src/WorkspaceContext";

const collections = ["planItems", "quickMemos", "mediaContents", "devProjects", "devMilestones", "devWorkItems", "devLogs", "clients", "consultingProjects", "consultingInteractions", "consultingDeliverables", "consultingFollowups", "consultingTimeEntries", "workoutTemplates", "workoutTemplateExercises", "workouts", "workoutExercises", "workoutSets", "bodyMetrics", "nutritionTargets", "foods", "meals", "mealItems", "entertainmentItems", "playSessions"];

function mockApi(theme = "light", backupStatus: Record<string, any> | null = null, appearance?: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/learning") return { ok: true, status: 200, json: async () => ({ data: emptyLearning }) } as Response;
    let data: any = null;
    if (url.startsWith("/api/state")) data = { ...Object.fromEntries(collections.map((name) => [name, []])), settings: { theme, ...(appearance === undefined ? {} : { appearance }) }, trash: [] };
    else if (url.startsWith("/api/dashboard")) data = { date: "2026-08-02", overview: { completed: 0, total: 0, progress: 0, scheduledMinutes: 0 }, timeline: [], unscheduled: [], attention: [], summaries: { media: [], development: [], consulting: [], fitness: [], diet: [], entertainment: [] } };
    else if (url.startsWith("/api/system/status")) data = { latestBackup: null, backupStatus };
    else if (url.startsWith("/api/system/save")) data = { savedAt: "2026-08-02T12:00:00.000Z", database: "ok", dataFile: "/tmp/app.sqlite" };
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function SaveFailureTrigger() {
  const { run } = useWorkspace();
  return <button onClick={() => void run(async () => { throw new Error("数据文件不可写"); }).catch(() => undefined)}>制造保存失败</button>;
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><WorkspaceProvider><App /></WorkspaceProvider></QueryClientProvider>);
}

afterEach(() => { vi.unstubAllGlobals(); document.documentElement.removeAttribute("data-theme"); document.documentElement.removeAttribute("data-appearance"); window.history.pushState({}, "", "/"); });

describe("application shell", () => {
  it("renders all eight active navigation destinations", async () => {
    mockApi();
    const { container } = renderApp();
    for (const label of ["首页总览", "自媒体", "开发工作", "学习", "健身计划", "饮食计划", "游戏娱乐", "数据与设置"]) {
      expect(await screen.findByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "今日计划" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /搜索所有内容/ })).toBeInTheDocument();
    expect(container.querySelector(".toolbar-context")).not.toBeInTheDocument();
    expect(container.querySelector(".topbar-create")).not.toBeInTheDocument();
    expect(screen.getByText("仅保存在这台电脑")).toBeInTheDocument();
    expect(container.querySelector(".brand-mark img")).toHaveAttribute("src", "/assets/brand/hasker-mark.svg");
    expect(container.querySelector(".brand-mark")).toHaveTextContent("");
  });

  it("applies the persisted theme to the document", async () => {
    mockApi("dark");
    renderApp();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));
  });

  it("uses liquid as the safe default for missing, legacy and unknown appearance values", async () => {
    mockApi("light", null, "glass");
    const first = renderApp();
    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("liquid"));
    expect(document.querySelector(".ambient-environment")).toBeInTheDocument();
    expect(document.querySelector(".neo-shell")).not.toBeInTheDocument();
    first.unmount();

    mockApi("light", null, "legacy-paper");
    const second = renderApp();
    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("liquid"));
    expect(document.querySelector(".ambient-environment")).toBeInTheDocument();
    second.unmount();

    mockApi();
    renderApp();
    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("liquid"));
  });

  it("applies the persisted notebook appearance without liquid or neo environment layers", async () => {
    mockApi("dark", null, "notebook");
    const { container } = renderApp();
    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("notebook"));
    expect(container.querySelector(".notebook-environment")).toBeInTheDocument();
    expect(container.querySelector(".ambient-environment")).not.toBeInTheDocument();
    expect(container.querySelector(".neo-shell")).not.toBeInTheDocument();
  });

  it("applies a persisted neo appearance without mounting liquid-only visuals", async () => {
    mockApi("dark", null, "neo");
    const { container } = renderApp();
    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("neo"));
    expect(container.querySelector(".app-shell")).toHaveClass("neo-shell");
    expect(document.querySelector(".ambient-environment")).not.toBeInTheDocument();
    expect(container.querySelector(".brand-mark img")).toHaveAttribute("src", "/assets/brand/hasker-mark.svg");
    expect(container.querySelectorAll(".neo-nav-emblem")).toHaveLength(7);
  });

  it("shows save failure instead of a false saved state", async () => {
    mockApi();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WorkspaceProvider><SaveFailureTrigger /><App /></WorkspaceProvider></QueryClientProvider>);
    await userEvent.click(await screen.findByRole("button", { name: "制造保存失败" }));
    expect(await screen.findByRole("status")).toHaveTextContent("保存失败");
  });

  it("offers a manual save button and confirms a successful disk save", async () => {
    const fetchMock = mockApi();
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: "手动保存" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/system/save",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("已保存");
  });

  it("saves pending data before requesting a safe service exit", async () => {
    const fetchMock = mockApi();
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: "保存并退出" }));
    expect(await screen.findByText("数据已保存，hasker工作台已安全退出")).toBeInTheDocument();
    const calls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(calls).toContain("/api/system/save");
    expect(calls).toContain("/api/system/save-and-exit");
    expect(calls.indexOf("/api/system/save")).toBeLessThan(calls.indexOf("/api/system/save-and-exit"));
  });

  it("surfaces automatic backup failure in the application shell", async () => {
    mockApi("light", { state: "error", lastError: "备份目录不可写" });
    renderApp();
    expect(await screen.findByText("自动备份失败")).toBeInTheDocument();
    expect(screen.getByText("备份目录不可写")).toBeInTheDocument();
  });
});
