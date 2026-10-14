'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),renderer=require('../tools/render-shortcut-install-page.js');
let assertions=0;const check=(value,message)=>{assert(value,message);assertions++};
const checkThrows=(callback,message)=>{assert.throws(callback,undefined,message);assertions++};
const contract=JSON.parse(fs.readFileSync(path.join(root,'release/shortcut-install-contract.json'),'utf8'));
const html=fs.readFileSync(path.join(root,'app/shortcuts/install/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'app/shortcuts/install/install.css'),'utf8');
const preflight=fs.readFileSync(path.join(root,'app/assets/timetable/shortcut-update-preflight.js'),'utf8');
const preflightHtml=fs.readFileSync(path.join(root,'app/shortcuts/preflight/index.html'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'app/shortcuts/manifest.json'),'utf8'));
const nginx=fs.readFileSync(path.join(root,'deployment/shortcuts-option-a-nginx.conf'),'utf8');

check(renderer.validateContract(contract).installLandingUrl===renderer.OFFICIAL_INSTALL_LANDING_URL,'exact install URL is pinned');
check(html===renderer.render(contract),'checked-in landing page equals deterministic renderer');
check(!/<script\b/i.test(html)&&!/<meta[^>]+http-equiv=["']?refresh/i.test(html),'landing page is JavaScript-free and has no redirect');
check(!/<a\b/i.test(html),'disabled page exposes no install link');
check(/新的通用快捷指令尚未公开/.test(html),'disabled state is explicit');
check(/学校页面、课表、账号、Cookie 或令牌/.test(html),'privacy statement is visible');
check(/prefers-color-scheme:\s*dark/.test(css)&&/prefers-reduced-motion:\s*reduce/.test(css),'light dark and reduced-motion styles exist');

const synthetic={...contract,enabled:true,reviewed:true,icloudUrl:'https://www.icloud.com/shortcuts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'};
const future=renderer.render(synthetic);
check((future.match(/<a\b/g)||[]).length===1,'approved future state has one explicit link');
check(future.includes('href="https://www.icloud.com/shortcuts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'),'audited iCloud URL is emitted exactly');
check(future.includes('rel="external noopener noreferrer"'),'outbound link has defensive rel');
for(const invalid of [
  {...synthetic,icloudUrl:'https://www.icloud.com/shortcuts/bad'},
  {...synthetic,icloudUrl:'https://evil.invalid/shortcuts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},
  {...contract,enabled:true,reviewed:false,icloudUrl:null},
  {...contract,enabled:false,reviewed:false,icloudUrl:'https://www.icloud.com/shortcuts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},
  {...contract,installLandingUrl:'https://anyclass.heyaaron.asia/shortcuts/install/'},
])checkThrows(()=>renderer.validateContract(invalid),'invalid release contract is rejected');

check(manifest.shortcutId==='anyclass-timetable-import'&&manifest.latestBuild===1,'manifest identity matches unpublished Build 1');
check(manifest.enabled===false&&manifest.reviewed===false&&manifest.updateUrl===null&&manifest.publishedAt===null,'manifest remains disabled and unpublishable');
check(preflight.includes("credentials:'omit'")&&preflight.includes("referrerPolicy:'no-referrer'")&&preflight.includes("cache:'no-store'"),'preflight request is credentialless and no-referrer');
check(preflight.includes("shortcutId===SHORTCUT_ID")&&preflight.includes("/^[0-9a-f]{32}$/")&&preflight.includes("Number.isSafeInteger(build)"),'preflight validates ID nonce and integer build');
check(preflight.includes("keys.length===expected.length")&&preflight.includes("text.length>4096"),'preflight rejects extra inputs and oversized metadata');
check(!/document\.cookie|localStorage|sessionStorage|indexedDB|location\.ancestorOrigins|authorization|credentials\s*:\s*['"]include/i.test(preflight),'preflight does not inspect local user data or include credentials');
check(preflightHtml.includes('/assets/timetable/shortcut-update-preflight.js')&&!preflightHtml.includes('inline'),'preflight uses one same-origin external script');

for(const exact of ['location = /shortcuts/install','location = /shortcuts/preflight','location = /shortcuts/manifest.json'])check(nginx.includes(exact),`exact route configured: ${exact}`);
check(nginx.includes("default-src 'none'; style-src 'self'")&&nginx.includes("frame-ancestors 'none'"),'install CSP is deny-by-default');
check(nginx.includes("script-src 'self'; connect-src 'self'")&&nginx.includes('frame-ancestors *'),'preflight CSP permits only required script/connect and embedding');
check((nginx.match(/Referrer-Policy "no-referrer"/g)||[]).length===3,'all exact routes have no-referrer');
check((nginx.match(/X-Content-Type-Options "nosniff"/g)||[]).length===3,'all exact routes have nosniff');
check((nginx.match(/Strict-Transport-Security "max-age=31536000; includeSubDomains"/g)||[]).length===3,'all exact routes retain HSTS despite location-level headers');
check(!/proxy_pass|return\s+30[1278]|rewrite/i.test(nginx),'proposal has no proxy or redirect');
console.log(JSON.stringify({result:'DEC059_OPTION_A_DISTRIBUTION_FOCUSED_PASS',assertions}));
