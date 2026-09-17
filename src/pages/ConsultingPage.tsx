import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Users, ChatCenteredText, Package, PhoneCall, Timer, Check, CurrencyCircleDollar, Trash } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { formatDate, formatDateTime, formatDuration, localDate } from "../utils";
import { Button, ConfirmDialog, EmptyState, EntityForm, Modal, PageHeader, Section, type FieldDefinition } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";

export function ConsultingPage() {
  const { data, run } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [clientId, setClientId] = useState<string | null>(data.clients[0]?.id ?? null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ type: string; item?: Record<string, any> } | null>(null);
  const [deleteClientOpen, setDeleteClientOpen] = useState(false);
  useEffect(() => { if (!clientId || !data.clients.some((client) => client.id === clientId)) setClientId(data.clients[0]?.id ?? null); }, [clientId, data.clients]);
  const projects = data.consultingProjects.filter((item) => item.client_id === clientId);
  useEffect(() => { if (!projectId || !projects.some((item) => item.id === projectId)) setProjectId(projects[0]?.id ?? null); }, [projectId, projects]);
  useEffect(() => { const value = params.get("new"); if (value) setDialog({ type: value }); }, [params]);
  const close = () => { setDialog(null); setParams({}); };
  const client = data.clients.find((item) => item.id === clientId);
  const project = data.consultingProjects.find((item) => item.id === projectId);
  const interactions = data.consultingInteractions.filter((item) => item.project_id === projectId);
  const deliverables = data.consultingDeliverables.filter((item) => item.project_id === projectId);
  const followups = data.consultingFollowups.filter((item) => item.project_id === projectId);
  const timeEntries = data.consultingTimeEntries.filter((item) => item.project_id === projectId);
  const totalMinutes = timeEntries.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const totalFee = timeEntries.reduce((sum, item) => sum + Number(item.fee_cents || 0), 0) / 100;
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="consulting" />} eyebrow="客户与交付" title="咨询工作" description="围绕客户、项目、沟通、交付和跟进组织咨询过程。" actions={<><Button variant="secondary" onClick={() => setDialog({ type: "client" })}><Users size={17} />添加客户</Button>{clientId ? <Button onClick={() => setDialog({ type: "project" })}><Plus size={17} />新建咨询项目</Button> : null}{client ? <Button variant="ghost" className="danger-text" onClick={() => setDeleteClientOpen(true)}><Trash size={16} />删除客户</Button> : null}</>} />
      {data.clients.length === 0 ? <EmptyState title="还没有客户记录" description="添加客户后，再创建咨询项目和跟进。" action={<Button onClick={() => setDialog({ type: "client" })}>添加第一个客户</Button>} /> : <div className="consult-layout">
        <aside className="client-column"><span className="rail-label">客户</span>{data.clients.map((client) => <button className={client.id === clientId ? "active" : ""} key={client.id} onClick={() => { setClientId(client.id); setProjectId(null); }}><div className="client-avatar">{client.name.slice(0, 1)}</div><div><strong>{client.name}</strong><small>{data.consultingProjects.filter((item) => item.client_id === client.id && item.status === "active").length} 个进行中项目</small></div></button>)}</aside>
        <div className="consult-main">
          <div className="project-tabs">{projects.map((item) => <button key={item.id} className={item.id === projectId ? "active" : ""} onClick={() => setProjectId(item.id)}>{item.name}</button>)}{projects.length === 0 ? <span>该客户还没有项目</span> : null}</div>
          {project ? <>
            <div className="detail-hero"><div><span className="eyebrow">咨询项目</span><h2>{project.name}</h2><p>{project.current_need || "尚未记录当前需求。"}</p></div><div className="consult-stats"><div><Timer size={18} /><strong>{formatDuration(totalMinutes)}</strong><small>累计咨询</small></div><div><CurrencyCircleDollar size={18} /><strong>¥{totalFee.toFixed(2)}</strong><small>记录费用</small></div></div></div>
            <div className="consult-action-strip"><Button variant="secondary" size="sm" onClick={() => setDialog({ type: "interaction" })}><ChatCenteredText size={15} />记录沟通</Button><Button variant="secondary" size="sm" onClick={() => setDialog({ type: "deliverable" })}><Package size={15} />添加交付</Button><Button variant="secondary" size="sm" onClick={() => setDialog({ type: "followup" })}><PhoneCall size={15} />安排跟进</Button><Button variant="secondary" size="sm" onClick={() => setDialog({ type: "time" })}><Timer size={15} />记录时长</Button></div>
            <div className="consult-grid">
              <Section title="交付物" description="明确截止日期和交付状态">
                {deliverables.length ? <div className="check-list">{deliverables.map((item) => <article key={item.id}><button className="complete-control" disabled={item.status === "done"} onClick={() => void run(() => api.update("consultingDeliverables", item.id, { status: "done" }))}>{item.status === "done" ? <Check size={14} /> : null}</button><div><strong>{item.name}</strong><small>{item.due_date ? `截止 ${formatDate(item.due_date)}` : "没有截止日期"}</small></div></article>)}</div> : <p className="quiet-line">暂无交付物。</p>}
              </Section>
              <Section title="待跟进" description="到了日期会出现在首页提醒中">
                {followups.length ? <div className="check-list">{followups.map((item) => <article key={item.id}><button className="complete-control" disabled={item.status === "done"} onClick={() => void run(() => api.update("consultingFollowups", item.id, { status: "done", completed_at: new Date().toISOString() }))}>{item.status === "done" ? <Check size={14} /> : null}</button><div><strong>{item.content}</strong><small>{formatDateTime(item.followup_at)}</small></div></article>)}</div> : <p className="quiet-line">暂无跟进安排。</p>}
              </Section>
            </div>
            <Section title="沟通记录" description="会议、电话和重要消息按时间连续保存">
              {interactions.length ? <div className="interaction-timeline">{interactions.map((item) => <article key={item.id}><span /><div><time>{formatDateTime(item.occurred_at)}</time><strong>{item.interaction_type === "meeting" ? "会议" : item.interaction_type === "call" ? "电话" : "消息"}</strong><p>{item.notes || "没有补充记录"}</p></div></article>)}</div> : <p className="quiet-line">暂无沟通记录。</p>}
            </Section>
          </> : <EmptyState title="选择或创建一个咨询项目" description="项目详情会显示在这里。" />}
        </div>
      </div>}
      <ConsultingDialog dialog={dialog} close={close} clientId={clientId} project={project} run={run} />
      <ConfirmDialog open={deleteClientOpen} title="将客户移到回收站？" description={`“${client?.name ?? "当前客户"}”会从咨询页面隐藏；相关项目、沟通和交付记录会保留，恢复客户后可继续访问。`} confirmLabel="移到回收站" danger onClose={() => setDeleteClientOpen(false)} onConfirm={async () => { if (client) await run(() => api.remove("clients", client.id)); }} />
    </div>
  );
}

