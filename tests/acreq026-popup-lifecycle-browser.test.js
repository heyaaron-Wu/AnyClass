"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{chromium}=require("playwright");
const channels=require("../app/assets/timetable/import-client-channels"),source="https://portal.example.invalid",beta=channels.CHANNELS.beta.pageOrigin;
const script=channels.buildBookmarklet(fs.readFileSync(path.join(__dirname,"../app/assets/timetable/bookmarklet.txt"),"utf8"),"beta").slice(11);
const pageHtml='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;height:3000px}button{margin-top:920px}</style><button id="opener">导入</button><select id="xnm"><option value="2026">2026</option></select><select id="xqm"><option value="3">1</option></select><table id="kbgrid_table_0"><td id="1-1"><div class="timetable_con">Synthetic</div></td></table>';
// The mocked Receiver isolates shell lifecycle/security from the full shared
// preview/persistence test; it makes no storage writes or external requests.
const receiverHtml='<!doctype html><script>const n="0123456789abcdef0123456789abcdef";window.send=(type,extra={})=>parent.postMessage({protocol:"timetable-import-v1",nonce:n,type,...extra},"'+source+'");send("READY");addEventListener("message",e=>{if(e.origin==="'+source+'"&&e.data.type==="HTML_IMPORT")send("ACK",{status:"PASS",meetingCount:1})})</script><button id="inside">Inside</button>';
(async()=>{
 const exe=[path.join(process.env.LOCALAPPDATA||"","Google/Chrome/Application/chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft/Edge/Application/msedge.exe")].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,executablePath:exe,args:["--disable-background-networking"]});let assertions=0;
 const check=(value,label)=>{assert(value,label);assertions++};
 try{
  const context=await browser.newContext({viewport:{width:430,height:844},hasTouch:true,serviceWorkers:"block"});let mode="ready",foreign=0;
  await context.route("**/*",route=>{const origin=new URL(route.request().url()).origin;if(origin===source)return route.fulfill({contentType:"text/html",body:pageHtml});if(origin===beta)return route.fulfill({contentType:"text/html",body:mode==="timeout"?"<!doctype html>Loading":receiverHtml});foreign++;return route.abort()});
  const page=await context.newPage();await page.goto(source);await page.locator("#opener").focus();await page.evaluate(()=>scrollTo({top:900,behavior:"instant"}));
  const open=()=>page.evaluate(script);const popup=page.locator("#__ANYCLASS_IMPORT_POPUP__"),status=page.locator("#__ANYCLASS_IMPORT_STATUS__"),frame=()=>page.frames().find(f=>f.url().startsWith(beta));
  let accept=false;page.on("dialog",d=>accept?d.accept():d.dismiss());
  await open();await status.filter({hasText:"已识别"}).waitFor();check(await popup.count()===1,"one popup after capture");check(await page.evaluate(()=>scrollY===900),"opening does not move source page");
  await page.locator("[data-anyclass-popup-close]").tap();check(await popup.count()===1,"unsaved dismissal refusal preserves preview");
  await open();check(await popup.count()===1,"repeated activation refusal preserves existing popup");
  await frame().evaluate(()=>send("IMPORT_SAVED",{nonce:"incorrect"}));check(await status.innerText().then(t=>!t.includes("通过本机读取校验")),"wrong nonce cannot claim save");
  await page.evaluate(()=>postMessage({protocol:"timetable-import-v1",nonce:"0123456789abcdef0123456789abcdef",type:"IMPORT_SAVED"},location.origin));check(await status.innerText().then(t=>!t.includes("通过本机读取校验")),"wrong sender cannot claim save");
  await frame().evaluate(()=>send("PREVIEW_STATE",{dirty:true,busy:true}));await page.waitForTimeout(30);accept=true;await page.locator("[data-anyclass-popup-close]").click();check(await popup.count()===1,"save in progress cannot discard window");
  await frame().evaluate(()=>send("IMPORT_SAVED"));await status.filter({hasText:"通过本机读取校验"}).waitFor();check(await popup.count()===1,"save completion keeps readable success until close");await page.locator("[data-anyclass-popup-close]").click();
  check(await popup.count()===0,"close removes popup after save");check(await page.evaluate(()=>scrollY===900&&document.activeElement.id==="opener"),"close restores source focus and exact scroll");
  await open();await status.filter({hasText:"已识别"}).waitFor();await frame().evaluate(()=>send("IMPORT_CANCELLED"));await popup.waitFor({state:"detached"});check(await page.evaluate(()=>document.activeElement.id==="opener"&&scrollY===900),"explicit cancel returns focus and position");
  await open();await status.filter({hasText:"已识别"}).waitFor();await frame().evaluate(()=>send("CLOSE_REQUEST"));await popup.waitFor({state:"detached"});check(true,"embedded Escape close request dismisses with confirmation");
  await open();await status.filter({hasText:"已识别"}).waitFor();await page.locator("[data-anyclass-popup-close]").focus();await page.keyboard.press("Escape");await popup.waitFor({state:"detached"});check(true,"outer Escape dismisses");
  mode="timeout";await page.evaluate(()=>{const native=window.setTimeout;window.setTimeout=(fn,ms,...args)=>native(fn,ms===15000?120:ms,...args)});await open();check(await popup.getAttribute("data-state")==="loading","initial loading state");await status.filter({hasText:"未能完成初始化"}).waitFor();check(await page.locator("[data-anyclass-popup-retry]").isVisible(),"timeout exposes retry");mode="ready";await page.locator("[data-anyclass-popup-retry]").click();await status.filter({hasText:"已识别"}).waitFor();check(await popup.count()===1,"retry succeeds without duplicate overlay");
  await frame().evaluate(()=>send("ACK",{status:"FAIL",meetingCount:0}));await status.filter({hasText:"校验失败"}).waitFor();check(await page.locator("[data-anyclass-popup-retry]").isVisible(),"transport rejection exposes retry");await open();await status.filter({hasText:"已识别"}).waitFor();check(await page.locator("#__ANYCLASS_IMPORT_FRAME__").count()===1,"repeat after failure replaces old iframe");
  await frame().evaluate(()=>send("RECEIVER_ERROR"));await status.filter({hasText:"本机存储访问"}).waitFor();check(true,"Receiver storage failure remains actionable");await page.locator("[data-anyclass-popup-close]").click();await popup.waitFor({state:"detached"});
  mode="timeout";await open();await open();check(await popup.count()===1,"repeat during loading leaves one instance");await page.locator("[data-anyclass-popup-close]").click();check(await page.evaluate(()=>!window.__ANYCLASS_IMPORT_CLEANUP__&&!document.querySelector("#__ANYCLASS_IMPORT_FRAME__")&&!document.querySelector("#__ANYCLASS_IMPORT_STATUS__")),"dismiss removes all shell DOM and registered cleanup");check(foreign===0,"no Production or foreign requests");
  await context.close();console.log(JSON.stringify({result:"ACREQ026_POPUP_LIFECYCLE_PASS",assertions,synthetic:true}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
