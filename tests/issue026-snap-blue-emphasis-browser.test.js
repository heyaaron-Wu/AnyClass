"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const zlib = require("node:zlib");
const {chromium} = require("playwright");
const {evidenceDirectory} = require("./local-artifacts");

const app = path.resolve(__dirname, "../app");
const evidence = evidenceDirectory("issue026-snap-blue-emphasis");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/timetable/timetable.css"><link rel="stylesheet" href="/assets/timetable/product-shell.css"><style>
body{min-height:100dvh!important;margin:0!important}.underlay{position:fixed;inset:0;background:repeating-linear-gradient(90deg,#f8d24b 0 4px,#173b70 4px 8px)}.dialog-body{height:500px;min-height:500px}.welcome-dialog{position:fixed;inset:auto auto 20px 20px;display:block;width:330px}.welcome-actions{display:block}.structural-blue{border:3px solid #2563eb;padding:8px}.sample-label{position:relative;z-index:3}
</style></head><body data-shell-page="timetable"><div class="underlay"></div><div class="structural-blue">Static informational border</div><dialog class="welcome-dialog" data-breathing="true" open><div class="dialog-body welcome-dialog-body"><div class="welcome-actions"><a id="welcome" class="button primary" data-onboarding-primary href="#">Welcome CTA</a><button id="disabled" class="button primary" data-blue-emphasis disabled>Disabled</button></div></div></dialog><dialog id="courseDialog" aria-modal="true"><div class="course-dialog-scrim" data-course-dialog-scrim aria-hidden="true"></div><div class="dialog-body"><div class="sheet-grabber" data-sheet-grabber></div><div class="dialog-head"><h2>Course</h2><button id="close" class="dialog-close" data-blue-emphasis>×</button></div><div style="height:650px">Content</div></div></dialog><script src="/assets/timetable/product-shell.js"></script><script>
const d=document.querySelector('#courseDialog'),b=d.querySelector('#courseDialog .dialog-body');AnyClassMotion.enableSheetDismiss(d,{scrollContainer:b});window.openSheet=()=>AnyClassMotion.openDialog(d,{focus:document.querySelector('#close')});openSheet();
</script></body></html>`;

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  if (pathname === "/__issue026/") { response.writeHead(200,{"content-type":"text/html; charset=utf-8"}); response.end(html); return; }
  const file = path.resolve(app, "." + pathname);
  if (!file.startsWith(app + path.sep) || !fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200,{"content-type":file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html"});response.end(fs.readFileSync(file));
});

function pngRows(buffer) {
  let offset=8,width,height,depth,colorType;const data=[];
  while(offset<buffer.length){const length=buffer.readUInt32BE(offset),type=buffer.toString("ascii",offset+4,offset+8),chunk=buffer.subarray(offset+8,offset+8+length);if(type==="IHDR"){width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);depth=chunk[8];colorType=chunk[9]}if(type==="IDAT")data.push(chunk);offset+=length+12}
  assert.equal(depth,8);const channels=colorType===6?4:colorType===2?3:0;assert(channels);const raw=zlib.inflateSync(Buffer.concat(data)),stride=width*channels,rows=Buffer.alloc(stride*height);let source=0;
  for(let row=0;row<height;row++){const filter=raw[source++],target=row*stride;for(let column=0;column<stride;column++){const value=raw[source++],left=column>=channels?rows[target+column-channels]:0,up=row?rows[target+column-stride]:0,upLeft=row&&column>=channels?rows[target+column-stride-channels]:0;let decoded=value;if(filter===1)decoded+=left;else if(filter===2)decoded+=up;else if(filter===3)decoded+=Math.floor((left+up)/2);else if(filter===4){const p=left+up-upLeft,pa=Math.abs(p-left),pb=Math.abs(p-up),pc=Math.abs(p-upLeft);decoded+=pa<=pb&&pa<=pc?left:pb<=pc?up:upLeft}else assert.equal(filter,0);rows[target+column]=decoded&255}}
  return {width,height,channels,stride,rows};
}
function metrics(buffer){const image=pngRows(buffer);let sum=0,count=0,edge=0,last=null;for(let y=5;y<image.height-5;y+=3){last=null;for(let x=5;x<image.width-5;x+=2){const i=y*image.stride+x*image.channels,l=.2126*image.rows[i]+.7152*image.rows[i+1]+.0722*image.rows[i+2];sum+=l;count++;if(last!==null)edge+=Math.abs(l-last);last=l}}return{luminance:sum/count,sharpness:edge/count}}
const near=(a,b,tolerance)=>Math.abs(a-b)<=tolerance;

(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
  const browser=await chromium.launch({executablePath,headless:true,args:["--disable-background-networking"]});let assertions=0;const check=(value,message)=>{assert(value,message);assertions++};const cycles=[];
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:"light"});const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/__issue026/`);await page.waitForTimeout(500);
    const dialog=page.locator("#courseDialog"),body=dialog.locator(".dialog-body"),grabber=dialog.locator("[data-sheet-grabber]"),scrim=dialog.locator("[data-course-dialog-scrim]");
    const resting=metrics(await page.screenshot({clip:{x:0,y:20,width:390,height:180}}));
    for(let cycle=1;cycle<=20;cycle++){
      const handle=await grabber.boundingBox(),panel=await body.boundingBox(),x=handle.x+handle.width/2,y=handle.y+handle.height/2;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+panel.height*.15,{steps:4});await page.waitForTimeout(120);await page.mouse.up();
      const rendered=[];let idleSeen=false;
      for(let sample=0;sample<18;sample++){
        await page.waitForTimeout(16);
        const state=await dialog.evaluate(node=>{const visual=getComputedStyle(node.querySelector('[data-course-dialog-scrim]'));return{phase:node.dataset.sheetGestureState,strength:Number(node.style.getPropertyValue('--sheet-scrim-strength')||1),opacity:Number(visual.opacity),filter:visual.backdropFilter||visual.webkitBackdropFilter,animation:visual.animationName,ready:node.dataset.sheetScrimReady,snapping:node.dataset.sheetSnapping==="true"}});
        const image=metrics(await page.screenshot({clip:{x:0,y:20,width:390,height:180}}));rendered.push({...state,...image});if(state.phase==="IDLE"){idleSeen=true;if(rendered.filter(item=>item.phase==="IDLE").length>=2)break}
      }
      check(idleSeen,`cycle ${cycle}: snap cleanup reaches IDLE`);
      check(rendered.every(item=>item.filter.includes("blur(3px)")),`cycle ${cycle}: persistent blur kernel never detaches`);
      const idle=rendered.filter(item=>item.phase==="IDLE");check(idle.every(item=>near(item.luminance,resting.luminance,2.5)&&near(item.sharpness,resting.sharpness,2.5)),`cycle ${cycle}: cleanup frames match resting rendered pixels ${JSON.stringify({resting,idle})}`);
      const strengths=rendered.filter(item=>item.phase!=="IDLE").map(item=>item.opacity);check(strengths.every((value,index)=>index===0||value+0.035>=strengths[index-1]),`cycle ${cycle}: scrim opacity does not drop during snap-back`);
      cycles.push({cycle,frames:rendered.length,resting,rendered});
    }
    const beforeAfter=await dialog.evaluate(node=>{const s=getComputedStyle(node.querySelector('[data-course-dialog-scrim]'));return{phase:node.dataset.sheetGestureState,opacity:s.opacity,filter:s.backdropFilter||s.webkitBackdropFilter,strength:node.style.getPropertyValue('--sheet-scrim-strength')}});check(beforeAfter.phase==="IDLE"&&beforeAfter.opacity==="1"&&beforeAfter.filter.includes("blur(3px)")&&!beforeAfter.strength,"canonical resting state survives 20 cycles");

    const welcome=page.locator("#welcome"),close=page.locator("#close"),disabled=page.locator("#disabled"),structural=page.locator(".structural-blue");
    const audit=async locator=>locator.evaluate(node=>{const own=getComputedStyle(node),text=getComputedStyle(node),halo=getComputedStyle(node,"::after"),rect=node.getBoundingClientRect();return{ownTransform:own.transform,ownOpacity:own.opacity,textOpacity:text.opacity,ownAnimation:own.animationName,ownIteration:own.animationIterationCount,haloOpacity:halo.opacity,haloTransform:halo.transform,haloAnimation:halo.animationName,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},pseudoContent:halo.content}});
    const initialWelcome=await audit(welcome),initialClose=await audit(close);check(initialWelcome.ownAnimation==="anyclass-welcome-cta-attention"&&initialWelcome.ownIteration==="3"&&initialWelcome.pseudoContent==="none","Welcome uses a finite surface cue without an external frame");check(initialClose.haloAnimation==="anyclass-blue-emphasis-pulse","course close keeps the shared circular emphasis primitive");check(initialWelcome.ownTransform==="none"&&initialWelcome.ownOpacity==="1"&&initialWelcome.textOpacity==="1","Welcome control body and text remain geometrically stable");check(initialClose.ownTransform==="none"&&initialClose.ownOpacity==="1","close control and X remain static");
    const animations=await page.evaluate(()=>{const welcome=document.querySelector('#welcome').getAnimations().find(item=>item.animationName==="anyclass-welcome-cta-attention");const close=document.querySelector('#close').getAnimations({subtree:true}).find(item=>item.animationName==="anyclass-blue-emphasis-pulse");if(welcome)welcome.currentTime=950;if(close)close.currentTime=950;return{welcomeActive:Boolean(welcome),close:Boolean(close)}});check(animations.close,"course close-ring timeline remains inspectable after the finite Welcome cue has completed");await page.screenshot({path:path.join(evidence,"blue-emphasis-phases.png")});const phaseWelcome=await audit(welcome),phaseClose=await audit(close);check(near(initialWelcome.rect.width,phaseWelcome.rect.width,1.25)&&near(initialWelcome.rect.height,phaseWelcome.rect.height,1.25)&&near(initialClose.rect.width,phaseClose.rect.width,.1)&&near(initialClose.rect.height,phaseClose.rect.height,.1),`pulse does not change hit-target geometry ${JSON.stringify({initialWelcome:initialWelcome.rect,phaseWelcome:phaseWelcome.rect,initialClose:initialClose.rect,phaseClose:phaseClose.rect})}`);check(phaseClose.haloTransform!=="none"||phaseClose.haloOpacity!==initialClose.haloOpacity,"course close halo changes across pulse phases");
    check((await audit(disabled)).haloAnimation==="none","disabled emphasis control does not pulse");check((await structural.evaluate(node=>getComputedStyle(node,"::after").content))==="none","structural blue border remains static");
    await dialog.evaluate(node=>node.close());check((await audit(close)).haloAnimation==="none","closing sheet stops close-halo lifecycle");await page.evaluate(()=>openSheet());await dialog.waitFor({state:"visible"});check((await audit(close)).haloAnimation==="anyclass-blue-emphasis-pulse","reopening sheet starts one close-halo lifecycle");check(await close.evaluate(node=>node.getAnimations({subtree:true}).filter(item=>item.animationName==="anyclass-blue-emphasis-pulse").length===1),"reopen does not duplicate halo animation");
    await context.close();

    const reduced=await browser.newContext({viewport:{width:430,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce"});const reducedPage=await reduced.newPage();await reducedPage.goto(`http://127.0.0.1:${server.address().port}/__issue026/`);const reducedState=await reducedPage.locator("#welcome").evaluate(node=>{const own=getComputedStyle(node),halo=getComputedStyle(node,"::after");return{animation:own.animationName,opacity:own.opacity,content:halo.content}});check(reducedState.animation==="none"&&reducedState.opacity==="1"&&reducedState.content==="none","reduced motion preserves a static Welcome primary without an external halo");await reduced.close();
    fs.writeFileSync(path.join(evidence,"measurements.json"),JSON.stringify({result:"ISSUE026_SNAP_BLUE_EMPHASIS_PASS",assertions,cycles},null,2));console.log(JSON.stringify({result:"ISSUE026_SNAP_BLUE_EMPHASIS_PASS",assertions,cycles:cycles.length,evidence},null,2));
  }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
