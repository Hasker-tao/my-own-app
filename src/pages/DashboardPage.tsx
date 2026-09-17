import { LearningSummary } from "../components/LearningSummary";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, NotePencil, Barbell, Bug, ForkKnife } from "@phosphor-icons/react";
import { api } from "../api";
import { useWorkspace } from "../WorkspaceContext";
import { localDate, formatDate } from "../utils";
import { Button, ErrorState, PageHeader, Section, Skeleton } from "../components/ui";
import { ModuleArtwork, type ModuleArtworkName } from "../components/ModuleArtwork";

const summaryMeta: Record<string, { title: string; route: string; module: ModuleArtworkName; empty: string }> = {
  media: { title: "自媒体", route: "/media", module: "media", empty: "暂无待发布内容" },
  development: { title: "开发工作", route: "/development", module: "development", empty: "暂无高优先级问题" },
  fitness: { title: "健身计划", route: "/fitness", module: "fitness", empty: "暂无近期训练" },
  diet: { title: "饮食计划", route: "/diet", module: "diet", empty: "今天还没有餐食记录" },
  entertainment: { title: "游戏娱乐", route: "/entertainment", module: "entertainment", empty: "暂无正在进行的游戏" },
};

export function DashboardPage() {
  const date = localDate();
  const dashboard = useQuery({ queryKey: ["dashboard", date], queryFn: () => api.dashboard(date) });
  const { data, registerSaveHandler, run } = useWorkspace();
  const navigate = useNavigate();
  const activeMemo = useMemo(() => data.quickMemos.find((item) => !item.archived_at && !item.converted_id), [data.quickMemos]);
  const [memo, setMemo] = useState(activeMemo?.content ?? "");
  const [memoId, setMemoId] = useState<string | null>(activeMemo?.id ?? null);
  const [savedMemo, setSavedMemo] = useState(activeMemo?.content ?? "");
  const [memoError, setMemoError] = useState("");
  const memoInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (activeMemo && !memoId) { setMemo(activeMemo.content); setSavedMemo(activeMemo.content); setMemoId(activeMemo.id); }
  }, [activeMemo, memoId]);

  const persistMemo = useCallback(async () => {
    if (memo === savedMemo || (!memo.trim() && !memoId)) return;
    try {
      setMemoError("");
      if (memoId) await run(() => api.update("quickMemos", memoId, { content: memo }));
      else {
        const created = await run(() => api.create("quickMemos", { content: memo }));
        setMemoId(created.id);
      }
      setSavedMemo(memo);
    } catch (error) {
      setMemoError((error as Error).message);
      throw error;
    }
  }, [memo, memoId, run, savedMemo]);

  useEffect(() => {
    if (memo === savedMemo || (!memo.trim() && !memoId)) return;
    const timer = window.setTimeout(() => void persistMemo().catch(() => undefined), 700);
    return () => window.clearTimeout(timer);
  }, [memo, memoId, persistMemo, savedMemo]);

  useEffect(() => registerSaveHandler(persistMemo), [persistMemo, registerSaveHandler]);

  if (dashboard.isLoading) return <><PageHeader icon={<ModuleArtwork module="dashboard" />} eyebrow="今天" title="正在整理你的工作台" description="读取学习进度和各模块状态" /><Skeleton lines={8} /></>;
  if (dashboard.error || !dashboard.data) return <ErrorState message={(dashboard.error as Error)?.message ?? "首页数据不可用"} onRetry={() => dashboard.refetch()} />;
  const value = dashboard.data;
  return (
    <div className="dashboard-page">
      <PageHeader icon={<ModuleArtwork module="dashboard" />} eyebrow={new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date())} title={`${new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date())}，从重点开始`} description="查看当前进度，记录实际行动。" />
      <LearningSummary />
      <nav className="dashboard-command-strip glass-clear" aria-label="快速操作">
        <span>快速操作</span>
        <button onClick={() => memoInput.current?.focus()}><NotePencil size={17} />记录备忘</button>
        <button onClick={() => navigate("/development?new=work-item")}><Bug size={17} />添加工作项</button>
        <button onClick={() => navigate("/fitness?new=workout")}><Barbell size={17} />记录训练</button>
        <button onClick={() => navigate("/diet?new=meal")}><ForkKnife size={17} />记录饮食</button>
      </nav>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <Section title="快速备忘" description="停顿后自动保存" className="memo-section">
            <div className="memo-pad"><NotePencil size={19} /><textarea ref={memoInput} aria-label="快速备忘" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="记下一闪而过的想法……" />{memoError ? <small className="field-error">{memoError}</small> : null}</div>
            {memoId ? <div className="memo-actions"><Button size="sm" variant="ghost" onClick={async () => { await run(() => api.convertMemo(memoId, "mediaContents", { stage: "idea" })); setMemo(""); setSavedMemo(""); setMemoId(null); }}>转为内容灵感</Button></div> : null}
          </Section>
        </div>
        <aside className="dashboard-aside">
          <Section title="需要关注" description="到期、跟进与今日提醒">
            {value.attention.some(item => !["consulting", "today"].includes(item.module)) ? <div className="attention-list">{value.attention.filter(item => !["consulting", "today"].includes(item.module)).map((item) => <button key={`${item.attention_type}-${item.id}`} onClick={() => navigate(`/${item.module}`)}><span className="attention-mark" /><div><strong>{item.display_title || item.title || item.name || item.content}</strong><small>{item.due_date ? `截止 ${formatDate(item.due_date)}` : item.followup_at ? `跟进 ${formatDate(item.followup_at)}` : "需要处理"}</small></div><ArrowRight size={16} /></button>)}</div> : <p className="quiet-line">目前没有紧急事项。</p>}
          </Section>
        </aside>
      </div>
      <Section title="各模块摘要" description="只展示近期真正需要留意的内容">
        <div className="summary-grid">{Object.entries(summaryMeta).filter(([key]) => !Array.isArray(data.settings.dashboardModules) || data.settings.dashboardModules.includes(key)).map(([key, meta]) => {
          const items = value.summaries[key] ?? [];
          return <button className="summary-tile" data-module={key} key={key} onClick={() => navigate(meta.route)}><div className="summary-top"><ModuleArtwork module={meta.module} loading="lazy" /><span>{meta.title}</span><ArrowRight size={16} /></div>{items.length ? <><strong>{items[0].title || items[0].name || items[0].content}</strong><small>{items.length > 1 ? `另外还有 ${items.length - 1} 项` : "查看详情"}</small></> : <small>{meta.empty}</small>}</button>;
        })}</div>
      </Section>
    </div>
  );
}
