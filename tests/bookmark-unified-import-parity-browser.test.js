"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {chromium} = require("playwright");
const root = path.resolve(__dirname,"../app");
const origin = "https://portal.example.invalid", receiver = process.env.ANYCLASS_BROWSER_BASE?.replace(/\/$/,"") || "https://anyclass.heyaaron.asia";
const executablePath = [path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const rows = Array.from({length:29},(_,i)=>({title:i===0?"示例课程名称很长，需要安全地换行显示":`Course ${(i-1)%10+1}`,weekday:i%5+1,period:i%7+1,weeks:["1-5周","2-8周(双)","3周","1-3周,6-7周","1-9周(单)"][i%5],teacher:`Teacher ${i%3+1}`,location:i===0?"示例教学楼东区长名称 A101":"Building A101"}));
const teaching = `<!doctype html><meta charset="utf-8"><select id="xnm"><option value="2026" selected>2026</option></select><select id="xqm"><option value="3" selected>1</option></select><table id="kbgrid_table_0"><tbody>${rows.map((m,i)=>`<tr><td id="${m.weekday}-${m.period}"><div class="timetable_con"><p class="title" data-jxb_id="synthetic-${i}">${m.title}</p><p><span class="glyphicon-time"></span>${m.weeks}（${m.period}-${m.period+1}节）</p><p><span class="glyphicon-user"></span>${m.teacher}</p><p><span class="glyphicon-map-marker"></span>${m.location}</p></div></td></tr>`).join("")}</tbody></table>`;

(async()=>{
  const browser=await chromium.launch({executablePath,headless:true,args:["--disable-background-networking"]});
  const context=await browser.newContext({serviceWorkers:"block"});
  let escapes=0;
  await context.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin)return route.fulfill({status:200,contentType:"text/html",body:teaching});
    if(url.origin!==receiver){escapes++;return route.abort()}
    if(process.env.ANYCLASS_BROWSER_BASE)return route.continue();
    let name=decodeURIComponent(url.pathname);if(name.endsWith("/"))name+="index.html";
    const file=path.resolve(root,"."+name);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:"not found"});
    return route.fulfill({status:200,contentType:file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html",body:fs.readFileSync(file)});
  });
  const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
  try{
    await page.goto(origin+"/timetable");
    await page.evaluate(({r,source})=>{window.messages=[];addEventListener("message",e=>{if(e.origin===r)window.messages.push(e.data)});const f=document.createElement("iframe");f.id="receiver";f.src=r+"/import/?method=desktop&sourceOrigin="+encodeURIComponent(source);document.body.append(f)},{r:receiver,source:origin});
    try{await page.waitForFunction(()=>window.messages.some(x=>x?.type==="READY"),{timeout:10000})}catch(error){console.error(JSON.stringify({errors,frameText:await page.frameLocator("#receiver").locator("body").innerText().catch(()=>"")}));throw error}
    const nonce=await page.evaluate(()=>window.messages.find(x=>x?.type==="READY").nonce);
    const payload=await page.evaluate(n=>({protocol:"timetable-import-v1",type:"HTML_IMPORT",nonce:n,client:{id:"anyclass-import",version:"3.0.0"},source:{system:"zhengfang-v9",origin:location.origin},semesterSource:{xnm:"2026",xqm:"3"},tableHtml:document.querySelector("#kbgrid_table_0").outerHTML}),nonce);
    const frame=page.frameLocator("#receiver");
    await page.evaluate(({p,target})=>document.querySelector("#receiver").contentWindow.postMessage(p,target),{p:payload,target:receiver});
    try{await page.waitForFunction(()=>window.messages.some(x=>x?.type==="ACK"&&x.status==="PASS"),null,{timeout:10000})}catch(error){const debug=await page.frames().find(f=>f.url().startsWith(receiver+"/import/")).evaluate(p=>{try{const d=new DOMParser().parseFromString(p.tableHtml,"text/html"),b=d.querySelector(".timetable_con"),profile=AnyClassSchoolProfileRegistry.matchOrigin(p.source.origin,p.source.system)[0],adapter=AnyClassAdapterRegistry.get(profile.adapterId),capture={captureVersion:1,sourceOrigin:p.source.origin,semesterSource:p.semesterSource,tableHtml:p.tableHtml},parsed=adapter.parse(capture,profile),s=adapter.extractSemester(capture,profile);return{meetings:parsed.meetings.length,semester:s,first:b?.innerHTML}}catch(e){const d=new DOMParser().parseFromString(p.tableHtml,"text/html"),b=d.querySelector(".timetable_con");return{error:e.message,stack:e.stack,first:b?.innerHTML,text:b?.textContent}}},payload);console.error(JSON.stringify({errors,messages:await page.evaluate(()=>window.messages),receiverMessage:await frame.locator("#message").innerText().catch(()=>""),debug}));throw error}
    await frame.locator("#filePreview:not([hidden]), #prepareReceiverTarget:not([hidden])").first().waitFor();
    if(await frame.locator("#prepareReceiverTarget").isVisible()){
      await frame.locator("#prepareReceiverTarget").evaluate(()=>Object.defineProperty(document,"requestStorageAccess",{configurable:true,value:()=>Promise.resolve({indexedDB})}));
      await frame.locator("#prepareReceiverTarget").click();
    }
    await frame.locator("#filePreview:not([hidden])").waitFor();
    assert.equal(await frame.locator("#preview").count(),0,"legacy Bookmark preview must be removed");
    assert.equal(await frame.locator("#save").count(),0,"legacy Bookmark save handler must be removed");
    assert.match(await frame.locator("#fileImportTarget").innerText(),/将创建新课表|将导入到/);
    assert.equal(await frame.locator("#fileMeetingCount").innerText(),"29");
    assert.equal(await frame.locator("#fileCourseCount").innerText(),"11");
    assert.equal(await frame.locator("#fileSchoolName").inputValue(),"");
    assert.equal(await frame.locator("#fileSchool").innerText(),"待确认");
    assert(await frame.locator("#computer-import").isHidden(),"completed Bookmark receiver card must collapse after shared preview opens");
    assert.match(await frame.locator("#fileSubmitBlockers").innerText(),/学校名称/);
    assert.equal(await frame.locator("#fileSemesterStart").inputValue(),"");
    assert.match(await frame.locator("#fileSubmitBlockers").innerText(),/学期第一周的星期一/);
    assert(await frame.locator("#fileSave").isDisabled());
    assert.equal(await frame.locator("#fileRows tr").count(),29);
    assert.equal(escapes,0);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:"PASS",preview:"SHARED",legacyRenderer:false,legacySave:false,meetings:29,logicalCourses:11,schoolIdentity:"CONFIRMATION_REQUIRED",receiverCard:"COLLAPSED_AFTER_PREVIEW",startDateRequired:true,saveEligibility:"SHARED_DISABLED_WITH_EXPLICIT_BLOCKER",networkEscape:escapes},null,2));
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
