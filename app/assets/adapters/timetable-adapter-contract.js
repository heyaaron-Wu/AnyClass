(function(root){
  "use strict";
  const INTERFACE_VERSION=1;
  const OUTCOMES=Object.freeze({MATCH:"MATCH",LOW_CONFIDENCE:"LOW_CONFIDENCE",UNSUPPORTED:"UNSUPPORTED",AMBIGUOUS:"AMBIGUOUS",INVALID_CAPTURE:"INVALID_CAPTURE",PARSE_ERROR:"PARSE_ERROR"});
  const REQUIRED_METHODS=Object.freeze(["detect","validateCapture","extractSemester","parse"]);
  const text=value=>typeof value==="string"&&value.trim().length>0;
  const validate=adapter=>{
    if(!adapter||typeof adapter!=="object")return{ok:false,code:"ADAPTER_REQUIRED"};
    if(adapter.interfaceVersion!==INTERFACE_VERSION)return{ok:false,code:"UNSUPPORTED_INTERFACE_VERSION"};
    if(!text(adapter.id)||!text(adapter.version)||!text(adapter.systemFamily))return{ok:false,code:"INVALID_ADAPTER_METADATA"};
    if(!Array.isArray(adapter.supportedCaptureVersions)||!adapter.supportedCaptureVersions.length||adapter.supportedCaptureVersions.some(value=>!Number.isInteger(value)||value<1))return{ok:false,code:"INVALID_CAPTURE_VERSIONS"};
    if(!adapter.limits||!Number.isInteger(adapter.limits.maxInputBytes)||adapter.limits.maxInputBytes<1||!Number.isInteger(adapter.limits.maxMeetings)||adapter.limits.maxMeetings<1)return{ok:false,code:"INVALID_ADAPTER_LIMITS"};
    const missing=REQUIRED_METHODS.filter(name=>typeof adapter[name]!=="function");
    return missing.length?{ok:false,code:"MISSING_ADAPTER_METHOD",missing}:{ok:true,code:"ADAPTER_CONFORMANT"};
  };
  const api=Object.freeze({INTERFACE_VERSION,OUTCOMES,REQUIRED_METHODS,validate});
  root.AnyClassTimetableAdapterContract=api;
  if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
