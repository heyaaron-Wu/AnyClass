/*
 * AnyClass - ZhengFang V9 Safari Shortcut Parser
 * Read-only boundary:
 * - Reads only the current page's timetable DOM and semester selectors.
 * - Does not read cookies, browser storage, credentials, or unrelated page data.
 * - Does not navigate, submit forms, mutate the page, or make network requests.
 * - Returns a JSON-compatible dictionary to Apple Shortcuts via completion().
 */
(() => {
  "use strict";

  const EXPECTED_ORIGIN = "https://jw.example.edu";
  const TABLE_SELECTOR = "table#kbgrid_table_0";
  const BLOCK_SELECTOR = ".timetable_con";
  const MAX_MEETINGS = 2000;
  const MAX_TEXT_LENGTH = 300;

  const finishError = (errorCode, errorMessage) => {
    completion({
      ok: false,
      errorCode,
      errorMessage
    });
  };

  const fail = (code, message) => {
    const error = new Error(message);
    error.code = code;
    throw error;
  };

  const compactText = value => String(value || "").replace(/\s+/g, " ").trim();

  const checkedText = (value, label, required = false) => {
    const text = compactText(value);
    if (required && !text) fail("INVALID_FIELD", `${label}不能为空`);
    if (text.length > MAX_TEXT_LENGTH) fail("INVALID_FIELD", `${label}过长`);
    return text || null;
  };

  const selectedText = element => {
    if (!element) return "";
    const selected = element.options && element.selectedIndex >= 0
      ? element.options[element.selectedIndex]
      : null;
    return compactText(selected ? selected.textContent : "");
  };

  const parseAcademicYear = element => {
    if (!element) fail("SEMESTER_NOT_FOUND", "未找到学年选择器");
    const candidates = [selectedText(element), compactText(element.value)].filter(Boolean);
    for (const candidate of candidates) {
      const range = candidate.match(/(\d{4})\s*[-—–~至]\s*(\d{4})/);
      if (range && Number(range[2]) === Number(range[1]) + 1) {
        return `${range[1]}-${range[2]}`;
      }
    }
    for (const candidate of candidates) {
      const single = candidate.match(/^\s*(\d{4})(?:\s*学年)?\s*$/);
      if (single) {
        const start = Number(single[1]);
        return `${start}-${start + 1}`;
      }
    }
    fail("SEMESTER_PARSE_FAILED", "无法识别当前学年");
  };

  const parseTerm = element => {
    if (!element) fail("SEMESTER_NOT_FOUND", "未找到学期选择器");
    const label = selectedText(element);
    if (/第?\s*(?:1|一)\s*学期|上学期/.test(label)) return "1";
    if (/第?\s*(?:2|二)\s*学期|下学期/.test(label)) return "2";

    const value = compactText(element.value);
    if (value === "3" || value === "1") return "1";
    if (value === "12" || value === "2") return "2";
    fail("SEMESTER_PARSE_FAILED", "无法识别当前学期");
  };

  const parseWeeks = expression => {
    const normalized = compactText(expression)
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/\s+/g, "")
      .replace(/[，、；;]/g, ",");
    if (!normalized) fail("WEEK_PARSE_FAILED", "课程周次为空");

    const weeks = [];
    for (const token of normalized.split(",").filter(Boolean)) {
      const match = token.match(/^(\d+)(?:[-—–~至](\d+))?周?(?:\((单|双)\))?$/);
      if (!match) fail("UNKNOWN_WEEK_TOKEN", "存在无法识别的周次格式");
      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      const parity = match[3] || "";
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > 60) {
        fail("WEEK_PARSE_FAILED", "课程周次范围无效");
      }
      for (let week = start; week <= end; week += 1) {
        if (parity === "单" && week % 2 === 0) continue;
        if (parity === "双" && week % 2 !== 0) continue;
        weeks.push(week);
      }
    }

    const result = [...new Set(weeks)].sort((left, right) => left - right);
    if (!result.length) fail("WEEK_PARSE_FAILED", "课程周次为空");
    return result;
  };

  const textForIcon = (block, selector) => {
    const icon = block.querySelector(selector);
    const container = icon && (icon.closest("p") || icon.parentElement);
    return checkedText(container ? container.textContent : "", selector, false);
  };

  const parseTimetable = table => {
    const allBlocks = [...table.querySelectorAll(BLOCK_SELECTOR)];
    if (!allBlocks.length) fail("EMPTY_TIMETABLE", "当前页面未发现课程安排");
    if (allBlocks.length > MAX_MEETINGS) fail("TOO_MANY_MEETINGS", "课程安排数量超出限制");

    const meetings = [];
    for (const cell of table.querySelectorAll("td[id]")) {
      let previousTitle = null;
      for (const block of cell.querySelectorAll(BLOCK_SELECTOR)) {
        const titleNode = block.querySelector(".title");
        const rawTitle = compactText(titleNode ? titleNode.textContent : "");
        let courseName = rawTitle
          ? rawTitle.replace(/【调】/g, "").replace(/[*&\s]+$/g, "").trim()
          : "";
        if (courseName) {
          previousTitle = courseName;
        } else if (previousTitle) {
          courseName = previousTitle;
        } else {
          fail("MISSING_TITLE", "存在无法识别课程名称的课程块");
        }
        courseName = checkedText(courseName, "课程名称", true);

        const weekdayMatch = String(cell.id || "").match(/^(\d+)-(\d+)$/);
        const weekday = weekdayMatch ? Number(weekdayMatch[1]) : NaN;
        if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
          fail("INVALID_WEEKDAY", "存在无法识别星期的课程块");
        }

        const timeText = textForIcon(block, ".glyphicon-time") || "";
        const periodMatch = timeText.match(/[（(]\s*(\d+)\s*[-—–~至]\s*(\d+)\s*节\s*[）)]/);
        if (!periodMatch) fail("PERIOD_PARSE_FAILED", "存在无法识别节次的课程块");
        const startPeriod = Number(periodMatch[1]);
        const endPeriod = Number(periodMatch[2]);
        if (!Number.isInteger(startPeriod) || !Number.isInteger(endPeriod) || startPeriod < 1 || endPeriod < startPeriod || endPeriod > 30) {
          fail("PERIOD_PARSE_FAILED", "存在无效节次范围");
        }

        const weekExpression = timeText
          .replace(/[（(]\s*\d+\s*[-—–~至]\s*\d+\s*节\s*[）)]/, "")
          .replace(/^[^0-9]+/, "")
          .trim();
        const adjustedByClass = Boolean(titleNode && titleNode.matches(".showJxbtkjl"));

        meetings.push({
          courseName,
          weekday,
          startPeriod,
          endPeriod,
          weeks: parseWeeks(weekExpression),
          teacher: textForIcon(block, ".glyphicon-user"),
          locationRaw: textForIcon(block, ".glyphicon-map-marker"),
          isAdjusted: /【调】/.test(rawTitle) || adjustedByClass
        });
      }
    }

    if (meetings.length !== allBlocks.length) {
      fail("BLOCK_COUNT_MISMATCH", "部分课程块不在可识别的课表单元格中");
    }
    return meetings;
  };

  try {
    if (window.location.origin !== EXPECTED_ORIGIN) {
      fail("UNSUPPORTED_ORIGIN", "请在已配置的教务系统中运行此快捷指令");
    }
    const tables = document.querySelectorAll(TABLE_SELECTOR);
    if (tables.length !== 1) fail("TABLE_NOT_FOUND", "请先打开并完整显示个人课表");

    const academicYear = parseAcademicYear(document.getElementById("xnm"));
    const term = parseTerm(document.getElementById("xqm"));
    const meetings = parseTimetable(tables[0]);
    const dataset = {
      schemaVersion: 1,
      school: {
        id: "school-demo",
        name: "Example University"
      },
      semester: {
        academicYear,
        term
      },
      meetings
    };

    completion({
      ok: true,
      fileName: `timetable-${academicYear}-${term}.json`,
      jsonText: JSON.stringify(dataset, null, 2),
      meetingCount: meetings.length
    });
  } catch (error) {
    finishError(
      error && typeof error.code === "string" ? error.code : "PARSER_FAILED",
      error instanceof Error ? error.message : "课表读取失败"
    );
  }
})();
