"use strict";
const fs=require("node:fs"),path=require("node:path"),root=path.resolve(__dirname,".."),config=require(path.join(root,"baseline.json")),source=path.join(root,"app"),argument=process.argv[2];
if(!argument)throw Error("PRODUCTION_APP_DESTINATION_REQUIRED");
const destination=path.resolve(argument);
if(destination===source||destination.startsWith(source+path.sep))throw Error("PRODUCTION_APP_DESTINATION_MUST_BE_OUTSIDE_SOURCE_APP");
if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw Error("PRODUCTION_APP_DESTINATION_MUST_BE_EMPTY");
const files=(directory,prefix="",result=[])=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const relative=path.posix.join(prefix,entry.name),absolute=path.join(directory,entry.name);entry.isDirectory()?files(absolute,relative,result):result.push(relative)}return result.sort()};
fs.mkdirSync(destination,{recursive:true});
for(const relative of files(source)){const output=path.join(destination,...relative.split("/"));fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(path.join(source,...relative.split("/")),output)}
const htmlFiles=["index.html","about/index.html","compatibility/index.html","export/index.html","import/index.html","local-status/index.html","settings/index.html","timetable/index.html","today/index.html"];let htmlReplacements=0;
for(const relative of htmlFiles){const file=path.join(destination,...relative.split("/")),input=fs.readFileSync(file,"utf8"),count=input.split(config.sourceReleaseId).length-1;if(count!==1)throw Error(`RELEASE_ID_SOURCE_DRIFT:${relative}:${count}`);fs.writeFileSync(file,input.replace(config.sourceReleaseId,config.productionReleaseId));htmlReplacements+=count}
const shell=path.join(destination,"assets","timetable","product-shell.js"),shellInput=fs.readFileSync(shell,"utf8"),shellCount=shellInput.split(config.sourceReleaseId).length-1;
if(shellCount!==1)throw Error(`PRODUCT_SHELL_RELEASE_ID_SOURCE_DRIFT:${shellCount}`);fs.writeFileSync(shell,shellInput.replace(config.sourceReleaseId,config.productionReleaseId));
const channel=path.join(destination,"assets","timetable","import-client-channels.js");let channelInput=fs.readFileSync(channel,"utf8");
const betaBlock=`    beta:Object.freeze({\n      id:"beta",\n      pageOrigin:"https://beta.anyclass.heyaaron.asia",\n      bookmarkDisplayName:"AnyClass 导入课表 Beta",\n      bookmarkTargetOrigin:"https://beta.anyclass.heyaaron.asia",\n      shortcutDisplayName:"AnyClass 导入课程 Beta",\n      shortcutICloudUrl:"https://www.icloud.com/shortcuts/2d1a3282109345918058db7cf1efd818",\n      shortcutTargetImportUrl:"https://beta.anyclass.heyaaron.asia/import/?method=file"\n    }),\n`;
const guard=`    for(const candidate of Object.values(CHANNELS))if(candidate.id!==channel.id&&result.includes(\`TARGET_ORIGIN="\${candidate.bookmarkTargetOrigin}"\`))throw Error("BOOKMARK_CROSS_CHANNEL_TARGET");\n`;
if(channelInput.split(betaBlock).length!==2)throw Error("BETA_CHANNEL_SOURCE_DRIFT");if(channelInput.split(guard).length!==2)throw Error("CROSS_CHANNEL_GUARD_SOURCE_DRIFT");
fs.writeFileSync(channel,channelInput.replace(betaBlock,"").replace(guard,""));
const outputFiles=files(destination);if(htmlReplacements!==9)throw Error(`HTML_RELEASE_FILE_COUNT_DRIFT:${htmlReplacements}`);if(outputFiles.length!==config.productionApplicationFileCount)throw Error(`PRODUCTION_FILE_COUNT_DRIFT:${outputFiles.length}`);
console.log(JSON.stringify({result:"PRODUCTION_APP_BUILD_COMPLETE",sourceReleaseId:config.sourceReleaseId,productionReleaseId:config.productionReleaseId,fileCount:outputFiles.length,htmlReleaseReplacements:htmlReplacements,shellReleaseReplacements:shellCount,channelMode:"stable-only"},null,2));
