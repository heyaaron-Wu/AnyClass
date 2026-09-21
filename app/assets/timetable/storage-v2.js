(function (root) {
  "use strict";

  const DB_NAME = "course-app", DB_VERSION = 3;
  const STORES = Object.freeze({legacy: "timetables", timetables: "v2Timetables", terms: "terms", baseMeetings: "baseMeetings", snapshots: "v1Snapshots", migrations: "v2Migrations", importSnapshots: "importSnapshots", courses: "courses", courseOverrides: "courseOverrides", occurrenceOverrides: "occurrenceOverrides", scheduleOverrides: "scheduleOverrides", schema3Migrations: "schema3Migrations"});

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
      if (!db.objectStoreNames.contains(STORES.importSnapshots)) {
        const store = db.createObjectStore(STORES.importSnapshots, {keyPath: "snapshotId"});
        store.createIndex("sourceKey", "sourceKey", {unique: false});
      }
      if (!db.objectStoreNames.contains(STORES.courses)) {
        const store = db.createObjectStore(STORES.courses, {keyPath: "courseId"});
        store.createIndex("sourceKey", "sourceKey", {unique: false});
        store.createIndex("sourceSnapshotId", "sourceSnapshotId", {unique: false});
      }
      if (!db.objectStoreNames.contains(STORES.courseOverrides)) db.createObjectStore(STORES.courseOverrides, {keyPath: "courseId"});
      if (!db.objectStoreNames.contains(STORES.occurrenceOverrides)) {
        const store = db.createObjectStore(STORES.occurrenceOverrides, {keyPath: "occurrenceId"});
        store.createIndex("courseId", "courseId", {unique: false});
      }
      if (!db.objectStoreNames.contains(STORES.scheduleOverrides)) db.createObjectStore(STORES.scheduleOverrides, {keyPath: "scheduleOverrideId"});
      if (!db.objectStoreNames.contains(STORES.schema3Migrations)) db.createObjectStore(STORES.schema3Migrations, {keyPath: "migrationId"});
      if (event.oldVersion > DB_VERSION) request.transaction.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("INDEXEDDB_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("INDEXEDDB_UPGRADE_BLOCKED"));
  });

  const canonicalLegacy = dataset => root.AnyClassPhaseB.canonical({
    key: dataset.key, school: dataset.school, semester: dataset.semester,
    meetings: dataset.meetings, fingerprint: dataset.fingerprint || null
  });

  const schema3Model = (dataset, graph) => {
    if (!root.AnyClassCourseModel) throw new Error("COURSE_MODEL_REQUIRED");
    return root.AnyClassCourseModel.build(dataset, graph);
  };

  const writeSchema3 = async (transaction, dataset, graph) => {
    const model = schema3Model(dataset, graph), sourceCanonical = canonicalLegacy(dataset);
    const migrationId = `v2-to-v3:${model.snapshot.sourceKey}`;
    const courses = transaction.objectStore(STORES.courses);
    const previous = await requestValue(courses.index("sourceKey").getAll(model.snapshot.sourceKey));
    const currentIds = new Set(model.courses.map(item => item.courseId));
    for (const item of previous) if (!currentIds.has(item.courseId)) courses.put({...item, suppressed: true});
    transaction.objectStore(STORES.importSnapshots).put(model.snapshot);
    for (const course of model.courses) courses.put(course);
    transaction.objectStore(STORES.schema3Migrations).put({migrationId, status: "VERIFIED", sourceKey: model.snapshot.sourceKey, sourceCanonical, snapshotId: model.snapshot.snapshotId, courseCount: model.courses.length, updatedAt: new Date().toISOString()});
    return model;
  };

  const migrateDataset = async (dataset, config, factory = indexedDB, hooks = {}) => {
    if (!root.AnyClassPhaseB) throw new Error("PHASE_B_ENGINE_REQUIRED");
    const graph = root.AnyClassPhaseB.convertV1Dataset(dataset, config);
    if (graph.baseMeetings.length !== dataset.meetings.length) throw new Error("MIGRATION_COUNT_MISMATCH");
    const migrationId = `v1-to-v2:${dataset.key}`;
    const snapshotId = `v1:${dataset.key}`;
    const db = await openDb(factory);
    try {
      const existing = await requestValue(db.transaction(STORES.migrations, "readonly").objectStore(STORES.migrations).get(migrationId));
      const schema3Id = `v2-to-v3:${root.AnyClassCourseModel.sourceKey(dataset)}`;
      const existingSchema3 = await requestValue(db.transaction(STORES.schema3Migrations, "readonly").objectStore(STORES.schema3Migrations).get(schema3Id));
      if (existing && existing.sourceCanonical === canonicalLegacy(dataset) && existing.status === "VERIFIED" && existingSchema3 && existingSchema3.sourceCanonical === canonicalLegacy(dataset) && existingSchema3.status === "VERIFIED") return {status: "UNCHANGED", graph};
      if (hooks.beforeWrite) await hooks.beforeWrite(graph);
      const priorRows = await requestValue(db.transaction(STORES.baseMeetings, "readonly").objectStore(STORES.baseMeetings).index("termId").getAll(graph.term.termId));
      const prior = priorRows.filter(item => item.sourceType === "academic").map(item => item.baseMeetingId);
      const names = [STORES.timetables, STORES.terms, STORES.baseMeetings, STORES.snapshots, STORES.migrations, STORES.importSnapshots, STORES.courses, STORES.schema3Migrations];
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
      await writeSchema3(transaction, dataset, graph);
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
      await verifySchema3(dataset, graph, factory);
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

  const readCourseModel = async (sourceKey, factory = indexedDB) => {
    const db = await openDb(factory);
    try {
      const transaction = db.transaction([STORES.importSnapshots, STORES.courses, STORES.courseOverrides, STORES.occurrenceOverrides, STORES.scheduleOverrides], "readonly");
      const snapshots = await requestValue(transaction.objectStore(STORES.importSnapshots).index("sourceKey").getAll(sourceKey));
      const courses = await requestValue(transaction.objectStore(STORES.courses).index("sourceKey").getAll(sourceKey));
      const courseOverrides = await requestValue(transaction.objectStore(STORES.courseOverrides).getAll());
      const occurrenceOverrides = await requestValue(transaction.objectStore(STORES.occurrenceOverrides).getAll());
      const scheduleOverrides = await requestValue(transaction.objectStore(STORES.scheduleOverrides).getAll());
      return {schemaVersion: 3, snapshots, courses, courseOverrides: courseOverrides.filter(item => courses.some(course => course.courseId === item.courseId)), occurrenceOverrides: occurrenceOverrides.filter(item => courses.some(course => course.courseId === item.courseId)), scheduleOverrides};
    } finally { db.close(); }
  };

  const verifySchema3 = async (dataset, graph, factory = indexedDB) => {
    const expected = schema3Model(dataset, graph), actual = await readCourseModel(expected.snapshot.sourceKey, factory);
    const ordered = value => [...value].sort((a, b) => a.courseId.localeCompare(b.courseId));
    const active = actual.courses.filter(item => item.suppressed !== true);
    if (!actual.snapshots.some(item => item.snapshotId === expected.snapshot.snapshotId) || active.length !== expected.courses.length || root.AnyClassPhaseB.canonical(ordered(active)) !== root.AnyClassPhaseB.canonical(ordered(expected.courses))) throw new Error("SCHEMA3_MIGRATION_READBACK_FAILED");
    return actual;
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
      const transaction = db.transaction([STORES.legacy, STORES.timetables, STORES.terms, STORES.baseMeetings, STORES.snapshots, STORES.migrations, STORES.importSnapshots, STORES.courses, STORES.schema3Migrations], "readwrite");
      transaction.objectStore(STORES.legacy).put(dataset);
      transaction.objectStore(STORES.timetables).put(graph.timetable);
      transaction.objectStore(STORES.terms).put(graph.term);
      const meetings = transaction.objectStore(STORES.baseMeetings);
      for (const item of priorRows) if (item.sourceType === "academic") meetings.delete(item.baseMeetingId);
      for (const meeting of graph.baseMeetings) meetings.put(meeting);
      transaction.objectStore(STORES.snapshots).put({snapshotId, sourceKey: dataset.key, capturedAt: new Date().toISOString(), dataset});
      transaction.objectStore(STORES.migrations).put({migrationId, status: "VERIFIED", sourceKey: dataset.key, sourceCanonical: canonicalLegacy(dataset), meetingCount: graph.baseMeetings.length, updatedAt: new Date().toISOString()});
      await writeSchema3(transaction, dataset, graph);
      if (hooks.beforeCommit) {
        try { hooks.beforeCommit({transaction, graph}); }
        catch (error) { transaction.abort(); throw error; }
      }
      await transactionDone(transaction);
    } finally { db.close(); }
    const readback = await readGraph(graph.timetable.timetableId, factory);
    const academic = readback.baseMeetings.filter(item => item.sourceType === "academic");
    if (academic.length !== graph.baseMeetings.length) throw new Error("MIGRATION_READBACK_FAILED");
    await verifySchema3(dataset, graph, factory);
    return {status: "VERIFIED", graph: readback};
  };

  root.AnyClassStorageV2 = Object.freeze({DB_NAME, DB_VERSION, STORES, countLegacyKey, ensureLatest, getLegacyDataset, latestLegacyDataset, migrateDataset, openDb, putLegacyAndMigrate, readCourseModel, readGraph, verifySchema3});
  if (typeof module === "object" && module.exports) module.exports = root.AnyClassStorageV2;
})(typeof globalThis !== "undefined" ? globalThis : this);
