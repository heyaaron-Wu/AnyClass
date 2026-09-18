(() => {
  "use strict";

  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const $ = id => document.getElementById(id);
  const input = $("fileInput");
  const message = $("message");
  const preview = $("preview");
  const save = $("save");
  let pending = null;

  const setMessage = (text, kind = "muted") => {
    message.textContent = text;
    message.className = kind;
    if (window.HeyAaronShell) {
      if (kind === "error") HeyAaronShell.setImportError(text);
      else HeyAaronShell.setImportError(false);
    }
  };

  const resetPreview = () => {
    pending = null;
    preview.hidden = true;
    $("rows").replaceChildren();
  };

  const renderPreview = dataset => {
    $("school").textContent = dataset.school.name;
    $("semester").textContent = `${dataset.semester.academicYear} 第${dataset.semester.term}学期`;
    $("meetingCount").textContent = dataset.meetings.length;
    $("courseCount").textContent = new Set(dataset.meetings.map(meeting => meeting.courseName)).size;
    const fragment = document.createDocumentFragment();
    for (const meeting of dataset.meetings.slice(0, 50)) {
      const row = document.createElement("tr");
      const values = [
        meeting.courseName,
        `周${meeting.weekday} / ${meeting.startPeriod}-${meeting.endPeriod}节`,
        meeting.locationRaw || "—"
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      }
      fragment.appendChild(row);
    }
    $("rows").replaceChildren(fragment);
    $("previewLimit").hidden = dataset.meetings.length <= 50;
    preview.hidden = false;
  };

  input.addEventListener("change", async () => {
    resetPreview();
    const file = input.files && input.files[0];
    if (!file) {
      setMessage("尚未选择文件");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".json")) {
      setMessage("请选择扩展名为 .json 的课表文件", "error");
      return;
    }
    if (!file.size) {
      setMessage("文件为空", "error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMessage("文件超过 5 MB 限制", "error");
      return;
    }
    try {
      const dataset = HeyAaronTimetableFile.parseText(await file.text());
      dataset.fingerprint = await HeyAaronTimetableFile.fingerprint(dataset);
      pending = dataset;
      renderPreview(dataset);
      setMessage("文件校验通过，请确认预览后保存。", "ok");
    } catch (error) {
      setMessage(`文件校验失败：${error.message || "未知错误"}`, "error");
    }
  });

  save.addEventListener("click", async () => {
    if (!pending) return;
    save.disabled = true;
    if (window.HeyAaronShell) HeyAaronShell.setStorageError(false);
    try {
      const dataset = {...pending, importedAt: new Date().toISOString()};
      await HeyAaronTimetableFileStorage.putDataset(dataset);
      const stored = await HeyAaronTimetableFileStorage.getDataset(dataset.key);
      const keyCount = await HeyAaronTimetableFileStorage.countKey(dataset.key);
      if (!stored || stored.fingerprint !== dataset.fingerprint || keyCount !== 1) {
        throw new Error("SAVE_VERIFICATION_FAILED");
      }
      pending = dataset;
      dispatchEvent(new CustomEvent("heyaaron:timetable-updated", {detail: {source: "file"}}));
      setMessage(`已保存到此设备：${dataset.meetings.length} 个课程安排。同一学期再次导入会原子替换，不会追加重复记录。`, "ok");
    } catch (_error) {
      setMessage("保存失败，原有课表未被修改。", "error");
      if (window.HeyAaronShell) {
        HeyAaronShell.setImportError(false);
        HeyAaronShell.setStorageError("无法写入本机课程数据。");
      }
    } finally {
      save.disabled = false;
    }
  });

  $("cancel").addEventListener("click", () => {
    resetPreview();
    input.value = "";
    setMessage("已取消，本次文件未保存。", "muted");
  });
})();
