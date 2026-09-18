(() => {
  "use strict";

  const STATES = Object.freeze({
    APP_READY: "APP_READY",
    NO_TIMETABLE: "NO_TIMETABLE",
    OFFLINE: "OFFLINE",
    RESOURCE_ERROR: "RESOURCE_ERROR",
    IMPORT_ERROR: "IMPORT_ERROR",
    STORAGE_ERROR: "STORAGE_ERROR"
  });
  const flags = {hasTimetable: undefined, resourceError: null, importError: null, storageError: null};
  const stateListeners = new Set();
  const DISPLAY_NAME_KEY = "anyclass.displayName";
  const BRAND_LABEL_KEY = "anyclass.brandLabel";
  const DISPLAY_NAME_VERSION_KEY = "anyclass.preferenceVersion";
  const DISPLAY_NAME_VERSION = "1";
  const LEGACY_NAME_KEY = "heyaaron.timetable.displayName";
  const DEFAULT_DISPLAY_NAME = "AnyClass";
  const ALLOWED_BRANDS = new Set(["AnyClass", "有课吗"]);
  const LEGACY_DEFAULTS = new Set(["", "课程表", "HeyAaron", "AnyClass", "有课吗"]);
  const normalizeDisplayName = value => {
    const name = String(value || "").trim().slice(0, 20);
    return LEGACY_DEFAULTS.has(name) ? null : name;
  };
  const migrateDisplayName = () => {
    try {
      if (localStorage.getItem(DISPLAY_NAME_VERSION_KEY) === DISPLAY_NAME_VERSION) return;
      const current = normalizeDisplayName(localStorage.getItem(DISPLAY_NAME_KEY));
      const legacy = normalizeDisplayName(localStorage.getItem(LEGACY_NAME_KEY));
      const selected = current || legacy;
      if (selected) localStorage.setItem(DISPLAY_NAME_KEY, selected);
      else localStorage.removeItem(DISPLAY_NAME_KEY);
      if (!localStorage.getItem(BRAND_LABEL_KEY)) localStorage.setItem(BRAND_LABEL_KEY, DEFAULT_DISPLAY_NAME);
      localStorage.setItem(DISPLAY_NAME_VERSION_KEY, DISPLAY_NAME_VERSION);
    } catch (_error) {}
  };
  const getDisplayName = () => {
    migrateDisplayName();
    try { return normalizeDisplayName(localStorage.getItem(DISPLAY_NAME_KEY)); }
    catch (_error) { return null; }
  };
  const getBrandLabel = () => {
    migrateDisplayName();
    try {
      const value = String(localStorage.getItem(BRAND_LABEL_KEY) || "").trim();
      return ALLOWED_BRANDS.has(value) ? value : DEFAULT_DISPLAY_NAME;
    } catch (_error) { return DEFAULT_DISPLAY_NAME; }
  };
  const applyDisplayName = () => {
    const name = getDisplayName();
    const brand = getBrandLabel();
    const label = name ? `${name} · ${brand}` : brand;
    for (const node of document.querySelectorAll("[data-timetable-brand]")) node.textContent = label;
    return name;
  };
  const isOffline = () => navigator.onLine === false;
  const computeState = () => {
    if (flags.resourceError) return STATES.RESOURCE_ERROR;
    if (flags.storageError) return STATES.STORAGE_ERROR;
    if (flags.importError) return STATES.IMPORT_ERROR;
    if (flags.hasTimetable === false) return STATES.NO_TIMETABLE;
    if (isOffline()) return STATES.OFFLINE;
    return STATES.APP_READY;
  };
  const snapshot = () => Object.freeze({
    state: computeState(), online: !isOffline(), hasTimetable: flags.hasTimetable,
    resourceError: flags.resourceError, importError: flags.importError, storageError: flags.storageError
  });
  const updateOfflineCopy = () => {
    const offline = isOffline();
    document.documentElement.dataset.connectivity = offline ? STATES.OFFLINE : "ONLINE";
    for (const node of document.querySelectorAll("[data-offline-empty]")) node.hidden = !(offline && flags.hasTimetable === false);
    for (const node of document.querySelectorAll("[data-online-empty]")) node.hidden = offline && flags.hasTimetable === false;
    const banner = document.querySelector('.shell-network[data-state="OFFLINE"]');
    if (banner) banner.textContent = flags.hasTimetable === false
      ? "当前设备还没有课程表。联网后可进行首次导入。"
      : "当前离线，本地课程仍可查看。";
  };
  const updateFailureSurface = () => {
    const surface = document.querySelector(".shell-runtime-failure");
    if (!surface) return;
    surface.hidden = !flags.resourceError;
    if (flags.resourceError) surface.querySelector("[data-runtime-reason]").textContent = flags.resourceError;
  };
  const publishState = () => {
    const current = snapshot();
    document.documentElement.dataset.appState = current.state;
    updateOfflineCopy();
    updateFailureSurface();
    for (const listener of stateListeners) listener(current);
    document.dispatchEvent(new CustomEvent("heyaaron:app-state", {detail: current}));
    return current;
  };
  const reason = (value, fallback) => typeof value === "string" && value.trim() ? value.trim() : fallback;

  const shellApi = Object.freeze({
    states: STATES,
    getState: computeState,
    getSnapshot: snapshot,
    setDataState(value) {
      flags.hasTimetable = typeof value === "boolean" ? value : undefined;
      return publishState();
    },
    setResourceError(value = "关键页面资源未能加载。") {
      flags.resourceError = value === false ? null : reason(value, "关键页面资源未能加载。");
      return publishState();
    },
    setImportError(value = "导入内容未能通过校验。") {
      flags.importError = value === false ? null : reason(value, "导入内容未能通过校验。");
      return publishState();
    },
    setStorageError(value = "无法读取本机课程数据。") {
      flags.storageError = value === false ? null : reason(value, "无法读取本机课程数据。");
      return publishState();
    },
    clearError(state) {
      if (!state || state === STATES.RESOURCE_ERROR) flags.resourceError = null;
      if (!state || state === STATES.IMPORT_ERROR) flags.importError = null;
      if (!state || state === STATES.STORAGE_ERROR) flags.storageError = null;
      return publishState();
    },
    retryResource() { location.reload(); },
    retryImport() { location.assign("/import/"); },
    getDisplayName,
    getBrandLabel,
    setDisplayName(value) {
      const name = normalizeDisplayName(value);
      try {
        if (!name) localStorage.removeItem(DISPLAY_NAME_KEY);
        else localStorage.setItem(DISPLAY_NAME_KEY, name);
        if (!ALLOWED_BRANDS.has(String(localStorage.getItem(BRAND_LABEL_KEY) || "").trim())) {
          localStorage.setItem(BRAND_LABEL_KEY, DEFAULT_DISPLAY_NAME);
        }
        localStorage.setItem(DISPLAY_NAME_VERSION_KEY, DISPLAY_NAME_VERSION);
      } catch (_error) {}
      applyDisplayName();
      dispatchEvent(new CustomEvent("anyclass:display-name", {detail: {name}}));
      return name || DEFAULT_DISPLAY_NAME;
    },
    setBrandLabel(value) {
      const brand = ALLOWED_BRANDS.has(String(value || "").trim()) ? String(value).trim() : DEFAULT_DISPLAY_NAME;
      try {
        localStorage.setItem(BRAND_LABEL_KEY, brand);
        localStorage.setItem(DISPLAY_NAME_VERSION_KEY, DISPLAY_NAME_VERSION);
      } catch (_error) {}
      applyDisplayName();
      dispatchEvent(new CustomEvent("anyclass:brand-label", {detail: {brand}}));
      return brand;
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      stateListeners.add(listener);
      listener(snapshot());
      return () => stateListeners.delete(listener);
    }
  });
  window.AnyClassShell = shellApi;
  window.HeyAaronShell = shellApi;

  addEventListener("online", publishState);
  addEventListener("offline", publishState);
  addEventListener("error", event => {
    const target = event.target;
    if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
      flags.resourceError = `${target.src || target.href || "关键静态资源"} 加载失败。`;
      publishState();
    }
  }, true);

  const mount = () => {
    const page = document.body.dataset.shellPage || "";
    if (window.parent !== window && page === "import") {
      document.body.removeAttribute("data-shell-page");
      return;
    }
    const active = page === "today" ? "today" : page === "timetable" ? "timetable" : page.startsWith("import") ? "import" : "";
    const header = document.createElement("header");
    header.className = "shell-header";
    header.innerHTML = `<a class="shell-brand" data-timetable-brand href="/"></a><a class="shell-more-link" href="/settings/">更多</a>`;
    const offline = document.createElement("p");
    offline.className = "shell-network";
    offline.dataset.state = STATES.OFFLINE;
    offline.setAttribute("role", "status");
    const failure = document.createElement("section");
    failure.className = "shell-runtime-failure";
    failure.hidden = true;
    failure.setAttribute("role", "alert");
    failure.innerHTML = `<div class="glass-surface"><h1>页面加载失败</h1><p data-runtime-reason>关键页面资源未能加载。</p><button type="button" data-resource-retry>重新加载</button></div>`;
    failure.querySelector("[data-resource-retry]").addEventListener("click", () => location.reload());
    const dock = document.createElement("nav");
    dock.className = "shell-bottom-nav glass-dock";
    dock.setAttribute("aria-label", "主要导航");
    const icons = {
      today: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9.5 20v-6h5v6"/></svg>',
      timetable: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 17.5h2M14 17.5h2"/></svg>',
      import: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17v3h16v-3"/></svg>'
    };
    const activeIndex = {today: 0, timetable: 1, import: 2}[active] ?? 0;
    dock.style.setProperty("--active-index", String(activeIndex));
    dock.innerHTML = [["today", "/", "今天"], ["timetable", "/timetable/", "课表"], ["import", "/import/", "导入"]]
      .map(([key, href, label]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ""}><span class="shell-dock-icon" aria-hidden="true">${icons[key]}</span><span class="shell-dock-label">${label}</span></a>`).join("");
    document.body.prepend(failure);
    document.body.prepend(offline);
    document.body.prepend(header);
    document.body.append(dock);
    const main = document.querySelector("main");
    if (main) main.classList.add("shell-page-enter");
    applyDisplayName();
    for (const surface of document.querySelectorAll(".panel,.card")) surface.classList.add("glass-surface");
    const sheet = document.querySelector("dialog .dialog-body");
    if (sheet) sheet.classList.add("glass-sheet");
    let dockLayoutFrame = 0;
    const updateDockLayout = () => {
      dockLayoutFrame = 0;
      const viewport = window.visualViewport;
      const viewportBottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
      const dockTop = dock.getBoundingClientRect().top;
      const clearance = Math.max(0, viewportBottom - dockTop) + 22;
      document.documentElement.style.setProperty("--app-dock-clearance", `${Math.ceil(clearance)}px`);
      dock.dataset.keyboard = viewport && viewport.height < innerHeight * .72 ? "true" : "false";
    };
    const scheduleDockLayout = () => {
      if (!dockLayoutFrame) dockLayoutFrame = requestAnimationFrame(updateDockLayout);
    };
    addEventListener("resize", scheduleDockLayout, {passive: true});
    if (window.visualViewport) {
      visualViewport.addEventListener("resize", scheduleDockLayout, {passive: true});
      visualViewport.addEventListener("scroll", scheduleDockLayout, {passive: true});
    }
    scheduleDockLayout();
    publishState();
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount, {once: true});
  else mount();
  addEventListener("storage", event => { if (event.key === DISPLAY_NAME_KEY) applyDisplayName(); });
  publishState();
})();
