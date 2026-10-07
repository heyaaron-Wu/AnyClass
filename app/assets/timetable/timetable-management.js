(function () {
  "use strict";
  const repo = globalThis.AnyClassTimetableRepository;
  const $ = id => document.getElementById(id);
  let deletingId = null, returnFocus = null, busy = false, switchNoticeTimer = null;
  const clearSwitchNoticeTimer = () => {
    if (switchNoticeTimer !== null) clearTimeout(switchNoticeTimer);
    switchNoticeTimer = null;
  };
  const message = (value, temporary = false) => {
    clearSwitchNoticeTimer();
    const status = $("managerStatus");
    status.textContent = value;
    status.classList.remove("is-expired");
    if (temporary) switchNoticeTimer = setTimeout(() => {
      status.classList.add("is-expired");
      switchNoticeTimer = null;
    }, 3000);
  };
  const button = (label, action, className = "button") => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = className;
    node.textContent = label;
    node.addEventListener("click", action);
    return node;
  };
  const completeOnboarding = () => { try { localStorage.setItem("anyclass.onboardingCompleted", "1"); } catch (_) {} };
  const closeDialog = dialog => globalThis.AnyClassMotion?.closeDialog ? globalThis.AnyClassMotion.closeDialog(dialog) : Promise.resolve((dialog.close(), true));
  const notify = () => AnyClassShell.dispatchTimetableUpdated({reason:"timetable-management"});
  const restoreFocus = () => { if (returnFocus?.isConnected) returnFocus.focus(); else $("createTimetable").focus(); };
  async function render() {
    const [tables, active] = await Promise.all([repo.listTimetables(), repo.getActiveTimetable()]);
    const list = $("timetableList");
    list.replaceChildren();
    $("noTimetables").hidden = tables.length > 0;
    for (const table of tables) {
      const row = document.createElement("article");
      row.className = "timetable-manager-row";
      const identity = document.createElement("div");
      identity.className = "timetable-manager-identity";
      const name = document.createElement("strong");
      name.textContent = table.label;
      const detail = document.createElement("small");
      const selected = table.timetableId === active?.timetableId;
      detail.textContent = selected ? "当前使用" : "未使用";
      identity.append(name, detail);
      const actions = document.createElement("div");
      actions.className = "timetable-manager-actions";
      if (!selected) actions.append(button("切换", async () => {
        try { await repo.setActiveTimetable(table.timetableId); notify(); await render(); message("已切换课表。", true); }
        catch (_) { message("切换失败，请重试。"); }
      }, "button primary"));
      actions.append(button("编辑信息", () => { location.href = `/local-status/?timetableId=${encodeURIComponent(table.timetableId)}&edit=1`; }));
      actions.append(button("删除", event => openDelete(table, event.currentTarget, event.detail === 0), "button timetable-manager-delete"));
      row.append(identity, actions);
      list.append(row);
    }
  }
  function openName(trigger) {
    returnFocus = trigger;
    $("nameDialogTitle").textContent = "新建课表";
    $("timetableName").value = "新课表";
    $("nameError").textContent = "";
    $("nameDialog").showModal();
    $("timetableName").focus();
    $("timetableName").select();
  }
  function openDelete(table, trigger, keyboardOpen = false) {
    deletingId = table.timetableId;
    returnFocus = trigger;
    $("deleteDescription").textContent = `确定删除“${table.label}”吗？`;
    const dialog = $("deleteDialog");
    dialog.showModal();
    if (keyboardOpen) dialog.querySelector("[data-close-dialog]").focus({ preventScroll: true });
    else dialog.focus({ preventScroll: true });
  }
  $("createTimetable").addEventListener("click", event => openName(event.currentTarget));
  for (const dialog of [$("nameDialog"), $("deleteDialog")]) {
    dialog.querySelector("[data-close-dialog]").addEventListener("click", () => { void closeDialog(dialog); });
    dialog.addEventListener("keydown", event => {
      if (event.key !== "Tab" || !dialog.open) return;
      const focusable = [...dialog.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]")].filter(node => node.getClientRects().length);
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0], last = focusable.at(-1), active = document.activeElement;
      if (active === dialog) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    });
    dialog.addEventListener("close", () => { deletingId = null; restoreFocus(); });
  }
  $("nameForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const name = $("timetableName").value.trim();
    if (!name) { $("nameError").textContent = "请输入课表名称。"; return; }
    busy = true;
    try {
      await repo.createTimetable({label:name}); completeOnboarding();
      await closeDialog($("nameDialog"));
      await render();
      notify();
      message("已创建课表。");
    } catch (_) { $("nameError").textContent = "保存失败，请重试。"; }
    finally { busy = false; }
  });
  $("confirmDelete").addEventListener("click", async () => {
    if (busy || !deletingId) return;
    busy = true;
    try {
      await repo.deleteTimetable(deletingId);
      completeOnboarding();
      await closeDialog($("deleteDialog"));
      await render();
      notify();
      message("已删除课表及其本机课程数据。");
    } catch (_) { message("删除失败，课表未被移除。请重试。"); await closeDialog($("deleteDialog")); }
    finally { busy = false; }
  });
  addEventListener("pagehide", clearSwitchNoticeTimer);
  render().catch(() => { message("无法读取本机课表，请稍后重试。"); });
})();
