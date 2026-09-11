import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
const exec = promisify(execFile);
const host = "https://moodle.nottingham.ac.uk";

// Runs inside the user's existing Moodle tab; only reads HTML, never pluginfile downloads.
export const extractCourseScript = `function extractCourse(doc, courseId) {
  const topics = Array.from(doc.querySelectorAll('li.section.main, .course-section')).filter((el, i, all) => !all.some(other => other !== el && other.contains(el))).map(section => {
    const heading = section.querySelector('.sectionname, .sectionname a, h3, h2');
    const title = (heading?.textContent || '').trim().replace(/\\s+/g, ' ');
    const resources = Array.from(section.querySelectorAll('a[href]')).flatMap(a => {
      const url = new URL(a.getAttribute('href'), 'https://moodle.nottingham.ac.uk');
      const match = url.pathname.match(/^\\/mod\\/(resource|folder|assign|quiz|page|url)\\/view\\.php$/);
      const id = url.searchParams.get('id');
      if (url.origin !== 'https://moodle.nottingham.ac.uk' || !match || !/^\\d+$/.test(id || '')) return [];
      const activity = a.closest('.activity');
      const name = (a.querySelector('.instancename')?.textContent || a.textContent || activity?.querySelector('.activityname')?.textContent || '').trim().replace(/\\s+/g, ' ');
      if (!name) return [];
      return [{ id: match[1] + ':' + id, title: name, kind: match[1], url: url.origin + url.pathname + '?id=' + id }];
    });
    return {id: section.id || section.getAttribute('data-id'), title, resources: resources.filter((r, i) => resources.findIndex(x => x.id === r.id) === i)};
  }).filter(t => t.id && t.title && t.resources.length);
  const title = (doc.querySelector('h1')?.textContent || doc.title).trim().replace(/\\s+/g, ' ');
  if (!topics.length) throw new Error('未识别到课程目录；请在 Chrome 打开该课程后重试。现有记录不会删除。');
  return {id: courseId, title, url: 'https://moodle.nottingham.ac.uk/course/view.php?id=' + courseId, topics};
}`;
function quote(value: string) { return JSON.stringify(value); }
async function apple(script: string) {
  try { return (await exec("osascript", ["-e", script], { timeout: 8000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim(); }
  catch { throw new Error("无法读取 Chrome。请允许系统自动化访问，并在 Chrome「查看 → 开发者」开启「允许 Apple 事件中的 JavaScript」。"); }
}
export async function readMoodle(courseId?: string): Promise<unknown> {
  if (process.platform !== "darwin") throw new Error("第一版 Moodle 读取需要 macOS 与 Google Chrome。");
  try { await exec("pgrep", ["-x", "Google Chrome"], { timeout: 2000 }); }
  catch { throw new Error("请先打开 Chrome，在学校 Moodle 页面登录。"); }
  const target = await apple(`tell application "Google Chrome"
repeat with w in windows
repeat with t in tabs of w
if URL of t starts with "${host}/" then return (id of w as text) & "|" & (id of t as text)
end repeat
end repeat
return "missing"
end tell`);
  if (!/^\d+\|\d+$/.test(target)) throw new Error("未找到 Moodle 标签。请在 Chrome 打开学校 Moodle 并登录。");
  const [windowId, tabId] = target.split("|");
  const key = `__learning_${randomUUID().replaceAll("-", "")}`;
  const run = (js: string) => apple(`tell application "Google Chrome" to execute tab id ${tabId} of window id ${windowId} javascript ${quote(js)}`);
  const path = courseId ? `/course/view.php?id=${courseId}` : "/my/";
  const script = `(async () => {try {
    ${extractCourseScript}
    const response = await fetch(${JSON.stringify(path)}, {cache:'no-store', signal:AbortSignal.timeout(20000)});
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (response.url.includes('/login/') || doc.querySelector('input[type=password]')) throw new Error('Moodle 登录已失效，请在 Chrome 重新登录后再次读取。');
    if (!response.ok) throw new Error('学校服务暂时不可用（' + response.status + '），请稍后重试。');
    let result;
    if (${JSON.stringify(courseId ?? null)}) result = extractCourse(doc, ${JSON.stringify(courseId ?? null)});
    else {
      const links = [...doc.querySelectorAll('a[href]'), ...document.querySelectorAll('a[href]')];
      result = links.flatMap(a => {const u = new URL(a.getAttribute('href'), '${host}'); const id=u.searchParams.get('id'); const title=a.textContent.trim().replace(/\\s+/g,' '); return u.origin==='${host}' && u.pathname==='/course/view.php' && /^\\d+$/.test(id||'') && title ? [{id,title}] : []});
      result = result.filter((c,i) => result.findIndex(x=>x.id===c.id)===i);
      if(!result.length) throw new Error('请在 Chrome 的 My Modules 页面显示课程列表，再点击读取。');
    }
    window[${quote(key)}] = {done:true,result};
  } catch(e) {window[${quote(key)}]={done:true,error:e.name==='TimeoutError' || e.name==='TypeError' ? '网络连接失败或超时；已保存的学习记录仍可使用。' : e.message};}})(); 'started'`;
  await run(script);
  try {
    for (let i = 0; i < 50; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const value = await run(`JSON.stringify(window[${quote(key)}] || {done:false})`);
      const result = JSON.parse(value) as { done: boolean; error?: string; result?: unknown };
      if (!result.done) continue;
      if (result.error) throw new Error(result.error);
      return result.result;
    }
    throw new Error("读取超时，请检查网络并重试；原有记录保持不变。");
  } finally { await run(`delete window[${quote(key)}]; 'cleared'`).catch(() => undefined); }
}
