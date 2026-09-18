(function (root) {
  "use strict";
  const records = new Map();
  const register = adapter => {
    if (!adapter || !adapter.id || !adapter.family || !adapter.version || typeof adapter.parse !== "function" || typeof adapter.detect !== "function") throw new Error("INVALID_ADAPTER");
    if (records.has(adapter.id)) throw new Error("DUPLICATE_ADAPTER_ID");
    records.set(adapter.id, Object.freeze({id: adapter.id, family: adapter.family, version: adapter.version, supportedCaptureVersions: Object.freeze([...adapter.compatibility.captureVersions]), integrity: adapter.integrity, adapter}));
  };
  const get = id => records.get(id)?.adapter || null;
  const list = () => [...records.values()];
  const api = Object.freeze({register, get, list});
  root.AnyClassAdapterRegistry = api;
  if (root.AnyClassZhengFangV9Adapter) register(root.AnyClassZhengFangV9Adapter);
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
