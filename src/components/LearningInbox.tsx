import { useState } from "react";
import { Badge, Button, EmptyState, Section } from "./ui";
import { courseworkTasks, courseworkComplete, type LearningState } from "../features/learning";

const statuses = { unknown: "待核实", not_submitted: "未提交", draft: "已上传草稿 · 尚未提交", submitted: "已正式提交" };
export function LearningInbox({ state, view, busy, onRead, onSync, onConfirm }: { state: LearningState; view: "tasks" | "news"; busy: boolean; onRead: (ids: string[]) => void; onSync: () => void; onConfirm: (courseId: string, resourceId: string, confirmed: boolean) => void }) {
  const [showSubmitted, setShowSubmitted] = useState(false);
  if (view === "news") return <Section title="课程消息" description="同步后发现的新课件、coursework，以及作业状态或截止时间变化。首次导入建立基线，不把全部旧资料当新消息。" action={<Button variant="secondary" disabled={busy || !state.notices.some(n => !n.read)} onClick={() => onRead(state.notices.filter(n => !n.read).map(n => n.id))}>全部标为已读</Button>}>
    {state.notices.length ? state.notices.map(n => <article className="learning-task" key={n.id}><div><small>{new Date(n.createdAt).toLocaleString("zh-CN")} · {n.read ? "已读" : "新消息"}</small><strong>{n.title}</strong><a href={n.url} target="_blank" rel="noreferrer">打开学校页面 ↗</a></div>{!n.read && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRead([n.id])}>标为已读</Button>}</article>) : <EmptyState title="暂无新消息" description="同步本学期课程后，新发布的资料会集中显示在这里。" />}
  </Section>;
  const tasks = courseworkTasks(state).filter(t => showSubmitted || !courseworkComplete(t.resource));
  return <Section title="Coursework 待办" description="未提交、草稿和待核实的作业集中放在这里。上传文件不等于正式提交，最终状态以学校页面为准。" action={<Button variant="secondary" loading={busy} onClick={onSync}>同步作业状态</Button>}>
    <label className="learning-inline"><input type="checkbox" checked={showSubmitted} onChange={e => setShowSubmitted(e.target.checked)} />也显示已正式提交</label>
    {tasks.length ? tasks.map(({course,resource}) => { const detail = resource.coursework; const complete = courseworkComplete(resource); const graded = !resource.confirmedAt && detail?.status === "unknown" && complete; const uncertain = !detail || detail.error || resource.missing; return <article className="learning-coursework" key={`${course.id}:${resource.id}`}><div><small>{course.title}</small><h3>{resource.title}</h3><Badge tone={complete ? "success" : "warning"}>{resource.confirmedAt ? "本人确认已完成" : graded ? "已发布成绩 · 视为完成" : uncertain ? "待核实" : statuses[detail.status]}</Badge>{!complete && <Button size="sm" variant="secondary" disabled={busy} onClick={() => onConfirm(course.id, resource.id.slice(7), true)}>我已确认完成</Button>}{resource.confirmedAt && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onConfirm(course.id, resource.id.slice(7), false)}>撤销本人确认</Button>}</div>
      <dl><div><dt>截止时间</dt><dd>{detail?.due || "学校页面未提供或尚未识别，请查看原页面"}</dd></div><div><dt>学校提交状态</dt><dd>{detail?.statusText || "尚未读取"}</dd></div><div><dt>已上传文件</dt><dd>{detail?.files.length ? detail.files.join("、") : "未读取到文件；不代表没有提交在线文本或其他内容"}</dd></div>{detail?.modified && <div><dt>最后修改</dt><dd>{detail.modified}</dd></div>}{detail?.grading && <div><dt>评分状态</dt><dd>{detail.grading}</dd></div>}{detail?.grade && <div><dt>成绩 / 反馈摘要</dt><dd>{detail.grade}</dd></div>}</dl>
      {uncertain && <p className="learning-warning">{resource.missing ? "本次目录未出现该作业，保留上次信息，请到学校页面核实。" : detail?.error || "同步后才能核实当前提交状态。"}</p>}
      <div className="learning-inline"><a href={resource.url} target="_blank" rel="noreferrer">打开 coursework / 提交页面 ↗</a><small>{detail ? `上次读取：${new Date(detail.checkedAt).toLocaleString("zh-CN")}` : "尚未同步详情"}</small></div>
    </article>; }) : <EmptyState title="当前没有待处理的 coursework" description="仅统计已导入本学期课程中识别到的 Moodle 作业。其他外部作业平台仍需在学校页面检查。" />}
  </Section>;
}
