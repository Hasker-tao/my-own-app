import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { DatabaseManager } from "./database.js";
import { ValidationError, NotFoundError } from "./store.js";
import { emptyLearning, type LearningCourse, type LearningState } from "../src/features/learning.js";
import { readMoodle } from "./moodle.js";

export function learningState(manager: DatabaseManager): LearningState {
  const row = manager.db.prepare("SELECT payload FROM learning_workspace WHERE id = 1").get() as { payload: string } | undefined;
  return row ? JSON.parse(row.payload) : structuredClone(emptyLearning);
}
export function changeLearning(manager: DatabaseManager, change: (state: LearningState) => void) {
  return manager.db.transaction(() => {
    const state = learningState(manager);
    change(state);
    manager.db.prepare("INSERT INTO learning_workspace(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(JSON.stringify(state));
    return state;
  })();
}
const courseSchema = z.object({ id: z.string().regex(/^\d+$/), title: z.string().trim().min(1).max(500), url: z.string().url(), topics: z.array(z.object({ id: z.string().min(1).max(100), title: z.string().trim().min(1).max(500), resources: z.array(z.object({ id: z.string(), title: z.string().max(500), url: z.string().url(), kind: z.enum(["resource", "folder", "assign", "quiz", "page", "url"]), dates: z.string().max(2000).optional() })).max(500) })).min(1).max(500) });
export function mergeCourse(state: LearningState, raw: unknown) {
  const incoming = courseSchema.parse(raw);
  if (incoming.url !== `https://moodle.nottingham.ac.uk/course/view.php?id=${incoming.id}`) throw new ValidationError("课程来源无效");
  for (const t of incoming.topics) for (const r of t.resources) {
    if (!/^https:\/\/moodle\.nottingham\.ac\.uk\/mod\/(resource|folder|assign|quiz|page|url)\/view\.php\?id=\d+$/.test(r.url)) throw new ValidationError("资料来源无效");
  }
  const old = state.courses.find(c => c.id === incoming.id);
  const topicIds = new Set<string>();
  const topics = incoming.topics.map(t => {
    if (topicIds.has(t.id)) throw new ValidationError("课程主题重复，请重新读取");
    topicIds.add(t.id);
    const previous = old?.topics.find(p => p.id === t.id);
    return { ...t, included: previous?.included ?? !old, taught: previous?.taught ?? false, missing: false };
  });
  for (const t of old?.topics ?? []) if (!topicIds.has(t.id)) topics.push({ ...t, missing: true });
  const course: LearningCourse = { ...incoming, topics, selected: old?.selected ?? true, syncedAt: new Date().toISOString() };
  if (old) state.courses[state.courses.indexOf(old)] = course; else state.courses.push(course);
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; }, "日期无效");
const recordSchema = z.object({ id: z.string().uuid(), courseId: z.string(), topicId: z.string(), date, action: z.enum(["review", "preview", "practice"]), completion: z.enum(["partial", "complete"]), understanding: z.enum(["unknown", "difficult", "prompted", "independent"]), position: z.string().trim().max(200), minutes: z.number().int().min(0).max(1440), notes: z.string().trim().max(4000) });
export function registerLearning(app: FastifyInstance, manager: DatabaseManager) {
  let reading = false;
  app.get("/api/learning", async () => ({ data: learningState(manager) }));
  app.put("/api/learning/budget", async request => {
    const { budget } = z.object({ budget: z.number().int().min(0).max(240) }).parse(request.body);
    return { data: changeLearning(manager, s => { s.budget = budget; }) };
  });
  app.patch("/api/learning/courses/:id", async request => {
    const { id } = request.params as { id: string };
    const body = z.object({ selected: z.boolean() }).parse(request.body);
    return { data: changeLearning(manager, s => { const c = s.courses.find(c => c.id === id); if (!c) throw new NotFoundError("课程不存在"); c.selected = body.selected; }) };
  });
  app.patch("/api/learning/courses/:id/topics/:topicId", async request => {
    const { id, topicId } = request.params as { id: string; topicId: string };
    const body = z.object({ taught: z.boolean().optional(), included: z.boolean().optional() }).parse(request.body);
    return { data: changeLearning(manager, s => { const t = s.courses.find(c => c.id === id)?.topics.find(t => t.id === topicId); if (!t) throw new NotFoundError("主题不存在"); Object.assign(t, body); }) };
  });
  app.put("/api/learning/records", async request => {
    const body = recordSchema.parse(request.body);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    if (body.date > today) throw new ValidationError("不能提前记录未来的学习完成情况");
    return { data: changeLearning(manager, s => {
      const topic = s.courses.find(c => c.id === body.courseId)?.topics.find(t => t.id === body.topicId);
      if (!topic) throw new NotFoundError("主题不存在");
      if (body.action !== "preview" && !topic.taught) throw new ValidationError("请先确认已授课，或将本次记录设为预习");
      const old = s.records.find(r => r.id === body.id);
      if (old && (old.courseId !== body.courseId || old.topicId !== body.topicId)) throw new ValidationError("记录归属不能修改");
      const now = new Date().toISOString();
      const record = { ...body, createdAt: old?.createdAt ?? now, updatedAt: now };
      if (old) s.records[s.records.indexOf(old)] = record; else s.records.push(record);
    }) };
  });
  app.post("/api/learning/moodle", async request => {
    const { courseId } = z.object({ courseId: z.string().regex(/^\d+$/).optional() }).parse(request.body ?? {});
    if (reading) throw new ValidationError("正在读取 Moodle，请稍候");
    reading = true;
    const attemptedAt = new Date().toISOString();
    try {
      const result = await readMoodle(courseId);
      changeLearning(manager, s => {
        if (courseId) mergeCourse(s, result);
        s.sync = { attemptedAt, successAt: new Date().toISOString(), status: "ok", message: courseId ? "课程目录已同步；授课位置请自行确认" : "已读取可见课程，请选择本学期课程" };
      });
      return { data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Moodle 读取失败";
      changeLearning(manager, s => { s.sync = { ...s.sync, attemptedAt, status: "error", message }; });
      throw new ValidationError(message);
    } finally { reading = false; }
  });
}
