import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { DatabaseManager } from "./database.js";
import { ValidationError, NotFoundError } from "./store.js";
import { emptyLearning, type LearningCourse, type LearningState, type LearningTopic } from "../src/features/learning.js";
import { readMoodle } from "./moodle.js";

export function learningState(manager: DatabaseManager): LearningState {
  const row = manager.db.prepare("SELECT payload FROM learning_workspace WHERE id = 1").get() as { payload: string } | undefined;
  return row ? { ...structuredClone(emptyLearning), ...JSON.parse(row.payload) } : structuredClone(emptyLearning);
}
export function changeLearning(manager: DatabaseManager, change: (state: LearningState) => void) {
  return manager.db.transaction(() => {
    const state = learningState(manager);
    change(state);
    manager.db.prepare("INSERT INTO learning_workspace(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(JSON.stringify(state));
    return state;
  })();
}
const courseworkSchema = z.object({ status: z.enum(["unknown", "not_submitted", "draft", "submitted"]), statusText: z.string().max(2000), due: z.string().max(2000), dueAt: z.string().datetime().optional(), files: z.array(z.string().max(500)).max(200), modified: z.string().max(2000), grading: z.string().max(2000), grade: z.string().max(2000), checkedAt: z.string().datetime(), error: z.string().max(2000).optional() });
const courseSchema = z.object({ id: z.string().regex(/^\d+$/), title: z.string().trim().min(1).max(500), url: z.string().url(), topics: z.array(z.object({ id: z.string().min(1).max(100), title: z.string().trim().min(1).max(500), resources: z.array(z.object({ id: z.string(), title: z.string().max(500), url: z.string().url(), kind: z.enum(["resource", "folder", "assign", "quiz", "page", "url"]), dates: z.string().max(2000).optional(), coursework: courseworkSchema.optional() })).max(500) })).min(1).max(500) });
export function mergeCourse(state: LearningState, raw: unknown) {
  const incoming = courseSchema.parse(raw);
  if (incoming.url !== `https://moodle.nottingham.ac.uk/course/view.php?id=${incoming.id}`) throw new ValidationError("课程来源无效");
  for (const t of incoming.topics) for (const r of t.resources) {
    if (!/^https:\/\/moodle\.nottingham\.ac\.uk\/(?:mod\/(resource|folder|assign|quiz|page|url)\/view\.php\?id=\d+|pluginfile\.php\/[^?#]+)$/.test(r.url)) throw new ValidationError("资料来源无效");
  }
  const old = state.courses.find(c => c.id === incoming.id);
  const oldResources = new Map(old?.topics.flatMap(t => t.resources.map(r => [r.id,r] as const)) ?? []);
  const seenResources = new Set(old?.seenResources ?? oldResources.keys());
  const upgradingOldCourse = Boolean(old && old.seenResources === undefined);
  const notify = (id: string, title: string, url: string) => {
    if (!state.notices.some(n => n.id === id)) state.notices.unshift({ id, courseId: incoming.id, title, url, createdAt: new Date().toISOString(), read: false });
  };
  const checked = new Set<string>();
  for (const t of incoming.topics) for (const r of t.resources) {
    if (checked.has(r.id)) continue;
    checked.add(r.id);
    const prior = oldResources.get(r.id);
    if (old && !upgradingOldCourse && !seenResources.has(r.id)) notify(`new:${incoming.id}:${r.id}`, `${incoming.title} · 新${r.kind === "assign" ? " coursework" : "资料"}：${r.title}`, r.url);
    if (old && prior?.coursework && r.coursework && !r.coursework.error && (prior.coursework.status !== r.coursework.status || prior.coursework.due !== r.coursework.due)) {
      notify(`change:${incoming.id}:${r.id}:${r.coursework.checkedAt}`, `${r.title} · 提交状态或截止时间更新`, r.url);
    }
    if (r.coursework?.error && prior?.coursework) r.coursework = { ...prior.coursework, error: r.coursework.error };
    seenResources.add(r.id);
  }
  const topicIds = new Set<string>();
  const topics: LearningTopic[] = incoming.topics.map(t => {
    if (topicIds.has(t.id)) throw new ValidationError("课程主题重复，请重新读取");
    topicIds.add(t.id);
    const previous = old?.topics.find(p => p.id === t.id);
    const resources = t.resources.map(r => ({ ...r, missing: false }));
    for (const r of previous?.resources ?? []) if (!checked.has(r.id)) resources.push({ ...r, missing: true });
    return { ...t, resources, included: previous?.included ?? !old, taught: previous?.taught ?? false, missing: false };
  });
  for (const t of old?.topics ?? []) if (!topicIds.has(t.id)) topics.push({ ...t, missing: true });
  const course: LearningCourse = { ...incoming, topics, selected: old?.selected ?? true, syncedAt: new Date().toISOString(), seenResources: [...seenResources] };
  if (old) state.courses[state.courses.indexOf(old)] = course; else state.courses.push(course);
}
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; }, "日期无效");
const recordSchema = z.object({ id: z.string().uuid(), courseId: z.string(), topicId: z.string(), date, action: z.enum(["review", "preview", "practice"]), completion: z.enum(["partial", "complete"]), understanding: z.enum(["unknown", "difficult", "prompted", "independent"]), position: z.string().trim().max(200), minutes: z.number().int().min(0).max(1440), notes: z.string().trim().max(4000) });
export function registerLearning(app: FastifyInstance, manager: DatabaseManager) {
  let reading = false;
  async function syncSelectedCourses() {
    if (reading) throw new ValidationError("正在读取 Moodle，请稍候");
    reading = true;
    const attemptedAt = new Date().toISOString();
    const failures: string[] = [];
    try {
      for (const course of learningState(manager).courses.filter(c => c.selected)) {
        try { const incoming = await readMoodle(course.id); changeLearning(manager, state => mergeCourse(state,incoming)); }
        catch { failures.push(course.title); }
      }
      changeLearning(manager, state => { state.sync = { attemptedAt, successAt: failures.length ? state.sync.successAt : new Date().toISOString(), status: failures.length ? "error" : "ok", message: failures.length ? `部分课程同步失败：${failures.join("、")}，旧记录保留，请重试` : "本学期课程已同步，作业详情如有未核实项请查看待办" }; });
      if (failures.length) throw new ValidationError("部分课程未同步成功，请查看同步状态。已成功的课程更新已保留。");
      return learningState(manager);
    } finally { reading = false; }
  }

  const automaticSync = setInterval(() => {
    if (!learningState(manager).courses.some(course => course.selected)) return;
    void syncSelectedCourses().catch(() => undefined);
  }, 30 * 60_000);
  automaticSync.unref();
  app.addHook("onClose", async () => clearInterval(automaticSync));
  app.get("/api/learning", async () => ({ data: learningState(manager) }));
  app.put("/api/learning/notices/read", async request => {
    const { ids } = z.object({ ids: z.array(z.string()).max(1000) }).parse(request.body);
    return { data: changeLearning(manager, s => { for (const notice of s.notices) if (ids.includes(notice.id)) notice.read = true; }) };
  });
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
  app.post("/api/learning/sync", async () => {
    return { data: await syncSelectedCourses() };
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
        s.sync = { attemptedAt, successAt: new Date().toISOString(), status: "ok", message: courseId ? "课程与作业已读取；授课位置请自行确认，未核实作业请查看待办" : "已读取可见课程，请选择本学期课程" };
      });
      return { data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Moodle 读取失败";
      changeLearning(manager, s => { s.sync = { ...s.sync, attemptedAt, status: "error", message }; });
      throw new ValidationError(message);
    } finally { reading = false; }
  });
}
