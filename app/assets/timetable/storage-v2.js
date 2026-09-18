(function (root) {
  "use strict";

  const DB_NAME = "course-app", DB_VERSION = 2;
  const STORES = Object.freeze({legacy: "timetables", timetables: "v2Timetables", terms: "terms", baseMeetings: "baseMeetings", snapshots: "v1Snapshots", migrations: "v2Migrations"});

  const requestValue = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("INDEXEDDB_REQUEST_FAILED"));
  });
  const transactionDone = transaction => new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("INDEXEDDB_TRANSACTION_FAILED"));
    transaction.onabort = () => reject(transaction.error || new Error("INDEXEDDB_TRANSACTION_ABORTED"));
  });

  const openDb = (factory = indexedDB) => new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = event => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.legacy)) db.createObjectStore(STORES.legacy, {keyPath: "key"});
      if (!db.objectStoreNames.contains(STORES.timetables)) db.createObjectStore(STORES.timetables, {keyPath: "timetableId"});
      if (!db.objectStoreNames.contains(STORES.terms)) {
        const store = db.createObjectStore(STORES.terms, {keyPath: "termId"});
        store.createIndex("timetableId", "timetableId", {unique: false});
      }
      if (!db.objectStoreNames.contains(STORES.baseMeetings)) {
        const store = db.createObjectStore(STORES.baseMeetings, {keyPath: "baseMeetingId"});
        store.createIndex("termId", "termId", {unique: false});
      }
      if (!db.objectStoreNames.contains(STORES.snapshots)) db.createObjectStore(STORES.snapshots, {keyPath: "snapshotId"});
      if (!db.objectStoreNames.contains(STORES.migrations)) db.createObjectStore(STORES.migrations, {keyPath: "migrationId"});
      if (event.oldVersion > 1 && event.oldVersion !== DB_VERSION) request.transaction.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("INDEXEDDB_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("INDEXEDDB_UPGRADE_BLOCKED"));
  });

  const canonicalLegacy = dataset => root.AnyClassPhaseB.canonical({
    key: dataset.key, school: dataset.school, semester: dataset.semester,
    meetings: dataset.meetings, fingerprint: dataset.fingerprint || null
  });

  const migrateDataset = async (dataset, config, factory = indexedDB, hooks = {}) => {
    if (!root.AnyClassPhaseB) throw new Error("PHASE_B_ENGINE_REQUIRED");
    const graph = root.AnyClassPhaseB.convertV1Dataset(dataset, config);
    if (graph.baseMeetings.length !== dataset.meetings.length) throw new Error("MIGRATION_COUNT_MISMATCH");
    const migrationId = `v1-to-v2:${dataset.key}`;
    const snapshotId = `v1:${dataset.key}`;
    const db = await openDb(factory);
    try {
      const existing = await requestValue(db.transaction(STORES.migrations, "readonly").objectStore(STORES.migrations).get(migrationId));
      if (existing && existing.sourceCanonical === canonicalLegacy(dataset) && existing.status === "VERIFIED") return {status: "UNCHANGED", graph};
      if (hooks.beforeWrite) await hooks.beforeWrite(graph);
      const priorRows = await requestValue(db.transaction(STORES.baseMeetings, "readonly").objectStore(STORES.baseMeetings).index("termId").getAll(graph.term.termId));
      const prior = priorRows.filter(item => item.sourceType === "academic").map(item => item.baseMeetingId);
      const names = [STORES.timetables, STORES.terms, STORES.baseMeetings, STORES.snapshots, STORES.migrations];
      const transaction = db.transaction(names, "readwrite");
      const timetableStore = transaction.objectStore(STORES.timetables);
      const termStore = transaction.objectStore(STORES.terms);
      const meetingStore = transaction.objectStore(STORES.baseMeetings);
      const snapshotStore = transaction.objectStore(STORES.snapshots);
      const migrationStore = transaction.objectStore(STORES.migrations);
      snapshotStore.put({snapshotId, sourceKey: dataset.key, capturedAt: new Date().toISOString(), dataset});
      timetableStore.put(graph.timetable);
      termStore.put(graph.term);
      for (const key of prior) meetingStore.delete(key);
      for (const meeting of graph.baseMeetings) meetingStore.put(meeting);
      migrationStore.put({migrationId, status: "VERIFIED", sourceKey: dataset.key, sourceCanonical: canonicalLegacy(dataset), meetingCount: graph.baseMeetings.length, updatedAt: new Date().toISOString()});
      if (hooks.beforeCommit) {
        try { hooks.beforeCommit({transaction, graph}); }
        catch (error) {
          transaction.abort();
          throw error;
        }
      }
      await transactionDone(transaction);
      const readback = await readGraph(graph.timetable.timetableId, factory);
      const ordered = value => [...value].sort((a, b) => a.baseMeetingId.localeCompare(b.baseMeetingId));
      const academicReadback = readback && readback.baseMeetings.filter(item => item.sourceType === "academic");
      if (!readback || academicReadback.length !== graph.baseMeetings.length || root.AnyClassPhaseB.canonical(ordered(academicReadback)) !== root.AnyClassPhaseB.canonical(ordered(graph.baseMeetings))) throw new Error("MIGRATION_READBACK_FAILED");
      return {status: existing ? "REPLACED" : "VERIFIED", graph: readback};
    } finally { db.close(); }
  };

  const readGraph = async (timetableId, factory = indexedDB) => {
    const db = await openDb(factory);
    try {
      const timetable = await requestValue(db.transaction(STORES.timetables, "readonly").objectStore(STORES.timetables).get(timetableId));
      if (!timetable) return null;
      const term = await requestValue(db.transaction(STORES.terms, "readonly").objectStore(STORES.terms).get(timetable.activeTermId));
      if (!term) throw new Error("ACTIVE_TERM_MISSING");
      const baseMeetings = await requestValue(db.transaction(STORES.baseMeetings, "readonly").objectStore(STORES.baseMeetings).index("termId").getAll(term.termId));
      return {schemaVersion: 2, timetable, term, baseMeetings};
    } finally { db.close(); }
  };

  const latestLegacyDataset = async (schoolId, factory = indexedDB) => {
    const db = await openDb(factory);
    try {
      const rows = await requestValue(db.transaction(STORES.legacy, "readonly").objectStore(STORES.legacy).getAll());
      return rows.filter(item => item && item.school && item.school.id === schoolId).sort((a, b) => String(b.importedAt || "").localeCompare(String(a.importedAt || "")))[0] || null;
    } finally { db.close(); }
  };

  const getLegacyDataset = async (key, factory = indexedDB) => {
    const db = await openDb(factory);
    try { return await requestValue(db.transaction(STORES.legacy, "readonly").objectStore(STORES.legacy).get(key)) || null; }
    finally { db.close(); }
  };

  const countLegacyKey = async (key, factory = indexedDB) => {
    const db = await openDb(factory);
    try { return await requestValue(db.transaction(STORES.legacy, "readonly").objectStore(STORES.legacy).count(key)); }
    finally { db.close(); }
  };

  const ensureLatest = async (schoolId, config, factory = indexedDB) => {
    const dataset = await latestLegacyDataset(schoolId, factory);
    if (!dataset) return null;
    await migrateDataset(dataset, config, factory);
    return {dataset, graph: await readGraph(`timetable:${schoolId}`, factory)};
  };

  const putLegacyAndMigrate = async (dataset, config, factory = indexedDB, hooks = {}) => {
    if (!root.AnyClassPhaseB) throw new Error("PHASE_B_ENGINE_REQUIRED");
    const graph = root.AnyClassPhaseB.convertV1Dataset(dataset, config);
    if (graph.baseMeetings.length !== dataset.meetings.length) throw new Error("MIGRATION_COUNT_MISMATCH");
    const migrationId = `v1-to-v2:${dataset.key}`, snapshotId = `v1:${dataset.key}`;
    const db = await openDb(factory);
    try {
      const priorRows = await requestValue(db.transaction(STORES.baseMeetings, "readonly").objectStore(STORES.baseMeetings).index("termId").getAll(graph.term.termId));
      const transaction = db.transaction([STORES.legacy, STORES.timetables, STORES.terms, STORES.baseMeetings, STORES.snapshots, STORES.migrations], "readwrite");
      transaction.objectStore(STORES.legacy).put(dataset);
      transaction.objectStore(STORES.timetables).put(graph.timetable);
      transaction.objectStore(STORES.terms).put(graph.term);
      const meetings = transaction.objectStore(STORES.baseMeetings);
      for (const item of priorRows) if (item.sourceType === "academic") meetings.delete(item.baseMeetingId);
      for (const meeting of graph.baseMeetings) meetings.put(meeting);
      transaction.objectStore(STORES.snapshots).put({snapshotId, sourceKey: dataset.key, capturedAt: new Date().toISOString(), dataset});
      transaction.objectStore(STORES.migrations).put({migrationId, status: "VERIFIED", sourceKey: dataset.key, sourceCanonical: canonicalLegacy(dataset), meetingCount: graph.baseMeetings.length, updatedAt: new Date().toISOString()});
      if (hooks.beforeCommit) {
        try { hooks.beforeCommit({transaction, graph}); }
        catch (error) { transaction.abort(); throw error; }
      }
      await transactionDone(transaction);
    } finally { db.close(); }
    const readback = await readGraph(graph.timetable.timetableId, factory);
    const academic = readback.baseMeetings.filter(item => item.sourceType === "academic");
    if (academic.length !== graph.baseMeetings.length) throw new Error("MIGRATION_READBACK_FAILED");
    return {status: "VERIFIED", graph: readback};
  };

  root.AnyClassStorageV2 = Object.freeze({DB_NAME, DB_VERSION, STORES, countLegacyKey, ensureLatest, getLegacyDataset, latestLegacyDataset, migrateDataset, openDb, putLegacyAndMigrate, readGraph});
  if (typeof module === "object" && module.exports) module.exports = root.AnyClassStorageV2;
})(typeof globalThis !== "undefined" ? globalThis : this);
