'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=process.env.ANYCLASS_OPTION_A_EVIDENCE_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'anyclass-option-a-'));
fs.mkdirSync(out,{recursive:true});
const install=fs.readFileSync(path.join(root,'app/shortcuts/install/index.html'));
const css=fs.readFileSync(path.join(root,'app/shortcuts/install/install.css'));
const preflightHtml=fs.readFileSync(path.join(root,'app/shortcuts/preflight/index.html'));
const preflightJs=fs.readFileSync(path.join(root,'app/assets/timetable/shortcut-update-preflight.js'));
const disabled=fs.readFileSync(path.join(root,'app/shortcuts/manifest.json'));
const icon=fs.readFileSync(path.join(root,'app/assets/brand/AnyClass_Icon.svg'));
const requests=[];
const headers={
  'Content-Security-Policy':"default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','Cache-Control':'public, max-age=300, must-revalidate'
};
const server=http.createServer((req,res)=>{
  requests.push({url:req.url,referer:req.headers.referer||null,cookie:req.headers.cookie||null});
  const send=(status,type,body,extra={})=>{res.writeHead(status,{'Content-Type':type,...extra});res.end(body)};
  if(req.url==='/shortcuts/install')return send(200,'text/html; charset=utf-8',install,headers);
  if(req.url==='/shortcuts/install/install.css')return send(200,'text/css; charset=utf-8',css,{'Cache-Control':'public, max-age=300'});
  if(req.url==='/assets/brand/AnyClass_Icon.svg')return send(200,'image/svg+xml',icon,{'Cache-Control':'public, max-age=300'});
  if(req.url==='/host')return send(200,'text/html; charset=utf-8','<!doctype html><title>Synthetic source</title><p id="marker">SECOND_READ_OK</p>',{'Referrer-Policy':'no-referrer'});
  if(req.url.startsWith('/shortcuts/preflight?'))return send(200,'text/html; charset=utf-8',preflightHtml,{'Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors *",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
  if(req.url==='/assets/timetable/shortcut-update-preflight.js')return send(200,'text/javascript; charset=utf-8',preflightJs,{'Cache-Control':'no-store'});
  if(req.url==='/shortcuts/manifest.json')return send(200,'application/json; charset=utf-8',disabled,{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  send(404,'text/plain; charset=utf-8','not found');
});
let assertions=0;const check=(value,message)=>{assert(value,message);assertions++};
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`,launchOptions={headless:true};
  if(process.env.ANYCLASS_CHROME_EXECUTABLE)launchOptions.executablePath=process.env.ANYCLASS_CHROME_EXECUTABLE;
  const browser=await chromium.launch(launchOptions);
  try{
    for(const width of [390,1280])for(const colorScheme of ['light','dark']){
      const context=await browser.newContext({viewport:{width,height:844},colorScheme,reducedMotion:'reduce'}),page=await context.newPage();
      const response=await page.goto(`${origin}/shortcuts/install`,{waitUntil:'networkidle'});
      check(response.status()===200&&response.url()===`${origin}/shortcuts/install`,'exact URL returns 200 without redirect');
      if(width===390&&colorScheme==='light'){
        const received=response.headers();
        check(received['content-security-policy']?.includes("default-src 'none'; style-src 'self'; img-src 'self'"),'landing response carries strict CSP and same-origin image policy');
        check(received['referrer-policy']==='no-referrer'&&received['x-content-type-options']==='nosniff','landing response carries privacy and MIME guards');
        check(received['x-frame-options']==='DENY'&&received['permissions-policy']?.includes('camera=()'),'landing response denies framing and device permissions');
      }
      check((await page.locator('a.primary-action').count())===1,'one explicit install link is rendered');
      check(await page.getByRole('heading',{name:'AnyClass·课程导入'}).isVisible(),'official public name is visible');
      check(await page.locator('.release-identity').getByText('1.0.0 / Build 1').isVisible(),'official version and Build are visible');
      check(await page.getByText('页面不会自动跳转，也不会自动安装或替换快捷指令。').isVisible(),'manual install boundary is visible');
      check(await page.getByRole('heading',{name:'版本更新日志'}).isVisible(),'version history is visible');
      check(await page.getByText('2026-10-14 · 初始版本').isVisible(),'verified initial release date is visible');
      check(await page.locator('.brand-row img').evaluate(node=>node.complete&&node.naturalWidth>0),'approved first-party icon loads');
      check((await page.locator('body').evaluate(el=>({sw:el.scrollWidth,cw:el.clientWidth}))).sw<=(await page.locator('body').evaluate(el=>el.clientWidth)),'no horizontal overflow');
      await page.screenshot({path:path.join(out,`install-${width}-${colorScheme}-reduced.png`),fullPage:true});
      await context.close();
    }
    const context=await browser.newContext(),page=await context.newPage();
    let outbound=0,outboundUrl=null;await page.route('https://www.icloud.com/**',route=>{outbound++;outboundUrl=route.request().url();route.abort();});
    await page.goto(`${origin}/shortcuts/install`);check(outbound===0,'install URL is not opened automatically');
    await page.locator('a.primary-action').click({noWaitAfter:true}).catch(()=>{});await page.waitForTimeout(100);check(outbound===1,'install URL opens only after explicit click');
    check(outboundUrl==='https://www.icloud.com/shortcuts/89145db4f66e409fbaa5fd3e5257b124','explicit click opens the exact audited iCloud record');
    const host=await context.newPage();
    await host.goto(`http://localhost:${server.address().port}/host`);
    let preflightResponse=null;host.on('response',response=>{if(response.url().startsWith(`${origin}/shortcuts/preflight?`))preflightResponse=response;});
    const message=host.evaluate(origin=>new Promise(resolve=>{addEventListener('message',event=>resolve(event.data),{once:true});const frame=document.createElement('iframe');frame.referrerPolicy='no-referrer';frame.src=`${origin}/shortcuts/preflight?shortcutId=anyclass-timetable-import&shortcutBuild=1&nonce=0123456789abcdef0123456789abcdef`;document.body.append(frame);setTimeout(()=>resolve({timeout:true}),2000)}),origin);
    const data=await message;check(data.status==='OK'&&data.manifest?.enabled===false,`live preflight returns disabled manifest without prompting: ${JSON.stringify(data)}`);
    check(preflightResponse?.headers()['cache-control']==='no-store'&&preflightResponse.headers()['referrer-policy']==='no-referrer','preflight response is no-store and no-referrer');
    await context.close();
    const sensitive=requests.filter(item=>item.url.startsWith('/shortcuts/preflight?'));
    check(sensitive.length===1&&sensitive[0].referer===null&&sensitive[0].cookie===null,'preflight request contains no referrer or cookie');
    const preflightUrl=new URL(sensitive[0].url,origin),queryKeys=[...preflightUrl.searchParams.keys()].sort();
    check(JSON.stringify(queryKeys)===JSON.stringify(['nonce','shortcutBuild','shortcutId']),'preflight transmits only ID build and nonce fields');
    check(!sensitive[0].url.includes('/host')&&!requests.some(item=>/credential|authorization|cookie|sourceUrl|pageUrl/i.test(item.url)),'request log contains no source page or credential fields');
    fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify({result:'DEC059_OPTION_A_BROWSER_PASS',assertions,requests},null,2));
    console.log(JSON.stringify({result:'DEC059_OPTION_A_BROWSER_PASS',assertions,evidenceDir:out}));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{server.close();console.error(error);process.exitCode=1});
