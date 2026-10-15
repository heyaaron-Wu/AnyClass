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

function render(contract,releaseId='v0.2.2'){
  const value=validateContract(contract);
  if(!/^v[\w.-]+$/.test(releaseId))throw Error('RELEASE_ID_INVALID');
  return fs.readFileSync(path.join(__dirname,'../release/shortcut-install-template.html'),'utf8').replaceAll('__ANYCLASS_RELEASE_ID__',escapeHtml(releaseId));
}

if(require.main===module){
  const root=path.resolve(__dirname,'..'),contract=JSON.parse(fs.readFileSync(path.join(root,'release/shortcut-install-contract.json'),'utf8'));
  const target=path.join(root,'app/shortcuts/install/index.html');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,render(contract,require('../app/assets/timetable/release-metadata.js').releaseId),'utf8');
  process.stdout.write(`${target}\n`);
}
module.exports=Object.freeze({OFFICIAL_INSTALL_LANDING_URL,OFFICIAL_ICLOUD_URL,ICLOUD_RECORD_ID,APPROVED_SIGNED_ARTIFACT_SHA256,SHARED_PAYLOAD_SHA256,validateContract,render});
