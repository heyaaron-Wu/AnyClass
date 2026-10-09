"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {chromium}=require("playwright");
const root=path.resolve(__dirname,"../app");
const parser=fs.readFileSync(path.join(root,"assets/timetable/ios-shortcut-parser.js"),"utf8");
const exportParser=fs.readFileSync(path.join(root,"assets/timetable/ios-shortcut-parser-shortcut.txt"),"utf8");
const chrome=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const source="https://portal.example.invalid",app="https://anyclass.test";
const timetable=withClock=>`<!doctype html><meta charset="utf-8"><select id="xnm"><option value="2026" selected>2026-2027</option></select><select id="xqm"><option value="3" selected>第一学期</option></select><table id="kbgrid_table_0"><tbody>${[1,2].map(period=>`<tr><td id="1-${period}"><div class="timetable_con"><p class="title">课程 ${period}</p><p><span class="glyphicon-time"></span>1-2周（${period}-${period}节）${withClock?` ${period===1?"08:00–08:45":"08:55–09:40"}`:""}</p><p><span class="glyphicon-user"></span>教师</p><p><span class="glyphicon-map-marker"></span>教室</p></div></td></tr>`).join("")}</tbody></table>`;
const expected={"1":{start:"08:00",end:"08:45"},"2":{start:"08:55",end:"09:40"}};
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:chrome,args:["--disable-background-networking"]});
  const context=await browser.newContext({serviceWorkers:"block"});
  let html=timetable(false),unexpected=0,assertions=0;
  const check=(value,message)=>{assert(value,message);assertions++};
  await context.route("**/*",route=>{const u=new URL(route.request().url());if(u.origin===source)return route.fulfill({status:200,contentType:"text/html",body:html});if(u.origin!==app){unexpected++;return route.abort()}let name=u.pathname;if(name.endsWith("/"))name+="index.html";const file=path.resolve(root,"."+name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404});return route.fulfill({status:200,contentType:file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html",body:fs.readFileSync(file)})});
  try{
    const page=await context.newPage();
    for(const withClock of [false,true]){
      html=timetable(withClock);await page.goto(source+"/timetable");
      await page.addScriptTag({path:path.join(root,"assets/adapters/zhengfang-v9.js")});
      const capture=await page.evaluate(()=>({captureVersion:1,sourceOrigin:location.origin,semesterSource:{xnm:document.querySelector("#xnm").value,xqm:document.querySelector("#xqm").value},tableHtml:document.querySelector("#kbgrid_table_0").outerHTML}));
      const adapter=await page.evaluate(value=>AnyClassZhengFangV9Adapter.parse(value,{id:"public-zhengfang-v9",adapterId:"zhengfang-v9",adapterVersion:"legacy-v1",profileVersion:"test"}),capture);
      const shortcut=await page.evaluate(code=>new Promise(resolve=>{window.completion=resolve;(0,eval)(code)}),parser);
      const exported=await page.evaluate(code=>new Promise(resolve=>{window.completion=resolve;(0,eval)(code)}),exportParser);
      check(shortcut.ok===true&&exported.ok===true,"both Shortcut source and copy/paste export parse");
      const payload=JSON.parse(shortcut.jsonText),exportPayload=JSON.parse(exported.jsonText);
      check(JSON.stringify(payload)===JSON.stringify(exportPayload),"delivered UTF-8 script matches canonical parser semantics");
      check(JSON.stringify(adapter.periodTimes)===JSON.stringify(withClock?expected:{}),"Bookmark adapter must capture only explicit single-period HH:mm");
      check(JSON.stringify(payload.periodTimes||{})===JSON.stringify(withClock?expected:{}),"Shortcut must capture only explicit single-period HH:mm");
      check((payload.periodTimeProvenance||null)===(withClock?"zhengfang-v9:explicit-single-period-clock-text":null),"Shortcut provenance truthfulness");
      check(adapter.meetings.length===2&&payload.meetings.length===2,"course parsing remains intact");
      await page.evaluate(({app})=>{window.captureMessages=[];addEventListener("message",e=>{if(e.origin===app)window.captureMessages.push(e.data)});const frame=document.createElement("iframe");frame.id="receiver";frame.src=app+"/import/?method=desktop&sourceOrigin="+encodeURIComponent(location.origin);document.body.append(frame)},{app});
      await page.waitForFunction(()=>window.captureMessages.some(message=>message?.type==="READY"));
      const nonce=await page.evaluate(()=>window.captureMessages.find(message=>message.type==="READY").nonce);
      await page.evaluate(({app,capture,nonce})=>document.querySelector("#receiver").contentWindow.postMessage({protocol:"timetable-import-v1",type:"HTML_IMPORT",nonce,client:{id:"anyclass-import",version:"3.0.0"},source:{system:"zhengfang-v9",origin:location.origin},semesterSource:capture.semesterSource,tableHtml:capture.tableHtml},app),{app,capture,nonce});
      await page.waitForFunction(()=>window.captureMessages.some(message=>message?.type==="ACK"));
      check((await page.evaluate(()=>window.captureMessages.find(message=>message.type==="ACK"))).status==="PASS","Bookmark transport ACK passes");
      const receiver=page.frameLocator("#receiver");
      if(await receiver.locator("#prepareReceiverTarget").isVisible()){
        await receiver.locator("#prepareReceiverTarget").evaluate(()=>Object.defineProperty(document,"requestStorageAccess",{configurable:true,value:()=>Promise.resolve({indexedDB})}));
        await receiver.locator("#prepareReceiverTarget").click();
      }
      await receiver.locator("#filePreview:not([hidden])").waitFor();
      const bookmarkDetails=await receiver.locator("#fileTimeDetails").innerText();
      check(withClock?/教务课表页面提供/.test(bookmarkDetails):/AnyClass 默认作息补全/.test(bookmarkDetails),"Bookmark transport reaches shared source-aware preview");
      const preview=await context.newPage();await preview.goto(app+"/import/?method=file");
      await preview.evaluate(data=>AnyClassSharedJsonImport.previewText(JSON.stringify(data),"file"),payload);
      await preview.locator("#filePreview:not([hidden])").waitFor();
      const details=await preview.locator("#fileTimeDetails").innerText(),reminder=await preview.locator("#fileTimeReminder").innerText();
      check(withClock?/教务课表页面提供/.test(details):/AnyClass 默认作息补全/.test(details),"shared preview identifies the effective timing source");
      check(/对照学校课表核实/.test(reminder),"shared preview asks for school-clock verification");
      await preview.close();
    }
    html=timetable(true).replace("08:55–09:40","");await page.goto(source+"/timetable");await page.addScriptTag({path:path.join(root,"assets/adapters/zhengfang-v9.js")});
    const partialShortcut=await page.evaluate(code=>new Promise(resolve=>{window.completion=resolve;(0,eval)(code)}),parser),partialPayload=JSON.parse(partialShortcut.jsonText);
    check(partialShortcut.ok===true&&JSON.stringify(partialPayload.periodTimes||{})===JSON.stringify({"1":expected["1"]}),"partial source clocks keep only reliable periods in Shortcut");
    const partialAdapter=await page.evaluate(()=>AnyClassZhengFangV9Adapter.parse({captureVersion:1,sourceOrigin:location.origin,semesterSource:{xnm:"2026",xqm:"3"},tableHtml:document.querySelector("#kbgrid_table_0").outerHTML},{id:"public-zhengfang-v9",adapterId:"zhengfang-v9",adapterVersion:"legacy-v1",profileVersion:"test"}));
    check(JSON.stringify(partialAdapter.periodTimes||{})===JSON.stringify({"1":expected["1"]}),"partial source clocks keep only reliable periods in Bookmark adapter");
    html=timetable(true).replace("08:00–08:45","09:00–08:45");await page.goto(source+"/timetable");await page.addScriptTag({path:path.join(root,"assets/adapters/zhengfang-v9.js")});
    const invalidShortcut=await page.evaluate(code=>new Promise(resolve=>{window.completion=resolve;(0,eval)(code)}),parser);
    check(invalidShortcut.ok===false&&invalidShortcut.errorCode==="SOURCE_PERIOD_CLOCK_INVALID","invalid explicit source clock must fail visibly in Shortcut");
    const invalidAdapter=await page.evaluate(()=>{try{AnyClassZhengFangV9Adapter.parse({captureVersion:1,sourceOrigin:location.origin,semesterSource:{xnm:"2026",xqm:"3"},tableHtml:document.querySelector("#kbgrid_table_0").outerHTML},{id:"public-zhengfang-v9",adapterId:"zhengfang-v9",adapterVersion:"legacy-v1",profileVersion:"test"});return null}catch(error){return error.code}});
    check(invalidAdapter==="SOURCE_PERIOD_CLOCK_INVALID","invalid explicit source clock must fail visibly in Bookmark adapter");
    for(const malformed of ["25:00–25:30","08:00"]){
      html=timetable(true).replace("08:00–08:45",malformed);await page.goto(source+"/timetable");await page.addScriptTag({path:path.join(root,"assets/adapters/zhengfang-v9.js")});
      const malformedShortcut=await page.evaluate(code=>new Promise(resolve=>{window.completion=resolve;(0,eval)(code)}),parser);
      check(malformedShortcut.ok===false&&malformedShortcut.errorCode==="SOURCE_PERIOD_CLOCK_INVALID",`malformed source clock ${malformed} must fail visibly in Shortcut`);
      const malformedAdapter=await page.evaluate(()=>{try{AnyClassZhengFangV9Adapter.parse({captureVersion:1,sourceOrigin:location.origin,semesterSource:{xnm:"2026",xqm:"3"},tableHtml:document.querySelector("#kbgrid_table_0").outerHTML},{id:"public-zhengfang-v9",adapterId:"zhengfang-v9",adapterVersion:"legacy-v1",profileVersion:"test"});return null}catch(error){return error.code}});
      check(malformedAdapter==="SOURCE_PERIOD_CLOCK_INVALID",`malformed source clock ${malformed} must fail visibly in Bookmark adapter`);
    }
    html=timetable(true).replace("08:55–09:40","09:00–09:45").replace("（2-2节）","（1-1节）");await page.goto(source+"/timetable");await page.addScriptTag({path:path.join(root,"assets/adapters/zhengfang-v9.js")});
    const conflictShortcut=await page.evaluate(code=>new Promise(resolve=>{window.completion=resolve;(0,eval)(code)}),parser);
    check(conflictShortcut.ok===false&&conflictShortcut.errorCode==="SOURCE_PERIOD_CLOCK_CONFLICT","conflicting source clocks must fail visibly in Shortcut");
    const conflictAdapter=await page.evaluate(()=>{try{AnyClassZhengFangV9Adapter.parse({captureVersion:1,sourceOrigin:location.origin,semesterSource:{xnm:"2026",xqm:"3"},tableHtml:document.querySelector("#kbgrid_table_0").outerHTML},{id:"public-zhengfang-v9",adapterId:"zhengfang-v9",adapterVersion:"legacy-v1",profileVersion:"test"});return null}catch(error){return error.code}});
    check(conflictAdapter==="SOURCE_PERIOD_CLOCK_CONFLICT","conflicting source clocks must fail visibly in Bookmark adapter");
    check(unexpected===0,"no requests escape the two synthetic origins");
    console.log(JSON.stringify({result:"ACREQ026_CLIENT_CLOCK_CAPTURE_PASS",assertions,bookmark:"WITH_AND_WITHOUT_EXPLICIT_CLOCK",shortcut:"CANONICAL_AND_DELIVERED_WITH_AND_WITHOUT_EXPLICIT_CLOCK",networkEscape:unexpected}));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
