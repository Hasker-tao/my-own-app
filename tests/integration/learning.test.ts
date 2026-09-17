// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { buildApp } from "../../server/app.js";
import { readMoodle } from "../../server/moodle.js";
import { makeTestDirectory, removeTestDirectory } from "../helpers.js";
import type { FastifyInstance } from "fastify";
vi.mock("../../server/moodle.js",()=>({readMoodle:vi.fn()}));
let app:FastifyInstance;let dir:string;
const incoming=()=>({id:"123",title:"Test course",url:"https://moodle.nottingham.ac.uk/course/view.php?id=123",topics:[{id:"section-1",title:"Topic one",resources:[{id:"resource:1",title:"Slides",kind:"resource",url:"https://moodle.nottingham.ac.uk/mod/resource/view.php?id=1"}]}]});
beforeEach(async()=>{dir=makeTestDirectory("learning");app=await buildApp({dataDir:dir,autoBackup:false});vi.mocked(readMoodle).mockResolvedValue(incoming());});
afterEach(async()=>{await app.close();removeTestDirectory(dir);vi.clearAllMocks();});
const call=(method:"GET"|"POST"|"PUT"|"PATCH",url:string,payload?:object)=>app.inject({method,url:`/api/learning${url}`,payload});
async function seed(){expect((await call("POST","/moodle",{courseId:"123"})).statusCode).toBe(200);await call("PATCH","/courses/123/topics/section-1",{taught:true});}
const record=()=>({id:randomUUID(),courseId:"123",topicId:"section-1",date:"2026-01-01",action:"review",completion:"complete",understanding:"unknown",position:"",minutes:20,notes:""});
describe("learning persistence and import",()=>{
  it("saves and reverses manual coursework confirmation across sync",async()=>{
    const assigned=incoming();assigned.topics[0].resources.push({id:"assign:2",title:"Work",kind:"assign",url:"https://moodle.nottingham.ac.uk/mod/assign/view.php?id=2"});
    vi.mocked(readMoodle).mockResolvedValue(assigned);
    await call("POST","/moodle",{courseId:"123"});
    expect((await call("PATCH","/courses/123/coursework/2",{confirmed:true})).statusCode).toBe(200);
    await call("POST","/moodle",{courseId:"123"});
    let resource=(await call("GET","")).json().data.courses[0].topics[0].resources[1];expect(resource.confirmedAt).toBeTruthy();
    expect((await call("PATCH","/courses/123/coursework/2",{confirmed:false})).statusCode).toBe(200);
    resource=(await call("GET","")).json().data.courses[0].topics[0].resources[1];expect(resource.confirmedAt).toBeUndefined();
  });
  it("preserves corrections and records on resync and holds new topics pending",async()=>{
    await seed();expect((await call("PATCH","/courses/123",{studiedThroughTopicId:"section-1"})).statusCode).toBe(200);expect((await call("PATCH","/courses/123/topics/section-1",{important:true})).statusCode).toBe(200);
    expect((await call("PATCH","/courses/123",{studiedThroughTopicId:"missing"})).statusCode).toBe(400);
    const r=record();expect((await call("PUT","/records",r)).statusCode).toBe(200);await call("PUT","/records",r);
    const update=incoming();update.topics.push({id:"section-2",title:"New topic",resources:[]});vi.mocked(readMoodle).mockResolvedValue(update);
    await call("POST","/moodle",{courseId:"123"});
    const s=(await call("GET","")).json().data;expect(s.records).toHaveLength(1);expect(s.courses[0].topics[0].important).toBe(true);expect(s.courses[0].topics[1].included).toBe(false);expect(s.courses[0].studiedThroughTopicId).toBe("section-1");
    await app.close();app=await buildApp({dataDir:dir,autoBackup:false});expect((await call("GET","")).json().data.courses[0].studiedThroughTopicId).toBe("section-1");
  });
  it("syncs every selected course, keeps partial successes and marks messages read",async()=>{
    await seed();
    const second={...incoming(),id:"456",title:"Second course",url:"https://moodle.nottingham.ac.uk/course/view.php?id=456"};
    vi.mocked(readMoodle).mockResolvedValueOnce(second);
    expect((await call("POST","/moodle",{courseId:"456"})).statusCode).toBe(200);
    const updated=incoming();
    updated.topics[0].resources.push({id:"resource:2",title:"New slides",kind:"resource",url:"https://moodle.nottingham.ac.uk/mod/resource/view.php?id=2"});
    vi.mocked(readMoodle).mockImplementation(async id => id === "123" ? updated : Promise.reject(new Error("offline")));
    expect((await call("POST","/sync",{})).statusCode).toBe(400);
    const state=(await call("GET","")).json().data;
    expect(state.courses).toHaveLength(2);
    expect(state.sync.status).toBe("error");
    expect(state.notices).toHaveLength(1);
    expect((await call("PUT","/notices/read",{ids:[state.notices[0].id]})).json().data.notices[0].read).toBe(true);
  });
  it("does not replace saved data when session expires or import is invalid",async()=>{
    await seed();vi.mocked(readMoodle).mockRejectedValue(new Error("登录已失效"));expect((await call("POST","/moodle",{courseId:"123"})).statusCode).toBe(400);
    let s=(await call("GET","")).json().data;expect(s.courses).toHaveLength(1);expect(s.sync.status).toBe("error");expect(s.sync.successAt).toBeTruthy();
    vi.mocked(readMoodle).mockResolvedValue({...incoming(),topics:[]});expect((await call("POST","/moodle",{courseId:"123"})).statusCode).toBe(400);
    s=(await call("GET","")).json().data;expect(s.courses[0].topics).toHaveLength(1);
  });
  it("allows exam review records without a taught checkbox and rejects invalid inputs",async()=>{
    await call("POST","/moodle",{courseId:"123"});expect((await call("PUT","/records",record())).statusCode).toBe(200);
    expect((await call("PUT","/records",{...record(),action:"preview"})).statusCode).toBe(200);
    await call("PATCH","/courses/123/topics/section-1",{taught:true});
    for(const patch of [{date:"2026-02-30"},{date:"2099-01-01"},{minutes:-1}])expect((await call("PUT","/records",{...record(),...patch})).statusCode).toBe(400);
    expect((await app.inject({method:"POST",url:"/api/learning/moodle",headers:{origin:"https://evil.example"},payload:{}})).statusCode).toBe(403);
  });
  it("includes learning in export and restores complete SQLite backups",async()=>{
    await seed();await call("PUT","/records",record());
    const backup=(await app.inject({method:"POST",url:"/api/backups",payload:{label:"learning"}})).json().data;
    await call("PUT","/budget",{budget:90});
    expect((await app.inject({method:"POST",url:`/api/backups/${backup.id}/restore`})).statusCode).toBe(200);
    expect((await call("GET","")).json().data.budget).toBe(60);
    const result=(await app.inject({method:"POST",url:"/api/export"})).json().data;
    const zip=await JSZip.loadAsync(fs.readFileSync(path.join(dir,"exports",result.filename)));
    expect(JSON.parse(await zip.file("all-data.json")!.async("string")).learning.records).toHaveLength(1);
  });
});
