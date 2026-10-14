'use strict';
const fs=require('node:fs'),path=require('node:path');

const OFFICIAL_INSTALL_LANDING_URL='https://anyclass.heyaaron.asia/shortcuts/install';
const OFFICIAL_ICLOUD_URL='https://www.icloud.com/shortcuts/89145db4f66e409fbaa5fd3e5257b124';
const ICLOUD_RECORD_ID='89145DB4-F66E-409F-BAA5-FD3E5257B124';
const APPROVED_SIGNED_ARTIFACT_SHA256='6b635a6eef4afe8f53188c25849657bf778a44585ee5027c8e855e33f47c9cd2';
const SHARED_PAYLOAD_SHA256='d241139d2631515a203955710caa7c53e55381393e49f43f42b4ec41de81eb85';
const escapeHtml=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function validateContract(value){
  const keys=['approvedSignedArtifactSha256','enabled','icloudRecordId','icloudUrl','installLandingUrl','javascriptFree','noRedirect','published','reviewed','schemaVersion','semanticGraphDifferences','sharedActionCount','sharedPayloadSha256','sharedSigningStatus','shortcutBuild','shortcutId','shortcutName','shortcutVersion'];
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||JSON.stringify(Object.keys(value).sort())!==JSON.stringify(keys))throw Error('CONTRACT_KEYS_INVALID');
  if(value.schemaVersion!==1||value.shortcutId!=='anyclass-timetable-import'||value.shortcutName!=='AnyClass·课程导入'||value.shortcutVersion!=='1.0.0'||value.shortcutBuild!==1)throw Error('SHORTCUT_IDENTITY_INVALID');
  if(value.installLandingUrl!==OFFICIAL_INSTALL_LANDING_URL||value.noRedirect!==true||value.javascriptFree!==true||value.published!==false)throw Error('LANDING_CONTRACT_INVALID');
  if(value.enabled!==true||value.reviewed!==true||value.icloudUrl!==OFFICIAL_ICLOUD_URL)throw Error('INSTALL_RELEASE_NOT_APPROVED');
  if(value.icloudRecordId!==ICLOUD_RECORD_ID||value.approvedSignedArtifactSha256!==APPROVED_SIGNED_ARTIFACT_SHA256||value.sharedPayloadSha256!==SHARED_PAYLOAD_SHA256)throw Error('REVIEWED_PROVENANCE_INVALID');
  if(value.sharedSigningStatus!=='APPROVED'||value.sharedActionCount!==43||value.semanticGraphDifferences!==0)throw Error('SHARED_PAYLOAD_AUDIT_INVALID');
  return Object.freeze({...value});
}

function render(contract){
  const value=validateContract(contract);
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
  <title>安装 ${escapeHtml(value.shortcutName)}</title>
</head>
<body>
  <main class="install-shell">
    <section class="install-card" aria-labelledby="install-title">
      <p class="eyebrow">AnyClass · 有课吗</p>
      <h1 id="install-title">${escapeHtml(value.shortcutName)}</h1>
      <p class="release-identity">版本 ${escapeHtml(value.shortcutVersion)} · Build ${value.shortcutBuild}</p>
      <p class="summary">这是 AnyClass 通用 iOS 快捷指令的官方安装入口。链接及共享载荷已经独立审核，安装或更新仍需由你主动确认。</p>
      <ol class="install-steps" aria-label="安装步骤">
        <li>轻点下方按钮打开 Apple 的 iCloud 快捷指令页面。</li>
        <li>核对名称为“${escapeHtml(value.shortcutName)}”，再选择获取快捷指令。</li>
        <li>如系统提示替换或更新，请先检查内容并自行确认。</li>
      </ol>
      <a class="primary-action" href="${escapeHtml(value.icloudUrl)}" rel="external noopener noreferrer">在 iCloud 中查看并安装</a>
      <p class="manual-note">页面不会自动跳转，也不会自动安装或替换快捷指令。</p>
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
module.exports=Object.freeze({OFFICIAL_INSTALL_LANDING_URL,OFFICIAL_ICLOUD_URL,ICLOUD_RECORD_ID,APPROVED_SIGNED_ARTIFACT_SHA256,SHARED_PAYLOAD_SHA256,validateContract,render});
