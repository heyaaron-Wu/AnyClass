"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),config=JSON.parse(fs.readFileSync(path.join(__dirname,"import-client-release-set.json"),"utf8"));
const channelApi=require(path.join(root,"app/assets/timetable/import-client-channels.js"));
const output=path.resolve(process.argv[2]||process.env.ANYCLASS_LOCAL_ARTIFACT_ROOT||path.join(require("node:os").tmpdir(),"anyclass-import-clients"));
if(output===root||output.startsWith(root+path.sep))throw Error("IMPORT_CLIENT_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY");
const sha=value=>crypto.createHash("sha256").update(value).digest("hex"),read=relative=>fs.readFileSync(path.join(root,relative),"utf8");
const bookmarkSource=read(config.bookmark.source),shortcutSource=read(config.shortcut.source);
const bookmarkFor=channel=>channelApi.buildBookmarklet(bookmarkSource,channel,{clientId:config.bookmark.id,clientVersion:config.bookmark.version});
const artifacts=[];
for(const channel of ["beta","stable"]){
  const dir=path.join(output,channel);fs.mkdirSync(dir,{recursive:true});
  const channelConfig=channelApi.CHANNELS[channel],bookmark=bookmarkFor(channel);
  const bookmarkPath=path.join(dir,"bookmarklet.txt"),parserPath=path.join(dir,"ios-shortcut-parser.js"),manifestPath=path.join(dir,"manifest.json");
  fs.writeFileSync(bookmarkPath,bookmark);fs.writeFileSync(parserPath,shortcutSource);
  const manifest={channel,webVersion:config.webVersion,importProtocol:config.importProtocol,normalizedImportSchema:config.normalizedImportSchema,storageSchema:config.storageSchema,bookmark:{id:config.bookmark.id,version:config.bookmark.version,displayName:channelConfig.bookmarkDisplayName,targetOrigin:channelConfig.bookmarkTargetOrigin,sha256:sha(bookmark)},shortcut:{id:config.shortcut.id,version:config.shortcut.version,displayName:channelConfig.shortcutDisplayName,targetImportUrl:channelConfig.shortcutTargetImportUrl,iCloudUrl:channelConfig.shortcutICloudUrl,parserSha256:sha(shortcutSource),stableICloudUrl:channel==="stable"?config.shortcut.stableICloudUrl:null,published:true}};
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n");artifacts.push({channel,dir,manifest});
}
console.log(JSON.stringify({result:"IMPORT_CLIENT_BUILD_PASS",output,artifacts},null,2));
