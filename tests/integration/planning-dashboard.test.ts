// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../server/app.js";
import { makeTestDirectory, removeTestDirectory } from "../helpers.js";
import type { FastifyInstance } from "fastify";

let directory = "";
let app: FastifyInstance;

beforeEach(async () => {
  directory = makeTestDirectory("planning");
  app = await buildApp({ dataDir: directory, autoBackup: false });
});
afterEach(async () => {
  await app.close();
  removeTestDirectory(directory);
});

async function create(collection: string, payload: Record<string, any>) {
  const response = await app.inject({ method: "POST", url: `/api/collections/${collection}`, payload });
  expect(response.statusCode).toBe(201);
  return response.json().data;
}

describe("dashboard and historical planning compatibility", () => {
  it("excludes historical plans from dashboard while retaining records and module summaries", async () => {
    const old = await create("planItems", { title: "历史逾期事项", plan_date: "2026-08-01" });
    await create("planItems", { title: "今天的历史安排", plan_date: "2026-08-02", start_time: "09:30" });
    const media = await create("mediaContents", { title: "继续制作", stage: "producing" });
    const dashboard = (await app.inject({ method: "GET", url: "/api/dashboard?date=2026-08-02" })).json().data;
    expect(dashboard).not.toHaveProperty("overview");
    expect(dashboard).not.toHaveProperty("timeline");
    expect(dashboard).not.toHaveProperty("unscheduled");
    expect(dashboard.attention.some((item: any) => item.module === "today")).toBe(false);
    expect(dashboard.summaries.media[0].id).toBe(media.id);
    const state = (await app.inject({ method: "GET", url: "/api/state" })).json().data;
    expect(state.planItems).toHaveLength(2);
    expect(state.planItems.find((item: any) => item.id === old.id).status).toBe("todo");
  });

  it("postpones items and saves the daily review", async () => {
    const item = await create("planItems", { title: "需要延期", plan_date: "2026-08-02" });
    const postponed = await app.inject({ method: "POST", url: `/api/plan-items/${item.id}/postpone`, payload: { date: "2026-08-03" } });
    expect(postponed.json().data).toMatchObject({ plan_date: "2026-08-03", status: "todo" });
    const review = await app.inject({ method: "PUT", url: "/api/daily-reviews/2026-08-02", payload: { content: "今天完成了关键功能" } });
    expect(review.statusCode).toBe(200);
    const loaded = await app.inject({ method: "GET", url: "/api/daily-reviews/2026-08-02" });
    expect(loaded.json().data.content).toBe("今天完成了关键功能");
  });

  it("resolves a linked record title live instead of keeping a stale duplicate", async () => {
    const media = await create("mediaContents", { title: "最初标题", stage: "producing" });
    await create("planItems", { title: "最初标题", plan_date: "2026-08-02", source_module: "media", source_entity_type: "media_content", source_entity_id: media.id });
    await app.inject({ method: "PATCH", url: `/api/collections/mediaContents/${media.id}`, payload: { title: "更新后的标题" } });
    const state = await app.inject({ method: "GET", url: "/api/state" });
    expect(state.json().data.planItems[0]).toMatchObject({ display_title: "更新后的标题", source_module: "media", source_entity_id: media.id });
  });

  it("converts a quick memo into a linked workflow record and archives the memo", async () => {
    const memo = await create("quickMemos", { content: "做一期本地数据安全视频" });
    const converted = await app.inject({ method: "POST", url: `/api/quick-memos/${memo.id}/convert`, payload: { collection: "mediaContents", fields: { stage: "idea", platform: "B站" } } });
    expect(converted.statusCode).toBe(200);
    expect(converted.json().data).toMatchObject({ title: "做一期本地数据安全视频", stage: "idea", platform: "B站" });
    const state = await app.inject({ method: "GET", url: "/api/state" });
    expect(state.json().data.quickMemos[0].converted_id).toBe(converted.json().data.id);
    expect(state.json().data.quickMemos[0].archived_at).toBeTruthy();
  });
});
