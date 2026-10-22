'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),destination=path.resolve(process.argv[2]||''),build=process.argv[3];
if(!process.argv[2]||!/^v022-stablecandidate-\d{8}-\d{6}$/.test(build||''))throw Error('EXPLICIT_DESTINATION_AND_BUILD_REQUIRED');
if(destination===root||destination.startsWith(root+path.sep)||fs.existsSync(destination))throw Error('NEW_EXTERNAL_DESTINATION_REQUIRED');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const list=(dir,prefix='')=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('SYMLINK_REJECTED');return e.isDirectory()?list(path.join(dir,e.name),path.posix.join(prefix,e.name)):[path.posix.join(prefix,e.name)]}).sort();
const source=path.join(root,'app'),metadata=require(path.join(source,'assets/timetable/release-metadata.js'));
if(require(path.join(root,'package.json')).version!=='0.2.2'||metadata.productVersion!=='0.2.2'||metadata.releaseId!=='v0.2.2'||metadata.releaseMode!=='source-release')throw Error('SOURCE_IDENTITY_DRIFT');
const commit=cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(cp.execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim())throw Error('CLEAN_SOURCE_REQUIRED');
fs.mkdirSync(destination,{recursive:true});const app=path.join(destination,'app');fs.cpSync(source,app,{recursive:true,errorOnExist:true});
const pages=['index.html','about/index.html','compatibility/index.html','export/index.html','import/index.html','local-status/index.html','settings/index.html','timetable/index.html','today/index.html'];
for(const rel of pages){const p=path.join(app,rel),s=fs.readFileSync(p,'utf8'),needle='<meta name="anyclass-release" content="v0.2.2">';if(s.split(needle).length!==2)throw Error('HTML_IDENTITY_DRIFT');fs.writeFileSync(p,s.replace(needle,`<meta name="anyclass-release" content="${build}">`));}
const meta=path.join(app,'assets/timetable/release-metadata.js');fs.writeFileSync(meta,fs.readFileSync(meta,'utf8').replace('releaseId:"v0.2.2",releaseMode:"source-release"',`releaseId:"${build}",releaseMode:"production-candidate"`));
// Reuse the established production transform: remove only Beta channel block and dual-channel generation guard.
const channel=path.join(app,'assets/timetable/import-client-channels.js'),input=fs.readFileSync(channel,'utf8');
const start=input.indexOf('    beta:Object.freeze({'),end=input.indexOf('    stable:Object.freeze({');
if(start<0||end<=start)throw Error('CHANNEL_SOURCE_DRIFT');
const guard='    for(const candidate of Object.values(CHANNELS))if(candidate.id!==channel.id&&result.includes(`TARGET_ORIGIN="${candidate.bookmarkTargetOrigin}"`))throw Error("BOOKMARK_CROSS_CHANNEL_TARGET");';
if(input.split(guard).length!==2)throw Error('CHANNEL_GUARD_SOURCE_DRIFT');
fs.writeFileSync(channel,(input.slice(0,start)+input.slice(end)).replace(guard,''));
const channelApi=require(channel);if(Object.keys(channelApi.CHANNELS).join(',')!=='stable')throw Error('NOT_STABLE_ONLY');
const inventory=list(app),files=Object.fromEntries(inventory.map(rel=>[rel,sha(fs.readFileSync(path.join(app,rel)))]));
if(inventory.length!==list(source).length)throw Error('INVENTORY_CHANGED');
if(!fs.readFileSync(path.join(app,'assets/timetable/storage-v2.js'),'utf8').includes('DB_VERSION = 4'))throw Error('SCHEMA_DRIFT');
const manifest={schemaVersion:1,productVersion:'0.2.2',candidateReleaseId:build,releaseMode:'production-candidate',channel:'stable',sourceCommit:commit,sourceBaseCommit:'61321b97336bb93e24d8bc2cd38250c65111e6f2',databaseVersion:4,applicationFileCount:inventory.length,published:false,deployed:false,files};
fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
function archive(){const blocks=[];for(const rel of inventory){const body=fs.readFileSync(path.join(app,rel)),h=Buffer.alloc(512);if(Buffer.byteLength(rel)>100)throw Error('TAR_NAME_TOO_LONG');h.write(rel,0,100,'utf8');const oct=(n,width)=>n.toString(8).padStart(width-1,'0')+'\0';h.write(oct(420,8),100);h.write(oct(0,8),108);h.write(oct(0,8),116);h.write(oct(body.length,12),124);h.write(oct(0,12),136);h.fill(32,148,156);h.write('0',156);h.write('ustar\0',257);h.write('00',263);h.write([...h].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);blocks.push(h,body,Buffer.alloc((512-body.length%512)%512));}blocks.push(Buffer.alloc(1024));return zlib.gzipSync(Buffer.concat(blocks),{level:9});}
const a=archive(),b=archive();if(!a.equals(b))throw Error('NONDETERMINISTIC_PACKAGE');fs.writeFileSync(path.join(destination,'release.tar.gz'),a);
const allowed=new Set([...pages,'assets/timetable/release-metadata.js','assets/timetable/import-client-channels.js']);
for(const rel of inventory)if(!allowed.has(rel)&&files[rel]!==sha(fs.readFileSync(path.join(source,rel))))throw Error('UNEXPECTED_TRANSFORM');
console.log(JSON.stringify({result:'LOCAL_STABLE_PACKAGE_BUILT_NOT_DEPLOYED',build,sourceCommit:commit,files:inventory.length,packageSHA256:sha(a),manifestSHA256:sha(fs.readFileSync(path.join(destination,'manifest.json'))),deterministic:true,sourceEquivalentExceptDeclaredTransforms:true}));
