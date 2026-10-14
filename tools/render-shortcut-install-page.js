'use strict';
const fs=require('node:fs'),path=require('node:path');

const OFFICIAL_INSTALL_LANDING_URL='https://anyclass.heyaaron.asia/shortcuts/install';
const ICLOUD_URL=/^https:\/\/www\.icloud\.com\/shortcuts\/[0-9a-f]{32}$/;
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function validateContract(value){
  const keys=['enabled','icloudUrl','installLandingUrl','javascriptFree','noRedirect','published','reviewed','schemaVersion','shortcutBuild','shortcutId','shortcutVersion'];
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||JSON.stringify(Object.keys(value).sort())!==JSON.stringify(keys))throw Error('CONTRACT_KEYS_INVALID');
  if(value.schemaVersion!==1||value.shortcutId!=='anyclass-timetable-import'||value.shortcutVersion!=='1.0.0'||value.shortcutBuild!==1)throw Error('SHORTCUT_IDENTITY_INVALID');
  if(value.installLandingUrl!==OFFICIAL_INSTALL_LANDING_URL||value.noRedirect!==true||value.javascriptFree!==true||value.published!==false)throw Error('LANDING_CONTRACT_INVALID');
  if(typeof value.enabled!=='boolean'||typeof value.reviewed!=='boolean')throw Error('RELEASE_STATE_INVALID');
  if(value.enabled||value.reviewed){
    if(value.enabled!==true||value.reviewed!==true||typeof value.icloudUrl!=='string'||!ICLOUD_URL.test(value.icloudUrl))throw Error('INSTALL_RELEASE_NOT_APPROVED');
  }else if(value.icloudUrl!==null)throw Error('DISABLED_RELEASE_MUST_NOT_LINK');
  return Object.freeze({...value});
}

function render(contract){
  const value=validateContract(contract),install=value.enabled&&value.reviewed;
  const action=install
    ? `<a class="primary-action" href="${escapeHtml(value.icloudUrl)}" rel="external noopener noreferrer">在 iCloud 中查看快捷指令</a>`
    : '<p class="release-pending" role="status">新的通用快捷指令尚未公开。请稍后再试。</p>';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="referrer" content="no-referrer">
  <meta name="anyclass-release" content="v0.2.2">
  <link rel="canonical" href="${OFFICIAL_INSTALL_LANDING_URL}">
  <link rel="stylesheet" href="/shortcuts/install/install.css">
  <title>安装 AnyClass 通用快捷指令</title>
</head>
<body>
  <main class="install-shell">
    <section class="install-card" aria-labelledby="install-title">
      <p class="eyebrow">AnyClass · 有课吗</p>
      <h1 id="install-title">通用 iOS 快捷指令</h1>
      <p class="summary">此页面只提供经过独立审核的官方安装入口。安装或更新必须由你主动确认。</p>
      ${action}
      <p class="privacy-note">本页面不会读取或上传学校页面、课表、账号、Cookie 或令牌。</p>
    </section>
  </main>
</body>
</html>
`;
}

if(require.main===module){
  const root=path.resolve(__dirname,'..'),contract=JSON.parse(fs.readFileSync(path.join(root,'release/shortcut-install-contract.json'),'utf8'));
  const target=path.join(root,'app/shortcuts/install/index.html');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,render(contract),'utf8');
  process.stdout.write(`${target}\n`);
}
module.exports=Object.freeze({OFFICIAL_INSTALL_LANDING_URL,validateContract,render});
