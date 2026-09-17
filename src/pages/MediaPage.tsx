import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, CalendarBlank, LinkSimple, ChartLine, DotsThree, Trash, PencilSimple } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { buildMediaAnalytics } from "../features/mediaAnalytics";
import { formatDate, localDate, classNames } from "../utils";
import { Badge, Button, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

const stages = [
  { value: "idea", label: "灵感" },
  { value: "planning", label: "待策划" },
  { value: "producing", label: "制作中" },
  { value: "ready", label: "待发布" },
  { value: "published", label: "已发布" },
];

const fields: FieldDefinition[] = [
  { name: "title", label: "内容标题", required: true },
  { name: "platform", label: "平台", placeholder: "例如：B站、小红书" },
  { name: "content_format", label: "内容形式", placeholder: "例如：视频、图文" },
  { name: "stage", label: "制作阶段", type: "select", required: true, options: stages },
  { name: "planned_publish_at", label: "计划发布日期", type: "date" },
  { name: "published_at", label: "实际发布日期", type: "date" },
  { name: "copy_text", label: "文案与内容笔记", type: "textarea" },
  { name: "asset_path", label: "素材位置", placeholder: "/Users/..." },
  { name: "publish_url", label: "发布链接", placeholder: "https://..." },
  { name: "views", label: "播放或阅读", type: "number" },
  { name: "likes", label: "点赞", type: "number" },
  { name: "comments", label: "评论", type: "number" },
];

export function MediaPage() {
  const { data, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const analytics = useMemo(() => buildMediaAnalytics(data.mediaContents), [data.mediaContents]);
  useEffect(() => { if (params.get("new") === "1") setEditing({ stage: "idea" }); }, [params]);
  const close = () => { setEditing(null); setParams({}); };
  const move = async (id: string, stage: string) => {
    const input: Record<string, any> = { stage };
    if (stage === "published") input.published_at = localDate();
    await run(() => api.update("mediaContents", id, input));
  };
  const handleDragEnd = (event: DragEndEvent) => { if (event.over?.id) void move(String(event.active.id), String(event.over.id)); };
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="media" />} eyebrow="创作流程" title="自媒体" description="从灵感、制作到发布，把内容放在真正的创作流程里。" actions={<Button onClick={() => setEditing({ stage: "idea" })}><Plus size={18} />记录内容</Button>} />
      <div className="media-kpis"><div><span>正在制作</span><strong>{data.mediaContents.filter((item) => item.stage === "producing").length}</strong></div><div><span>等待发布</span><strong>{data.mediaContents.filter((item) => item.stage === "ready").length}</strong></div><div><span>本月已发布</span><strong>{data.mediaContents.filter((item) => item.stage === "published" && item.published_at?.slice(0, 7) === localDate().slice(0, 7)).length}</strong></div></div>
      <Section title="发布后数据" description="对比最近 12 条已发布内容的播放、点赞和评论" action={<Badge tone="accent">{analytics.points.length} 条有数据</Badge>}>
        {analytics.points.length ? <div className="media-analytics-grid">
          <div className="media-analytics-summary">
            <div><span>总播放 / 阅读</span><strong>{formatMetric(analytics.totals.views)}</strong><small>当前已记录内容合计</small></div>
            <div><span>平均互动率</span><strong>{analytics.engagementRate.toFixed(1)}%</strong><small>（点赞 + 评论）÷ 播放</small></div>
            <div><span>最佳表现</span><strong>{analytics.best?.title}</strong><small>{formatMetric(analytics.best?.views ?? 0)} 次播放 / 阅读</small></div>
          </div>
          <div className="media-analytics-chart" role="img" aria-label="发布后视频数据图表">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analytics.points} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--text-soft)", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="views" tickFormatter={formatCompactAxis} tick={{ fill: "var(--text-soft)", fontSize: 10 }} tickLine={false} axisLine={false} width={42} />
                <YAxis yAxisId="engagement" orientation="right" tickFormatter={formatCompactAxis} tick={{ fill: "var(--text-soft)", fontSize: 10 }} tickLine={false} axisLine={false} width={42} />
                <Tooltip content={<MediaTooltip />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                <Bar yAxisId="views" dataKey="views" name="播放 / 阅读" fill="var(--accent)" radius={[5, 5, 1, 1]} maxBarSize={44} />
                <Line yAxisId="engagement" type="monotone" dataKey="likes" name="点赞" stroke="var(--success)" strokeWidth={2.2} dot={{ r: 3, fill: "var(--surface-strong)" }} />
                <Line yAxisId="engagement" type="monotone" dataKey="comments" name="评论" stroke="var(--text-soft)" strokeWidth={2} dot={{ r: 3, fill: "var(--surface-strong)" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div> : <EmptyState title="还没有可视化数据" description="把内容标记为已发布，并填写播放、点赞或评论后，这里会自动生成图表。" />}
      </Section>
      <DndContext onDragEnd={handleDragEnd}>
        <div className="kanban-board">{stages.map((stage) => <StageColumn key={stage.value} stage={stage} items={data.mediaContents.filter((item) => item.stage === stage.value)} onEdit={setEditing} onMove={move} onDelete={(id: string) => run(() => api.remove("mediaContents", id))} menu={menu} setMenu={setMenu} />)}</div>
      </DndContext>
      {data.mediaContents.length === 0 ? <EmptyState title="还没有内容灵感" description="先记录一个标题，其他信息可以以后再补。" action={<Button variant="secondary" onClick={() => setEditing({ stage: "idea" })}>记录灵感</Button>} /> : null}
      <Modal open={editing !== null} title={editing?.id ? "编辑内容" : "记录内容"} description="内容阶段和发布信息会影响首页摘要。" onClose={close} wide>
        <EntityForm fields={fields} initial={editing ?? { stage: "idea" }} onCancel={close} onSubmit={async (values) => { if (editing?.id) await run(() => api.update("mediaContents", editing.id, values)); else await run(() => api.create("mediaContents", values)); close(); }} />
      </Modal>
    </div>
  );
}

function MediaTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="media-chart-tooltip"><strong>{point.title}</strong>{point.publishedAt ? <small>{formatDate(point.publishedAt)}</small> : null}<span>播放 / 阅读 {formatMetric(point.views)}</span><span>点赞 {formatMetric(point.likes)}</span><span>评论 {formatMetric(point.comments)}</span></div>;
}

