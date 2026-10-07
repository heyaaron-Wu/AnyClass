(function () {
  "use strict";
  const host = document.querySelector("[data-timetable-switcher]");
  if (!host) return;
  const repo = globalThis.AnyClassTimetableRepository;
  const select = host.querySelector("select");
  const status = host.querySelector("[data-switch-status]");
  let busy = false;
  let noticeTimer = null;
  const clearNotice = () => {
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = null;
  };
  const showNotice = text => {
    clearNotice();
    status.textContent = text;
    status.classList.add("is-visible");
    noticeTimer = setTimeout(() => {
      status.classList.remove("is-visible");
      noticeTimer = null;
    }, 3000);
  };
  async function refresh() {
    const [tables, active] = await Promise.all([repo.listTimetables(), repo.getActiveTimetable()]);
    select.replaceChildren();
    if (!tables.length) {
      const option = new Option("暂无课表", "");
      select.add(option);
      select.disabled = true;
    } else {
      for (const table of tables) select.add(new Option(table.label, table.timetableId));
      select.value = active?.timetableId || "";
      select.disabled = false;
    }
    host.hidden = tables.length === 0;
  }
  select.addEventListener("change", async () => {
    if (busy) return;
    busy = true;
    select.disabled = true;
    try {
      await repo.setActiveTimetable(select.value);
      showNotice("已切换课表");
      AnyClassShell.dispatchTimetableUpdated({reason:"active-timetable"});
      await refresh();
    } catch (_) {
      showNotice("切换失败，请重试。");
      await refresh().catch(() => {});
    } finally { busy = false; select.disabled = false; }
  });
  addEventListener("anyclass:timetable-updated", () => { if (!busy) refresh().catch(() => { showNotice("无法读取课表列表。"); }); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !busy) refresh().catch(() => { showNotice("无法读取课表列表。"); }); });
  addEventListener("pagehide", clearNotice);
  refresh().catch(() => { showNotice("无法读取课表列表。"); });
})();
