(function(root){
  "use strict";
  const VERSION=1,STAGES=Object.freeze(["DETECTION","VALIDATION","SEMESTER","PARSE","NORMALIZATION","TRANSPORT"]),SEVERITIES=Object.freeze(["INFO","WARNING","ERROR"]);
  const clean=value=>String(value==null?"":value).replace(/[\u0000-\u001f\u007f]/g," ").replace(/https?:\/\/[^\s]+/gi,"[origin]").slice(0,240).trim();
  const create=({adapterId=null,stage,code,severity="ERROR",message,detail=null})=>{
    if(!STAGES.includes(stage)||!SEVERITIES.includes(severity)||!/^[-A-Z0-9_]+$/.test(String(code||"")))throw Error("INVALID_ADAPTER_DIAGNOSTIC");
    return Object.freeze({taxonomyVersion:VERSION,adapterId:adapterId?clean(adapterId):null,stage,code:String(code),severity,message:clean(message),...(detail?{developerDetail:clean(detail)}:{})});
  };
  const api=Object.freeze({VERSION,STAGES,SEVERITIES,create});root.AnyClassAdapterDiagnostics=api;if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
