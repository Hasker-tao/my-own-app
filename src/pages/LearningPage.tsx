import { useState } from "react";
import { BookOpen, ArrowSquareOut, ArrowClockwise, Check, Plus } from "@phosphor-icons/react";
import { Badge, Button, EmptyState, ErrorState, Modal, PageHeader, Section, Skeleton } from "../components/ui";
import { learningRequest, useLearning } from "../features/learningApi";
import { courseProgress, topicProgress, todaySuggestions, type LearningCourse, type LearningRecord, type LearningState, type LearningTopic } from "../features/learning";
import { localDate } from "../utils";
import "../learning.css";

const actions = { review: "复习", preview: "预习", practice: "做题" };
const understanding = { unknown: "未评估", difficult: "仍有困难", prompted: "需要提示", independent: "能独立完成" };
export function LearningPage() {
  const query = useLearning();
  const [courseId, setCourseId] = useState("");
  const [tab, setTab] = useState("courses");
  const [importOpen, setImportOpen] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ id: string; title: string }>>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<{ course: LearningCourse; topic: LearningTopic; record?: LearningRecord; preview?: boolean } | null>(null);
  const [filter, setFilter] = useState("all");
  const [budget, setBudget] = useState<string | null>(null);
  async function perform(fn: () => Promise<unknown>, success = "已保存") {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await fn(); await query.refresh(); setMessage(success); }
    catch (e) { setError((e as Error).message); await query.refresh(); }
    finally { setBusy(false); }
  }
  const importCourse = (id: string) => perform(async () => {
    await learningRequest("/moodle", "POST", { courseId: id }); setCourseId(id); setImportOpen(false);
  }, "课程目录已保存，请确认授课范围。管理资料可取消纳入复习。");
  if (query.isLoading) return <Skeleton />;
  if (!query.data) return <ErrorState message={query.error?.message ?? "学习数据不可用"} onRetry={() => void query.refresh()} />;
  const state = query.data;
  const course = state.courses.find(c => c.id === courseId) ?? state.courses.find(c => c.selected) ?? state.courses[0];
  const suggestions = todaySuggestions(state, localDate());
  const preview = state.courses.filter(c => c.selected).flatMap(c => c.topics.filter(t => t.included && !t.taught && !t.missing && !topicProgress(state, c.id, t.id).previewed).slice(0, 1).map(t => ({ course: c, topic: t }))).slice(0, 2);
  const minutes = state.records.filter(r => r.date === localDate());
  const reviewMinutes = minutes.filter(r => r.action !== "preview").reduce((n, r) => n + r.minutes, 0);
  const previewMinutes = minutes.filter(r => r.action === "preview").reduce((n, r) => n + r.minutes, 0);
  const patchTopic = (c: LearningCourse, t: LearningTopic, patch: object) => {
    if (busy) return;
    query.setData({ ...state, courses: state.courses.map(item => item.id === c.id ? { ...item, topics: item.topics.map(topic => topic.id === t.id ? { ...topic, ...patch } : topic) } : item) });
    return perform(() => learningRequest(`/courses/${c.id}/topics/${encodeURIComponent(t.id)}`, "PATCH", patch));
  };
  return <div className="page-stack learning-page">
    <PageHeader eyebrow="UNNC · EEE" title="学习工作台" description="按真实学习更新进度。没复习的日子，不结转任务，也不扣减完成记录。" actions={<Button onClick={() => setImportOpen(true)}><Plus size={17} />导入课程</Button>} />
    <div className="learning-sync" role="status"><span className={`status-dot ${state.sync.status === "error" ? "learning-error-dot" : ""}`} /><div><strong>{state.sync.message}</strong><small>{state.sync.successAt ? `上次成功：${new Date(state.sync.successAt).toLocaleString("zh-CN")}` : "使用 Chrome 中已登录的学校 Moodle，只读取目录和链接"} · 手动同步</small></div><a href="https://moodle.nottingham.ac.uk/my/courses.php" target="_blank" rel="noreferrer">打开 Moodle <ArrowSquareOut size={14} /></a></div>
    {error && <ErrorState message={error} />}{message && <p className="learning-message" role="status"><Check size={16} />{message}</p>}
    <div className="learning-tabs" role="tablist" aria-label="学习视图">{[["courses", "我的课程"], ["today", "今天复习"], ["history", "学习记录"]].map(([id, title]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{title}</button>)}</div>
    {tab === "today" ? <>
      <Section title="今天的复习量" description="作业另计。预习可选，不自动加到一小时复习任务中。">
        <div className="learning-stats"><div><strong>{reviewMinutes}<small> 分钟</small></strong><span>实际复习 / 做题</span></div><div><strong>{state.budget}<small> 分钟</small></strong><span>建议上限</span></div><div><strong>{previewMinutes}<small> 分钟</small></strong><span>额外预习</span></div></div>
        <form className="learning-inline" onSubmit={e => { e.preventDefault(); void perform(() => learningRequest("/budget", "PUT", { budget: Number(budget ?? state.budget) })); }}><label>调整复习预算<input type="number" min="0" max="240" required value={budget ?? state.budget} onChange={e => setBudget(e.target.value)} /></label><Button type="submit" variant="secondary" loading={busy}>保存预算</Button></form>
      </Section>
      <Section title="建议从这些主题开始" description="先尝试回忆或做题，再核对课件。以下是短任务建议，不是必须完成的长期计划。">
        {suggestions.length ? suggestions.map(s => <div className="learning-task" key={`${s.course.id}-${s.topic.id}`}><BookOpen size={22} /><div><small>{s.course.title}</small><strong>{s.topic.title}</strong><span>{s.reason} · 建议 {s.minutes} 分钟</span></div><Button variant="secondary" onClick={() => setEditing(s)}>记录学习</Button></div>) : <p className="quiet-line">当前没有需要安排的复习，或今天预算已用完。可到课程页选择主题，先确认已授课范围。</p>}
      </Section>
      {preview.length > 0 && <Section title="有余力时，提前看一看" description="只作预习候选，尚未核对新学期课表顺序。">{preview.map(s => <div className="learning-task" key={`${s.course.id}-${s.topic.id}`}><div><small>{s.course.title}</small><strong>{s.topic.title}</strong></div><Button variant="ghost" onClick={() => setEditing({ ...s, preview: true })}>记录预习</Button></div>)}</Section>}
    </> : tab === "history" ? <Section title="实际学习记录" description="支持补录和纠正。自测不是必做；未评估不会阻止记录完成。">
      {state.records.length ? [...state.records].sort((a,b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)).map(r => { const c = state.courses.find(c => c.id === r.courseId)!; const t = c.topics.find(t => t.id === r.topicId)!; return <div className="learning-task" key={r.id}><div><small>{r.date} · {c.title}</small><strong>{t.title}</strong><span>{actions[r.action]} · {r.completion === "complete" ? "本次范围完成" : "部分完成"} · {r.position || "整个主题"} · {r.minutes} 分钟 · {understanding[r.understanding]}</span>{r.notes && <p>{r.notes}</p>}</div><Button variant="ghost" onClick={() => setEditing({ course:c, topic:t, record:r })}>修改记录</Button></div>; }) : <EmptyState title="还没有学习记录" description="在课程主题旁点击记录学习，保存后这里会留下真实进度。" />}
    </Section> : <>
      {!state.courses.length ? <EmptyState title="把本学期课程带进来" description="先在 Chrome 登录 Moodle，再读取可见课程。不需要逐章手填，不会下载课件。" action={<Button onClick={() => setImportOpen(true)}>从 Moodle 导入</Button>} /> : <>
        <div className="learning-courses">{state.courses.map(c => {const p = courseProgress(state,c); return <button key={c.id} className={`learning-course ${course?.id===c.id ? "active" : ""}`} onClick={() => setCourseId(c.id)}><small>{c.selected ? "本学期" : "未加入本学期"}</small><strong>{c.title}</strong><span>已授课中已复习 {p.covered}/{p.taught}</span><progress aria-label={`${c.title}复习覆盖`} value={p.covered} max={p.taught || 1} /><span>已知 {p.total} 个主题 · 待纳入 {p.pending}</span></button>; })}</div>
        {course && <Section title={course.title} description="目录来自 Moodle。主题中可能包含管理资料，取消纳入即可；资料尚未全部发布时，总量仅代表已知范围。" action={<Button variant="secondary" loading={busy} onClick={() => void importCourse(course.id)}><ArrowClockwise size={16} />同步目录</Button>}>
          <div className="learning-inline"><label><input type="checkbox" checked={course.selected} disabled={busy} onChange={e => { const selected = e.target.checked; query.setData({ ...state, courses: state.courses.map(c => c.id === course.id ? { ...c, selected } : c) }); void perform(() => learningRequest(`/courses/${course.id}`, "PATCH", { selected })); }} /> 加入本学期</label><a href={course.url} target="_blank" rel="noreferrer">查看学校原页面 ↗</a></div>
          <CourseStats state={state} course={course} />
          <label className="learning-filter">查看范围<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部已知主题</option><option value="taught">已授课</option><option value="pending">待纳入</option><option value="difficult">需加强</option></select></label>
          <div className="learning-topics">{course.topics.filter(t => filter === "all" || (filter === "taught" && t.included && t.taught) || (filter === "pending" && !t.included) || (filter === "difficult" && topicProgress(state,course.id,t.id).understanding === "difficult")).map(t => { const p = topicProgress(state,course.id,t.id); return <article className="learning-topic" key={t.id}>
            <div className="learning-topic-head"><div><h3>{t.title}</h3><div className="learning-badges"><Badge tone={p.covered ? "success" : "neutral"}>{p.covered ? "已复习" : p.previewed ? "已预习" : "未完成复习"}</Badge>{!t.included && <Badge tone="warning">待纳入</Badge>}{t.missing && <Badge tone="warning">来源暂未出现</Badge>}<Badge tone={p.understanding === "difficult" ? "warning" : "neutral"}>{understanding[p.understanding]}</Badge></div></div><Button size="sm" onClick={() => setEditing({ course, topic:t, preview:!t.taught })}>记录学习</Button></div>
            <div className="learning-inline"><label><input type="checkbox" checked={t.included} disabled={busy} onChange={e => void patchTopic(course,t,{included:e.target.checked})} />纳入复习范围</label><label><input type="checkbox" checked={t.taught} disabled={busy} onChange={e => void patchTopic(course,t,{taught:e.target.checked})} />已授课（本人确认）</label><small>复习 {p.count} 次{p.latest ? ` · 最近 ${p.latest.date} · ${p.latest.position || "整个主题"}` : ""}</small></div>
            <details><summary>{t.resources.length} 项课件 / 活动 · 查看链接</summary><ul className="learning-resources">{t.resources.map(r => <li key={r.id}><Badge>{r.kind === "assign" ? "Coursework" : r.kind === "quiz" ? "测验" : r.kind === "folder" ? "资料目录" : "资料"}</Badge><a href={r.url} target="_blank" rel="noreferrer">{r.title} ↗</a></li>)}</ul></details>
          </article>; })}</div>
          <p className="quiet-line">Coursework 与测验保留学校页面入口；本版尚未自动解析截止日期或推送通知。新课表和课件正文解析也尚未接入。</p>
        </Section>}
      </>}
    </>}
    <Modal open={importOpen} title="从 Moodle 读取课程" onClose={() => !busy && setImportOpen(false)} description="保持 Chrome 中的 Moodle 已登录。这里只导入目录与资料链接，历史课程不会自动当作本学期课程。">
      <div className="learning-import"><p>在 Chrome 打开 My Modules，让目标课程出现在列表中，然后读取并选择需要导入的课程。</p><Button loading={busy} onClick={() => void perform(async () => setCandidates(await learningRequest("/moodle","POST",{})),"请选择需要导入的课程")}>读取可见课程</Button>
      {error && <ErrorState message={error} />}
      {candidates.map(c => <div className="learning-task" key={c.id}><span>{c.title}</span><Button size="sm" disabled={busy} onClick={() => void importCourse(c.id)}>导入</Button></div>)}
      <form onSubmit={e => { e.preventDefault(); try { const u = new URL(sourceUrl); const id=u.searchParams.get("id"); if(u.origin!=="https://moodle.nottingham.ac.uk"||u.pathname!=="/course/view.php"||!/^\d+$/.test(id??"")) throw new Error(); void importCourse(id!); } catch { setError("请粘贴学校课程页面地址（course/view.php?id=…）"); } }}><label>也可以粘贴目标课程地址<input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://moodle.nottingham.ac.uk/course/view.php?id=…" required /></label><Button type="submit" variant="secondary" disabled={busy}>读取这门课程</Button></form></div>
    </Modal>
    {editing && <RecordForm key={editing.record?.id ?? `${editing.course.id}:${editing.topic.id}`} {...editing} onClose={() => setEditing(null)} onSaved={() => { void query.refresh(); setEditing(null); setMessage("已保存真实学习记录"); }} />}
  </div>;
}
function CourseStats({ state, course }: {state:LearningState;course:LearningCourse}) {
  const p=courseProgress(state,course);
  return <div className="learning-stats">{[[p.total,"已知主题"],[p.taught,"已授课"],[`${p.covered}/${p.taught}`,"课后已复习"],[p.previewed,"已预习"],[p.difficult,"需加强"]].map(([n,label])=><div key={label}><strong>{n}</strong><span>{label}</span></div>)}</div>;
}
function RecordForm({course,topic,record,preview,onClose,onSaved}:{course:LearningCourse;topic:LearningTopic;record?:LearningRecord;preview?:boolean;onClose:()=>void;onSaved:()=>void}) {
  const [value,setValue]=useState({id:record?.id??crypto.randomUUID(),courseId:course.id,topicId:topic.id,date:record?.date??localDate(),action:record?.action??(preview?"preview":"review"),completion:record?.completion??"partial",understanding:record?.understanding??"unknown",position:record?.position??"",minutes:record?.minutes??0,notes:record?.notes??""});
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const field=(key:string,input:string|number)=>setValue(v=>({...v,[key]:input}));
  return <Modal open title={record?"修改学习记录":"记录学习"} description={topic.title} onClose={()=>!busy&&onClose()}><form className="learning-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError("");try{await learningRequest("/records","PUT",value);onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <div className="learning-form-grid"><label>实际学习日期<input type="date" max={localDate()} required value={value.date} onChange={e=>field("date",e.target.value)}/></label><label>本次动作<select value={value.action} onChange={e=>field("action",e.target.value)}>{Object.entries(actions).map(([v,label])=><option key={v} value={v} disabled={!topic.taught&&v!=="preview"}>{label}</option>)}</select></label></div>
    <label>本次完成情况<select value={value.completion} onChange={e=>field("completion",e.target.value)}><option value="partial">部分完成（不会增加整主题覆盖数）</option><option value="complete">整个主题本次已完成</option></select></label>
    <label>学到哪里（可选）<input value={value.position} maxLength={200} placeholder="例如：PDF 第 12 页 / 小节 2.3" onChange={e=>field("position",e.target.value)}/></label>
    <div className="learning-form-grid"><label>理解情况（可选）<select value={value.understanding} onChange={e=>field("understanding",e.target.value)}>{Object.entries(understanding).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><label>实际分钟（可填 0）<input type="number" min={0} max={1440} required value={value.minutes} onChange={e=>field("minutes",Number(e.target.value))}/></label></div>
    <label>问题或备注（可选）<textarea rows={3} maxLength={4000} value={value.notes} onChange={e=>field("notes",e.target.value)} /></label><p className="quiet-line">自测不是必做。复习过但仍有困难，可以如实记录；页码不等于掌握比例。</p>
    {error&&<ErrorState message={error}/>}<div className="learning-inline"><Button type="submit" loading={busy}>保存记录</Button><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>取消</Button></div>
  </form></Modal>;
}
