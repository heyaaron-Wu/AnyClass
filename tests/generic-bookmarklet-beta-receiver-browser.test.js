"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require("playwright");
const source="https://jw.example.edu",beta="https://beta.anyclass.heyaaron.asia",production="https://anyclass.heyaaron.asia";
const app=path.resolve(__dirname,"../app");
const bookmarklet=fs.readFileSync(path.join(__dirname,"../app/assets/timetable/bookmarklet.txt"),"utf8").trim();
assert(bookmarklet.startsWith("javascript:"));
assert.equal(bookmarklet.split(production).length,2,"expected exactly one production target to replace in isolated test copy");
const betaBookmarklet=bookmarklet.replace(production,beta);
const weeks=["1-5周","2-8周(双)","3周","1-3周,6-7周","1-9周(单)"];
const table=`<table id="kbgrid_table_0"><tbody>${Array.from({length:29},(_,i)=>`<tr><td id="${i%5+1}-${i%7+1}"><div class="timetable_con"><p class="title" data-jxb_id="synthetic-${i}">${i===0?"示例课程名称很长，需要安全地换行显示":`Course ${i%11+1}`}</p><p><span class="glyphicon-time"></span>${weeks[i%5]}（${i%7+1}-${i%7+2}节）</p><p><span class="glyphicon-user"></span>Teacher ${i%3+1}</p><p><span class="glyphicon-map-marker"></span>Building A101</p></div></td></tr>`).join("")}</tbody></table>`;
const sourceHtml=`<!doctype html><meta charset="utf-8"><select id="xnm"><option value="2026" selected>2026</option></select><select id="xqm"><option value="3" selected>1</option></select>${table}`;
(async()=>{
  const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
  const browser=await chromium.launch({headless:true,executablePath,args:["--disable-background-networking"]});
  const context=await browser.newContext({serviceWorkers:"block"});
  const requests={beta:0,production:0,other:0};const pageErrors=[];
  await context.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.origin===source){await route.fulfill({status:200,contentType:"text/html",body:sourceHtml});return;}
    if(url.origin===production){requests.production++;await route.abort();return;}
    if(url.origin===beta){requests.beta++;let name=decodeURIComponent(url.pathname);if(name.endsWith("/"))name+="index.html";const file=path.resolve(app,"."+name);if(!file.startsWith(app+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:"not found"});return;}const type=file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":file.endsWith(".json")?"application/json":file.endsWith(".txt")?"text/plain":"text/html";await route.fulfill({status:200,contentType:type,body:fs.readFileSync(file)});return;}
    requests.other++;await route.abort();
  });
  await context.addInitScript(()=>{window.__betaHandshake=[];addEventListener("message",event=>{if(event.origin==="https://beta.anyclass.heyaaron.asia"&&["READY","ACK"].includes(event.data?.type))window.__betaHandshake.push({type:event.data.type,protocol:event.data.protocol,status:event.data.status||null,noncePresent:Boolean(event.data.nonce),meetingCount:event.data.meetingCount??null,adapterId:event.data.stats?.adapterId||null});});});
  const page=await context.newPage();page.on("pageerror",e=>pageErrors.push(e.message));
  try{
    await page.goto(source+"/synthetic-personal-timetable");
    await page.evaluate(betaBookmarklet.slice("javascript:".length));
    const frame=page.frameLocator("#__ANYCLASS_IMPORT_FRAME__");
    try{await frame.locator("#filePreview:not([hidden]), #prepareReceiverTarget:not([hidden])").first().waitFor({timeout:30000});if(await frame.locator("#prepareReceiverTarget").isVisible()){await frame.locator("#prepareReceiverTarget").evaluate(()=>Object.defineProperty(document,"requestStorageAccess",{configurable:true,value:()=>Promise.resolve({indexedDB})}));await frame.locator("#prepareReceiverTarget").click()}await frame.locator("#filePreview:not([hidden])").waitFor({timeout:30000})}catch(error){const diagnostic=await page.evaluate(()=>({frame:document.querySelector("#__ANYCLASS_IMPORT_FRAME__")?.src||null,status:document.querySelector("#__ANYCLASS_IMPORT_STATUS__")?.textContent||null,handshake:window.__betaHandshake||[]}));console.error(`BOOKMARK_DIAGNOSTIC=${JSON.stringify({diagnostic,pageErrors,requests})}`);throw error}
    const meetingCount=Number(await frame.locator("#fileMeetingCount").innerText());
    const logicalCourses=Number(await frame.locator("#fileCourseCount").innerText());
    const receiverFrame=page.frames().find(x=>x.url().startsWith(beta+"/import/"));
    assert(receiverFrame,"live Beta receiver frame was not loaded");
    const contract=await receiverFrame.evaluate(()=>({normalized:typeof AnyClassNormalizedImport?.create==="function",repository:typeof AnyClassTimetableRepository?.listTimetables==="function",preview:!document.querySelector("#filePreview").hidden,legacyPreview:document.querySelector("#preview")===null}));
    const status=await page.locator("#__ANYCLASS_IMPORT_STATUS__").innerText();
    const handshake=await page.evaluate(()=>window.__betaHandshake);
    assert.equal(meetingCount,29);assert.equal(logicalCourses,12);assert.equal(contract.normalized,true);assert.equal(contract.preview,true);assert.equal(contract.legacyPreview,true);assert.match(status,/已识别 29 个课程安排/);
    assert(handshake.some(x=>x.type==="READY"&&x.protocol==="timetable-import-v1"&&x.noncePresent));
    assert(handshake.some(x=>x.type==="ACK"&&x.protocol==="timetable-import-v1"&&x.status==="PASS"&&x.meetingCount===29&&x.adapterId==="zhengfang-v9"));
    assert.equal(requests.production,0);assert.equal(requests.other,0);assert.deepEqual(pageErrors,[]);
    console.log(JSON.stringify({receiverUrl:receiverFrame.url(),interception:"in-memory replacement of only fixed production target with Beta; no production request permitted",meetingCount,logicalCourses,contract,handshake,status,requests,pageErrors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
