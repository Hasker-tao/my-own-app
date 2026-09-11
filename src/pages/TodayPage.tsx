import { LearningSummary } from "../components/LearningSummary";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarPlus, Check, Clock, DotsThree, ArrowBendDownRight, Trash, Play, X, ArrowSquareOut } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { addDays, classNames, formatDate, formatDuration, localDate } from "../utils";
import { Badge, Button, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

const fields: FieldDefinition[] = [
  { name: "title", label: "事项名称", required: true, placeholder: "例如：完成本周课程习题" },
  { name: "plan_date", label: "日期", type: "date", required: true },
  { name: "start_time", label: "开始时间", type: "time" },
  { name: "estimated_minutes", label: "预计分钟", type: "number", placeholder: "60" },
  { name: "priority", label: "优先级", type: "select", required: true, options: [{ value: "low", label: "低" }, { value: "medium", label: "普通" }, { value: "high", label: "高" }] },
  { name: "notes", label: "备注", type: "textarea", placeholder: "补充执行说明" },
];

export function TodayPage() {
  const { data, registerSaveHandler, run } = useWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"today" | "week" | "history">("today");
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [review, setReview] = useState("");
  const [savedReview, setSavedReview] = useState("");
  const newOpen = params.get("new") === "1";
  const openForm = (item: Record<string, any> | null = null) => { setEditing(item ?? {}); if (!item) setParams({ new: "1" }); };
  const closeForm = () => { setEditing(null); setParams({}); };

  useEffect(() => {
    void api.getReview(selectedDate).then((value) => {
      const content = value?.content ?? "";
      setReview(content);
      setSavedReview(content);
    });
  }, [selectedDate]);

  const persistReview = useCallback(async () => {
    if (review === savedReview) return;
    await run(() => api.setReview(selectedDate, review));
    setSavedReview(review);
  }, [review, run, savedReview, selectedDate]);

  useEffect(() => registerSaveHandler(persistReview), [persistReview, registerSaveHandler]);

  const items = useMemo(() => {
    if (view === "today") return data.planItems.filter((item) => item.plan_date === selectedDate && item.status !== "cancelled");
    if (view === "week") {
      const end = addDays(selectedDate, 6);
      return data.planItems.filter((item) => item.plan_date >= selectedDate && item.plan_date <= end && item.status !== "cancelled");
    }
    return data.planItems.filter((item) => item.plan_date < selectedDate || ["done", "cancelled"].includes(item.status));
  }, [data.planItems, selectedDate, view]);
  const ordered = [...items].sort((a, b) => `${a.plan_date}${a.start_time || "99:99"}`.localeCompare(`${b.plan_date}${b.start_time || "99:99"}`));
  const complete = items.filter((item) => item.status === "done").length;

  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="today" />} eyebrow="日常执行" title="今日计划" description="只安排今天何时执行什么，业务详情仍留在对应模块。" actions={<Button onClick={() => openForm()}><CalendarPlus size={18} />添加事项</Button>} />
      <LearningSummary />
      <div className="plan-toolbar">
        <div className="segmented" role="tablist">{(["today", "week", "history"] as const).map((key) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{key === "today" ? "今日" : key === "week" ? "本周" : "历史"}</button>)}</div>
        <label className="date-control"><span>起始日期</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
        <div className="plan-stat"><span>完成</span><strong>{complete}/{items.length}</strong></div>
        <div className="plan-stat"><span>预计</span><strong>{formatDuration(items.reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0))}</strong></div>
      </div>
      <Section title={view === "today" ? formatDate(selectedDate) : view === "week" ? "未来七天" : "历史记录"} description={view === "today" ? "按时间顺序处理；没有时间的事项排在最后。" : "按日期查看计划状态。"}>
        {ordered.length ? <div className="plan-table">{ordered.map((item) => <div className={classNames("plan-table-row", item.status === "done" && "is-done")} key={item.id}>
          <button className="complete-control" disabled={item.status === "done"} onClick={() => void run(() => api.completePlan(item.id))}>{item.status === "done" ? <Check size={14} /> : item.status === "doing" ? <Play size={12} /> : null}</button>
          <div className="date-block"><strong>{item.start_time || "待安排"}</strong>{view !== "today" ? <small>{formatDate(item.plan_date)}</small> : null}</div>
          <div className="plan-copy"><strong>{item.display_title || item.title}</strong><small>{item.notes || (item.source_module ? `来自 ${sourceLabels[item.source_module] ?? item.source_module}` : "独立事项")}</small>{item.source_module ? <button className="text-button source-link" onClick={() => navigate(sourceRoutes[item.source_module] ?? "/")}>打开来源 <ArrowSquareOut size={13} /></button> : null}</div>
          <Badge tone={item.priority === "high" ? "warning" : item.status === "done" ? "success" : "neutral"}>{item.status === "done" ? "已完成" : item.priority === "high" ? "高优先" : "待处理"}</Badge>
          <div className="row-menu-wrap"><button className="icon-button" onClick={() => setMenu(menu === item.id ? null : item.id)}><DotsThree size={20} /></button>{menu === item.id ? <div className="row-menu"><button onClick={() => { openForm(item); setMenu(null); }}><Clock size={15} />调整时间</button><button onClick={() => void run(() => api.update("planItems", item.id, { status: "doing" }))}><Play size={15} />开始执行</button><button onClick={() => void run(() => api.postponePlan(item.id, addDays(item.plan_date, 1)))}><ArrowBendDownRight size={15} />移到明天</button><button onClick={() => void run(() => api.update("planItems", item.id, { status: "cancelled" }))}><X size={15} />取消</button><button className="danger" onClick={() => void run(() => api.remove("planItems", item.id))}><Trash size={15} />移到回收站</button></div> : null}</div>
        </div>)}</div> : <EmptyState title="这个时间范围还没有计划" description="添加第一件需要执行的事情。" action={<Button variant="secondary" onClick={() => openForm()}>添加事项</Button>} />}
      </Section>
      {view === "today" ? <Section title="当日复盘" description="一句话记录今天做得如何"><textarea className="review-input" value={review} onChange={(event) => setReview(event.target.value)} onBlur={() => void persistReview().catch(() => undefined)} placeholder="今天最值得记住的进展、问题或调整……" /></Section> : null}
      <Modal open={newOpen || editing !== null} title={editing?.id ? "编辑计划事项" : "添加计划事项"} description="时间可以暂时留空，之后再安排。" onClose={closeForm}>
        <EntityForm fields={fields} initial={{ plan_date: selectedDate, priority: "medium", ...editing }} onCancel={closeForm} onSubmit={async (values) => { if (editing?.id) await run(() => api.update("planItems", editing.id, values)); else await run(() => api.create("planItems", values)); closeForm(); }} />
      </Modal>
    </div>
  );
}

const sourceRoutes: Record<string, string> = { media: "/media", development: "/development", consulting: "/consulting", fitness: "/fitness", diet: "/diet", entertainment: "/entertainment" };
const sourceLabels: Record<string, string> = { media: "自媒体", development: "开发工作", consulting: "咨询工作", fitness: "健身计划", diet: "饮食计划", entertainment: "游戏娱乐" };
