import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, FolderOpen, ShieldCheck, DownloadSimple, ArrowCounterClockwise, Trash, Sun, Moon, Check, Archive, Notebook, Stack, SquaresFour } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import type { CollectionName } from "../types";
import { formatBytes, formatDateTime } from "../utils";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Section, Skeleton } from "../components/ui";
import { ModuleArtwork } from "../components/ModuleArtwork";
import { normalizeAppearance } from "../appearance";

const collectionLabels: Record<string, string> = { planItems: "今日计划", quickMemos: "快速备忘", mediaContents: "自媒体", devProjects: "开发项目", devMilestones: "里程碑", devWorkItems: "开发工作项", devLogs: "开发日志", clients: "客户", consultingProjects: "咨询项目", consultingInteractions: "沟通记录", consultingDeliverables: "交付物", consultingFollowups: "咨询跟进", consultingTimeEntries: "咨询时长", workoutTemplates: "训练模板", workoutTemplateExercises: "模板动作", workouts: "训练记录", workoutExercises: "训练动作", workoutSets: "训练组", bodyMetrics: "身体数据", nutritionTargets: "营养目标", foods: "常用食物", meals: "餐食", mealItems: "餐食明细", entertainmentItems: "游戏娱乐", playSessions: "游玩记录" };
const dashboardOptions = [{ value: "media", label: "自媒体" }, { value: "development", label: "开发工作" }, { value: "fitness", label: "健身计划" }, { value: "diet", label: "饮食计划" }, { value: "entertainment", label: "游戏娱乐" }];

