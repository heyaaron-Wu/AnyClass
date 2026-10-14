"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {chromium}=require("playwright");

const root=path.resolve(__dirname,"../app");
const out=path.resolve(process.env.ANYCLASS_SHORTCUT_ENTRY_EVIDENCE_DIR||fs.mkdtempSync(path.join(os.tmpdir(),"anyclass-shortcut-entry-")));
const chrome=process.env.ANYCLASS_CHROME_EXECUTABLE;
const stable="https://anyclass.heyaaron.asia",beta="https://beta.anyclass.heyaaron.asia";
const installUrl=stable+"/shortcuts/install";
const officialICloud="https://www.icloud.com/shortcuts/89145db4f66e409fbaa5fd3e5257b124";
const legacyStable="https://www.icloud.com/shortcuts/8b151aa3c24441c3b87c6f2b85fa5f37";
const betaShortcut="https://www.icloud.com/shortcuts/e5464e9969ef4749bfef3882d12134e9";
fs.mkdirSync(out,{recursive:true});
let assertions=0;
const check=(value,message)=>{assert(value,message);assertions++};
const equal=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};

const appRoute=async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="www.icloud.com")return route.abort();
  let rel=decodeURIComponent(url.pathname);
  if(rel.endsWith("/"))rel+="index.html";
  let file=path.resolve(root,"."+rel);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:"not found"});
  if(fs.statSync(file).isDirectory())file=path.join(file,"index.html");
  if(!fs.existsSync(file))return route.fulfill({status:404,body:"not found"});
  const type=file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":file.endsWith(".json")?"application/json":"text/html";
  return route.fulfill({status:200,contentType:type,body:fs.readFileSync(file)});
};

(async()=>{
  const browser=await chromium.launch({headless:true,...(chrome?{executablePath:chrome}:{})});
  try{
    const matrix=[
      {width:390,height:844,theme:"light",name:"iphone-light"},
      {width:390,height:844,theme:"dark",name:"iphone-dark"},
      {width:768,height:1024,theme:"light",name:"ipad-light"},
      {width:768,height:1024,theme:"dark",name:"ipad-dark"},
      {width:1280,height:900,theme:"light",name:"desktop-light"},
    ];
    for(const item of matrix){
      const context=await browser.newContext({viewport:{width:item.width,height:item.height},colorScheme:item.theme,reducedMotion:"reduce",serviceWorkers:"block"});
      let iCloudRequests=0,lastICloud=null;
      await context.route("**/*",async route=>{
        if(new URL(route.request().url()).hostname==="www.icloud.com"){iCloudRequests++;lastICloud=route.request().url();return route.abort();}
        return appRoute(route);
      });
      const page=await context.newPage();
      await page.goto(stable+"/import/?entryAudit=hotfix",{waitUntil:"networkidle"});
      const choice=page.getByRole("button",{name:/手机 \/ iPad 导入/});
      check(await choice.isVisible(),`${item.name}: mobile/iPad choice is visible`);
      check((await choice.innerText()).includes("通用快捷指令"),`${item.name}: chooser identifies the universal Shortcut before expansion`);
      await choice.click();
      const panel=page.locator("#mobile-import"),link=page.locator("#addImportShortcut");
      check(await panel.isVisible(),`${item.name}: mobile panel opens`);
      check(await link.isVisible(),`${item.name}: installation action is visible`);
      equal(await link.getAttribute("href"),installUrl,`${item.name}: primary action uses the first-party landing page`);
      check((await link.innerText()).includes("AnyClass·课程导入"),`${item.name}: primary action names the current universal Shortcut`);
      check((await panel.innerText()).includes("1.0.0 / Build 1"),`${item.name}: current Shortcut identity is visible`);
      check((await panel.innerText()).includes("旧版快捷指令")&&(await panel.innerText()).includes("不是本入口提供的当前版本"),`${item.name}: legacy compatibility is clearly distinguished`);
      equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false,`${item.name}: no horizontal overflow`);
      await page.screenshot({path:path.join(out,`after-${item.name}.png`),fullPage:true});
      await panel.screenshot({path:path.join(out,`after-${item.name}-panel.png`),animations:"disabled"});
      equal(iCloudRequests,0,`${item.name}: no automatic iCloud request before consent`);
      const popupPromise=context.waitForEvent("page");
      await link.click();
      const install=await popupPromise;
      await install.waitForLoadState("networkidle");
      equal(install.url(),installUrl,`${item.name}: click opens the reviewed first-party page`);
      equal((await install.locator("h1").innerText()).trim(),"AnyClass·课程导入",`${item.name}: landing page identity is correct`);
      equal(await install.locator("a.primary-action").getAttribute("href"),officialICloud,`${item.name}: landing page exposes the exact approved iCloud record`);
      equal(await install.locator("script").count(),0,`${item.name}: landing page remains JavaScript-free`);
      equal(await install.locator('meta[http-equiv="refresh" i]').count(),0,`${item.name}: landing page has no automatic redirect`);
      equal(iCloudRequests,0,`${item.name}: landing page remains idle until explicit click`);
      await install.locator("a.primary-action").click({noWaitAfter:true}).catch(()=>{});
      await install.waitForTimeout(100);
      equal(iCloudRequests,1,`${item.name}: iCloud opens only after explicit user click`);
      equal(lastICloud,officialICloud,`${item.name}: explicit click targets the approved iCloud record`);
      await context.close();
    }

    const betaContext=await browser.newContext({viewport:{width:390,height:844},colorScheme:"light",serviceWorkers:"block"});
    await betaContext.route("**/*",appRoute);
    const betaPage=await betaContext.newPage();
    await betaPage.goto(beta+"/import/?method=mobile&entryAudit=hotfix");
    equal(await betaPage.locator("#addImportShortcut").getAttribute("href"),betaShortcut,"Beta keeps its independent installation target");
    check((await betaPage.locator("#mobile-import").innerText()).includes("Beta")&&!((await betaPage.locator("#mobile-import").innerText()).includes("1.0.0 / Build 1")),"Beta copy stays distinct from the Production universal release");
    await betaContext.close();

    const stableContext=await browser.newContext({serviceWorkers:"block"});
    await stableContext.route("**/*",appRoute);
    const exportPage=await stableContext.newPage();
    await exportPage.goto(stable+"/export/?entryAudit=hotfix");
    equal(await exportPage.locator("#exportImportShortcut").getAttribute("href"),legacyStable,"export fallback preserves the supported legacy Shortcut URL");
    check((await exportPage.locator("#exportImportShortcut").innerText()).includes("旧版兼容")&&(await exportPage.locator("#exportImportShortcut").innerText()).includes("已有用户"),"export fallback cannot be mistaken for the current universal Shortcut");
    await stableContext.close();

    const importHtml=fs.readFileSync(path.join(root,"import/index.html"),"utf8");
    check(!importHtml.includes(legacyStable),"the primary mobile/iPad source contains no legacy iCloud URL");
    check(importHtml.includes(installUrl),"the static mobile/iPad fallback uses the reviewed first-party landing page");
    console.log(JSON.stringify({result:"SHORTCUT_ENTRY_INTEGRATION_PASS",assertions,evidenceDir:out,matrix:matrix.map(item=>item.name),officialInstallUrl:installUrl,officialICloudUrl:officialICloud,legacyExportCompatibilityPreserved:true},null,2));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
