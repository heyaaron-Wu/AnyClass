(() => {
  "use strict";
  const BUILD_ID = "v2f3.1-20260914";
  window.__HEYARON_TODAY_BUILD__ = BUILD_ID;
  document.documentElement.dataset.todayBuild = BUILD_ID;
  console.info(`[AnyClass] Today build: ${BUILD_ID}`);
  const $ = id => document.getElementById(id);
  const config = AnyClassSchoolProfileRegistry.getActive();
  let dataset = null;
  let renderTimer = null;
  let refreshPending = false;

  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  };

  const addDetail = (container, label, value) => {
    if (!value) return;
    const row = el("div", "hero-detail");
    row.append(el("span", "detail-label", label), el("span", null, value));
    container.append(row);
  };

  const adjustedName = meeting => {
    const line = el("div", "course-name", meeting.courseName || "未命名课程");
    if (meeting.isAdjusted) line.append(el("span", "pill", "调"));
    return line;
  };

  const courseRow = item => {
    const row = el("article", `course-row ${item.status}${item.meeting.isAdjusted ? " adjusted" : ""}`);
    const time = el("time", "course-time", item.startText);
    time.dateTime = `${item.dateKey}T${item.startText}`;
    const info = el("div", "course-info");
    info.append(adjustedName(item.meeting));
    const line = el("div", "course-meta", item.periodLabel);
    if (item.location) line.append(document.createTextNode(` · ${item.location}`));
    info.append(line);
    const badge = el("span", `status-chip ${item.status}`, item.status === "completed" ? "已完成" : item.status === "current" ? "进行中" : "未开始");
    row.append(time, info, badge);
    return row;
  };

  const renderTodayList = model => {
    $("todayList").replaceChildren(...model.today.map(courseRow));
  };

  const renderHero = model => {
    const card = $("heroCard");
    card.dataset.state = model.heroState;
    $("heroContent").replaceChildren();
    $("heroConflict").hidden = model.currentCount < 2;
    const content = $("heroContent");

    if (model.heroState === "IN_CLASS" || model.heroState === "NEXT_CLASS") {
      const item = model.heroItem;
      $("heroKicker").textContent = model.heroState === "IN_CLASS" ? "正在上课" : "下一节课";
      content.append(adjustedName(item.meeting));
      const details = el("div", "hero-details");
      addDetail(details, model.heroState === "IN_CLASS" ? "时间" : "开始", model.heroState === "IN_CLASS" ? `${item.startText}–${item.endText}` : item.startText);
      addDetail(details, "地点", item.location);
      addDetail(details, "教师", item.meeting.teacher);
      content.append(details);
      content.append(el("div", "hero-countdown", model.heroState === "IN_CLASS"
        ? `还有 ${TimetableCore.durationText(model.countdownMinutes)}结束`
        : `还有 ${TimetableCore.durationText(model.countdownMinutes)}开始`));
      return;
    }

    $("heroKicker").textContent = "今日状态";
    content.append(el("h1", "no-class-title", model.noClassTitle));
    if (model.futureItem) {
      const item = model.futureItem;
      content.append(el("div", "future-label", "下一节"));
      content.append(adjustedName(item.meeting));
      const details = el("div", "hero-details");
      addDetail(details, "日期", `${item.dateKey} · ${TimetableTodayView.weekdays[item.weekday - 1]}`);
      addDetail(details, "时间", `${item.startText}–${item.endText}`);
      addDetail(details, "地点", item.location);
      content.append(details);
    } else {
      content.append(el("p", "hero-empty", "当前课表中没有未来课程。"));
    }
  };

  const render = () => {
    const model = TimetableTodayView.createTodayModel(dataset, config);
    $("datePrimary").textContent = model.date;
    $("dateWeekday").textContent = model.weekday;
    $("dateWeek").textContent = model.weekLabel;
    renderHero(model);
    $("statTotal").textContent = model.stats.total;
    $("statCompleted").textContent = model.stats.completed;
    $("statRemaining").textContent = model.stats.remaining;
    renderTodayList(model);
    $("todayEmpty").hidden = model.today.length > 0;
  };

  const showEmptyState = () => {
    $("loading").hidden = true;
    $("storageError").hidden = true;
    $("emptyState").hidden = false;
    AnyClassShell.setStorageError(false);
    AnyClassShell.setDataState(false);
  };

  const refreshTimetableData = async (options = {}) => {
    if (refreshPending) return;
    refreshPending = true;
    const initial = !dataset;
    const button = $("refreshTimetable");
    if (button) { button.classList.add("is-refreshing"); button.setAttribute("aria-busy", "true"); }
    $("refreshNotice").hidden = true;
    if (initial) {
      $("loading").hidden = false;
      $("loading").textContent = "正在读取本机课表…";
      $("emptyState").hidden = true;
      $("storageError").hidden = true;
      $("app").hidden = true;
    }
    AnyClassShell.setStorageError(false);
    try {
      const nextDataset = await TimetableStorage.latestDataset(config.id);
      if (!nextDataset || !Array.isArray(nextDataset.meetings) || !nextDataset.meetings.length) {
        dataset = null;
        showEmptyState();
        return;
      }
      dataset = nextDataset;
      AnyClassShell.setDataState(true);
      $("loading").hidden = true;
      $("emptyState").hidden = true;
      $("storageError").hidden = true;
      $("app").hidden = false;
      render();
      if (!renderTimer) renderTimer = setInterval(render, 60000);
    } catch (_error) {
      window.__ANYCLASS_PHASE_B_STORAGE_ERROR__ = {name: _error && _error.name || "Error", message: _error && _error.message || "STORAGE_ERROR", stage: _error && _error.runtimeStage || null};
      if (dataset) {
        $("refreshNotice").textContent = "更新失败，当前仍显示上一次数据";
        $("refreshNotice").hidden = false;
      } else {
        $("loading").hidden = true;
        $("storageError").hidden = false;
        AnyClassShell.setStorageError("无法读取本机课程数据。");
      }
    } finally {
      refreshPending = false;
      if (button) { button.classList.remove("is-refreshing"); button.removeAttribute("aria-busy"); }
    }
  };

  window.refreshTimetableData = refreshTimetableData;
  $("retryStorage").addEventListener("click", refreshTimetableData);
  $("refreshTimetable")?.addEventListener("click", refreshTimetableData);
  addEventListener("anyclass:timetable-updated", refreshTimetableData);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && dataset) refreshTimetableData({silent: true});
  });
  refreshTimetableData();
})();
