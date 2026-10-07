(function (root) {
  "use strict";
  const contract=root.AnyClassTimetableAdapterContract||(typeof require==="function"?require("./timetable-adapter-contract.js"):null),OUTCOMES = contract.OUTCOMES;
  const result = (outcome, candidate, evidenceCodes = [],diagnostics=[]) => Object.freeze({outcome,systemFamily:candidate?.systemFamily||candidate?.family||null,family:candidate?.family||null,version:candidate?.version||null,confidence:candidate?.confidence||0,adapterId:candidate?.adapterId||null,evidenceCodes:Object.freeze([...evidenceCodes]),diagnostics:Object.freeze([...diagnostics]),schoolProfileCandidates:Object.freeze([...(candidate?.schoolProfileCandidates||[])])});
  const detect = (input, registry = root.AnyClassAdapterRegistry) => {
    if (!registry) throw new Error("ADAPTER_REGISTRY_REQUIRED");
    const diagnostics=[],candidates=[];for(const entry of [...registry.list()].sort((a,b)=>a.id.localeCompare(b.id))){const response=typeof registry.invoke==="function"?registry.invoke(entry.id,"detect",input):(()=>{try{return{ok:true,value:entry.adapter.detect(input)}}catch(_){return{ok:false}}})();if(!response.ok){if(response.diagnostic)diagnostics.push(response.diagnostic);continue}const value=response.value;if(value&&[OUTCOMES.MATCH,OUTCOMES.LOW_CONFIDENCE,OUTCOMES.UNSUPPORTED].includes(value.outcome)&&Number.isFinite(value.confidence))candidates.push({...value,adapterId:entry.id,systemFamily:value.systemFamily||value.family||entry.systemFamily})}candidates.sort((a,b)=>b.confidence-a.confidence||a.adapterId.localeCompare(b.adapterId));
    const matches = candidates.filter(item => item.outcome === OUTCOMES.MATCH);
    if (matches.length > 1 && matches[0].confidence === matches[1].confidence) return result(OUTCOMES.AMBIGUOUS,null,[...new Set(matches.flatMap(item=>item.evidenceCodes))],diagnostics);
    if (matches.length >= 1) return result(OUTCOMES.MATCH, matches[0], matches[0].evidenceCodes,diagnostics);
    const lowCandidates=candidates.filter(item=>item.outcome===OUTCOMES.LOW_CONFIDENCE);if(lowCandidates.length>1&&lowCandidates[0].confidence===lowCandidates[1].confidence)return result(OUTCOMES.AMBIGUOUS,null,[...new Set(lowCandidates.flatMap(item=>item.evidenceCodes||[]))],diagnostics);const low=lowCandidates[0];
    return low ? result(OUTCOMES.LOW_CONFIDENCE, low, low.evidenceCodes,diagnostics) : result(OUTCOMES.UNSUPPORTED, null, [],diagnostics);
  };
  root.AnyClassSystemDetector = Object.freeze({OUTCOMES, detect});
  if (typeof module === "object" && module.exports) module.exports = root.AnyClassSystemDetector;
})(typeof globalThis !== "undefined" ? globalThis : this);
