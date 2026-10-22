'use strict';
// Local-only deterministic identity stamping / packaging. No deployment capability.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),cp=require('node:child_process');
const [mode,rootArg,destArg]=process.argv.slice(2),root=path.resolve(rootArg||'.');
if(!['prepare','package'].includes(mode)||!rootArg)throw Error('EXPLICIT_MODE_ROOT_REQUIRED');
const identity=JSON.parse(fs.readFileSync(path.join(root,'release/safari-ui-fix-identity.json'),'utf8'));
if(identity.databaseVersion!==4||!/^v022-production-\d{8}-\d{6}$/.test(identity.releaseId)||identity.releaseMode!=='production'||identity.channel!=='stable')throw Error('STABLE_IDENTITY_REQUIRED');
const navigationContractFile=path.join(root,'release/navigation-hotfix-contract.json');
if(fs.existsSync(navigationContractFile)){
  const c=JSON.parse(fs.readFileSync(navigationContractFile,'utf8'));
  if(identity.productVersion!=='0.2.2'||identity.releaseMode!=='production'||identity.channel!=='stable'||!/^v022-production-\d{8}-\d{6}$/.test(identity.releaseId))throw Error('V022_NAVIGATION_IDENTITY_REQUIRED');
  for(const k of ['productVersion','releaseMode','channel','databaseVersion'])if(identity[k]!==c[k])throw Error('NAVIGATION_CONTRACT_DRIFT');
  if(identity.releaseId!==c.candidateReleaseId||identity.baseCommit!==c.sourceBaseCommit||identity.rollbackReleaseId!==c.rollbackReleaseId)throw Error('NAVIGATION_LINEAGE_DRIFT');
}
const app=path.join(root,'app'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const list=(dir,prefix='')=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw Error('SYMLINK');return e.isDirectory()?list(path.join(dir,e.name),path.posix.join(prefix,e.name)):[path.posix.join(prefix,e.name)]}).sort();
const write=(p,s)=>fs.writeFileSync(p,s.replace(/\r\n/g,'\n'));
if(mode==='prepare'){
  const m={schemaVersion:1,productVersion:identity.productVersion,releaseId:identity.releaseId,releaseMode:identity.releaseMode};
  write(path.join(app,'assets/timetable/release-metadata.js'),`(function(root){\n  "use strict";\n  const metadata=Object.freeze(${JSON.stringify(m)});\n  root.AnyClassReleaseMetadata=metadata;\n  if(typeof module==="object"&&module.exports)module.exports=metadata;\n})(typeof globalThis!=="undefined"?globalThis:this);\n`);
  if(identity.channel==='stable'){
    const renderer=require(path.join(root,'tools/render-shortcut-install-page.js'));
    const contract=JSON.parse(fs.readFileSync(path.join(root,'release/shortcut-install-contract.json'),'utf8'));
    write(path.join(app,'shortcuts/install/index.html'),renderer.render(contract,identity.releaseId));
  }
  // Mechanical generated identity / cache-key stamping, not a new import lifecycle.
  for(const rel of list(app).filter(x=>x.endsWith('.html'))){
    const file=path.join(app,rel),original=fs.readFileSync(file,'utf8');
    let text=original.replace(/(<meta name="anyclass-release" content=")[^"]+(">)/,`$1${identity.releaseId}$2`);
    text=text.replace(/((?:src|href)=")([^"?#]+\.(?:js|css))(?:\?[^"#]*)?(?=")/g,(all,prefix,url)=>url.startsWith('/')?`${prefix}${url}?v=${identity.releaseId}`:all);
    if(text!==original)write(file,text);
  }
  const pkgPath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));pkg.version=identity.productVersion;write(pkgPath,JSON.stringify(pkg,null,2)+'\n');
  const lockPath=path.join(root,'package-lock.json');if(fs.existsSync(lockPath)){const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));lock.version=identity.productVersion;if(lock.packages?.[''])lock.packages[''].version=identity.productVersion;write(lockPath,JSON.stringify(lock,null,2)+'\n');}
  console.log(JSON.stringify({result:'LOCAL_IDENTITY_PREPARED',...identity}));process.exit(0);
}
if(!destArg)throw Error('DEST_REQUIRED');const dest=path.resolve(destArg);
if(fs.existsSync(dest)||dest===root||dest.startsWith(root+path.sep))throw Error('FRESH_EXTERNAL_OUTPUT_REQUIRED');
// Workflow: prepare -> inspect/test -> LOCAL commit -> package twice.
// Never silently package dirty or unreviewed source; no remote push is performed.
if(cp.execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim())throw Error('LOCAL_REVIEWED_COMMIT_REQUIRED_BEFORE_PACKAGING');
const sourceCommit=cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const runtime=require(path.join(app,'assets/timetable/release-metadata.js'));for(const k of ['productVersion','releaseId','releaseMode'])if(runtime[k]!==identity[k])throw Error('RUNTIME_IDENTITY_DRIFT');
const inventory=list(app);if(inventory.length!==98)throw Error('STABLE_INVENTORY_DRIFT');
if(!fs.readFileSync(path.join(app,'assets/timetable/storage-v2.js'),'utf8').includes('DB_VERSION = 4'))throw Error('SCHEMA_DRIFT');
const bodies=Object.fromEntries(inventory.map(rel=>[rel,fs.readFileSync(path.join(app,rel))]));
if(identity.channel==='stable'){
  // Preserve the already-reviewed Production-only channel transform.
  const rel='assets/timetable/import-client-channels.js',input=bodies[rel].toString('utf8');
  const start=input.indexOf('    beta:Object.freeze({'),end=input.indexOf('    stable:Object.freeze({');
  const guard='    for(const candidate of Object.values(CHANNELS))if(candidate.id!==channel.id&&result.includes(`TARGET_ORIGIN="${candidate.bookmarkTargetOrigin}"`))throw Error("BOOKMARK_CROSS_CHANNEL_TARGET");';
  if(start<0||end<=start||input.split(guard).length!==2)throw Error('CHANNEL_TRANSFORM_DRIFT');
  bodies[rel]=Buffer.from((input.slice(0,start)+input.slice(end)).replace(guard,''));
}
const files=Object.fromEntries(inventory.map(rel=>[rel,sha(bodies[rel])])),sourceTreeDigest=sha(Object.entries(files).map(([p,h])=>`${p}\0${h}\n`).join(''));
const manifest={schemaVersion:1,productVersion:identity.productVersion,candidateReleaseId:identity.releaseId,releaseMode:identity.releaseMode,channel:identity.channel,databaseVersion:4,sourceCommit,sourceBaseCommit:identity.baseCommit,rollbackReleaseId:identity.rollbackReleaseId,sourceTreeDigest,applicationFileCount:inventory.length,archiveMtimeUtc:identity.archiveMtimeUtc,published:false,deployed:false,files};
const epoch=Date.parse(identity.archiveMtimeUtc)/1000;if(!Number.isSafeInteger(epoch)||epoch<=0)throw Error('NONZERO_DETERMINISTIC_MTIME_REQUIRED');
const blocks=[];for(const rel of inventory){const body=bodies[rel],h=Buffer.alloc(512);if(Buffer.byteLength(rel)>100)throw Error('LONG_TAR_PATH');h.write(rel);const oct=(n,w)=>n.toString(8).padStart(w-1,'0')+'\0';h.write(oct(420,8),100);h.write(oct(0,8),108);h.write(oct(0,8),116);h.write(oct(body.length,12),124);h.write(oct(epoch,12),136);h.fill(32,148,156);h.write('0',156);h.write('ustar\0',257);h.write('00',263);h.write([...h].reduce((s,b)=>s+b,0).toString(8).padStart(6,'0')+'\0 ',148);blocks.push(h,body,Buffer.alloc((512-body.length%512)%512));}blocks.push(Buffer.alloc(1024));const tar=Buffer.concat(blocks),pack=zlib.gzipSync(tar,{level:9});if(!pack.equals(zlib.gzipSync(tar,{level:9})))throw Error('NONDETERMINISTIC');
fs.mkdirSync(dest,{recursive:true});for(const rel of inventory){const out=path.join(dest,'app',rel);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,bodies[rel]);}fs.writeFileSync(path.join(dest,'release.tar.gz'),pack);fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const result={build:identity.releaseId,sourceCommit,files:inventory.length,sourceTreeDigest,packageSHA256:sha(pack),manifestSHA256:sha(fs.readFileSync(path.join(dest,'manifest.json'))),archiveMtimeUtc:identity.archiveMtimeUtc};
fs.writeFileSync(path.join(dest,'sha256.txt'),`${result.packageSHA256}  release.tar.gz\n${result.manifestSHA256}  manifest.json\n`);console.log(JSON.stringify(result));