function ConsultingDialog({ dialog, close, clientId, project, run }: any) {
  if (!dialog) return null;
  const map: Record<string, { title: string; collection: any; fields: FieldDefinition[]; defaults: Record<string, any> }> = {
    client: { title: "添加客户", collection: "clients", fields: [{ name: "name", label: "客户名称", required: true }, { name: "notes", label: "基础备注", type: "textarea" }], defaults: {} },
    project: { title: "新建咨询项目", collection: "consultingProjects", fields: [{ name: "name", label: "项目名称", required: true }, { name: "current_need", label: "当前需求", type: "textarea" }, { name: "status", label: "状态", type: "select", required: true, options: [{ value: "active", label: "进行中" }, { value: "waiting", label: "等待中" }, { value: "completed", label: "已完成" }] }], defaults: { client_id: clientId, status: "active" } },
    interaction: { title: "记录沟通", collection: "consultingInteractions", fields: [{ name: "occurred_at", label: "时间", type: "datetime-local", required: true }, { name: "interaction_type", label: "形式", type: "select", required: true, options: [{ value: "meeting", label: "会议" }, { value: "call", label: "电话" }, { value: "message", label: "消息" }] }, { name: "notes", label: "沟通记录", type: "textarea" }], defaults: { project_id: project?.id, occurred_at: new Date().toISOString().slice(0, 16), interaction_type: "meeting" } },
    deliverable: { title: "添加交付物", collection: "consultingDeliverables", fields: [{ name: "name", label: "交付物名称", required: true }, { name: "due_date", label: "截止日期", type: "date" }], defaults: { project_id: project?.id, status: "todo" } },
    followup: { title: "安排跟进", collection: "consultingFollowups", fields: [{ name: "followup_at", label: "跟进时间", type: "datetime-local", required: true }, { name: "content", label: "跟进内容", type: "textarea", required: true }], defaults: { project_id: project?.id, followup_at: `${localDate()}T10:00`, status: "todo" } },
    time: { title: "记录咨询时长", collection: "consultingTimeEntries", fields: [{ name: "entry_date", label: "日期", type: "date", required: true }, { name: "minutes", label: "分钟", type: "number", required: true }, { name: "fee_cents", label: "费用（分）", type: "number", helper: "例如 120000 表示 1200 元" }, { name: "settled", label: "已经结算", type: "checkbox" }, { name: "notes", label: "备注", type: "textarea" }], defaults: { project_id: project?.id, entry_date: localDate(), minutes: 60, settled: false } },
  };
  const config = map[dialog.type] ?? map.followup;
  return <Modal open title={config.title} description="记录会保存在当前电脑的数据文件中。" onClose={close}><EntityForm fields={config.fields} initial={{ ...config.defaults, ...dialog.item }} onCancel={close} onSubmit={async (values) => { await run(() => api.create(config.collection, { ...config.defaults, ...values })); close(); }} /></Modal>;
}
