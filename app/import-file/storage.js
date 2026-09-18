(function (root) {
  "use strict";

  const api = () => {
    if (!root.AnyClassStorageV2 || !root.TimetableSchoolConfigs) throw new Error("PHASE_B_STORAGE_DEPENDENCY_MISSING");
    return root.AnyClassStorageV2;
  };

  const putDataset = (dataset, factory = indexedDB) => api().putLegacyAndMigrate(dataset, root.TimetableSchoolConfigs.gupt, factory);
  const getDataset = (key, factory = indexedDB) => api().getLegacyDataset(key, factory);
  const countKey = (key, factory = indexedDB) => api().countLegacyKey(key, factory);

  root.HeyAaronTimetableFileStorage = Object.freeze({putDataset, getDataset, countKey});
})(typeof globalThis !== "undefined" ? globalThis : this);
