(function (root) {
  "use strict";
  const contract=root.AnyClassTimetableAdapterContract||(typeof require==="function"?require("./timetable-adapter-contract.js"):null),diagnostics=root.AnyClassAdapterDiagnostics||(typeof require==="function"?require("./adapter-diagnostics.js"):null),records = new Map();
  const register = adapter => {
    const validation=contract?.validate(adapter);if(!validation?.ok){const error=new Error(validation?.code||"INVALID_ADAPTER");error.code=error.message;error.missing=validation?.missing||[];throw error}
    if (records.has(adapter.id)) throw new Error("DUPLICATE_ADAPTER_ID");
    records.set(adapter.id, Object.freeze({id:adapter.id,interfaceVersion:adapter.interfaceVersion,systemFamily:adapter.systemFamily,version:adapter.version,supportedCaptureVersions:Object.freeze([...adapter.supportedCaptureVersions]),limits:Object.freeze({...adapter.limits}),integrity:adapter.integrity||"bundled",adapter}));return adapter;
  };
  const get = id => records.get(id)?.adapter || null;
  const list = () => [...records.values()];
  const invoke=(adapterId,method,...args)=>{const adapter=get(adapterId);if(!adapter)return Object.freeze({ok:false,outcome:contract.OUTCOMES.UNSUPPORTED,diagnostic:null});try{return Object.freeze({ok:true,value:adapter[method](...args)})}catch(error){const stage=method==="detect"?"DETECTION":method==="validateCapture"?"VALIDATION":method==="extractSemester"?"SEMESTER":"PARSE";return Object.freeze({ok:false,outcome:method==="detect"?contract.OUTCOMES.UNSUPPORTED:contract.OUTCOMES.PARSE_ERROR,diagnostic:diagnostics?.create({adapterId,stage,code:"ADAPTER_METHOD_EXCEPTION",message:"课表数据无法由此适配器安全处理。",detail:error?.code||error?.message||"unknown"})||null})}};
  const api = Object.freeze({register, get, list,invoke});
  root.AnyClassAdapterRegistry = api;
  if (root.AnyClassZhengFangV9Adapter) register(root.AnyClassZhengFangV9Adapter);
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
