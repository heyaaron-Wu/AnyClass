"use strict";
const crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),contract=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]||path.join(root,"release/v022-beta-contract.json")),"utf8")),manifest=JSON.parse(fs.readFileSync(path.resolve(process.argv[3]||path.join(root,"release/v022-beta-app-manifest.json")),"utf8"));
if(!process.argv[4])throw Error("BETA_DESTINATION_REQUIRED");
const destination=path.resolve(process.argv[4]),source=path.resolve(root,contract.appRoot),hash=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const list=(dir,prefix="")=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const relative=path.posix.join(prefix,entry.name),absolute=path.join(dir,entry.name);return entry.isDirectory()?list(absolute,relative):[relative]}).sort();
const metadata=require(path.join(source,"assets/timetable/release-metadata.js")),pkg=require(path.join(root,"package.json")),db=fs.readFileSync(path.join(source,"assets/timetable/storage-v2.js"),"utf8");
if(contract.schemaVersion!==1||contract.releaseMode!=="beta-candidate"||contract.channel!=="beta"||contract.publicPrivateBoundary!=="public-core-only")throw Error("BETA_CONTRACT_INVALID");
if(pkg.version!==contract.productVersion||metadata.productVersion!==contract.productVersion||metadata.releaseId!==contract.candidateReleaseId||metadata.releaseMode!==contract.releaseMode||!db.includes(`DB_VERSION = ${contract.databaseVersion}`))throw Error("BETA_IDENTITY_DRIFT");
for(const key of Object.keys(contract))if(JSON.stringify(manifest[key])!==JSON.stringify(contract[key]))throw Error(`BETA_MANIFEST_CONTRACT_DRIFT:${key}`);
if(destination===source||destination.startsWith(source+path.sep))throw Error("BETA_DESTINATION_INSIDE_APP");
if(fs.existsSync(destination)&&fs.readdirSync(destination).length)throw Error("BETA_DESTINATION_NOT_EMPTY");
const actual=list(source),expected=Object.keys(manifest.files).sort();
if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error("BETA_FILE_SET_DRIFT");
for(const relative of expected)if(hash(path.join(source,...relative.split("/")))!==manifest.files[relative])throw Error(`BETA_HASH_DRIFT:${relative}`);
fs.mkdirSync(destination,{recursive:true});for(const relative of expected){const output=path.join(destination,...relative.split("/"));fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(path.join(source,...relative.split("/")),output)}
console.log(JSON.stringify({result:"BETA_CANDIDATE_BUILD_PASS",releaseId:contract.candidateReleaseId,fileCount:actual.length,missing:0,mismatched:0,extra:0}));
