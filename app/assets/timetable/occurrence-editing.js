(function(root){
  "use strict";
  const editable=Object.freeze(["title","teacher","location","effectiveDate","startPeriod","endPeriod","notes","cancelled"]);
  const validDate=value=>{const text=String(value||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;const date=new Date(`${text}T00:00:00Z`);return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===text};
  const normalized=(draft,term)=>{
    if(!draft||!term?.periodTimes)throw Error("OCCURRENCE_EDIT_CONTEXT_MISSING");
    if(typeof draft.cancelled!=="boolean")throw Error("OCCURRENCE_CANCELLED_INVALID");
    const result={title:String(draft.title||"").trim(),teacher:String(draft.teacher||"").trim(),location:String(draft.location||"").trim(),effectiveDate:String(draft.effectiveDate||""),startPeriod:Number(draft.startPeriod),endPeriod:Number(draft.endPeriod),notes:String(draft.notes||"").trim(),cancelled:draft.cancelled===true};
    if(!result.title)throw Error("OCCURRENCE_TITLE_REQUIRED");
    if(!validDate(result.effectiveDate))throw Error("OCCURRENCE_DATE_INVALID");
    if(!Number.isInteger(result.startPeriod)||!Number.isInteger(result.endPeriod)||result.startPeriod>result.endPeriod||!term.periodTimes[result.startPeriod]||!term.periodTimes[result.endPeriod]||term.periodTimes[result.startPeriod].start>=term.periodTimes[result.endPeriod].end)throw Error("OCCURRENCE_PERIOD_INVALID");
    if(result.title.length>200||result.teacher.length>200||result.location.length>200||result.notes.length>1000)throw Error("OCCURRENCE_TEXT_TOO_LONG");
    return result;
  };
  const differences=(baseline,draft,term)=>{
    const values=normalized(draft,term),fields={};
    for(const field of editable)if(JSON.stringify(values[field])!==JSON.stringify(field==="cancelled"?false:(baseline[field]??"")))fields[field]=values[field];
    return fields;
  };
  const api=Object.freeze({editable,validDate,normalized,differences});root.AnyClassOccurrenceEditing=api;
  if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
