(function (root) {
  "use strict";
  // Scheduling context is independent of course-source integration: import course data first,
  // keep common time setup short, and expose exact per-period timing only when requested.
  const valid = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
  const minutes = value => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
  const clock = value => `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`;
  const maxPeriod = rows => Math.max(1,...rows.map(row => Number(row.endPeriod) || 0));
  const complete = (times, highest) => Array.from({length:highest},(_,index)=>times?.[index+1]).every(row => valid(row?.start) && valid(row?.end) && row.start < row.end);
  const editor = (container, highest, initial = {}, options = {}) => {
    if (!container || !Number.isInteger(highest) || highest < 1) throw Error("SCHEDULE_EDITOR_CONTEXT_INVALID");
    container.replaceChildren();
    const mode = document.createElement("label");
    mode.className = "schedule-equal-toggle";
    const toggle = document.createElement("input"); toggle.type = "checkbox";
    mode.append(toggle, document.createTextNode("每节课时长相同"));
    const durationLabel = document.createElement("label"); durationLabel.className = "schedule-duration";
    durationLabel.textContent = "每节课时长（分钟）";
    const duration = document.createElement("input"); duration.type = "number"; duration.min = "1"; duration.max = "300";
    const existingDurations = Object.values(initial).filter(row=>valid(row?.start)&&valid(row?.end)).map(row=>minutes(row.end)-minutes(row.start));
    toggle.checked = !existingDurations.length || existingDurations.every(value=>value===existingDurations[0]);
    duration.value = String(toggle.checked && existingDurations.length ? existingDurations[0] : 45);
    durationLabel.append(duration);
    const list = document.createElement("div"); list.className = "schedule-time-list";
    const rows = [];
    const addRow = period => {
      const row = document.createElement("div"); row.className = "schedule-time-row period-setting-row";
      const title = document.createElement("strong"); title.textContent = `第 ${period} 节`;
      const startLabel = document.createElement("label"); startLabel.append(document.createElement("span")); startLabel.firstChild.textContent = "开始";
      const start = document.createElement("input"); start.type = "time"; start.value = initial[period]?.start || ""; startLabel.append(start);
      const endLabel = document.createElement("label"); endLabel.append(document.createElement("span")); endLabel.firstChild.textContent = "结束";
      const end = document.createElement("input"); end.type = "time"; end.value = initial[period]?.end || ""; endLabel.append(end);
      const entry = {period,start,end,manualEnd:end.value};
      end.addEventListener("input",()=>{if(!toggle.checked)entry.manualEnd=end.value;});
      row.append(title,startLabel,endLabel); list.append(row);
      rows.push(entry);
    };
    for (let period = 1; period <= highest; period++) addRow(period);
    const update = () => {
      const equal = toggle.checked, count = Number(duration.value);
      durationLabel.hidden = !equal;
      for (const row of rows) {
        row.end.readOnly = equal;
        row.end.setAttribute("aria-readonly",String(equal));
        row.end.title = equal ? "根据开始时间和每节课时长自动计算" : "";
        if (equal) row.end.value = valid(row.start.value) && Number.isInteger(count) && count > 0 && minutes(row.start.value)+count < 1440 ? clock(minutes(row.start.value)+count) : "";
        else row.end.value = row.manualEnd;
      }
    };
    toggle.addEventListener("change",update); duration.addEventListener("input",update);
    list.addEventListener("input",event=>{if(event.target !== event.target.closest(".schedule-time-row")?.querySelector("input[readonly]"))update();});
    container.append(mode,durationLabel,list);
    if (options.allowExpand) {
      const add = document.createElement("button");add.type="button";add.className="button";add.textContent="＋ 增加节次";
      add.addEventListener("click",()=>{addRow(rows.length+1);update();});container.append(add);
    }
    update();
    const read = () => {
      const result = {}, equal = toggle.checked, count = Number(duration.value);
      if (equal && (!Number.isInteger(count) || count < 1 || count > 300)) throw Error("SCHEDULE_DURATION_INVALID");
      let priorEnd = -1;
      for (const row of rows) {
        const start = row.start.value, end = equal && valid(start) && minutes(start)+count < 1440 ? clock(minutes(start)+count) : row.end.value;
        if (!start && (!end || equal)) continue;
        if (!valid(start) || !valid(end) || minutes(end) <= minutes(start) || minutes(start) < priorEnd) throw Error("SCHEDULE_TIME_INVALID");
        result[row.period] = {start,end}; priorEnd = minutes(end);
      }
      return result;
    };
    return Object.freeze({read,update,addPeriod:()=>{addRow(rows.length+1);update();},element:container});
  };
  const api = Object.freeze({valid,maxPeriod,complete,editor});
  root.AnyClassScheduleTimes = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
