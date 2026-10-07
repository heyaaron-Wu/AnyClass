"use strict";
const crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),contractPath=path.resolve(process.argv[2]||path.join(root,"release","v021-candidate-contract.json")),manifestPath=path.resolve(process.argv[3]||path.join(root,"release","v021-candidate-app-manifest.json")),argument=process.argv[4];
if(!argument)throw Error("V021_CANDIDATE_DESTINATION_REQUIRED");
const destination=path.resolve(argument),contract=JSON.parse(fs.readFileSync(contractPath,"utf8")),manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8")),pkg=require(path.join(root,"package.json")),source=path.resolve(root,contract.appRoot),hash=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const files=(directory,prefix="",result=[])=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const relative=path.posix.join(prefix,entry.name),absolute=path.join(directory,entry.name);entry.isDirectory()?files(absolute,relative,result):result.push(relative)}return result.sort()};
if(contract.schemaVersion!==1||manifest.schemaVersion!==1)throw Error("V021_CANDIDATE_SCHEMA_DRIFT");
if(pkg.version!==contract.productVersion||manifest.productVersion!==contract.productVersion)throw Error("V021_CANDIDATE_VERSION_DRIFT");
for(const key of ["candidateReleaseId","workstream","parentCommit","releaseMode","channelExpectation","publicPrivateBoundary"])if(manifest[key]!==contract[key])throw Error(`V021_CANDIDATE_CONTRACT_DRIFT:${key}`);
if(JSON.stringify(manifest.transform)!==JSON.stringify(contract.transform)||manifest.candidateSourceCommitBinding!==contract.commitBinding)throw Error("V021_CANDIDATE_TRANSFORM_DRIFT");
if(JSON.stringify(manifest.lineage)!==JSON.stringify({baseReleaseId:"v020-production-20260930-005312",baseApplicationFileCount:87,functionalSourceCommit:contract.lineage.functionalSourceCommit,motionCommit:contract.lineage.motionCommit,adapterCommit:contract.lineage.adapterCommit}))throw Error("V021_CANDIDATE_LINEAGE_DRIFT");
if(destination===source||destination.startsWith(source+path.sep))throw Error("V021_CANDIDATE_DESTINATION_INSIDE_APP");
if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw Error("V021_CANDIDATE_DESTINATION_NOT_EMPTY");
const actual=files(source),expected=Object.keys(manifest.files).sort(),missing=expected.filter(file=>!actual.includes(file)),extra=actual.filter(file=>!expected.includes(file)),mismatched=actual.filter(file=>manifest.files[file]&&hash(path.join(source,...file.split("/")))!==manifest.files[file]);
if(missing.length)throw Error(`V021_CANDIDATE_MISSING:${missing.join(",")}`);if(extra.length)throw Error(`V021_CANDIDATE_EXTRA:${extra.join(",")}`);if(mismatched.length)throw Error(`V021_CANDIDATE_HASH_DRIFT:${mismatched.join(",")}`);
const channelSource=fs.readFileSync(path.join(source,"assets","timetable","import-client-channels.js"),"utf8");if(!channelSource.includes('id:"beta"')||!channelSource.includes('id:"stable"'))throw Error("V021_CANDIDATE_CHANNEL_DRIFT");
const runtimeMetadata=fs.readFileSync(path.join(source,"assets","timetable","release-metadata.js"),"utf8");if(!runtimeMetadata.includes(`productVersion:"${contract.productVersion}"`)||!runtimeMetadata.includes(`releaseId:"${contract.candidateReleaseId}"`))throw Error("V021_CANDIDATE_RUNTIME_IDENTITY_DRIFT");
fs.mkdirSync(destination,{recursive:true});for(const relative of actual){const output=path.join(destination,...relative.split("/"));fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(path.join(source,...relative.split("/")),output)}
console.log(JSON.stringify({result:"V021_CANDIDATE_BUILD_PASS",releaseId:contract.candidateReleaseId,fileCount:actual.length,missing:0,mismatched:0,extra:0},null,2));
