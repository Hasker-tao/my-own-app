export type Coursework = { status: "unknown" | "not_submitted" | "draft" | "submitted"; statusText: string; due: string; dueAt?: string; files: string[]; modified: string; grading: string; grade: string; checkedAt: string; error?: string };
export type LearningNotice = { id: string; courseId: string; title: string; url: string; createdAt: string; read: boolean };
export type LearningResource = { id: string; title: string; url: string; kind: "resource" | "folder" | "assign" | "quiz" | "page" | "url"; dates?: string; coursework?: Coursework; missing?: boolean };
export type LearningTopic = { id: string; title: string; resources: LearningResource[]; included: boolean; taught: boolean; missing?: boolean };
export type LearningCourse = { id: string; title: string; url: string; selected: boolean; topics: LearningTopic[]; syncedAt: string; seenResources?: string[] };
export type LearningRecord = { id: string; courseId: string; topicId: string; date: string; action: "review" | "preview" | "practice"; completion: "partial" | "complete"; understanding: "unknown" | "difficult" | "prompted" | "independent"; position: string; minutes: number; notes: string; createdAt: string; updatedAt: string };
export type LearningState = { courses: LearningCourse[]; records: LearningRecord[]; budget: number; notices: LearningNotice[]; sync: { attemptedAt: string | null; successAt: string | null; message: string; status: "idle" | "ok" | "error" } };
export const emptyLearning: LearningState = { courses: [], records: [], budget: 60, notices: [], sync: { attemptedAt: null, successAt: null, message: "尚未读取 Moodle", status: "idle" } };
export function topicProgress(state: LearningState, courseId: string, topicId: string) {
  const records = state.records.filter(r => r.courseId === courseId && r.topicId === topicId).sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt));
  const reviews = records.filter(r => r.action !== "preview");
  const assessed = records.filter(r => r.understanding !== "unknown").at(-1);
  return { covered: reviews.some(r => r.completion === "complete"), previewed: records.some(r => r.action === "preview" && r.completion === "complete"), last: reviews.at(-1), latest: records.at(-1), understanding: assessed?.understanding ?? "unknown", count: reviews.length };
}
export function courseProgress(state: LearningState, course: LearningCourse) {
  const included = course.topics.filter(t => t.included);
  const taught = included.filter(t => t.taught);
  return { total: included.length, pending: course.topics.length - included.length, taught: taught.length, covered: taught.filter(t => topicProgress(state, course.id, t.id).covered).length, previewed: included.filter(t => topicProgress(state, course.id, t.id).previewed).length, difficult: included.filter(t => topicProgress(state, course.id, t.id).understanding === "difficult").length };
}
export function todaySuggestions(state: LearningState, date: string) {
  const used = state.records.filter(r => r.date === date && r.action !== "preview").reduce((n, r) => n + r.minutes, 0);
  let remaining = Math.max(0, state.budget - used);
  const options = state.courses.filter(c => c.selected).flatMap(course => course.topics.filter(t => t.included && t.taught && !t.missing).map(topic => {
    const p = topicProgress(state, course.id, topic.id);
    const age = p.last ? Math.floor((Date.parse(date) - Date.parse(p.last.date)) / 86400000) : Infinity;
    const interval = p.understanding === "difficult" ? 1 : p.understanding === "independent" ? 7 : 3;
    return { course, topic, reason: p.understanding === "difficult" ? "回顾薄弱点" : !p.covered ? "首次巩固 / 继续上次" : "间隔回顾", eligible: !p.last || (p.last.date !== date && (!p.covered || age >= interval)), rank: p.understanding === "difficult" ? 0 : !p.covered ? 1 : 2, age };
  })).filter(o => o.eligible).sort((a, b) => a.rank - b.rank || b.age - a.age || a.topic.id.localeCompare(b.topic.id));
  return options.flatMap(o => { if (remaining < 10) return []; const minutes = Math.min(20, remaining); remaining -= minutes; return [{ ...o, minutes }]; }).slice(0, 3);
}

export function courseworkTasks(state: LearningState) {
  return state.courses.filter(c => c.selected).flatMap(course => {
    const seen = new Set<string>();
    return course.topics.flatMap(topic => topic.resources.filter(r => r.kind === "assign" && !seen.has(r.id) && Boolean(seen.add(r.id))).map(resource => ({ course, topic, resource })));
  }).sort((a,b) => (a.resource.coursework?.dueAt || "9999").localeCompare(b.resource.coursework?.dueAt || "9999"));
}
