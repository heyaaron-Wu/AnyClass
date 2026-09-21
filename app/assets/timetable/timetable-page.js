(() => {
  "use strict";
  const BUILD_ID = "closure-reopen-20260918";
  window.__ANYCLASS_TIMETABLE_BUILD__ = BUILD_ID;
  document.documentElement.dataset.timetableBuild = BUILD_ID;
  const $ = id => document.getElementById(id);
  const baseConfig = TimetableSchoolConfigs.demo;
  let config = baseConfig;
  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  let dataset = null;
  let selectedWeek = 1;
  let maxWeek = 1;
  let currentState = null;
  let minuteTimer = null;
  let initialScrollPending = true;
  let refreshPending = false;
  let resizeFrame = null;

  const syncVisiblePeriodConfig = weekOccurrences => {
    if (!dataset) return;
    const periodView = AnyClassPeriodPreferences.effective(baseConfig, dataset, {weekOccurrences});
    config = {...baseConfig, periodTimes: periodView.periodTimes};
  };

  const el = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = String(value);
    return node;
  };

  const detailRow = (label, value) => {
    const row = el("div", "dialog-row");
    row.append(el("dt", null, label), el("dd", null, value || "未提供"));
    return row;
  };

  const openCourse = item => {
    const meeting = item.meeting;
    $("dialogTitle").textContent = meeting.courseName || "未命名课程";
    $("dialogAdjusted").hidden = !meeting.isAdjusted;
    $("dialogDetails").replaceChildren(
      detailRow("星期", days[item.weekday - 1]),
      detailRow("节次", TimetableTodayView.periodLabel(meeting)),
      detailRow("时间", `${item.startText}–${item.endText}`),
      detailRow("周次", meeting.weekExpressionRaw || `${meeting.weeks.join(",")}周`),
      detailRow("地点", TimetableTodayView.normalizeDisplayLocation(meeting.locationRaw)),
      detailRow("教师", meeting.teacher)
    );
    const dialog = $("courseDialog");
    delete dialog.dataset.closing;
    dialog.showModal();
    $("closeDialog").focus({preventScroll: true});
  };

  const closeCourse = () => {
    const dialog = $("courseDialog");
    if (!dialog.open || dialog.dataset.closing === "true") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }
    dialog.dataset.closing = "true";
    const body = dialog.querySelector(".dialog-body");
    body.addEventListener("animationend", event => {
      if (event.animationName !== "shell-sheet-exit") return;
      dialog.close();
      delete dialog.dataset.closing;
    }, {once: true});
  };

  const cardContent = (item, isCurrent) => {
    const fragment = document.createDocumentFragment();
    const title = el("strong", null, item.meeting.courseName || "未命名课程");
    if (item.meeting.isAdjusted) title.prepend("调 · ");
    fragment.append(title, el("span", null, `${item.startText}–${item.endText}`), el("span", null, TimetableTodayView.normalizeDisplayLocation(item.meeting.locationRaw) || "地点未提供"));
    if (isCurrent) fragment.append(el("span", "live-label", "进行中"));
    return fragment;
  };

  const courseButton = (item, className, isCurrent) => {
    const button = el("button", className);
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    if (isCurrent) button.setAttribute("aria-label", `${item.meeting.courseName || "未命名课程"}，进行中`);
    button.append(cardContent(item, isCurrent));
    button.addEventListener("click", () => openCourse(item));
    return button;
  };

  const timeMarker = (state, variant) => {
    const marker = el("div", `current-time-indicator ${variant}-time`);
    marker.setAttribute("aria-label", `当前时间 ${state.timeText}`);
    marker.append(el("time", "current-time-text", state.timeText));
    if (variant === "desktop") {
      const track = el("span", "current-time-track");
      track.style.gridColumn = String(state.weekday + 1);
      track.append(el("span", "current-time-dot"), el("span", "current-time-rule"));
      marker.append(track);
    } else {
      marker.append(el("span", "current-time-dot"), el("span", "current-time-rule"));
    }
    return marker;
  };

  const renderGrid = (layout, state, currentMeetings) => {
    const grid = $("weekGrid");
    grid.replaceChildren();
    const periods = Object.keys(config.periodTimes).map(Number).sort((a,b)=>a-b);
    grid.style.setProperty("--visible-period-count", String(periods.length));
    const corner = el("div", "corner", "节次");
    corner.style.gridColumn = "1";
    corner.style.gridRow = "1";
    grid.append(corner);
    days.forEach((name, index) => {
      const head = el("div", `day-head${state.visible && index + 1 === state.weekday ? " today" : ""}`, name);
      head.style.gridColumn = String(index + 2);
      head.style.gridRow = "1";
      grid.append(head);
    });
    for (const period of periods) {
      const time = config.periodTimes[period];
      const label = el("div", "period-label");
      label.append(el("div", null, period));
      label.firstChild.append(el("small", null, time.start));
      label.style.gridColumn = "1";
      label.style.gridRow = String(periods.indexOf(period) + 2);
      grid.append(label);
    }
    for (let day = 1; day <= 7; day += 1) {
      const column = el("div", "day-column");
      column.style.gridColumn = String(day + 1);
      column.style.gridRow = `2 / span ${periods.length}`;
      for (const item of layout.items.filter(entry => entry.weekday === day)) {
        const isCurrent = currentMeetings.has(item.meeting);
        const card = courseButton(item, `course-card${item.meeting.isAdjusted ? " adjusted" : ""}${item.laneCount > 1 ? " conflicting" : ""}${isCurrent ? " current" : ""}`, isCurrent);
        if (item.meeting.startPeriod > periods.at(-1)) continue;
        card.style.gridRow = `${item.meeting.startPeriod} / ${Math.min(item.meeting.endPeriod,periods.at(-1)) + 1}`;
        card.style.width = `calc((100% - ${(item.laneCount - 1) * 4}px) / ${item.laneCount})`;
        card.style.marginLeft = `calc(${item.lane} * ((100% + 4px) / ${item.laneCount}))`;
        column.append(card);
      }
      grid.append(column);
    }
    const markerAllowed = state.visible && state.position &&
      TimetableCurrentTime.isWithinVisibleTimeRange(
        TimetableCurrentTime.schoolClock(new Date(), config.timezone).minutes,
        config.periodTimes
      );
    if (markerAllowed) {
      const marker = timeMarker(state, "desktop");
      marker.style.setProperty("--time-y", `${state.position.y}px`);
      grid.append(marker);
    }
  };

  const renderMobile = (items, state, currentMeetings) => {
    const list = $("mobileWeekList");
    list.replaceChildren();
    const visibleMeetingCount = items.length;
    for (let day = 1; day <= 7; day += 1) {
      const dayItems = items.filter(item => item.weekday === day);
      const isToday = state.visible && day === state.weekday;
      if (!dayItems.length && !isToday) continue;
      const group = el("section", "mobile-day");
      const heading = el("h2", isToday ? "today" : null, days[day - 1]);
      const date = TimetableCore.occurrenceDate(selectedWeek, day, config);
      heading.append(el("span", null, `${date.getMonth() + 1}月${date.getDate()}日`));
      group.append(heading);
      for (const item of dayItems) {
        const isCurrent = currentMeetings.has(item.meeting);
        group.append(courseButton(item, `mobile-course${item.meeting.isAdjusted ? " adjusted" : ""}${isCurrent ? " current" : ""}`, isCurrent));
      }
      list.append(group);
    }
    const empty = $("mobileEmpty");
    empty.hidden = visibleMeetingCount !== 0;
    empty.setAttribute("aria-hidden", visibleMeetingCount === 0 ? "false" : "true");
  };

  const visibleTimeMarker = () => [...document.querySelectorAll(".current-time-indicator")].find(node => node.offsetParent !== null);

  const scrollToCurrent = force => {
    const marker = visibleTimeMarker();
    if (!marker) return;
    const bounds = marker.getBoundingClientRect();
    const outsideComfortZone = bounds.top < 120 || bounds.bottom > window.innerHeight - 120;
    if (!force && !outsideComfortZone) return;
    marker.scrollIntoView({block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  };

  const updateReturnNow = () => {
    if (!currentState) return;
    const available = currentState.currentWeek >= 1 && currentState.currentWeek <= maxWeek;
    $("returnNow").textContent = "回到本周";
    $("returnNow").hidden = !available || selectedWeek === currentState.currentWeek;
  };

  const render = (options = {}) => {
    document.querySelectorAll(".current-time-indicator").forEach(node => node.remove());
    selectedWeek = Math.max(1, Math.min(maxWeek, selectedWeek));
    const fullConfig = {...baseConfig, periodTimes: AnyClassPeriodPreferences.definitions(baseConfig)};
    const raw = TimetableCore.meetingsForWeek(dataset, selectedWeek, fullConfig);
    syncVisiblePeriodConfig(raw);
    const now = new Date();
    currentState = TimetableCurrentTime.stateFor(now, config, selectedWeek, TimetableCore);
    $("weekTitle").textContent = `第 ${selectedWeek} 周`;
    const monday = TimetableCore.occurrenceDate(selectedWeek, 1, config);
    const sunday = TimetableCore.occurrenceDate(selectedWeek, 7, config);
    $("weekRange").textContent = `${TimetableCore.formatDate(monday)} 至 ${TimetableCore.formatDate(sunday)}`;
    $("previous").disabled = selectedWeek <= 1;
    $("next").disabled = selectedWeek >= maxWeek;
    const layout = TimetableCore.layoutWeek(raw);
    const currentMeetings = currentState.visible
      ? new Set(TimetableCore.analyze(dataset, now, config).currentClasses.map(item => item.meeting))
      : new Set();
    $("conflictCount").hidden = !layout.scheduleConflictCount;
    $("conflictCount").textContent = `${layout.scheduleConflictCount} 组冲突`;
    renderGrid(layout, currentState, currentMeetings);
    if (!currentState.visible) document.querySelectorAll(".current-time-indicator").forEach(node => node.remove());
    const visibleEndPeriod = Math.max(...Object.keys(config.periodTimes).map(Number));
    renderMobile(layout.items.filter(item => item.meeting.startPeriod <= visibleEndPeriod), currentState, currentMeetings);
    updateReturnNow();
    if (options.scrollToNow || (initialScrollPending && currentState.visible)) {
      initialScrollPending = false;
      setTimeout(() => {
        scrollToCurrent(Boolean(options.scrollToNow));
        updateReturnNow();
      }, 0);
    }
  };

  $("previous").addEventListener("click", () => { selectedWeek -= 1; render(); });
  $("next").addEventListener("click", () => { selectedWeek += 1; render(); });
  $("returnNow").addEventListener("click", () => {
    const now = new Date();
    selectedWeek = TimetableCore.currentWeek(now, config);
    render();
  });
  $("closeDialog").addEventListener("click", closeCourse);
  $("courseDialog").addEventListener("cancel", event => {
    event.preventDefault();
    closeCourse();
  });
  $("courseDialog").addEventListener("click", event => {
    if (event.target === $("courseDialog")) closeCourse();
  });

  const refreshTimetableData = async () => {
    if (refreshPending) return;
    refreshPending = true;
    const initial = !dataset;
    const previousWeek = selectedWeek;
    const scrollY = window.scrollY;
    const gridScroll = document.querySelector(".grid-scroll");
    const gridScrollLeft = gridScroll ? gridScroll.scrollLeft : 0;
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
    HeyAaronShell.setStorageError(false);
    try {
      const nextDataset = await TimetableStorage.latestDataset("demo");
      $("loading").hidden = true;
      if (nextDataset?.__courseModel && !Array.isArray(nextDataset.__effectiveOccurrences)) throw new Error("SCHEMA3_EFFECTIVE_OCCURRENCES_REQUIRED");
      if (!nextDataset || (!nextDataset.__courseModel && (!Array.isArray(nextDataset.meetings) || !nextDataset.meetings.length))) {
        dataset = null;
        HeyAaronShell.setDataState(false);
        $("emptyState").hidden = false;
        $("app").hidden = true;
        return;
      }
      dataset = nextDataset;
      HeyAaronShell.setDataState(true);
      maxWeek = TimetableCore.maxDatasetWeek(dataset) || 1;
      selectedWeek = initial
        ? Math.max(1, Math.min(maxWeek, TimetableCore.currentWeek(new Date(), config)))
        : Math.max(1, Math.min(maxWeek, previousWeek));
      $("emptyState").hidden = true;
      $("storageError").hidden = true;
      $("app").hidden = false;
      render();
      requestAnimationFrame(() => {
        window.scrollTo({top: scrollY, behavior: "auto"});
        if (gridScroll) gridScroll.scrollLeft = gridScrollLeft;
      });
      if (!minuteTimer) minuteTimer = setInterval(render, 60000);
    } catch (_error) {
      if (dataset) {
        $("refreshNotice").textContent = "更新失败，当前仍显示上一次数据";
        $("refreshNotice").hidden = false;
      } else {
        $("loading").hidden = true;
        $("storageError").hidden = false;
        HeyAaronShell.setStorageError("无法读取本机课程数据。");
      }
    } finally {
      refreshPending = false;
      if (button) { button.classList.remove("is-refreshing"); button.removeAttribute("aria-busy"); }
    }
  };

  window.refreshTimetableData = refreshTimetableData;
  $("retryStorage").addEventListener("click", refreshTimetableData);
  $("refreshTimetable")?.addEventListener("click", refreshTimetableData);
  addEventListener("heyaaron:timetable-updated", refreshTimetableData);
  window.addEventListener("scroll", updateReturnNow, {passive: true});
  window.addEventListener("resize", () => {
    updateReturnNow();
    if (!dataset || resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => { resizeFrame = null; render(); });
  }, {passive: true});
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && dataset) refreshTimetableData();
  });
  addEventListener("storage", event => {
    if (event.key === AnyClassPeriodPreferences.KEY && dataset) render();
  });
  addEventListener("pageshow", () => { if (dataset) render(); });
  addEventListener("focus", () => { if (dataset) render(); });
  addEventListener("anyclass:period-preferences", () => { if (dataset) render(); });
  refreshTimetableData();
})();
