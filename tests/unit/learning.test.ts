import { describe, expect, it } from "vitest";
import { emptyLearning, courseProgress, todaySuggestions, topicProgress, type LearningRecord } from "../../src/features/learning";
function fixture() {
  const state=structuredClone(emptyLearning);
  state.courses=[{id:"1",title:"Example",url:"https://moodle.nottingham.ac.uk/course/view.php?id=1",selected:true,syncedAt:"2026-01-01",topics:Array.from({length:5},(_,i)=>({id:String(i),title:`Topic ${i}`,resources:[],included:true,taught:i!==4}))}];
  return state;
}
function record(patch:Partial<LearningRecord>={}):LearningRecord {return {id:"r1",courseId:"1",topicId:"0",date:"2026-01-01",action:"review",completion:"complete",understanding:"unknown",position:"",minutes:20,notes:"",createdAt:"2026-01-01",updatedAt:"2026-01-01",...patch};}
describe("learning progress and suggestions",()=>{
  it("does not count previews, partial reviews, repeated reviews twice or passage of time as coverage",()=>{
    const s=fixture();s.records=[record({action:"preview"}),record({id:"r2",completion:"partial"})];
    expect(courseProgress(s,s.courses[0])).toMatchObject({covered:0,previewed:1,taught:4});
    s.records.push(record({id:"r3"}),record({id:"r4"}));
    expect(courseProgress(s,s.courses[0]).covered).toBe(1);
    const before=JSON.stringify(s);todaySuggestions(s,"2026-06-01");expect(JSON.stringify(s)).toBe(before);
    expect(topicProgress(s,"1","0").understanding).toBe("unknown");
  });
  it("respects remaining budget and excludes unselected courses, untaught and pending topics",()=>{
    const s=fixture();s.budget=35;s.records=[record({date:"2026-01-02",minutes:20})];
    const suggestions=todaySuggestions(s,"2026-01-02");
    expect(suggestions.reduce((n,t)=>n+t.minutes,0)).toBeLessThanOrEqual(15);
    expect(suggestions.every(t=>t.topic.taught)).toBe(true);
    s.courses[0].selected=false;expect(todaySuggestions(s,"2026-01-02")).toEqual([]);
  });
  it("keeps completed work while highlighting difficulty",()=>{
    const s=fixture();s.records=[record({understanding:"difficult"})];
    expect(courseProgress(s,s.courses[0])).toMatchObject({covered:1,difficult:1});
    expect(todaySuggestions(s,"2026-01-02")[0].topic.id).toBe("0");
    expect(todaySuggestions(s,"2026-01-01").some(t=>t.topic.id==="0")).toBe(false);
  });
});
