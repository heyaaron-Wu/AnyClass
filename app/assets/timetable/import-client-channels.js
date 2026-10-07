(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.AnyClassImportClientChannels=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const CHANNELS=Object.freeze({
    beta:Object.freeze({
      id:"beta",
      pageOrigin:"https://beta.anyclass.heyaaron.asia",
      bookmarkDisplayName:"AnyClass 导入课表 Beta",
      bookmarkTargetOrigin:"https://beta.anyclass.heyaaron.asia",
      shortcutDisplayName:"AnyClass 导入课程 Beta",
      shortcutICloudUrl:"https://www.icloud.com/shortcuts/2d1a3282109345918058db7cf1efd818",
      shortcutTargetImportUrl:"https://beta.anyclass.heyaaron.asia/import/?method=file"
    }),
    stable:Object.freeze({
      id:"stable",
      pageOrigin:"https://anyclass.heyaaron.asia",
      bookmarkDisplayName:"AnyClass 导入课表",
      bookmarkTargetOrigin:"https://anyclass.heyaaron.asia",
      shortcutDisplayName:"AnyClass 导入课程",
      shortcutICloudUrl:"https://www.icloud.com/shortcuts/8b151aa3c24441c3b87c6f2b85fa5f37",
      shortcutTargetImportUrl:"https://anyclass.heyaaron.asia/import/?method=file"
    })
  });
  const normalizeOrigin=value=>new URL(value).origin;
  const forPageOrigin=value=>{
    const origin=normalizeOrigin(value);
    const match=Object.values(CHANNELS).find(channel=>channel.pageOrigin===origin);
    if(!match)throw Error("IMPORT_CLIENT_CHANNEL_UNSUPPORTED_ORIGIN");
    return match;
  };
  const buildBookmarklet=(source,channelValue,{clientId="anyclass-import",clientVersion="3.0.0"}={})=>{
    const channel=typeof channelValue==="string"?CHANNELS[channelValue]:channelValue;
    if(!channel||!CHANNELS[channel.id])throw Error("IMPORT_CLIENT_CHANNEL_INVALID");
    const stableTarget=CHANNELS.stable.bookmarkTargetOrigin;
    const targetNeedle=`const TARGET_ORIGIN="${stableTarget}"`;
    if(source.split(targetNeedle).length!==2)throw Error("BOOKMARK_TARGET_SOURCE_DRIFT");
    const clientNeedle=`CLIENT=Object.freeze({id:"${clientId}",version:"${clientVersion}"})`;
    if(source.split(clientNeedle).length!==2)throw Error("BOOKMARK_CLIENT_SOURCE_DRIFT");
    const result=source
      .replace(targetNeedle,`const TARGET_ORIGIN="${channel.bookmarkTargetOrigin}"`)
      .replace(clientNeedle,`CLIENT=Object.freeze({id:"${clientId}",version:"${clientVersion}",channel:"${channel.id}"})`);
    if(!result.includes(`TARGET_ORIGIN="${channel.bookmarkTargetOrigin}"`)||!result.includes(`channel:"${channel.id}"`))throw Error("BOOKMARK_CHANNEL_BUILD_FAILED");
    for(const candidate of Object.values(CHANNELS))if(candidate.id!==channel.id&&result.includes(`TARGET_ORIGIN="${candidate.bookmarkTargetOrigin}"`))throw Error("BOOKMARK_CROSS_CHANNEL_TARGET");
    return result;
  };
  return Object.freeze({CHANNELS,forPageOrigin,buildBookmarklet});
});
