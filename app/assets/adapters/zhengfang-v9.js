(function (root) {
  "use strict";
  const ID = "zhengfang-v9", VERSION = "legacy-v1", FAMILY = "zhengfang";
  const TABLE = "table#kbgrid_table_0", BLOCK = ".timetable_con";
  const compact = value => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const fail = code => { const error = new Error(code); error.code = code; throw error; };
  const parseDocument = html => {
    if (typeof html !== "string" || !html.trim() || html.length > 2000000) fail("SOURCE_VALIDATION_FAILED");
    if (/<\s*\/?\s*(?:script|iframe|frame|img|link|style|object|embed|source|video|audio|form|input|button|meta|base)\b/i.test(html) || /\s(?:src|href|srcset|poster|background)\s*=/i.test(html) || /\son[a-z][a-z0-9_-]*\s*=/i.test(html) || /javascript\s*:/i.test(html)) fail("SOURCE_VALIDATION_FAILED");
    if (typeof root.DOMParser !== "function") fail("DOM_PARSER_UNAVAILABLE");
    return new root.DOMParser().parseFromString(html, "text/html");
  };
  const captureSignals = capture => {
    let document = capture?.document || null;
    if (!document && capture?.tableHtml) { try { document = parseDocument(capture.tableHtml); } catch (_) {} }
    return Object.freeze({
      tableSignature: document?.querySelectorAll(TABLE).length === 1,
      blockSignature: Boolean(document?.querySelector(`${TABLE} ${BLOCK}`)),
      semesterSelectors: Boolean(capture?.semesterSource && "xnm" in capture.semesterSource && "xqm" in capture.semesterSource) || Boolean(document?.querySelector("#xnm") && document?.querySelector("#xqm")),
      cellSignature: Boolean(document?.querySelector(`${TABLE} td[id] ${BLOCK}`)),
      iconSignature: Boolean(document?.querySelector(`${TABLE} .glyphicon-time`)),
      origin: capture?.sourceOrigin || capture?.origin || null
    });
  };
  const detect = input => {
    const signals = input?.tableSignature === undefined ? captureSignals(input) : input;
    const evidenceCodes = [];
    let confidence = 0;
    if (signals.tableSignature) { confidence += 40; evidenceCodes.push("ZF9_TABLE_KBGRID"); }
    if (signals.blockSignature) { confidence += 25; evidenceCodes.push("ZF9_TIMETABLE_BLOCKS"); }
    if (signals.semesterSelectors) { confidence += 15; evidenceCodes.push("ZF9_SEMESTER_SELECTORS"); }
    if (signals.cellSignature) { confidence += 10; evidenceCodes.push("ZF9_CELL_ID_LAYOUT"); }
    if (signals.iconSignature) { confidence += 5; evidenceCodes.push("ZF9_GLYPHICON_FIELDS"); }
    const outcome = confidence >= 85 && signals.tableSignature && signals.blockSignature && signals.semesterSelectors ? "MATCH" : confidence >= 40 ? "LOW_CONFIDENCE" : "UNSUPPORTED";
    return Object.freeze({outcome, family: FAMILY, version: VERSION, confidence, adapterId: ID, evidenceCodes, schoolProfileCandidates: []});
  };
  const parseWeeks = expression => {
    const normalized = compact(expression).replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/\s+/g, "").replace(/[，、；;]/g, ",");
    if (!normalized) fail("PARSER_FAILED");
    const weeks = [];
    for (const token of normalized.split(",").filter(Boolean)) {
      const match = token.match(/^(\d+)(?:[-—–~至](\d+))?周?(?:\((单|双)\))?$/);
      if (!match) fail("PARSER_FAILED");
      const start = Number(match[1]), end = Number(match[2] || match[1]), parity = match[3] || "";
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > 60) fail("PARSER_FAILED");
      for (let week = start; week <= end; week += 1) {
        if (parity === "单" && week % 2 === 0) continue;
        if (parity === "双" && week % 2 !== 0) continue;
        weeks.push(week);
      }
    }
    const result = [...new Set(weeks)].sort((a, b) => a - b);
    if (!result.length) fail("PARSER_FAILED");
    return result;
  };
  const iconText = (block, selector) => {
    const icon = block.querySelector(selector), container = icon && (icon.closest("p") || icon.parentElement);
    return compact(container ? container.textContent : "") || null;
  };
  const extractSemester = (capture, profile) => {
    const year = compact(capture?.semesterSource?.xnm), sourceTerm = compact(capture?.semesterSource?.xqm);
    const academicYear = /^\d{4}$/.test(year) ? `${year}-${Number(year) + 1}` : year;
    const termCode = profile?.semesterMapping?.termCodes?.[sourceTerm] || sourceTerm;
    if (!/^\d{4}-\d{4}$/.test(academicYear) || !termCode) fail("SOURCE_VALIDATION_FAILED");
    return Object.freeze({academicYear, termCode, sourceCodes: Object.freeze({xnm: year, xqm: sourceTerm})});
  };
  const validateSource = capture => {
    try {
      parseDocument(capture?.tableHtml);
      const detection = detect(captureSignals(capture));
      return Object.freeze({ok: detection.outcome === "MATCH", code: detection.outcome === "MATCH" ? "SOURCE_VALID" : detection.outcome === "LOW_CONFIDENCE" ? "LOW_CONFIDENCE_SYSTEM" : "UNSUPPORTED_SYSTEM", detection});
    } catch (_) { return Object.freeze({ok: false, code: "SOURCE_VALIDATION_FAILED", detection: null}); }
  };
  const parse = (capture, profile) => {
    if (!profile || profile.adapterId !== ID || profile.adapterVersion !== VERSION) fail("UNSUPPORTED_ADAPTER_VERSION");
    if (!capture || capture.captureVersion !== 1) fail("UNSUPPORTED_CAPTURE_VERSION");
    const validation = validateSource(capture);
    if (!validation.ok) fail(validation.code);
    const document = parseDocument(capture.tableHtml), table = document.querySelector(TABLE);
    const allBlocks = [...table.querySelectorAll(BLOCK)], meetings = [];
    let inheritedTitles = 0, adjustedBlocks = 0, blockIndex = 0;
    for (const cell of table.querySelectorAll("td[id]")) {
      let previousTitle = null;
      for (const block of cell.querySelectorAll(BLOCK)) {
        const titleNode = block.querySelector(".title"), rawTitle = compact(titleNode?.textContent);
        let courseName = rawTitle ? rawTitle.replace(/【调】/g, "").replace(/[*&\s]+$/g, "").trim() : "";
        if (courseName) previousTitle = courseName;
        else if (previousTitle) { courseName = previousTitle; inheritedTitles += 1; }
        else fail("PARSER_FAILED");
        const cellMatch = String(cell.id || "").match(/^(\d+)-(\d+)$/), weekday = cellMatch ? Number(cellMatch[1]) : NaN;
        if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) fail("PARSER_FAILED");
        const timeText = iconText(block, ".glyphicon-time") || "", periodMatch = timeText.match(/[（(]\s*(\d+)\s*[-—–~至]\s*(\d+)\s*节\s*[）)]/);
        if (!periodMatch) fail("PARSER_FAILED");
        const startPeriod = Number(periodMatch[1]), endPeriod = Number(periodMatch[2]);
        const weekExpressionRaw = timeText.replace(/[（(]\s*\d+\s*[-—–~至]\s*\d+\s*节\s*[）)]/, "").replace(/^[^0-9]+/, "").trim();
        const isAdjusted = /【调】/.test(rawTitle) || Boolean(titleNode?.matches(".showJxbtkjl"));
        if (isAdjusted) adjustedBlocks += 1;
        meetings.push({courseName, weekday, startPeriod, endPeriod, weeks: parseWeeks(weekExpressionRaw), weekExpressionRaw, teacher: iconText(block, ".glyphicon-user"), locationRaw: iconText(block, ".glyphicon-map-marker"), classInfo: iconText(block, ".glyphicon-home"), metadata: iconText(block, ".glyphicon-tower"), isAdjusted, teachingClassId: titleNode?.getAttribute("data-jxb_id") || null, source: {cellId: cell.id, blockIndex}, warnings: []});
        blockIndex += 1;
      }
    }
    if (meetings.length !== allBlocks.length) fail("PARSER_FAILED");
    return Object.freeze({meetings, diagnostics: Object.freeze({adapterId: ID, adapterVersion: VERSION, profileId: profile.id, profileVersion: profile.profileVersion, parseCount: meetings.length, inheritedTitles, adjustedBlocks})});
  };
  const normalizeCompatibilityDataset = (dataset, profile) => {
    if (!dataset || dataset.schemaVersion !== 1 || !dataset.semester || !Array.isArray(dataset.meetings)) fail("PARSER_FAILED");
    if (!profile || dataset.school?.id !== profile.id) fail("UNSUPPORTED_SYSTEM");
    return Object.freeze({source: Object.freeze({systemFamily: FAMILY, adapterId: ID, adapterVersion: VERSION, schoolId: profile.id, profileVersion: profile.profileVersion}), semester: Object.freeze({academicYear: String(dataset.semester.academicYear), termCode: String(dataset.semester.term)}), meetings: dataset.meetings});
  };
  const adapter = Object.freeze({id: ID, family: FAMILY, version: VERSION, integrity: "bundled", captureRequirements: Object.freeze({captureVersion: 1, required: Object.freeze(["tableHtml", "semesterSource.xnm", "semesterSource.xqm"])}), compatibility: Object.freeze({captureVersions: Object.freeze([1])}), captureSignals, detect, extractSemester, normalizeCompatibilityDataset, parse, parseWeeks, validateSource});
  root.AnyClassZhengFangV9Adapter = adapter;
  if (typeof module === "object" && module.exports) module.exports = adapter;
})(typeof globalThis !== "undefined" ? globalThis : this);
