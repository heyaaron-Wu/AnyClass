(() => {
  'use strict';
  const PROTOCOL='anyclass-shortcut-update-preflight-v1',TYPE='RESULT',SHORTCUT_ID='anyclass-timetable-import';
  const params=new URLSearchParams(location.search),keys=[...params.keys()].sort();
  const expected=['nonce','shortcutBuild','shortcutId'];
  const nonce=params.get('nonce'),shortcutId=params.get('shortcutId'),buildText=params.get('shortcutBuild');
  const validKeys=keys.length===expected.length&&keys.every((key,index)=>key===expected[index]);
  const build=Number(buildText),valid=validKeys&&shortcutId===SHORTCUT_ID&&/^[0-9a-f]{32}$/.test(nonce||'')&&/^[1-9][0-9]*$/.test(buildText||'')&&Number.isSafeInteger(build);
  let sent=false;
  const send=(status,manifest=null)=>{
    if(sent)return;
    sent=true;
    parent.postMessage({protocol:PROTOCOL,type:TYPE,nonce,status,manifest},'*');
  };
  if(!valid){ send('INVALID'); return; }
  fetch('/shortcuts/manifest.json',{method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}})
    .then(response=>{if(!response.ok||response.type==='opaque')throw Error('UNAVAILABLE');return response.text();})
    .then(text=>{if(text.length>4096)throw Error('OVERSIZED');return JSON.parse(text);})
    .then(manifest=>send('OK',manifest))
    .catch(()=>send('UNAVAILABLE'));
})();