export function SettingsPage() {
  const { data, run } = useWorkspace();
  const system = useQuery({ queryKey: ["system"], queryFn: api.systemStatus });
  const backups = useQuery({ queryKey: ["backups"], queryFn: api.backups });
  const [busy, setBusy] = useState("");
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [permanent, setPermanent] = useState<{ collection: CollectionName; id: string; title: string } | null>(null);
  const [dashboardModules, setDashboardModules] = useState<string[] | null>(null);
  const saveSetting = (key: string, value: any) => run(() => api.saveSettings({ [key]: value }));
  useEffect(() => { setDashboardModules(null); }, [data.settings.dashboardModules]);
  const createBackup = async () => { setBusy("backup"); try { await run(() => api.createBackup("手动备份", false)); } finally { setBusy(""); } };
  const exportAll = async () => { setBusy("export"); try { const result = await run(api.exportAll); window.location.href = result.downloadUrl; } finally { setBusy(""); } };
  if (system.isLoading || backups.isLoading) return <><PageHeader icon={<ModuleArtwork module="settings" />} eyebrow="系统" title="数据与设置" description="检查本地数据和备份状态" /><Skeleton lines={8} /></>;
  if (system.error || backups.error) return <ErrorState message={((system.error || backups.error) as Error).message} onRetry={() => { void system.refetch(); void backups.refetch(); }} />;
  const status = system.data!;
  const selectedBackup = backups.data?.find((backup) => backup.id === restoreId);
  const appearance = normalizeAppearance(data.settings.appearance);
  const persistedModules = Array.isArray(data.settings.dashboardModules) ? data.settings.dashboardModules : dashboardOptions.map((option) => option.value);
  const visibleModules = dashboardModules ?? persistedModules;
  const toggleDashboardModule = (module: string, checked: boolean) => {
    const next = checked ? Array.from(new Set([...visibleModules, module])) : visibleModules.filter((value: string) => value !== module);
    setDashboardModules(next);
    void saveSetting("dashboardModules", next).catch(() => setDashboardModules(null));
  };
  return (
    <div>
      <PageHeader icon={<ModuleArtwork module="settings" />} eyebrow="本机数据控制" title="数据与设置" description="查看数据文件、创建备份、恢复历史版本并调整使用偏好。" />
      <Section title="数据文件" description="业务数据保存在浏览器之外的独立 SQLite 文件中" action={<Button variant="secondary" onClick={() => void api.openDataDirectory()}><FolderOpen size={16} />打开数据目录</Button>}>
        <div className="data-file-panel"><div className="file-icon"><Database size={27} /></div><div className="file-copy"><strong>app.sqlite</strong><code>{status.dataFile.path}</code><div><span>{formatBytes(status.dataFile.size)}</span><span>修改于 {formatDateTime(status.dataFile.modifiedAt)}</span><Badge tone={status.dataFile.writable ? "success" : "warning"}><Check size={12} />{status.dataFile.writable ? "可读写" : "只读"}</Badge></div></div></div>
      </Section>
      <div className="settings-grid">
        <Section title="备份与恢复" description="每天自动备份一次，普通自动备份保留最近30份" action={<Button loading={busy === "backup"} onClick={() => void createBackup()}><ShieldCheck size={16} />立即备份</Button>}>
          {backups.data?.length ? <div className="backup-list">{backups.data.map((backup) => <article key={backup.id}><div className="backup-type"><Archive size={18} /><Badge tone={backup.type === "safety" ? "warning" : backup.type === "automatic" ? "neutral" : "accent"}>{backup.type === "automatic" ? "自动" : backup.type === "safety" ? "安全" : "手动"}</Badge></div><div className="backup-copy"><input aria-label={`备份名称 ${formatDateTime(backup.createdAt)}`} defaultValue={backup.label} placeholder="添加备份名称" onBlur={(event) => { if (event.target.value.trim() !== backup.label) void run(() => api.updateBackup(backup.id, { label: event.target.value })); }} /><small>{formatDateTime(backup.createdAt)} · {formatBytes(backup.size)}</small></div><label className="keep-check"><input type="checkbox" checked={backup.keep} onChange={(event) => void run(() => api.updateBackup(backup.id, { keep: event.target.checked }))} />长期保留</label><Button variant="ghost" size="sm" onClick={() => setRestoreId(backup.id)}><ArrowCounterClockwise size={15} />恢复</Button></article>)}</div> : <EmptyState title="还没有备份" description="创建第一份完整备份。" />}
        </Section>
        <Section title="导出" description="生成包含 JSON 和各模块 CSV 的压缩包"><div className="export-panel"><DownloadSimple size={28} /><div><strong>完整数据导出</strong><p>适合人工查看和未来迁移，不替代完整备份。</p></div><Button variant="secondary" loading={busy === "export"} onClick={() => void exportAll()}>导出 ZIP</Button></div></Section>
      </div>
      <Section title="使用偏好" description="设置会保存在主数据文件中">
        <div className="preferences">
          <div><div><strong>界面风格</strong><small>功能和数据保持一致，只改变视觉系统</small></div><div className="appearance-toggle style-toggle" role="group" aria-label="界面风格"><button className={appearance === "liquid" ? "active" : ""} aria-label="Liquid Glass" aria-pressed={appearance === "liquid"} onClick={() => void saveSetting("appearance", "liquid")}><span><Stack size={17} /><strong>Liquid Glass</strong></span><small>环境色、透明材质与柔和层次</small></button><button className={appearance === "notebook" ? "active" : ""} aria-label="Notion 笔记" aria-pressed={appearance === "notebook"} onClick={() => void saveSetting("appearance", "notebook")}><span><Notebook size={17} /><strong>Notion 笔记</strong></span><small>紧凑画布、纯平表面与低饱和标记</small></button><button className={appearance === "neo" ? "active" : ""} aria-label="Neo-Brutalism" aria-pressed={appearance === "neo"} onClick={() => void saveSetting("appearance", "neo")}><span><SquaresFour size={17} /><strong>Neo-Brutalism</strong></span><small>多色印刷、硬边框与机械反馈</small></button></div></div>
          <div><div><strong>界面主题</strong><small>选择适合长时间使用的明暗风格</small></div><div className="theme-toggle" role="group" aria-label="界面主题"><button className={(data.settings.theme ?? "light") === "light" ? "active" : ""} aria-pressed={(data.settings.theme ?? "light") === "light"} onClick={() => void saveSetting("theme", "light")}><Sun size={16} />浅色</button><button className={data.settings.theme === "dark" ? "active" : ""} aria-pressed={data.settings.theme === "dark"} onClick={() => void saveSetting("theme", "dark")}><Moon size={16} />深色</button></div></div>
          <label><div><strong>每周起始日</strong><small>影响今日计划的本周视图</small></div><select value={data.settings.weekStart ?? "monday"} onChange={(event) => void saveSetting("weekStart", event.target.value)}><option value="monday">星期一</option><option value="sunday">星期日</option></select></label>
          <label><div><strong>日期格式</strong><small>用于列表和时间线</small></div><select value={data.settings.dateFormat ?? "zh-CN"} onChange={(event) => void saveSetting("dateFormat", event.target.value)}><option value="zh-CN">中文日期</option><option value="iso">YYYY-MM-DD</option></select></label>
          <fieldset className="dashboard-options"><legend><strong>首页模块摘要</strong><small>选择首页底部需要显示的模块</small></legend><div>{dashboardOptions.map((option) => <label key={option.value}><input type="checkbox" checked={visibleModules.includes(option.value)} onChange={(event) => toggleDashboardModule(option.value, event.target.checked)} />{option.label}</label>)}</div></fieldset>
        </div>
      </Section>
      <Section title="回收站" description="删除记录先进入这里，永久删除需要再次确认">
        {data.trash.length ? <div className="trash-list">{data.trash.map((item) => <article key={item.id}><Trash size={18} /><div><strong>{item.display_title}</strong><small>{collectionLabels[item.collection] || item.collection} · 删除于 {formatDateTime(item.deleted_at)}</small></div><Button variant="ghost" size="sm" onClick={() => void run(() => api.restore(item.collection as CollectionName, item.entity_id))}><ArrowCounterClockwise size={15} />恢复</Button><Button variant="ghost" size="sm" className="danger-text" onClick={() => setPermanent({ collection: item.collection as CollectionName, id: item.entity_id, title: item.display_title })}>永久删除</Button></article>)}</div> : <p className="quiet-line">回收站是空的。</p>}
      </Section>
      <ConfirmDialog open={Boolean(restoreId)} title="恢复这份备份？" description={selectedBackup ? `${selectedBackup.label || selectedBackup.filename} · ${formatDateTime(selectedBackup.createdAt)} · ${formatBytes(selectedBackup.size)}。恢复前会先为当前数据创建安全备份。` : "恢复前会先为当前数据创建安全备份。"} confirmLabel="创建安全备份并恢复" onClose={() => setRestoreId(null)} onConfirm={async () => { if (!restoreId) return; setBusy("restore"); try { await api.restoreBackup(restoreId); window.location.reload(); } finally { setBusy(""); } }} />
      <ConfirmDialog open={Boolean(permanent)} title="永久删除这条记录？" description={`“${permanent?.title ?? "记录"}”将无法从回收站恢复。`} confirmLabel="永久删除" danger onClose={() => setPermanent(null)} onConfirm={async () => { if (permanent) await run(() => api.permanentDelete(permanent.collection, permanent.id)); }} />
    </div>
  );
}
