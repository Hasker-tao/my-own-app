import { describe, expect, it } from "vitest";
import { extractCourseScript } from "../../server/moodle";
const parse = new Function("doc", "id", `${extractCourseScript};return extractCourse(doc,id);`);
describe("Moodle course HTML",()=>{
  it("extracts collapsed sections and deduplicates activity links without fetching files",()=>{
    const doc=new DOMParser().parseFromString(`<h1>Sample course</h1><li id="section-1" class="section main"><h3 class="sectionname">Semiconductors</h3><div hidden><a href="/mod/folder/view.php?id=1">Slides</a><a href="/mod/folder/view.php?id=1">Slides duplicate</a><a href="/mod/assign/view.php?id=2">Coursework</a><a href="/pluginfile.php/3/paper.pdf">PDF</a><a href="https://evil.example/mod/folder/view.php?id=4">Other site</a></div></li>`,"text/html");
    const course=parse(doc,"123");expect(course.topics).toHaveLength(1);expect(course.topics[0].resources).toHaveLength(2);expect(course.topics[0].id).toBe("section-1");expect(course.topics[0].resources[1].kind).toBe("assign");
  });
  it("rejects unexpected empty markup instead of erasing courses",()=>{expect(()=>parse(new DOMParser().parseFromString('<h1>Login</h1>',"text/html"),"1")).toThrow();});
});

import { extractAssignmentScript } from "../../server/moodle";
it("distinguishes uploaded drafts from final submission and retains unknown status", () => {
  const parse = new Function('doc', `${extractAssignmentScript}; return extractAssignment(doc);`);
  const documentFor = (status: string) => new DOMParser().parseFromString(`<div class="submissionstatustable"><table><tr><th>Submission status</th><td>${status}</td></tr><tr><th>File submissions</th><td><a href="/pluginfile.php/1/work.pdf">work.pdf</a></td></tr><tr><th>Due date</th><td><time datetime="2026-10-01T16:00:00+08:00">1 October, 4pm</time></td></tr></table></div>`, 'text/html');
  expect(parse(documentFor('Draft (not submitted)'))).toMatchObject({status:'draft',files:['work.pdf'],dueAt:'2026-10-01T08:00:00.000Z'});
  expect(parse(documentFor('Submitted for grading')).status).toBe('submitted');
  expect(parse(documentFor('No submissions have been made yet')).status).toBe('not_submitted');
  expect(parse(documentFor('')).status).toBe('unknown');
});
