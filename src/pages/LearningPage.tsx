import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LearningInbox } from "../components/LearningInbox";
import { ArrowSquareOut, ArrowClockwise, Check, Plus, Star } from "@phosphor-icons/react";
import { Badge, Button, EmptyState, ErrorState, Modal, PageHeader, Section, Skeleton } from "../components/ui";
import { learningRequest, useLearning } from "../features/learningApi";
import { courseProgress, materialProgress, materialTopics, topicProgress, type LearningCourse, type LearningRecord, type LearningState, type LearningTopic } from "../features/learning";
import { localDate } from "../utils";
import "../learning.css";

const actions = { review: "复习", preview: "预习", practice: "做题" };
export function LearningPage() {
  const query = useLearning();
  const [params, setParams] = useSearchParams();
  const courseId = params.get("course") ?? "";
  const setCourseId = (id: string) => setParams(id ? {course:id} : {});
  const [selectedImports, setSelectedImports] = useState<string[]>([]);
  const [tab, setTab] = useState("courses");
  const [importOpen, setImportOpen] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ id: string; title: string }>>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<{ course: LearningCourse; topic: LearningTopic; record?: LearningRecord; preview?: boolean } | null>(null);
  const [filter, setFilter] = useState("all");
  async function perform(fn: () => Promise<unknown>, success = "已保存") {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await fn(); await query.refresh(); setMessage(success); }
    catch (e) { setError((e as Error).message); await query.refresh(); }
    finally { setBusy(false); }
  }
  const importCourse = (id: string) => perform(async () => {
    await learningRequest("/moodle", "POST", { courseId: id });
  }, "课程目录已保存，请确认授课范围。管理资料可取消纳入复习。");
  if (query.isLoading) return <Skeleton />;
  if (!query.data) return <ErrorState message={query.error?.message ?? "学习数据不可用"} onRetry={() => void query.refresh()} />;
  const state = query.data;
  const course = state.courses.find(c => c.id === courseId);
  const unread = state.notices.filter(n => !n.read);
  const patchTopic = (c: LearningCourse, t: LearningTopic, patch: object) => {
    if (busy) return;
    query.setData({ ...state, courses: state.courses.map(item => item.id === c.id ? { ...item, topics: item.topics.map(topic => topic.id === t.id ? { ...topic, ...patch } : topic) } : item) });
    return perform(() => learningRequest(`/courses/${c.id}/topics/${encodeURIComponent(t.id)}`, "PATCH", patch));
  };
  return <div className="page-stack learning-page">
    <PageHeader eyebrow="UNNC · EEE" title="学习工作台" description="课程学习、Coursework 与考试前复习分开管理；复习进度只按实际记录更新。" actions={<Button onClick={() => setImportOpen(true)}><Plus size={17} />导入课程</Button>} />
    <div className="learning-sync" role="status"><span className={`status-dot ${state.sync.status === "error" ? "learning-error-dot" : ""}`} /><div><strong>{state.sync.message}</strong><small>{state.sync.successAt ? `上次成功：${new Date(state.sync.successAt).toLocaleString("zh-CN")}` : "使用 Chrome 中已登录的学校 Moodle，同步课程与作业状态"} · 工作台运行时每 30 分钟检查，也可手动同步</small></div><a href="https://moodle.nottingham.ac.uk/my/courses.php" target="_blank" rel="noreferrer">打开 Moodle <ArrowSquareOut size={14} /></a></div>
    {unread.length > 0 && <button className="learning-news-banner" onClick={() => setTab("news")} role="status">你有 {unread.length} 条新消息 · 查看新增课件与 coursework →</button>}
    {error && <ErrorState message={error} />}{message && <p className="learning-message" role="status"><Check size={16} />{message}</p>}
    <div className="learning-tabs" role="tablist" aria-label="学习视图">{[["courses", "我的课程"], ["tasks", "Coursework 待办"], ["review", "复习"], ["news", `消息${unread.length ? `（${unread.length}）` : ""}`], ["history", "学习记录"]].map(([id, title]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{title}</button>)}</div>
    {tab === "review" ? <ReviewList state={state} busy={busy} onEdit={(course, topic) => setEditing({course, topic})} onImportant={(course, topic) => void patchTopic(course, topic, {important:!topic.important})} /> : tab === "tasks" || tab === "news" ? <LearningInbox state={state} view={tab} busy={busy} onRead={ids => void perform(() => learningRequest("/notices/read","PUT",{ids}))} onSync={() => void perform(() => learningRequest("/sync","POST",{}),"本学期课程同步完成")} onConfirm={(courseId, resourceId, confirmed) => void perform(() => learningRequest(`/courses/${courseId}/coursework/${resourceId}`,"PATCH",{confirmed}), confirmed ? "已记录本人确认" : "已撤销本人确认")} /> : tab === "history" ? <Section title="学习记录" description="支持补录和纠正；考试前复习完成情况会同步到复习页。">
      {state.records.length ? [...state.records].sort((a,b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)).map(r => { const c = state.courses.find(c => c.id === r.courseId)!; const t = c.topics.find(t => t.id === r.topicId)!; return <div className="learning-task" key={r.id}><div><small>{r.date} · {c.title}</small><strong>{t.title}</strong><span>{actions[r.action]} · {r.completion === "complete" ? "本次范围完成" : "部分完成"} · {r.position || "整个主题"} · {r.minutes} 分钟</span>{r.notes && <p>{r.notes}</p>}</div><Button variant="ghost" onClick={() => setEditing({ course:c, topic:t, record:r })}>修改记录</Button></div>; }) : <EmptyState title="还没有学习记录" description="在复习页选择 Part 并记录后，这里会保存真实进度。" />}
    </Section> : <>
      {!state.courses.length ? <EmptyState title="把本学期课程带进来" description="先在 Chrome 登录 Moodle，再读取可见课程。不需要逐章手填，不会下载课件。" action={<Button onClick={() => setImportOpen(true)}>从 Moodle 导入</Button>} /> : <>
        {!course && <><div className="learning-overview-heading"><div><h2>课程总览</h2><p>课件进度按你确认的已学主题估算；考试前复习进度单独记录。</p></div><Button variant="secondary" loading={busy} onClick={() => void perform(() => learningRequest("/sync","POST",{}),"本学期课程同步完成")}>同步本学期课程</Button></div><div className="learning-courses">{state.courses.map(c => {const p = courseProgress(state,c); const m = materialProgress(c); return <button key={c.id} className="learning-course" onClick={() => setCourseId(c.id)}><small>{c.selected ? "本学期" : "未加入本学期"}</small><strong>{c.title}</strong><div className="learning-ring" role="img" aria-label={`${c.title}课件学习进度 ${m.confirmed ? `${m.percent}%` : "待确认学习位置"}`}><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40"/><circle className="learning-ring-value" cx="50" cy="50" r="40" pathLength="100" strokeDasharray={`${m.percent} 100`}/></svg><span>{m.confirmed ? `${m.percent}%` : "—"}</span></div><span>已学课件 / 资料 {m.confirmed ? `${m.studied}/${m.total}` : `待确认 / ${m.total}`}</span><span>考试前已复习 {p.covered}/{p.total} 个 Part</span><span>重要 Part {p.important} · 点击查看课程 →</span></button>; })}</div></>}
        {course && <Button variant="ghost" onClick={() => setCourseId("")}>← 返回课程总览</Button>}
        {course && <Section title={course.title} description="目录来自 Moodle。主题中可能包含管理资料，取消纳入即可；资料尚未全部发布时，总量仅代表已知范围。" action={<Button variant="secondary" loading={busy} onClick={() => void importCourse(course.id)}><ArrowClockwise size={16} />同步目录</Button>}>
          <div className="learning-inline"><label><input type="checkbox" checked={course.selected} disabled={busy} onChange={e => { const selected = e.target.checked; query.setData({ ...state, courses: state.courses.map(c => c.id === course.id ? { ...c, selected } : c) }); void perform(() => learningRequest(`/courses/${course.id}`, "PATCH", { selected })); }} /> 加入本学期</label><a href={course.url} target="_blank" rel="noreferrer">查看学校原页面 ↗</a></div>
          <label className="learning-filter">已学完到哪个主题<select value={course.studiedThroughTopicId ?? ""} disabled={busy} onChange={e => void perform(() => learningRequest(`/courses/${course.id}`, "PATCH", { studiedThroughTopicId: e.target.value || null }), "课件学习位置已更新")}><option value="">尚未确认</option>{materialTopics(course).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
          <p className="quiet-line">一次选择该主题及之前的课件 / 资料视为已学。Coursework、测验和课后复习不计入圆环；新课件同步后比例可能变化。</p>
          <CourseStats state={state} course={course} />
          <label className="learning-filter">查看范围<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部已知主题</option><option value="included">纳入考试复习</option><option value="pending">待纳入</option><option value="important">重要 Part</option></select></label>
          <div className="learning-topics">{course.topics.filter(t => filter === "all" || (filter === "included" && t.included) || (filter === "pending" && !t.included) || (filter === "important" && t.important)).map(t => { const p = topicProgress(state,course.id,t.id); return <article className="learning-topic" key={t.id}>
            <div className="learning-topic-head"><div><h3>{t.title}</h3><div className="learning-badges"><Badge tone={p.covered ? "success" : "neutral"}>{p.covered ? "考试前已复习" : p.previewed ? "已预习" : "考试前待复习"}</Badge>{!t.included && <Badge tone="warning">待纳入</Badge>}{t.missing && <Badge tone="warning">来源暂未出现</Badge>}{t.important && <Badge tone="warning">重要</Badge>}</div></div><Button size="sm" onClick={() => setEditing({ course, topic:t })}>记录复习</Button></div>
            <div className="learning-inline"><label><input type="checkbox" checked={t.included} disabled={busy} onChange={e => void patchTopic(course,t,{included:e.target.checked})} />纳入课程统计与考试复习</label><button type="button" className="learning-star" aria-label={`${t.title}${t.important ? "取消重要标记" : "标为重要"}`} aria-pressed={Boolean(t.important)} disabled={busy} onClick={() => void patchTopic(course,t,{important:!t.important})}><Star size={21} weight={t.important ? "fill" : "regular"} />{t.important ? "重要" : "标为重要"}</button><small>考试前复习 {p.count} 次{p.latest ? ` · 最近 ${p.latest.date} · ${p.latest.position || "整个 Part"}` : ""}</small></div>
            <details><summary>{t.resources.length} 项课件 / 活动 · 查看链接</summary><ul className="learning-resources">{t.resources.map(r => <li key={r.id}><Badge>{r.kind === "assign" ? "Coursework" : r.kind === "quiz" ? "测验" : r.kind === "folder" ? "资料目录" : "资料"}</Badge><a href={r.url} target="_blank" rel="noreferrer">{r.title} ↗</a></li>)}</ul></details>
          </article>; })}</div>
          <p className="quiet-line">Coursework 与测验保留学校页面入口；作业提交、上传与截止信息请到 Coursework 待办查看。新课表和课件正文解析尚未接入。</p>
        </Section>}
      </>}
    </>}
    <Modal open={importOpen} title="从 Moodle 读取课程" onClose={() => !busy && setImportOpen(false)} description="保持 Chrome 中的 Moodle 已登录。选择本学期课程，可一次导入多门。只读取学校信息，不代你上传或提交作业。">
      <div className="learning-import"><p>在 Chrome 打开 My Modules，让目标课程出现在列表中，然后读取并选择需要导入的课程。</p><Button loading={busy} onClick={() => void perform(async () => setCandidates(await learningRequest("/moodle","POST",{})),"勾选需要导入的本学期课程（可能含历史课程）")}>读取可见课程</Button>
      {error && <ErrorState message={error} />}
      {candidates.map(c => <label className="learning-import-option" key={c.id}><input type="checkbox" checked={selectedImports.includes(c.id)} disabled={busy || state.courses.some(saved => saved.id === c.id)} onChange={e => setSelectedImports(ids => e.target.checked ? [...ids,c.id] : ids.filter(id => id !== c.id))}/><span>{c.title}{state.courses.some(saved => saved.id === c.id) ? " · 已导入" : ""}</span></label>)}
      {candidates.length > 0 && <Button disabled={busy || !selectedImports.length} onClick={() => void perform(async () => { const failures:string[]=[]; for(const id of selectedImports) { try { await learningRequest("/moodle","POST",{courseId:id}); setSelectedImports(ids => ids.filter(value => value !== id)); } catch { failures.push(candidates.find(c=>c.id===id)?.title ?? id); } } if(failures.length) throw new Error(`这些课程未导入，请重试：${failures.join("、")}。成功导入的课程已保留。`); },"所选课程已导入，可关闭弹窗查看课程总览")}>导入所选课程（{selectedImports.length}）</Button>}
      {message && <p role="status">{message}</p>}
      <form onSubmit={e => { e.preventDefault(); try { const u = new URL(sourceUrl); const id=u.searchParams.get("id"); if(u.origin!=="https://moodle.nottingham.ac.uk"||u.pathname!=="/course/view.php"||!/^\d+$/.test(id??"")) throw new Error(); void importCourse(id!); } catch { setError("请粘贴学校课程页面地址（course/view.php?id=…）"); } }}><label>也可以粘贴目标课程地址<input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://moodle.nottingham.ac.uk/course/view.php?id=…" required /></label><Button type="submit" variant="secondary" disabled={busy}>读取这门课程</Button></form></div>
    </Modal>
    {editing && <RecordForm key={editing.record?.id ?? `${editing.course.id}:${editing.topic.id}`} {...editing} onClose={() => setEditing(null)} onSaved={() => { void query.refresh(); setEditing(null); setMessage("已保存真实学习记录"); }} />}
  </div>;
}
function ReviewList({state,busy,onEdit,onImportant}:{state:LearningState;busy:boolean;onEdit:(course:LearningCourse,topic:LearningTopic)=>void;onImportant:(course:LearningCourse,topic:LearningTopic)=>void}) {
  const courses=state.courses.filter(c=>c.selected);
  return <Section title="考试前复习" description="这是考试前需要完成的长期复习范围，没有每日任务或时间预算。展开 Part 查看课件，完整复习后计入进度。">
    {courses.length ? courses.map(course => { const topics=course.topics.filter(t=>t.included&&!t.missing); const done=topics.filter(t=>topicProgress(state,course.id,t.id).covered).length; return <section className="learning-review-course" key={course.id}><h3>{course.title}</h3><p className="quiet-line">已复习 {done}/{topics.length} 个 Part · 重要 {topics.filter(t=>t.important).length}</p>{topics.map(topic=>{const p=topicProgress(state,course.id,topic.id);const resources=topic.resources.filter(r=>r.kind!=="assign"&&r.kind!=="quiz"&&!r.missing);return <details className="learning-review-part" key={topic.id}><summary><span>{topic.important&&<Star size={18} weight="fill" aria-label="重要"/>}<strong>{topic.title}</strong></span><Badge tone={p.covered?"success":"neutral"}>{p.covered?"已完成":"待复习"}</Badge></summary><div className="learning-review-actions"><button type="button" className="learning-star" aria-label={`${topic.title}${topic.important?"取消重要标记":"标为重要"}`} aria-pressed={Boolean(topic.important)} disabled={busy} onClick={()=>onImportant(course,topic)}><Star size={21} weight={topic.important?"fill":"regular"}/>{topic.important?"重要":"标为重要"}</button><Button size="sm" onClick={()=>onEdit(course,topic)}>记录复习</Button></div>{resources.length?<ul className="learning-resources">{resources.map(r=><li key={r.id}><a href={r.url} target="_blank" rel="noreferrer">{r.title} ↗</a></li>)}</ul>:<p className="quiet-line">这个 Part 暂无可读取的课件链接。</p>}</details>})}</section>}) : <EmptyState title="暂无本学期课程" description="先从 Moodle 导入并选择本学期课程。" />}
  </Section>;
}
function CourseStats({ state, course }: {state:LearningState;course:LearningCourse}) {
  const p=courseProgress(state,course);
  return <div className="learning-stats">{[[p.total,"考试复习 Part"],[`${p.covered}/${p.total}`,"考试前已复习"],[p.important,"重要 Part"],[p.previewed,"已预习"]].map(([n,label])=><div key={label}><strong>{n}</strong><span>{label}</span></div>)}</div>;
}
function RecordForm({course,topic,record,preview,onClose,onSaved}:{course:LearningCourse;topic:LearningTopic;record?:LearningRecord;preview?:boolean;onClose:()=>void;onSaved:()=>void}) {
  const [value,setValue]=useState({id:record?.id??crypto.randomUUID(),courseId:course.id,topicId:topic.id,date:record?.date??localDate(),action:record?.action??(preview?"preview":"review"),completion:record?.completion??"partial",understanding:record?.understanding??"unknown",position:record?.position??"",minutes:record?.minutes??0,notes:record?.notes??""});
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const field=(key:string,input:string|number)=>setValue(v=>({...v,[key]:input}));
  return <Modal open title={record?"修改学习记录":"记录学习"} description={topic.title} onClose={()=>!busy&&onClose()}><form className="learning-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError("");try{await learningRequest("/records","PUT",value);onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
    <div className="learning-form-grid"><label>实际学习日期<input type="date" max={localDate()} required value={value.date} onChange={e=>field("date",e.target.value)}/></label><label>本次动作<select value={value.action} onChange={e=>field("action",e.target.value)}>{Object.entries(actions).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label></div>
    <label>本次完成情况<select value={value.completion} onChange={e=>field("completion",e.target.value)}><option value="partial">部分完成（不会增加整主题覆盖数）</option><option value="complete">整个主题本次已完成</option></select></label>
    <label>学到哪里（可选）<input value={value.position} maxLength={200} placeholder="例如：PDF 第 12 页 / 小节 2.3" onChange={e=>field("position",e.target.value)}/></label>
    <label>实际分钟（可填 0）<input type="number" min={0} max={1440} required value={value.minutes} onChange={e=>field("minutes",Number(e.target.value))}/></label>
    <label>问题或备注（可选）<textarea rows={3} maxLength={4000} value={value.notes} onChange={e=>field("notes",e.target.value)} /></label><p className="quiet-line">Part 的重要程度请在课程页或复习页点亮星星；默认不标记。</p>
    {error&&<ErrorState message={error}/>}<div className="learning-inline"><Button type="submit" loading={busy}>保存记录</Button><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>取消</Button></div>
  </form></Modal>;
}
