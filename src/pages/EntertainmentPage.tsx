import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, GameController, Play, Stop, Timer, Star, PencilSimple } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { formatDate, formatDateTime, formatDuration } from "../utils";
import { Badge, Button, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

const statusLabels: Record<string, string> = { wishlist: "想玩", playing: "正在进行", paused: "暂停", completed: "已完成" };

export function EntertainmentPage() {
  const { data, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("playing");
  const [dialog, setDialog] = useState<{ type: string; item?: Record<string, any> } | null>(null);
  useEffect(() => { if (params.get("new")) setDialog({ type: "item" }); }, [params]);
  const close = () => { setDialog(null); setParams({}); };
  const items = data.entertainmentItems.filter((item) => filter === "all" || item.status === filter);
  const activeSessions = data.playSessions.filter((item) => !item.ended_at);
  const totals = useMemo(() => Object.fromEntries(data.entertainmentItems.map((item) => [item.id, data.playSessions.filter((session) => session.entertainment_id === item.id).reduce((sum, session) => sum + Number(session.duration_minutes || 0), 0)])), [data.entertainmentItems, data.playSessions]);
  const startSession = async (item: Record<string, any>) => { await run(async () => { if (item.status !== "playing") await api.update("entertainmentItems", item.id, { status: "playing" }); return api.create("playSessions", { entertainment_id: item.id, started_at: new Date().toISOString(), progress_note: "" }); }); };
  const stopSession = async (session: Record<string, any>) => { const ended = new Date(); const duration = Math.max(1, Math.round((ended.getTime() - new Date(session.started_at).getTime()) / 60_000)); await run(() => api.update("playSessions", session.id, { ended_at: ended.toISOString(), duration_minutes: duration })); };
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="entertainment" />} eyebrow="放松与进度" title="游戏娱乐" description="记录想玩、正在玩和已经完成的内容，不制造工作式逾期压力。" actions={<Button onClick={() => setDialog({ type: "item" })}><Plus size={17} />添加游戏或活动</Button>} />
      {activeSessions.length ? <div className="now-playing">{activeSessions.map((session) => { const item = data.entertainmentItems.find((value) => value.id === session.entertainment_id); return <div key={session.id}><span className="live-dot" /><div><small>正在进行</small><strong>{item?.name || "娱乐活动"}</strong><span>开始于 {formatDateTime(session.started_at)}</span></div><Button variant="secondary" onClick={() => void stopSession(session)}><Stop size={16} />结束并记录</Button></div>; })}</div> : null}
      <div className="entertainment-toolbar"><div className="segmented">{["playing", "wishlist", "paused", "completed", "all"].map((value) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{value === "all" ? "全部" : statusLabels[value]}</button>)}</div></div>
      {items.length ? <div className="game-grid">{items.map((item) => {
        const active = activeSessions.find((session) => session.entertainment_id === item.id);
        return <article className="game-card" key={item.id}><div className="game-cover"><GameController size={32} /><Badge tone={item.status === "playing" ? "accent" : item.status === "completed" ? "success" : "neutral"}>{statusLabels[item.status]}</Badge></div><div className="game-content"><span>{item.platform || item.activity_type || "游戏"}</span><h2>{item.name}</h2><p>{item.progress || "尚未记录进度"}</p><div className="next-goal"><small>下一次目标</small><strong>{item.next_goal || "随心继续"}</strong></div><div className="game-meta"><span><Timer size={15} />{formatDuration(totals[item.id] || 0)}</span>{item.rating ? <span><Star size={15} weight="fill" />{item.rating}</span> : null}</div><div className="game-actions">{active ? <Button variant="secondary" size="sm" onClick={() => void stopSession(active)}><Stop size={15} />结束</Button> : <Button size="sm" onClick={() => void startSession(item)}><Play size={15} />开始游玩</Button>}<Button variant="ghost" size="sm" onClick={() => setDialog({ type: "item", item })}><PencilSimple size={15} />编辑</Button></div></div></article>;
      })}</div> : <EmptyState title="这个分类还没有内容" description="添加想玩的游戏或其他娱乐活动。" action={<Button variant="secondary" onClick={() => setDialog({ type: "item" })}>添加内容</Button>} />}
      <Section title="最近游玩记录" description="只记录进度和时间，不评价是否高效">
        {data.playSessions.filter((item) => item.ended_at).length ? <div className="session-list">{data.playSessions.filter((item) => item.ended_at).slice(0, 12).map((session) => { const item = data.entertainmentItems.find((value) => value.id === session.entertainment_id); return <article key={session.id}><div><strong>{item?.name || "已删除项目"}</strong><small>{formatDate(session.started_at)}</small></div><span>{formatDuration(session.duration_minutes)}</span><p>{session.progress_note || "没有补充进度"}</p></article>; })}</div> : <p className="quiet-line">还没有完成的游玩记录。</p>}
      </Section>
      <EntertainmentDialog dialog={dialog} close={close} run={run} />
    </div>
  );
}

function EntertainmentDialog({ dialog, close, run }: any) {
  if (!dialog) return null;
  const fields: FieldDefinition[] = [
    { name: "name", label: "名称", required: true },
    { name: "platform", label: "平台", placeholder: "例如：Steam、Switch、桌游" },
    { name: "activity_type", label: "类型", type: "select", required: true, options: [{ value: "game", label: "游戏" }, { value: "movie", label: "影视" }, { value: "reading", label: "阅读" }, { value: "other", label: "其他" }] },
    { name: "status", label: "状态", type: "select", required: true, options: Object.entries(statusLabels).map(([value, label]) => ({ value, label })) },
    { name: "progress", label: "当前进度", type: "textarea" },
    { name: "next_goal", label: "下一次目标" },
    { name: "notes", label: "攻略或个人笔记", type: "textarea" },
    { name: "rating", label: "个人评分（0-10）", type: "number", step: "0.5" },
    { name: "completed_date", label: "完成日期", type: "date" },
  ];
  return <Modal open title={dialog.item?.id ? "编辑游戏或活动" : "添加游戏或活动"} description="娱乐记录不会产生逾期提醒。" onClose={close}><EntityForm fields={fields} initial={{ activity_type: "game", status: "wishlist", ...dialog.item }} onCancel={close} onSubmit={async (values) => { if (dialog.item?.id) await run(() => api.update("entertainmentItems", dialog.item.id, values)); else await run(() => api.create("entertainmentItems", values)); close(); }} /></Modal>;
}
