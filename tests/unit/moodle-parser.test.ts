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
