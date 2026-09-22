(function (root) {
  "use strict";

  const api = () => {
    if (!root.AnyClassStorageV2 || !root.AnyClassSchoolProfileRegistry) throw new Error("PHASE_B_STORAGE_DEPENDENCY_MISSING");
    return root.AnyClassStorageV2;
  };

  const putDataset = (dataset, factory = indexedDB) => { const profile=root.AnyClassSchoolProfileRegistry.get(dataset?.school?.id); if(!profile) throw new Error("SCHOOL_PROFILE_UNKNOWN"); return api().putLegacyAndMigrate(dataset,profile,factory); };
  const getDataset = (key, factory = indexedDB) => api().getLegacyDataset(key, factory);
  const countKey = (key, factory = indexedDB) => api().countLegacyKey(key, factory);

  const storage=Object.freeze({putDataset,getDataset,countKey});
  root.AnyClassTimetableFileStorage=storage;
  root.HeyAaronTimetableFileStorage=storage;
})(typeof globalThis !== "undefined" ? globalThis : this);
