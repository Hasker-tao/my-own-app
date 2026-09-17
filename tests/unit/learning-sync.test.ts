// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mergeCourse } from "../../server/learning";
import { courseworkTasks, courseworkComplete, emptyLearning, type Coursework, type LearningResource } from "../../src/features/learning";
const detail: Coursework = {status:'draft',statusText:'Draft (not submitted)',files:['report.pdf'],due:'Tomorrow',modified:'Today',grading:'Not graded',grade:'',checkedAt:'2026-09-11T08:00:00.000Z'};
const course = () => ({id:'123',title:'Sample',url:'https://moodle.nottingham.ac.uk/course/view.php?id=123',topics:[{id:'one',title:'Lecture 1',resources:[{id:'assign:1',title:'Report',kind:'assign',url:'https://moodle.nottingham.ac.uk/mod/assign/view.php?id=1',coursework:{...detail}}] as LearningResource[]}]});
it('treats released grade as completion and keeps manual confirmation separate',()=>{
  const resource = course().topics[0].resources[0];
  resource.coursework = {...detail,status:'unknown',statusText:'Reopened',grading:'Released',grade:'40.00 / 40.00',files:[]};
  expect(courseworkComplete(resource)).toBe(true);
  resource.coursework.grade='';expect(courseworkComplete(resource)).toBe(false);
  resource.confirmedAt='2026-09-14T00:00:00.000Z';expect(courseworkComplete(resource)).toBe(true);
});
describe('coursework and change messages',()=>{
  it('establishes an enhanced-sync baseline for a pre-upgrade course without flooding messages',()=>{
    const state=structuredClone(emptyLearning);
    const old=course();
    state.courses=[{...old,selected:true,syncedAt:'2026-09-11T00:00:00.000Z',topics:old.topics.map(t=>({...t,included:true,taught:false}))}];
    const expanded=course();expanded.topics[0].resources.push({...expanded.topics[0].resources[0],id:'resource:2',kind:'resource',title:'Existing folder file',url:'https://moodle.nottingham.ac.uk/mod/resource/view.php?id=2'});
    mergeCourse(state,expanded);
    expect(state.notices).toHaveLength(0);
    expect(state.courses[0].seenResources).toContain('resource:2');
  });
  it('baselines imports, reports new resources once and preserves unseen tasks',()=>{
    const state=structuredClone(emptyLearning);mergeCourse(state,course());expect(state.notices).toHaveLength(0);
    const changed=course();changed.topics[0].resources.push({...changed.topics[0].resources[0],id:'assign:2',title:'New report',url:'https://moodle.nottingham.ac.uk/mod/assign/view.php?id=2'});
    mergeCourse(state,changed);mergeCourse(state,changed);expect(state.notices).toHaveLength(1);
    mergeCourse(state,course());expect(courseworkTasks(state)).toHaveLength(2);expect(courseworkTasks(state)[1].resource.missing).toBe(true);
    mergeCourse(state,changed);expect(state.notices).toHaveLength(1);
  });
  it('preserves last-known status on failure and reports actual submission changes',()=>{
    const state=structuredClone(emptyLearning);mergeCourse(state,course());
    const submitted=course();submitted.topics[0].resources[0].coursework!.status='submitted';mergeCourse(state,submitted);expect(state.notices).toHaveLength(1);
    const failed=course();Object.assign(failed.topics[0].resources[0].coursework!,{status:'unknown',error:'Unavailable'});mergeCourse(state,failed);
    expect(state.courses[0].topics[0].resources[0].coursework).toMatchObject({status:'submitted',error:'Unavailable'});expect(state.notices).toHaveLength(1);
  });
});
