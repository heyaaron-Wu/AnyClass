(() => {
  "use strict";
  const metadata=window.AnyClassReleaseMetadata||Object.freeze({schemaVersion:1,productVersion:"Unknown",releaseId:"Unknown",releaseMode:"unavailable"}),RELEASE_ID=metadata.releaseId;
  window.AnyClassReleaseIdentity = Object.freeze({...metadata,channel:location.hostname.startsWith("beta.")?"beta":location.hostname==="anyclass.heyaaron.asia"?"stable":"local"});
  document.documentElement.dataset.releaseId = RELEASE_ID;

  const reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const syncReducedMotion = () => { document.documentElement.dataset.reducedMotion = reducedMotionQuery.matches ? "reduce" : "no-preference"; };
  syncReducedMotion();
  reducedMotionQuery.addEventListener?.("change", syncReducedMotion);
  const dialogStates = new WeakMap();
  const sheetDismissStates = new WeakMap();
  let sheetScrollLock = null;
  let semanticNavigationRevision = 0;
  const lockSheetBackground = dialog => {
    if (sheetScrollLock?.dialog === dialog) return;
    if (sheetScrollLock) return;
    const body = document.body, root = document.documentElement, x = scrollX, y = scrollY;
    sheetScrollLock = {
      dialog, x, y,
      body: {position:body.style.position, top:body.style.top, left:body.style.left, right:body.style.right, width:body.style.width, overflow:body.style.overflow},
      rootOverflow:root.style.overflow
    };
    root.dataset.sheetScrollLocked = "true";
    root.style.overflow = "hidden";
    Object.assign(body.style,{position:"fixed",top:`-${y}px`,left:"0",right:"0",width:"100%",overflow:"hidden"});
  };
  const unlockSheetBackground = dialog => {
    const state = sheetScrollLock;
    if (!state || state.dialog !== dialog) return;
    sheetScrollLock = null;
    const body = document.body, root = document.documentElement;
    delete root.dataset.sheetScrollLocked;
    root.style.overflow = state.rootOverflow;
    Object.assign(body.style,state.body);
    scrollTo({top:state.y,left:state.x,behavior:"auto"});
  };
  const cancelDialogClose = dialog => {
    const state = dialogStates.get(dialog);
    if (!state) return;
    clearTimeout(state.timer);
    state.body?.removeEventListener("animationend", state.onEnd);
    state.body?.removeEventListener("animationcancel", state.onCancel);
    dialogStates.delete(dialog);
    delete dialog.dataset.closing;
    state.resolve(false);
  };
  const motionApi = Object.freeze({
    prefersReducedMotion: () => reducedMotionQuery.matches,
    cancelNavigation: () => ++semanticNavigationRevision,
    reveal(element) {
      if (!element?.isConnected) return false;
      element.classList.remove("shell-content-refresh");
      void element.offsetWidth;
      element.classList.add("shell-content-refresh");
      return true;
    },
    async navigate(target, options = {}) {
      const revision = ++semanticNavigationRevision;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (revision !== semanticNavigationRevision || options.valid?.() === false || !target?.isConnected || target.hidden) return false;
      for (let details = target.closest?.("details:not([open])"); details; details = target.closest?.("details:not([open])")) details.open = true;
      const offset = options.offset ?? Math.min(180, Math.max(96, Math.round(innerHeight * .18)));
      const top = Math.max(0, scrollY + target.getBoundingClientRect().top - offset);
      if (options.focus !== false) {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({preventScroll:true});
      }
      scrollTo({top, behavior:reducedMotionQuery.matches ? "auto" : "smooth"});
      return true;
    },
    openDialog(dialog, options = {}) {
      if (!(dialog instanceof HTMLDialogElement)) throw new TypeError("dialog required");
      cancelDialogClose(dialog);
      if (!dialog.open) {
        dialog.__anyclassRestoreFocus = options.restoreFocus || document.activeElement;
        dialog.showModal();
      }
      sheetDismissStates.get(dialog)?.opened?.();
      options.focus?.focus?.({preventScroll:true});
      return dialog;
    },
    closeDialog(dialog, options = {}) {
      if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return Promise.resolve(false);
      const pending = dialogStates.get(dialog);
      if (pending) return pending.promise;
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      const body = dialog.querySelector(".dialog-body") || dialog;
      const finish = () => {
        const state = dialogStates.get(dialog);
        if (!state || state.promise !== promise) return;
        clearTimeout(state.timer);
        body.removeEventListener("animationend", state.onEnd);
        body.removeEventListener("animationcancel", state.onCancel);
        dialogStates.delete(dialog);
        delete dialog.dataset.closing;
        sheetDismissStates.get(dialog)?.closed?.();
        if (dialog.open) dialog.close(options.returnValue || "");
        const restore = options.restoreFocus === false ? null : options.restoreFocus || dialog.__anyclassRestoreFocus;
        delete dialog.__anyclassRestoreFocus;
        if (restore?.isConnected) restore.focus({preventScroll:true});
        resolve(true);
      };
      const onEnd = event => { if (event.target === body && (!event.animationName || ["shell-sheet-exit","shell-sheet-drag-exit"].includes(event.animationName))) finish(); };
      const onCancel = event => { if (event.target === body) finish(); };
      const state = {promise, resolve, body, onEnd, onCancel, timer:0};
      dialogStates.set(dialog, state);
      if (reducedMotionQuery.matches) { finish(); return promise; }
      dialog.dataset.closing = "true";
      body.addEventListener("animationend", onEnd);
      body.addEventListener("animationcancel", onCancel);
      state.timer = setTimeout(finish, options.timeout || 320);
      return promise;
    },
    enableSheetDismiss(dialog, options = {}) {
      if (!(dialog instanceof HTMLDialogElement)) throw new TypeError("dialog required");
      if (sheetDismissStates.has(dialog)) return sheetDismissStates.get(dialog).cleanup;
      const handle=options.handle||dialog.querySelector("[data-sheet-grabber]"),body=dialog.querySelector(".dialog-body")||dialog,scrim=dialog.querySelector("[data-course-dialog-scrim]"),scroll=options.scrollContainer||dialog;
      if (!handle) throw new TypeError("sheet handle required");
      const phases=Object.freeze({IDLE:"IDLE",PRESS_PENDING:"PRESS_PENDING",SHEET_DRAG:"SHEET_DRAG",CONTENT_SCROLL:"CONTENT_SCROLL",SNAP_BACK:"SNAP_BACK",DISMISS:"DISMISS"});
      let gesture=null,snapTimer=0,snapFrame=0,snapCleanupFrame=0,entryTimer=0,frame=0,pendingY=0,snapPending=null;
      const setPhase=phase=>{dialog.dataset.sheetGestureState=phase};
      const setProgress=(progress,y)=>{const value=Math.max(0,Math.min(1,progress));if(y!==undefined)dialog.style.setProperty("--sheet-drag-y",`${Math.max(0,y)}px`);dialog.style.setProperty("--sheet-drag-progress",String(value));dialog.style.setProperty("--sheet-scrim-strength",String(1-value))};
      const paint=()=>{frame=0;if(!gesture||gesture.phase!==phases.SHEET_DRAG)return;const y=pendingY;setProgress(y/gesture.height,y)};
      const queuePaint=y=>{pendingY=y;if(!frame)frame=requestAnimationFrame(paint)};
      const clearVisual=()=>{clearTimeout(snapTimer);if(frame)cancelAnimationFrame(frame);if(snapFrame)cancelAnimationFrame(snapFrame);if(snapCleanupFrame)cancelAnimationFrame(snapCleanupFrame);frame=snapFrame=snapCleanupFrame=0;snapPending=null;for(const node of [body,scrim]){node?.removeEventListener("transitionend",onSnapEnd);node?.removeEventListener("transitioncancel",onSnapEnd)}delete dialog.dataset.sheetDragging;delete dialog.dataset.sheetSnapping;delete dialog.dataset.sheetDismissing;for(const property of ["--sheet-drag-y","--sheet-drag-progress","--sheet-scrim-strength"])dialog.style.removeProperty(property);setPhase(phases.IDLE)};
      const finishSnap=()=>{if(!dialog.dataset.sheetSnapping)return;snapPending=null;snapFrame=requestAnimationFrame(()=>{snapFrame=0;snapCleanupFrame=requestAnimationFrame(()=>{snapCleanupFrame=0;dialog.dataset.sheetSettled="true";clearVisual()})})};
      const onSnapEnd=event=>{if(!snapPending)return;if(event.target===body&&event.propertyName==="transform")snapPending.delete("transform");if(event.target===scrim&&event.propertyName==="opacity")snapPending.delete("opacity");if(!snapPending.size)finishSnap()};
      const snap=()=>{gesture=null;setPhase(phases.SNAP_BACK);delete dialog.dataset.sheetDragging;dialog.dataset.sheetSnapping="true";snapPending=new Set(scrim?["transform","opacity"]:["transform"]);for(const node of [body,scrim]){node?.addEventListener("transitionend",onSnapEnd);node?.addEventListener("transitioncancel",onSnapEnd)}setProgress(0,0);if(reducedMotionQuery.matches)finishSnap();else snapTimer=setTimeout(finishSnap,360)};
      const begin=(kind,id,x,y,source,eventTime)=>{if(!dialog.open)return;const interactive=eventTime?.target?.closest?.("button,a,input,select,textarea,label,[contenteditable=true]");const contentEligible=source==="content"&&!interactive&&scroll.scrollTop<=0;gesture={kind,id,source,phase:source==="handle"||contentEligible?phases.PRESS_PENDING:phases.CONTENT_SCROLL,startX:x,startY:y,lastY:y,lastTime:eventTime?.timeStamp||performance.now(),velocity:0,height:0};setPhase(gesture.phase)};
      const moveGesture=(x,y,time,cancelNative)=>{if(!gesture||gesture.phase===phases.CONTENT_SCROLL)return;const dx=x-gesture.startX,dy=y-gesture.startY;if(gesture.phase===phases.PRESS_PENDING){const downwardCandidate=dy>0&&Math.abs(dx)<=Math.max(4,Math.abs(dy)*.8);if(gesture.kind==="touch"&&(gesture.source==="handle"||downwardCandidate))cancelNative();if(Math.abs(dy)<6&&Math.abs(dx)<6)return;if(dy<=0||Math.abs(dx)>Math.abs(dy)*.8){gesture.phase=phases.CONTENT_SCROLL;setPhase(phases.CONTENT_SCROLL);return}gesture.phase=phases.SHEET_DRAG;gesture.height=Math.max(1,body.getBoundingClientRect().height);dialog.dataset.sheetDragging="true";setPhase(phases.SHEET_DRAG)}cancelNative();const elapsed=Math.max(1,time-gesture.lastTime);gesture.velocity=(y-gesture.lastY)/elapsed;gesture.lastY=y;gesture.lastTime=time;queuePaint(Math.max(0,dy))};
      const finishGesture=(y,time)=>{if(!gesture)return;const state=gesture,dragged=state.phase===phases.SHEET_DRAG,displacement=Math.max(0,y-state.startY),releaseVelocity=time-state.lastTime<=80?state.velocity:0,dismiss=dragged&&(displacement>=state.height*.23||releaseVelocity>=.65);gesture=null;if(!dragged){clearVisual();return}if(!dismiss){snap();return}if(frame){cancelAnimationFrame(frame);frame=0}setProgress(displacement/state.height,displacement);setPhase(phases.DISMISS);delete dialog.dataset.sheetDragging;dialog.dataset.sheetDismissing="true";const close=options.close||(()=>motionApi.closeDialog(dialog));const closing=close({reason:"drag",displacement,velocity:releaseVelocity});requestAnimationFrame(()=>{if(dialog.open&&dialog.dataset.sheetDismissing)setProgress(1)});void closing};
      const down=event=>{if(event.pointerType==="touch"||event.button!==0)return;begin("pointer",event.pointerId,event.clientX,event.clientY,"handle",event);try{handle.setPointerCapture?.(event.pointerId)}catch{}}
      const move=event=>{if(!gesture||gesture.kind!=="pointer"||event.pointerId!==gesture.id)return;moveGesture(event.clientX,event.clientY,event.timeStamp,()=>event.preventDefault())};
      const finish=event=>{if(!gesture||gesture.kind!=="pointer"||event.pointerId!==gesture.id)return;try{handle.releasePointerCapture?.(event.pointerId)}catch{}finishGesture(event.clientY,event.timeStamp)};
      const cancelGesture=()=>{if(gesture?.phase===phases.SHEET_DRAG)snap();else{gesture=null;clearVisual()}};
      const cancel=event=>{if(!gesture||gesture.kind!=="pointer"||event.pointerId!==gesture.id)return;cancelGesture()};
      const touchById=(list,id)=>Array.from(list||[]).find(touch=>touch.identifier===id);
      const touchStart=event=>{if(event.touches.length!==1||gesture)return;const touch=event.touches[0],source=event.target.closest?.("[data-sheet-grabber]")?"handle":"content";begin("touch",touch.identifier,touch.clientX,touch.clientY,source,event)};
      const touchMove=event=>{if(!gesture||gesture.kind!=="touch")return;const touch=touchById(event.touches,gesture.id);if(!touch)return;moveGesture(touch.clientX,touch.clientY,event.timeStamp,()=>{if(event.cancelable)event.preventDefault()})};
      const touchEnd=event=>{if(!gesture||gesture.kind!=="touch")return;const touch=touchById(event.changedTouches,gesture.id);if(touch)finishGesture(touch.clientY,event.timeStamp)};
      const touchCancel=()=>{if(gesture?.kind==="touch")cancelGesture()};
      const viewportReset=()=>{if(gesture)snap()};
      const settleEntry=event=>{if(event&&(event.target!==body||event.animationName!=="shell-sheet-enter"))return;clearTimeout(entryTimer);entryTimer=0;if(dialog.open&&!dialog.dataset.closing&&!dialog.dataset.sheetDismissing)dialog.dataset.sheetSettled="true"};
      const opened=()=>{clearTimeout(entryTimer);delete dialog.dataset.sheetSettled;lockSheetBackground(dialog);setPhase(phases.IDLE);if(reducedMotionQuery.matches)settleEntry();else entryTimer=setTimeout(settleEntry,360)};
      const closed=()=>{gesture=null;clearTimeout(entryTimer);entryTimer=0;delete dialog.dataset.sheetSettled;clearVisual();unlockSheetBackground(dialog)};
      const onClose=()=>{if(!dialog.open)closed()};
      handle.addEventListener("pointerdown",down);handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",finish);handle.addEventListener("pointercancel",cancel);body.addEventListener("animationend",settleEntry);dialog.addEventListener("touchstart",touchStart,{passive:true});dialog.addEventListener("touchmove",touchMove,{passive:false});dialog.addEventListener("touchend",touchEnd,{passive:true});dialog.addEventListener("touchcancel",touchCancel,{passive:true});addEventListener("resize",viewportReset,{passive:true});window.visualViewport?.addEventListener("resize",viewportReset,{passive:true});dialog.addEventListener("close",onClose);
      const cleanup=()=>{closed();handle.removeEventListener("pointerdown",down);handle.removeEventListener("pointermove",move);handle.removeEventListener("pointerup",finish);handle.removeEventListener("pointercancel",cancel);body.removeEventListener("animationend",settleEntry);dialog.removeEventListener("touchstart",touchStart);dialog.removeEventListener("touchmove",touchMove);dialog.removeEventListener("touchend",touchEnd);dialog.removeEventListener("touchcancel",touchCancel);removeEventListener("resize",viewportReset);window.visualViewport?.removeEventListener("resize",viewportReset);dialog.removeEventListener("close",onClose);sheetDismissStates.delete(dialog)};
      const state={cleanup,opened,closed};sheetDismissStates.set(dialog,state);if(dialog.open)opened();return cleanup;
    }
  });
  window.AnyClassMotion = motionApi;

  const animateStatus = node => {
    if (!node?.isConnected || node.hidden || !node.textContent.trim()) return;
    node.classList.remove("motion-status-enter");
    void node.offsetWidth;
    node.classList.add("motion-status-enter");
  };
  const observeStatusFeedback = () => {
    for (const node of document.querySelectorAll('[role="status"]')) {
      new MutationObserver(records => {
        const stableValueOnly=records.length&&records.every(record=>{
          const target=record.target.nodeType===Node.TEXT_NODE?record.target.parentElement:record.target;
          return Boolean(target?.closest?.("[data-motion-stable-value]"));
        });
        if(!stableValueOnly)animateStatus(node);
      }).observe(node,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:["hidden"]});
    }
  };

  // Cross-document View Transitions are progressive enhancement; navigation itself stays native.
  addEventListener("pagereveal", event => {
    if (!event.viewTransition) return;
    document.documentElement.dataset.crossPageTransition = "true";
  });

  const NAV_PROGRESS_KEY = "anyclass.navigationProgress";
  const progress = document.createElement("div");
  progress.className = "shell-nav-progress";
  progress.setAttribute("aria-hidden", "true");
  document.documentElement.append(progress);
  let progressTimers = [];
  let progressActive = false;
  const clearProgressTimers = () => { for (const timer of progressTimers) clearTimeout(timer); progressTimers = []; };
  const setProgress = value => progress.style.setProperty("--nav-progress", String(value));
  const finishProgress = () => {
    if (!progressActive) return;
    clearProgressTimers();
    setProgress(1);
    progressTimers.push(setTimeout(() => {
      progress.dataset.visible = "false";
      progressTimers.push(setTimeout(() => { progressActive = false; setProgress(0); }, 180));
    }, 150));
  };
  const startProgress = destination => {
    progressActive = true;
    clearProgressTimers();
    progress.dataset.visible = "true";
    setProgress(.08);
    requestAnimationFrame(() => setProgress(.36));
    for (const [delay, value] of [[140, .56], [450, .72], [1100, .84]]) {
      progressTimers.push(setTimeout(() => { if (progressActive) setProgress(value); }, delay));
    }
    // A destination only resumes a fresh same-origin navigation to itself.
    try { sessionStorage.setItem(NAV_PROGRESS_KEY, JSON.stringify({url:destination.href, at:Date.now()})); } catch (_error) {}
    progressTimers.push(setTimeout(() => {
      if (location.href === destination.href && document.visibilityState === "visible") finishProgress();
    }, 12000));
  };
  let suppressDockClick = false;
  const eligibleLink = event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    if (suppressDockClick && event.isTrusted) return null;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return null;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || destination.href === location.href) return null;
    if (destination.pathname === location.pathname && destination.search === location.search) return null;
    return destination;
  };
  document.addEventListener("click", event => {
    const destination = eligibleLink(event);
    if (destination) startProgress(destination);
  }, true);
  try {
    const pending = JSON.parse(sessionStorage.getItem(NAV_PROGRESS_KEY) || "null");
    sessionStorage.removeItem(NAV_PROGRESS_KEY);
    if (pending?.url === location.href && Date.now() - pending.at < 15000) {
      progressActive = true;
      progress.dataset.visible = "true";
      setProgress(.88);
      if (document.readyState === "complete") finishProgress();
      else addEventListener("load", finishProgress, {once:true});
    }
  } catch (_error) {}
  addEventListener("pageshow", event => { if (event.persisted) finishProgress(); });

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
  const DISPLAY_NAME_KEY = "anyclass.timetable.displayName";
  const PREVIOUS_DISPLAY_NAME_KEY = "anyclass.displayName";
  const BRAND_LABEL_KEY = "anyclass.brandLabel";
  const DISPLAY_NAME_VERSION_KEY = "anyclass.preferenceVersion";
  const DISPLAY_NAME_VERSION = "2";
  const LEGACY_NAME_KEY = "heyaaron.timetable.displayName";
  const DEFAULT_DISPLAY_NAME = "AnyClass";
  const ALLOWED_BRANDS = new Set(["AnyClass", "有课吗"]);
  const LEGACY_DEFAULTS = new Set(["", "课程表", "HeyAaron", "AnyClass", "有课吗"]);
  const PRIMARY_PAGES = new Set(["today", "timetable", "import"]);
  const PRIMARY_ACTION_PAGES = new Set(["today", "timetable"]);
  const normalizeDisplayName = value => {
    const name = String(value || "").trim().slice(0, 20);
    return LEGACY_DEFAULTS.has(name) ? null : name;
  };
  const migrateDisplayName = () => {
    try {
      if (localStorage.getItem(DISPLAY_NAME_VERSION_KEY) === DISPLAY_NAME_VERSION) return;
      const current = normalizeDisplayName(localStorage.getItem(DISPLAY_NAME_KEY));
      const previous = normalizeDisplayName(localStorage.getItem(PREVIOUS_DISPLAY_NAME_KEY));
      const legacy = normalizeDisplayName(localStorage.getItem(LEGACY_NAME_KEY));
      const selected = current || previous || legacy;
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
    dispatchTimetableUpdated(detail = {}) { dispatchEvent(new CustomEvent("anyclass:timetable-updated", {detail})); },
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
  addEventListener("heyaaron:timetable-updated", event => {
    if (event.detail && event.detail.__anyclassCompatibilityBridge) return;
    dispatchEvent(new CustomEvent("anyclass:timetable-updated", {detail: {...(event.detail || {}), legacyEvent: true, __anyclassCompatibilityBridge: true}}));
  });

  addEventListener("online", publishState);
  addEventListener("offline", publishState);
  addEventListener("error", event => {
    const target = event.target;
    if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
      flags.resourceError = `${target.src || target.href || "关键静态资源"} 加载失败。`;
      publishState();
    }
  }, true);

  const enableDockScrub = (dock, activeIndex) => {
    const links = [...dock.querySelectorAll("a")];
    dock.addEventListener("dragstart", event => event.preventDefault());
    let gesture = null;
    const preview = index => {
      dock.style.setProperty("--active-index", String(index));
      links.forEach((link, position) => { link.dataset.preview = String(position === index); });
    };
    const reset = () => {
      dock.dataset.scrubbing = "false";
      dock.style.removeProperty("--scrub-x");
      dock.style.setProperty("--active-index", String(activeIndex));
      links.forEach(link => { delete link.dataset.preview; });
    };
    const cancelGesture = () => { if (!gesture) return; gesture = null; reset(); };
    const indexAt = x => {
      const bounds = dock.getBoundingClientRect();
      const position = (x - bounds.left - 6) / Math.max(1, bounds.width - 12);
      return Math.max(0, Math.min(links.length - 1, Math.floor(position * links.length)));
    };
    const followPointer = x => {
      const bounds = dock.getBoundingClientRect();
      const travel = (bounds.width - 12) * (links.length - 1) / links.length;
      const offset = Math.max(0, Math.min(travel, x - bounds.left - 6 - (bounds.width - 12) / links.length / 2));
      dock.style.setProperty("--scrub-x", `${offset}px`);
    };
    dock.addEventListener("pointerdown", event => {
      const link = event.target.closest("a");
      if (event.button !== 0 || !link) return;
      gesture = {id:event.pointerId, startX:event.clientX, startY:event.clientY, index:indexAt(event.clientX), moved:false};
    });
    document.addEventListener("pointermove", event => {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 7) return;
      gesture.moved = true;
      dock.dataset.scrubbing = "true";
      gesture.index = indexAt(event.clientX);
      followPointer(event.clientX);
      preview(gesture.index);
    });
    document.addEventListener("pointerup", event => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const {moved} = gesture;
      const index = indexAt(event.clientX);
      gesture = null;
      if (!moved) return; // A tap keeps the anchor's normal native click.
      suppressDockClick = true;
      event.preventDefault();
      dock.dataset.scrubbing = "false";
      dock.style.removeProperty("--scrub-x");
      if (index === activeIndex) reset();
      else { preview(index); links[index].click(); }
      setTimeout(() => { suppressDockClick = false; }, 0);
    });
    document.addEventListener("pointercancel", event => { if (!gesture || event.pointerId !== gesture.id) return; cancelGesture(); });
    dock.addEventListener("lostpointercapture", cancelGesture);
    addEventListener("blur", cancelGesture);
    addEventListener("pagehide", cancelGesture);
    dock.addEventListener("click", event => {
      if (!suppressDockClick || !event.isTrusted) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  };

  const mount = () => {
    const page = document.body.dataset.shellPage || "";
    if (window.parent !== window && page === "import") {
      document.body.removeAttribute("data-shell-page");
      return;
    }
    const primaryContext = PRIMARY_PAGES.has(page);
    const active = page === "today" ? "today" : page === "timetable" ? "timetable" : "";
    const header = document.createElement("header");
    header.className = "shell-header";
    header.innerHTML = `<a class="shell-brand" data-timetable-brand href="/"></a>${PRIMARY_ACTION_PAGES.has(page) ? '<a class="shell-more-link" href="/import/">导入</a>' : ""}`;
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
    const dock = primaryContext ? document.createElement("nav") : null;
    if (dock) {
      dock.className = "shell-bottom-nav glass-dock";
      dock.setAttribute("aria-label", "主要导航");
    }
    const icons = {
      today: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M9.5 20v-6h5v6"/></svg>',
      timetable: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h2M14 14h2M8 17.5h2M14 17.5h2"/></svg>',
      settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>'
    };
    if (dock) {
      const activeIndex = {today: 0, timetable: 1}[active] ?? 0;
      dock.dataset.active = active || "none";
      dock.style.setProperty("--active-index", String(activeIndex));
      dock.innerHTML = [["today", "/", "今天"], ["timetable", "/timetable/", "课表"], ["settings", "/settings/", "设置"]]
        .map(([key, href, label]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ""}><span class="shell-dock-icon" aria-hidden="true">${icons[key]}</span><span class="shell-dock-label">${label}</span></a>`).join("");
    }
    document.body.prepend(failure);
    document.body.prepend(offline);
    document.body.prepend(header);
    if (dock) { document.body.append(dock); enableDockScrub(dock, {today:0,timetable:1}[active] ?? 0); }
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
      const dockTop = dock ? dock.getBoundingClientRect().top : viewportBottom;
      const clearance = dock ? Math.max(0, viewportBottom - dockTop) + 22 : 0;
      document.documentElement.style.setProperty("--app-dock-clearance", `${Math.ceil(clearance)}px`);
      if (dock) dock.dataset.keyboard = viewport && viewport.height < innerHeight * .72 ? "true" : "false";
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
    observeStatusFeedback();
    publishState();
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount, {once: true});
  else mount();
  addEventListener("storage", event => { if ([DISPLAY_NAME_KEY, PREVIOUS_DISPLAY_NAME_KEY, LEGACY_NAME_KEY].includes(event.key)) applyDisplayName(); });
  publishState();
})();
