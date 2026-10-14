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
    <header class="install-hero" aria-labelledby="install-title">
      <div class="brand-row"><img src="/assets/brand/AnyClass_Icon.svg" width="64" height="64" alt=""><p class="eyebrow">AnyClass · 有课吗</p></div>
      <div class="hero-copy">
        <p class="release-label">通用 iOS 快捷指令</p>
        <h1 id="install-title">${escapeHtml(value.shortcutName)}</h1>
        <p class="release-identity">${escapeHtml(value.shortcutVersion)} / Build ${value.shortcutBuild}</p>
        <p class="summary">从 Safari 分享菜单读取当前课表，在 AnyClass 统一预览中核对后保存。一个快捷指令即可由你选择正式版或测试版，两个网站的数据相互隔离。</p>
      </div>
      <div class="install-actions">
        <a class="primary-action" href="${escapeHtml(value.icloudUrl)}" rel="external noopener noreferrer">在 iCloud 中查看并安装</a>
        <p class="manual-note">页面不会自动跳转，也不会自动安装或替换快捷指令。</p>
      </div>
      <ol class="install-steps" aria-label="安装与使用步骤">
        <li><strong>安装：</strong>轻点按钮打开 Apple iCloud，核对名称后由你确认添加。</li>
        <li><strong>导入：</strong>在 Safari 打开学校课表，通过分享菜单运行“${escapeHtml(value.shortcutName)}”。</li>
        <li><strong>选择：</strong>按需要进入正式版或测试版，再选择生成的 JSON 文件并核对保存。</li>
      </ol>
    </header>
    <section class="history-card" aria-labelledby="history-title">
      <div class="section-heading"><p class="eyebrow">Release history</p><h2 id="history-title">版本更新日志</h2></div>
      <article class="release-entry">
        <div class="release-entry-heading"><h3>1.0.0 / Build 1</h3><time datetime="2026-10-14">2026-10-14 · 初始版本</time></div>
        <ul>
          <li>同一快捷指令支持由用户选择 AnyClass 正式版或测试版导入目标。</li>
          <li>从 Safari 分享菜单读取当前教务课表，生成本地 JSON 后进入 AnyClass 统一预览。</li>
          <li>支持可选的上课时间信息；保存前仍需在 AnyClass 核对并确认。</li>
        </ul>
      </article>
    </section>
    <footer class="install-footer">
      <p><strong>隐私：</strong>本页面不读取或上传学校页面内容、课表、账号、Cookie、Session 或 Token。服务器可能按既有安全运维策略记录最小化的常规访问日志；只有你主动点击按钮时，浏览器才会前往 Apple iCloud。</p>
      <p><a href="https://github.com/heyaaron-Wu/AnyClass" rel="external noopener noreferrer">AnyClass 开源项目</a> · Apache-2.0。AnyClass 是独立项目，与 Apple、学校或教务系统厂商无隶属或官方合作关系。</p>
    </footer>
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
