import { Link } from "react-router-dom";
import { useLearning } from "../features/learningApi";
import { courseProgress, courseworkTasks, courseworkComplete } from "../features/learning";
import { Section } from "./ui";
export function LearningSummary() {
  const { data, error } = useLearning();
  if (!data) return error ? <Section title="学习"><p>学习数据暂时不可用，请到学习模块重试。</p><Link to="/learning">打开学习模块 →</Link></Section> : null;
  const courses=data.courses.filter(c=>c.selected);
  const covered=courses.reduce((n,c)=>n+courseProgress(data,c).covered,0);
  const total=courses.reduce((n,c)=>n+courseProgress(data,c).total,0);
  const pending=courseworkTasks(data).filter(t=>!courseworkComplete(t.resource)).length;
  const unread=data.notices.filter(n=>!n.read).length;
  return <Section title="我的学习" description="课程进度、Coursework 与考试复习分开统计" action={<Link to="/learning">打开学习模块 →</Link>}><p>{courses.length ? `${courses.length} 门本学期课程 · 考试前已复习 ${covered}/${total} 个 Part` : "从 Moodle 导入本学期课程，开始记录章节进度。"}</p>{(pending>0 || unread>0) && <p>{pending} 项 coursework 待处理 / 核实 · {unread} 条课程新消息</p>}{data.sync.status==="error"&&<p className="quiet-line">{data.sync.message}</p>}</Section>;
}