function formatMetric(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatCompactAxis(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function StageColumn({ stage, items, onEdit, onMove, onDelete, menu, setMenu }: any) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.value });
  return <section ref={setNodeRef} className={classNames("kanban-column", isOver && "is-over")}><header><div><span className={`stage-dot stage-${stage.value}`} /><h2>{stage.label}</h2></div><Badge>{items.length}</Badge></header><div className="kanban-stack">{items.map((item: any) => <MediaCard key={item.id} item={item} onEdit={onEdit} onMove={onMove} onDelete={onDelete} menu={menu} setMenu={setMenu} />)}{items.length === 0 ? <p className="drop-hint">拖到这里</p> : null}</div></section>;
}

function MediaCard({ item, onEdit, onMove, onDelete, menu, setMenu }: any) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  const style: CSSProperties = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : {};
  return <article ref={setNodeRef} style={style} className={classNames("media-card", isDragging && "is-dragging")} {...listeners} {...attributes}><div className="media-card-top"><Badge tone="accent">{item.platform || "未指定平台"}</Badge><div className="row-menu-wrap"><button className="icon-button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setMenu(menu === item.id ? null : item.id); }}><DotsThree size={18} /></button>{menu === item.id ? <div className="row-menu" onPointerDown={(event) => event.stopPropagation()}><button onClick={() => onEdit(item)}><PencilSimple size={15} />编辑详情</button><select aria-label="改变制作阶段" value={item.stage} onChange={(event) => onMove(item.id, event.target.value)}>{stages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select><button className="danger" onClick={() => onDelete(item.id)}><Trash size={15} />移到回收站</button></div> : null}</div></div><h3>{item.title}</h3><p>{item.copy_text || "尚未添加内容笔记"}</p><div className="media-meta">{item.planned_publish_at ? <span><CalendarBlank size={14} />{formatDate(item.planned_publish_at)}</span> : null}{item.publish_url ? <span><LinkSimple size={14} />已发布</span> : null}{item.views !== null && item.views !== undefined ? <span><ChartLine size={14} />{item.views}</span> : null}</div></article>;
}
