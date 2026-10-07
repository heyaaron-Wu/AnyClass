"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const http=require("node:http");
const path=require("node:path");
const {chromium}=require("playwright");

const app=path.resolve(__dirname,"../app");
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/timetable/product-shell.css"><style>body{margin:0;min-height:2600px}.spacer{height:1180px}.tail{height:1100px}.dialog-body{min-height:360px}</style></head><body data-shell-page="timetable"><div class="spacer"></div><button id="opener" type="button">Course</button><div class="tail"></div><dialog id="courseDialog" aria-modal="true"><div class="course-dialog-scrim" data-course-dialog-scrim aria-hidden="true"></div><div class="dialog-body"><div class="sheet-grabber" data-sheet-grabber></div><div class="dialog-head"><h2>Course detail</h2><button id="close" type="button">×</button></div><p>Details</p></div></dialog><script src="/assets/timetable/product-shell.js"></script><script>const dialog=document.querySelector("#courseDialog"),body=dialog.querySelector(".dialog-body");AnyClassMotion.enableSheetDismiss(dialog,{scrollContainer:body});window.issue039={dialog,opener:document.querySelector("#opener"),close:document.querySelector("#close")};</script></body></html>`;

const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,"http://local").pathname);
  if(pathname==="/__issue039/"){response.writeHead(200,{"content-type":"text/html; charset=utf-8"});response.end(html);return}
  const file=path.resolve(app,"."+pathname);
  if(!file.startsWith(app+path.sep)||!fs.existsSync(file)){response.writeHead(404);response.end();return}
  response.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html"});
  response.end(fs.readFileSync(file));
});

(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const executablePath=[
    path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")
  ].find(fs.existsSync);
  const browser=await chromium.launch({executablePath,headless:true,args:["--disable-background-networking"]});
  let assertions=0;
  const check=(condition,label)=>{assert(condition,label);assertions++};
  try{
    for(const profile of [
      {name:"desktop",viewport:{width:1280,height:800},isMobile:false,hasTouch:false},
      {name:"mobile",viewport:{width:390,height:844},isMobile:true,hasTouch:true}
    ]){
      const context=await browser.newContext(profile);
      const page=await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/__issue039/`);
      await page.evaluate(()=>scrollTo(0,900));
      await page.waitForTimeout(50);

      for(const simulatedUaScroll of [false,true]){
        const result=await page.evaluate(async simulated=>{
          const {dialog,opener,close}=window.issue039;
          if(simulated){
            const nativeShow=dialog.showModal.bind(dialog);
            dialog.showModal=()=>{nativeShow();scrollTo(0,0)};
          }
          const before={x:scrollX,y:scrollY};
          opener.focus({preventScroll:true});
          AnyClassMotion.openDialog(dialog,{focus:close});
          const locked={
            top:document.body.style.top,
            position:document.body.style.position,
            flag:document.documentElement.dataset.sheetScrollLocked
          };
          await AnyClassMotion.closeDialog(dialog,{timeout:40});
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const after={
            x:scrollX,y:scrollY,
            bodyPosition:document.body.style.position,
            bodyTop:document.body.style.top,
            flag:document.documentElement.dataset.sheetScrollLocked||"",
            active:document.activeElement?.id||""
          };
          return{before,locked,after};
        },simulatedUaScroll);

        check(result.before.y===900,`${profile.name}/${simulatedUaScroll?"forced-UA":"native"}: pre-open scroll is 900`);
        check(result.locked.position==="fixed",`${profile.name}/${simulatedUaScroll?"forced-UA":"native"}: sheet locks background`);
        check(result.locked.top==="-900px",`${profile.name}/${simulatedUaScroll?"forced-UA":"native"}: lock uses pre-showModal scroll snapshot`);
        check(result.after.y===900,`${profile.name}/${simulatedUaScroll?"forced-UA":"native"}: close restores exact scroll position`);
        check(result.after.bodyPosition===""&&result.after.bodyTop===""&&result.after.flag==="",`${profile.name}/${simulatedUaScroll?"forced-UA":"native"}: lock styles fully cleaned`);
        check(result.after.active==="opener",`${profile.name}/${simulatedUaScroll?"forced-UA":"native"}: opener focus restored without scrolling`);
      }
      await context.close();
    }
    console.log(JSON.stringify({result:"ISSUE039_SCROLL_RESTORE_PASS",assertions},null,2));
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
