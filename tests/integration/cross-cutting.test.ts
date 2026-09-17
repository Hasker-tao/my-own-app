// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../server/app.js";
import { makeTestDirectory, removeTestDirectory } from "../helpers.js";

let directory = "";
let app: FastifyInstance;
beforeEach(async () => { directory = makeTestDirectory("cross-cutting"); app = await buildApp({ dataDir: directory, autoBackup: false }); });
afterEach(async () => { if (app) await app.close(); removeTestDirectory(directory); });

async function create(collection: string, payload: Record<string, any>) {
  const response = await app.inject({ method: "POST", url: `/api/collections/${collection}`, payload });
  expect(response.statusCode).toBe(201);
  return response.json().data;
}

describe("search, trash and settings", () => {
  it("searches business records while excluding archived daily plans", async () => {
    const client = await create("clients", { name: "晨星咨询客户" });
    await create("planItems", { title: "晨星今日计划", plan_date: "2026-08-02" });
    await create("mediaContents", { title: "晨星内容", stage: "idea" });
    await create("devProjects", { name: "晨星开发项目" });
    await create("consultingProjects", { client_id: client.id, name: "晨星咨询项目" });
    await create("workoutTemplates", { name: "晨星训练" });
    await create("foods", { name: "晨星早餐" });
    await create("entertainmentItems", { name: "晨星游戏" });
    const response = await app.inject({ method: "GET", url: "/api/search?q=%E6%99%A8%E6%98%9F" });
    expect(response.statusCode).toBe(200);
    const modules = new Set(response.json().data.map((item: any) => item.module));
    expect(modules).toEqual(new Set(["media", "development", "consulting", "fitness", "diet", "entertainment"]));
  });

  it("moves a record to trash, restores it, and requires a separate permanent-delete operation", async () => {
    const content = await create("mediaContents", { title: "可恢复内容", stage: "idea" });
    const removed = await app.inject({ method: "DELETE", url: `/api/collections/mediaContents/${content.id}` });
    expect(removed.statusCode).toBe(200);
    let state = (await app.inject({ method: "GET", url: "/api/state" })).json().data;
    expect(state.mediaContents).toHaveLength(0);
    expect(state.trash[0]).toMatchObject({ collection: "mediaContents", entity_id: content.id, display_title: "可恢复内容" });
    const restored = await app.inject({ method: "POST", url: `/api/collections/mediaContents/${content.id}/restore` });
    expect(restored.statusCode).toBe(200);
    state = (await app.inject({ method: "GET", url: "/api/state" })).json().data;
    expect(state.mediaContents[0].title).toBe("可恢复内容");
    expect(state.trash).toHaveLength(0);
    await app.inject({ method: "DELETE", url: `/api/collections/mediaContents/${content.id}` });
    const permanent = await app.inject({ method: "DELETE", url: `/api/collections/mediaContents/${content.id}/permanent` });
    expect(permanent.statusCode).toBe(204);
    const includeDeleted = await app.inject({ method: "GET", url: "/api/collections/mediaContents?includeDeleted=true" });
    expect(includeDeleted.json().data).toHaveLength(0);
  });

  it("persists theme, appearance and calendar preferences across a restart", async () => {
    const saved = await app.inject({ method: "PUT", url: "/api/settings", payload: { theme: "dark", appearance: "neo", weekStart: "sunday", dateFormat: "iso", dashboardModules: ["media", "fitness"] } });
    expect(saved.json().data).toMatchObject({ theme: "dark", appearance: "neo", weekStart: "sunday", dateFormat: "iso" });
    await app.close();
    app = await buildApp({ dataDir: directory, autoBackup: false });
    const loaded = await app.inject({ method: "GET", url: "/api/settings" });
    expect(loaded.json().data).toMatchObject({ theme: "dark", appearance: "neo", weekStart: "sunday", dateFormat: "iso", dashboardModules: ["media", "fitness"] });
  });

  it("cascades child records when a deleted aggregate is permanently removed", async () => {
    const project = await create("devProjects", { name: "待永久删除项目" });
    await create("devWorkItems", { project_id: project.id, title: "子工作项", item_type: "feature", status: "todo" });
    await app.inject({ method: "DELETE", url: `/api/collections/devProjects/${project.id}` });
    await app.inject({ method: "DELETE", url: `/api/collections/devProjects/${project.id}/permanent` });
    const state = (await app.inject({ method: "GET", url: "/api/state" })).json().data;
    expect(state.devProjects).toHaveLength(0);
    expect(state.devWorkItems).toHaveLength(0);
  });
});
