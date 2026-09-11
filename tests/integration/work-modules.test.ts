// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../server/app.js";
import { makeTestDirectory, removeTestDirectory } from "../helpers.js";

let directory = "";
let app: FastifyInstance;
beforeEach(async () => { directory = makeTestDirectory("work-modules"); app = await buildApp({ dataDir: directory, autoBackup: false }); });
afterEach(async () => { await app.close(); removeTestDirectory(directory); });

async function create(collection: string, payload: Record<string, any>) {
  const response = await app.inject({ method: "POST", url: `/api/collections/${collection}`, payload });
  expect(response.statusCode).toBe(201);
  return response.json().data;
}

describe("specialized work modules", () => {
  it("moves media content through production and stores publishing metrics", async () => {
    const content = await create("mediaContents", { title: "本地工作台介绍", platform: "B站", content_format: "视频", stage: "idea", copy_text: "首版脚本" });
    const producing = await app.inject({ method: "PATCH", url: `/api/collections/mediaContents/${content.id}`, payload: { stage: "producing", planned_publish_at: "2026-08-08" } });
    expect(producing.json().data).toMatchObject({ stage: "producing", planned_publish_at: "2026-08-08" });
    const published = await app.inject({ method: "PATCH", url: `/api/collections/mediaContents/${content.id}`, payload: { stage: "published", published_at: "2026-08-09", publish_url: "https://example.test/video", views: 1387, likes: 94, comments: 17 } });
    expect(published.json().data).toMatchObject({ stage: "published", views: 1387, likes: 94, comments: 17 });
  });

  it("keeps development projects, milestones, typed work items and logs as distinct records", async () => {
    const project = await create("devProjects", { name: "hasker工作台", description: "个人本地管理 App", status: "active", local_path: "/tmp/muzi" });
    const milestone = await create("devMilestones", { project_id: project.id, name: "第一版", target_date: "2026-09-01", status: "open" });
    const bug = await create("devWorkItems", { project_id: project.id, milestone_id: milestone.id, title: "修复备份恢复边界", item_type: "bug", priority: "high", status: "todo", description: "损坏文件不得覆盖当前数据" });
    await create("devLogs", { project_id: project.id, log_date: "2026-08-02", content: "完成数据库迁移和备份切片。" });
    const done = await app.inject({ method: "PATCH", url: `/api/collections/devWorkItems/${bug.id}`, payload: { status: "done" } });
    expect(done.json().data).toMatchObject({ item_type: "bug", priority: "high", status: "done", milestone_id: milestone.id });
    const state = (await app.inject({ method: "GET", url: "/api/state" })).json().data;
    expect(state.devProjects).toHaveLength(1);
    expect(state.devMilestones).toHaveLength(1);
    expect(state.devWorkItems).toHaveLength(1);
    expect(state.devLogs[0].content).toContain("数据库迁移");
  });

  it("records the complete consulting chain from client to delivery, follow-up and billing", async () => {
    const client = await create("clients", { name: "远山工作室", notes: "品牌咨询" });
    const project = await create("consultingProjects", { client_id: client.id, name: "内容策略", current_need: "制定三个月内容计划", status: "active" });
    await create("consultingInteractions", { project_id: project.id, occurred_at: "2026-08-02T09:00:00.000Z", interaction_type: "meeting", notes: "确认目标受众" });
    const deliverable = await create("consultingDeliverables", { project_id: project.id, name: "策略方案", due_date: "2026-08-05", status: "todo" });
    const followup = await create("consultingFollowups", { project_id: project.id, followup_at: "2026-08-04T10:00:00.000Z", content: "确认方案反馈", status: "todo" });
    await create("consultingTimeEntries", { project_id: project.id, entry_date: "2026-08-02", minutes: 95, fee_cents: 180000, settled: 0, notes: "首次会议" });
    expect(deliverable.due_date).toBe("2026-08-05");
    expect(followup.content).toBe("确认方案反馈");
    const dashboard = (await app.inject({ method: "GET", url: "/api/dashboard?date=2026-08-04" })).json().data;
    expect(dashboard.attention.map((item: any) => item.name || item.content)).toEqual(expect.arrayContaining(["策略方案", "确认方案反馈"]));
    const state = (await app.inject({ method: "GET", url: "/api/state" })).json().data;
    expect(state.consultingTimeEntries[0]).toMatchObject({ minutes: 95, fee_cents: 180000, settled: 0 });
  });
});
