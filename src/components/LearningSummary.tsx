import { Link } from "react-router-dom";
import { useLearning } from "../features/learningApi";
import { courseProgress, todaySuggestions, courseworkTasks } from "../features/learning";
import { Section } from "./ui";
import { localDate } from "../utils";
export function LearningSummary() {
  const { data, error } = useLearning();
  if (!data) return error ? <Section title="学习"><p>学习数据暂时不可用，请到学习模块重试。</p><Link to="/learning">打开学习模块 →</Link></Section> : null;
  const courses=data.courses.filter(c=>c.selected);
  const covered=courses.reduce((n,c)=>n+courseProgress(data,c).covered,0);
  const taught=courses.reduce((n,c)=>n+courseProgress(data,c).taught,0);
  const pending=courseworkTasks(data).filter(t=>t.resource.coursework?.status!=="submitted" || t.resource.coursework?.error || t.resource.missing).length;
  const unread=data.notices.filter(n=>!n.read).length;
  const count=todaySuggestions(data,localDate()).length;
  return <Section title="我的学习" description="只按真实学习记录更新，不自动累计进度" action={<Link to="/learning">打开学习模块 →</Link>}><p>{courses.length ? `${courses.length} 门本学期课程 · 已授课中已复习 ${covered}/${taught} 个主题 · 今日 ${count} 项可选复习建议` : "从 Moodle 导入本学期课程，开始记录章节进度。"}</p>{(pending>0 || unread>0) && <p>{pending} 项 coursework 待处理 / 核实 · {unread} 条课程新消息</p>}{data.sync.status==="error"&&<p className="quiet-line">{data.sync.message}</p>}</Section>;
}
