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
// This function is serialized into the existing Moodle tab; no credentials leave Chrome.
export const extractAssignmentScript = String.raw`function extractAssignment(doc) {
  const clean = el => (el?.textContent || '').trim().replace(/\s+/g, ' ');
  const rows = [...doc.querySelectorAll('.submissionstatustable tr, .feedback tr')];
  const values = new Map(rows.map(row => {
    const cells = row.querySelectorAll('th,td');
    return [clean(cells[0]).replace(/[:：]$/, '').toLowerCase(), cells[1]];
  }));
  const field = (...names) => names.map(name => values.get(name)).find(Boolean);
  const statusCell = field('submission status', '提交状态');
  const statusText = clean(statusCell);
  const status = /draft|草稿/i.test(statusText) ? 'draft' : /no (attempt|submission)|not submitted|未提交|尚未提交/i.test(statusText) ? 'not_submitted' : /submitted for grading|submitted|已提交/i.test(statusText) ? 'submitted' : 'unknown';
  const dueCell = field('due date','截止日期','截止时间') || doc.querySelector('[data-region="activity-dates"] time, .activity-dates time');
  const datetime = dueCell?.querySelector('time[datetime]')?.getAttribute('datetime');
  const dueAt = datetime && /(?:Z|[+-]\d{2}:?\d{2})$/.test(datetime) && !isNaN(Date.parse(datetime)) ? new Date(datetime).toISOString() : undefined;
  const filesCell = field('file submissions','文件提交','提交的文件') || doc.querySelector('.submissionstatustable .fileuploadsubmission');
  const files = [...(filesCell?.querySelectorAll('a[href]') || [])].filter(a => a.getAttribute('href').includes('/pluginfile.php/')).map(clean);
  const due = dueCell?.closest?.('div') && !values.has('due date') ? clean(dueCell.closest('div')) : clean(dueCell);
  return {status, statusText: statusText || '学校页面未提供可识别的提交状态', due, ...(dueAt ? {dueAt} : {}), files:[...new Set(files)], modified:clean(field('last modified','最后修改','最后修改时间')), grading:clean(field('grading status','评分状态')), grade:clean(field('grade','成绩','分数')), checkedAt:new Date().toISOString()};
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
  const path = courseId ? `/course/view.php?id=${courseId}` : "/my/courses.php";
  const script = `(async () => {try {
    ${extractCourseScript}
    ${extractAssignmentScript}
    const response = await fetch(${JSON.stringify(path)}, {cache:'no-store', signal:AbortSignal.timeout(20000)});
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (response.url.includes('/login/') || doc.querySelector('input[type=password]')) throw new Error('Moodle 登录已失效，请在 Chrome 重新登录后再次读取。');
    if (!response.ok) throw new Error('学校服务暂时不可用（' + response.status + '），请稍后重试。');
    let result;
    if (${JSON.stringify(courseId ?? null)}) {
      result = extractCourse(doc, ${JSON.stringify(courseId ?? null)});
      const resources = [...new Map(result.topics.flatMap(t => t.resources).map(r => [r.id,r])).values()].filter(r => r.kind === 'assign' || r.kind === 'folder');
      const deadline = AbortSignal.timeout(65000);
      let next = 0;
      async function worker() {
        while (next < resources.length) {
          const r = resources[next++];
          try {
            const response = await fetch(r.url, {cache:'no-store', signal:AbortSignal.any([deadline,AbortSignal.timeout(12000)])});
            const page = new DOMParser().parseFromString(await response.text(),'text/html');
            if (!response.ok || response.url.includes('/login/') || page.querySelector('input[type=password]')) throw new Error('作业详情读取失败或登录失效，请重新同步核实');
            if (r.kind === 'assign') r.coursework = extractAssignment(page);
            else {
              r.files = [...page.querySelectorAll('.foldertree a[href], .folderview a[href]')].flatMap(a => {
                const u = new URL(a.getAttribute('href'), '${host}');
                if (u.origin !== '${host}' || !u.pathname.startsWith('/pluginfile.php/')) return [];
                return [{id:'file:' + u.pathname,title:a.textContent.trim(),kind:'resource',url:u.origin + u.pathname}];
              }).filter(f => f.title);
            }
          } catch (e) { if(r.kind === 'assign') r.coursework = {status:'unknown',statusText:'待核实',due:'',files:[],modified:'',grading:'',grade:'',checkedAt:new Date().toISOString(),error:'本次未能核实作业详情，请打开学校原页面确认'}; }
        }
      }
      await Promise.all([worker(),worker(),worker()]);
      const details = new Map(resources.map(r => [r.id,r]));
      for (const t of result.topics) {
        const files = [];
        for (const r of t.resources) { const detail = details.get(r.id); if (detail?.coursework) r.coursework = detail.coursework; if(detail?.files) files.push(...detail.files); }
        t.resources.push(...files.filter((f,i) => files.findIndex(other => other.id === f.id) === i && !t.resources.some(r => r.id === f.id)));
      }
    }
    else {
      const links = [...doc.querySelectorAll('a[href]'), ...document.querySelectorAll('a[href]')];
      result = links.flatMap(a => {const u = new URL(a.getAttribute('href'), '${host}'); const id=u.searchParams.get('id'); const title=a.textContent.trim().replace(/\\s+/g,' '); return u.origin==='${host}' && u.pathname==='/course/view.php' && /^\\d+$/.test(id||'') && title ? [{id,title}] : []});
      // Use Moodle's read-only course overview API to include dynamically rendered/paginated courses.
      try {
        const sesskey = window.M?.cfg?.sesskey || [...doc.scripts].map(s => s.textContent.match(/"sesskey"\\s*:\\s*"([a-zA-Z0-9]+)"/)?.[1]).find(Boolean);
        if (sesskey) {
          let offset = 0;
          for (let page = 0; page < 100; page++) {
            const response = await fetch('/lib/ajax/service.php?sesskey=' + encodeURIComponent(sesskey), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify([{index:0,methodname:'core_course_get_enrolled_courses_by_timeline_classification',args:{classification:'all',limit:100,offset,sort:'fullname'}}]),signal:AbortSignal.timeout(12000)});
            const payload = await response.json();
            if (!response.ok || payload[0]?.error || !Array.isArray(payload[0]?.data?.courses)) break;
            const courses = payload[0].data.courses;
            result.push(...courses.filter(c => Number.isSafeInteger(c.id) && c.id > 0).map(c => ({id:String(c.id),title:new DOMParser().parseFromString(c.fullname,'text/html').body.textContent.trim()})));
            if (courses.length < 100) break;
            offset += courses.length;
          }
        }
      } catch { /* Visible links remain available when this Moodle version has no overview API. */ }
      result = result.filter((c,i) => result.findIndex(x=>x.id===c.id)===i);
      if(!result.length) throw new Error('请在 Chrome 的 My Modules 页面显示课程列表，再点击读取。');
    }
    window[${quote(key)}] = {done:true,result};
  } catch(e) {window[${quote(key)}]={done:true,error:e.name==='TimeoutError' || e.name==='TypeError' ? '网络连接失败或超时；已保存的学习记录仍可使用。' : e.message};}})(); 'started'`;
  await run(script);
  try {
    for (let i = 0; i < 180; i++) {
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
