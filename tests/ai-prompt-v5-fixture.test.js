"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
require("../app/assets/timetable/normalized-import.js");
const file=require("../app/assets/timetable/import-file-core.js");
const {chromium}=require("playwright");
const executablePath=[path.join(process.env.LOCALAPPDATA||"","Google","Chrome","Application","chrome.exe"),path.join(process.env["PROGRAMFILES(X86)"]||"","Microsoft","Edge","Application","msedge.exe")].find(fs.existsSync);
const fixture=require("./fixtures/ai-prompt-v5-cells-synthetic.json");
const out=require("./local-artifacts").evidenceDirectory("ai-prompt-v5-synthetic");
const fields=["courseName","weekday","startPeriod","endPeriod","weeks","teacher","locationRaw"];
const htmlEscape=value=>String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]);
const payload={schemaVersion:1,school:{id:null,name:"Example University"},semester:{academicYear:"2026-2027",term:"1"},meetings:fixture.cells.map(cell=>({...cell.expected,isAdjusted:false}))};
const parsed=file.parseText(JSON.stringify(payload));
assert.equal(parsed.meetings.length,fixture.cells.length,"all source cells remain separate meetings");
for(const [index,cell] of fixture.cells.entries())for(const field of fields)assert.deepEqual(parsed.meetings[index][field],cell.expected[field],`${cell.id}: ${field}`);
const corrupted=structuredClone(payload);for(const bad of fixture.deliberatelyCorruptedSameCount){const index=fixture.cells.findIndex(cell=>cell.id===bad.cellId);assert(index>=0);corrupted.meetings[index][bad.field]=bad.wrongValue}
assert.equal(corrupted.meetings.length,payload.meetings.length,"record count alone does not detect corruption");
const mismatches=[];for(const [index,cell] of fixture.cells.entries())for(const field of fields)if(JSON.stringify(corrupted.meetings[index][field])!==JSON.stringify(cell.expected[field]))mismatches.push(`${cell.id}:${field}`);
assert.equal(mismatches.length,fixture.deliberatelyCorruptedSameCount.length,"field-by-field oracle detects every deliberate corruption");
const prompt=fs.readFileSync(path.join(__dirname,"../app/assets/timetable/clipboard-import.js"),"utf8");
for(const token of ["单元格证据锁定","1-8节","1-10节","1-2,4-10,13-14,16-18","敏行楼","德行楼","尚智楼","教师","地点","相邻格","条数齐全"])assert(prompt.includes(token),`v5 prompt missing ${token}`);
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const cells=fixture.headers.map((header,column)=>`<section><h2>${htmlEscape(header)}</h2>${fixture.cells.filter(cell=>cell.column===column+1).map(cell=>`<article>${htmlEscape(cell.sourceText)}</article>`).join("")}</section>`).join("");
    await page.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:24px;font:16px/1.5 sans-serif;background:#fff;color:#111}h1{font-size:24px}main{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}section{border:2px solid #555;min-height:470px}h2{font-size:16px;text-align:center;border-bottom:2px solid #555;margin:0;padding:8px}article{border:1px solid #333;margin:8px;padding:8px;overflow-wrap:anywhere}p{margin:8px 0 0}</style><h1>合成课程表 · 逐格证据测试</h1><main>${cells}</main>`);
    fs.mkdirSync(out,{recursive:true});const image=path.join(out,"synthetic-timetable-v5.png");await page.screenshot({path:image,fullPage:true});
    console.log(JSON.stringify({result:"V5_SYNTHETIC_FIXTURE_READY_NOT_MODEL_ACCEPTANCE",sourceCells:fixture.cells.length,fieldDimensions:fields.length,deliberateCorruptionsDetected:mismatches.length,image}));
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
