(function(root){
  "use strict";
  const compact=value=>String(value==null?"":value).normalize("NFKC").replace(/\s+/g," ").trim();
  const parseWeeks=expression=>{
    const normalized=compact(expression).replace(/\s+/g,"").replace(/[，、；;]/g,",");if(!normalized)return null;const weeks=[];
    for(const token of normalized.split(",").filter(Boolean)){const match=token.match(/^(\d+)(?:[-—–~至](\d+))?周?(?:\((单|双)\))?$/);if(!match)return null;const start=Number(match[1]),end=Number(match[2]||match[1]),parity=match[3]||"";if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>60)return null;for(let week=start;week<=end;week+=1){if(parity==="单"&&week%2===0)continue;if(parity==="双"&&week%2!==0)continue;weeks.push(week)}}
    const result=[...new Set(weeks)].sort((a,b)=>a-b);return result.length?result:null;
  };
  const parsePeriodRange=value=>{const match=compact(value).match(/[（(]\s*(\d+)\s*[-—–~至]\s*(\d+)\s*节\s*[）)]/);if(!match)return null;const startPeriod=Number(match[1]),endPeriod=Number(match[2]);return startPeriod>=1&&endPeriod>=startPeriod&&endPeriod<=30?Object.freeze({startPeriod,endPeriod}):null};
  const weekdayFromCellId=value=>{const match=String(value||"").match(/^(\d+)-(\d+)$/),weekday=match?Number(match[1]):NaN;return Number.isInteger(weekday)&&weekday>=1&&weekday<=7?weekday:null};
  const canonicalMeeting=meeting=>Object.freeze({...meeting,weeks:Object.freeze([...new Set(meeting.weeks||[])].sort((a,b)=>a-b))});
  const api=Object.freeze({compact,parseWeeks,parsePeriodRange,weekdayFromCellId,canonicalMeeting});root.AnyClassAdapterPrimitives=api;if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
