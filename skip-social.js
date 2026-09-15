export const EFFECTS = {
  confetti: "Confetti",
  reveal: "Reveal",
  bounce: "Bounce",
  gentle: "Gentle",
  slam: "Slam",
  echo: "Echo",
  sparkle: "Sparkle",
  float: "Float",
};
export const SERVER_EFFECTS = ["reveal", "bounce", "gentle"];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safe = (e) => e.replace(/\./g, ",");
const gameName = (k) => (k === "four" ? "Four in a Row" : "Tic-tac-toe");
const icon = (k) =>
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  ({
    plus: '<path d="M12 5v14M5 12h14"/>',
    gallery:
      '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="8" cy="8" r="1.4"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
    camera:
      '<path d="m8 5 1-2h6l1 2h3a2 2 0 0 1 2 2v12H3V7a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12" r="4"/>',
    file: '<path d="M14 3H5v18h14V8Zm0 0v5h5M8 13h8M8 17h5"/>',
    games:
      '<rect x="2" y="6" width="20" height="13" rx="6"/><path d="M8 10v5M5.5 12.5h5M16 11h.01M18 14h.01"/>',
    theme:
      '<path d="M12 3a9 9 0 1 0 0 18c3 0 1-4 3-5s6 1 6-4a9 9 0 0 0-9-9Z"/><path d="M7 9h.01M11 6h.01M16 8h.01"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="4"/><path d="M7 3v4M17 3v4M3 11h18"/>',
  }[k] || "") +
  "</svg>";
export function winningLines(k) {
  if (k === "ttt")
    return [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
  const a = [];
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 7; c++)
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ])
        if (r + 3 * dr < 6 && c + 3 * dc >= 0 && c + 3 * dc < 7)
          a.push([0, 1, 2, 3].map((i) => (r + i * dr) * 7 + c + i * dc));
  return a;
}
export function gameResult(g) {
  if (!g || !["ttt", "four"].includes(g.kind)) return null;
  const b = g.board || {};
  for (const line of winningLines(g.kind))
    if (b[line[0]] && line.every((i) => b[i] === b[line[0]])) return b[line[0]];
  return Object.values(b).filter((v) => v === 1 || v === 2).length ===
    (g.kind === "ttt" ? 9 : 42)
    ? "draw"
    : null;
}
export function socialMessageMarkup(m) {
  let h = "";
  if (
    m?.skipGame &&
    /^[\w-]{1,80}$/.test(m.skipGame.id) &&
    ["ttt", "four"].includes(m.skipGame.kind)
  )
    h +=
      '<section class="sp-game-invite" data-sp-game="' +
      esc(m.skipGame.id) +
      '"><div class="sp-game-emblem">' +
      (m.skipGame.kind === "four" ? "●●<br>●○" : "×○<br>○×") +
      "</div><div><small>GAME INVITATION</small><strong>" +
      gameName(m.skipGame.kind) +
      '</strong><p class="sp-invite-status">A little friendly competition</p><div class="sp-invite-actions"><button data-game-action="open">Open game</button></div></div></section>';
  if (Object.hasOwn(EFFECTS, m?.skipEffect || ""))
    h +=
      '<span class="sp-effect-mark" data-sp-effect="' +
      m.skipEffect +
      '" data-sp-loop="' +
      (m.skipEffectLoop === true ? "1" : "0") +
      '" title="' +
      EFFECTS[m.skipEffect] +
      (m.skipEffectLoop ? " · looping" : "") +
      ' · tap message to replay" aria-label="Message effect: ' +
      EFFECTS[m.skipEffect] +
      '">' +
      (m.skipEffectLoop ? "✧" : "✦") +
      "</span>";
  if (m?.skipFile && typeof m.skipFile.name === "string")
    h +=
      '<button class="sp-file-card" data-sp-file>' +
      icon("file") +
      "<span>" +
      esc(m.skipFile.name) +
      "<small>Download file</small></span></button>";
  return h;
}
export function createSkipSocial({
  auth,
  db,
  sdk,
  send,
  toast,
  themeKit,
  appName = "skip",
}) {
  const {
    ref,
    get,
    set,
    remove,
    onValue,
    runTransaction,
    push,
    query,
    orderByChild,
    limitToLast,
  } = sdk;
  const {
    THEME_LIBRARY,
    normalizeChatTheme,
    themeTokens,
    paintWallpaper,
    readThemeImage,
  } = themeKit;
  let context = null,
    epoch = 0,
    offs = [],
    cleanups = [],
    space = {},
    games = {},
    nicknames = {},
    selectedGame = null,
    gameOff = null,
    gameRecord = null;
  let dialog = null,
    popover = null,
    popoverKind = "",
    globalTheme = null,
    globalOff = null,
    globalUid = null,
    dmVisible = true,
    themeCache = "",
    baseline = null,
    wallpaper = null;
  let selectedEffect = "",
    loop = false,
    observer = null,
    intersection = null,
    frame = 0,
    holdTimer = 0,
    suppressUntil = 0,
    holdConsumed = false,
    lastFocus = null,
    reported = false,
    editorScope = "dm",
    editorDraft = null,
    editorSession = 0;
  const seen = new Set(),
    loops = new Map(),
    gameSignatures = new WeakMap(),
    animationTimers = new Map();
  const pref = (k) => {
      try {
        return localStorage.getItem(k) !== "false";
      } catch {
        return true;
      }
    },
    motion = matchMedia("(prefers-reduced-motion: reduce)");
  const effectsOn = () => pref("skip_effects_enabled") && !motion.matches;
  function current(dm = false) {
    if (!context || context.uid !== auth.currentUser?.uid)
      throw Error("Open a conversation while signed in.");
    if (dm && context.type !== "dm")
      throw Error("This feature is for direct messages.");
    return context;
  }
  function still(c) {
    if (context !== c || c.uid !== auth.currentUser?.uid)
      throw Error("The conversation changed. Please try again.");
  }
  function fail(e) {
    const denied = /permission[-_]denied/i.test(e.code || e.message || "");
    if (denied && reported) return;
    if (denied) reported = true;
    toast(
      denied
        ? "Update the database rules to use the new chat features."
        : e.message || "Please try again.",
    );
  }
  function listen(path, fn) {
    const run = epoch;
    offs.push(
      onValue(
        ref(db, path),
        (s) => {
          if (run === epoch) fn(s.val());
        },
        fail,
      ),
    );
  }
  function event(el, type, fn, options) {
    if (!el?.addEventListener) return;
    el.addEventListener(type, fn, options);
    cleanups.push(() => el.removeEventListener(type, fn, options));
  }
  function clearEffect() {
    selectedEffect = "";
    loop = false;
    context?.sendButton?.removeAttribute("data-effect-ready");
  }
  function effectPayload() {
    if (!context || !selectedEffect) return {};
    if (context.type === "server" && !SERVER_EFFECTS.includes(selectedEffect))
      return {};
    return {
      skipEffect: selectedEffect,
      ...(loop && context.type === "dm" ? { skipEffectLoop: true } : {}),
    };
  }
  function stopAnimation(el) {
    clearTimeout(animationTimers.get(el));
    animationTimers.delete(el);
    for (const name of Object.keys(EFFECTS))
      el.classList.remove("sp-fx-" + name);
    el.classList.remove("sp-loop", "sp-paused");
    el.querySelector(":scope > .sp-particles")?.remove();
  }
  function syncLoops() {
    for (const [el, visible] of loops) {
      if (!el.isConnected) {
        loops.delete(el);
        intersection?.unobserve(el);
        stopAnimation(el);
        continue;
      }
      if (visible && effectsOn() && pref("skip_effect_loops") && !el.classList.contains("sp-loop")) {
        const mark = el.querySelector("[data-sp-effect]");
        if (mark) animate(mark.dataset.spEffect, el, true);
      }
      el.classList.toggle(
        "sp-paused",
        !visible ||
          document.visibilityState === "hidden" ||
          !effectsOn() ||
          !pref("skip_effect_loops"),
      );
    }
  }
  function animate(kind, el, repeating = false) {
    if (!el || !effectsOn()) return;
    stopAnimation(el);
    el.classList.add("sp-fx-" + kind);
    if (repeating) el.classList.add("sp-loop");
    if (kind === "confetti" || kind === "sparkle") {
      const layer = document.createElement("span");
      layer.className = "sp-particles";
      layer.setAttribute("aria-hidden", "true");
      for (let i = 0; i < (kind === "confetti" ? 28 : 14); i++) {
        const p = document.createElement("i");
        p.style.cssText =
          "--i:" +
          i +
          ";--x:" +
          ((i * 37) % 101) +
          "%;--dx:" +
          (((i * 67) % 141) - 70) +
          "px;--rot:" +
          ((i * 131) % 720) +
          "deg;--delay:" +
          (i % 7) * 0.045 +
          "s;--color:" +
          ["#f3a6cb", "#99ceff", "#ffe69b", "#b0ecc3", "#d0b5ff"][i % 5];
        layer.append(p);
      }
      el.append(layer);
    }
    if (!repeating)
      animationTimers.set(
        el,
        setTimeout(() => stopAnimation(el), 2200),
      );
  }
  function replay(e) {
    if (
      e.target.closest("button,a,input,textarea,video,audio,summary") &&
      !e.target.closest(".sp-effect-mark")
    )
      return;
    const row = e.target.closest(".chat-message,.message"),
      mark = row?.querySelector("[data-sp-effect]");
    if (!mark) return;
    if (e.type === "keydown" && !["Enter", " "].includes(e.key)) return;
    if (e.type === "keydown") e.preventDefault();
    animate(
      mark.dataset.spEffect,
      row,
      mark.dataset.spLoop === "1" &&
        context?.type === "dm" &&
        pref("skip_effect_loops"),
    );
    syncLoops();
  }
  function detach() {
    epoch++;
    gameOff?.();
    gameOff = null;
    for (const off of offs) off();
    offs = [];
    for (const fn of cleanups) fn();
    cleanups = [];
    observer?.disconnect();
    intersection?.disconnect();
    observer = null;
    intersection = null;
    cancelAnimationFrame(frame);
    clearTimeout(holdTimer);
    holdConsumed = false;
    suppressUntil = 0;
    for (const el of animationTimers.keys()) stopAnimation(el);
    for (const el of loops.keys()) stopAnimation(el);
    loops.clear();
    clearEffect();
    if (context?.title && context.originalTitle && context.title.textContent === context.appliedTitle)
      context.title.textContent = context.originalTitle;
    context?.plusCreated?.remove();
    context = null;
    space = {};
    games = {};
    nicknames = {};
    selectedGame = null;
    gameRecord = null;
    reported = false;
    closePopover();
    if (dialog?.open) dialog.close();
    editorSession++;
    applyTheme();
  }
  function attach(c) {
    detach();
    context = {
      ...c,
      type: c.type || "dm",
      uid: auth.currentUser?.uid,
      me: safe(auth.currentUser?.email || ""),
    };
    const captured = context;
    dmVisible = true;
    if (!context.attachButton) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sp-composer-plus icon-button";
      b.innerHTML = icon("plus");
      c.composer.prepend(b);
      context.attachButton = b;
      context.plusCreated = b;
    }
    context.attachButton.setAttribute("aria-label", "Add attachments and more");
    context.attachButton.setAttribute("aria-haspopup", "dialog");
    event(
      context.attachButton,
      "click",
      (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        open("menu");
      },
      true,
    );
    context.sendButton.setAttribute("title", "Send · hold for effects");
    context.sendButton.setAttribute(
      "aria-description",
      "Hold for message effects, or press Alt and Arrow Up.",
    );
    event(context.sendButton, "pointerdown", (e) => {
      if (e.button !== 0 || context.sendButton.disabled) return;
      holdConsumed = false;
      context.holdPoint = { x: e.clientX, y: e.clientY };
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        if (context !== captured) return;
        suppressUntil = Date.now() + 900;
        holdConsumed = true;
        open("effects");
      }, 460);
    });
    event(context.sendButton, "pointermove", (e) => {
      if (
        context?.holdPoint &&
        Math.hypot(
          e.clientX - context.holdPoint.x,
          e.clientY - context.holdPoint.y,
        ) > 12
      )
        clearTimeout(holdTimer);
    });
    for (const ev of ["pointerup", "pointercancel", "pointerleave"])
      event(context.sendButton, ev, () => clearTimeout(holdTimer));
    event(
      context.sendButton,
      "click",
      (e) => {
        if (holdConsumed || Date.now() < suppressUntil) {
          holdConsumed = false;
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
    event(context.sendButton, "contextmenu", (e) => {
      e.preventDefault();
      suppressUntil = Date.now() + 900;
      holdConsumed = true;
      open("effects");
    });
    event(context.sendButton, "keydown", (e) => {
      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        open("effects");
      }
    });
    event(c.messages, "click", handleMessages);
    event(c.messages, "keydown", replay);
    if (context.type === "dm") {
      listen("dm_spaces/" + c.id, (v) => {
        space = v || {};
        applyTheme();
        renderTitle();
      });
      listen("dm_nicknames/" + c.id, (v) => {
        nicknames = v || {};
        renderTitle();
      });
      const run = epoch;
      offs.push(
        onValue(
          query(
            ref(db, "dm_games/" + c.id),
            orderByChild("createdAt"),
            limitToLast(20),
          ),
          (s) => {
            if (run !== epoch) return;
            games = s.val() || {};
            decorateGames();
            if (dialog?.open && dialog.dataset.page === "games") renderGames();
          },
          fail,
        ),
      );
    }
    observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (context === captured) decorate();
      });
    });
    observer.observe(c.messages, { childList: true, subtree: true });
    if (typeof IntersectionObserver !== "undefined")
      intersection = new IntersectionObserver(
        (entries) => {
          for (const e of entries)
            if (loops.has(e.target)) loops.set(e.target, e.isIntersecting);
          syncLoops();
        },
        { root: c.messages, threshold: 0.05 },
      );
    event(document, "visibilitychange", syncLoops);
    event(window, "resize", positionPopover);
    if (window.visualViewport) {
      event(window.visualViewport, "resize", positionPopover);
      event(window.visualViewport, "scroll", positionPopover);
    }
    event(
      document,
      "pointerdown",
      (e) => {
        if (
          popoverKind &&
          !popover?.contains(e.target) &&
          !context?.attachButton?.contains(e.target) &&
          !context?.sendButton?.contains(e.target)
        )
          closePopover();
      },
      true,
    );
    event(document, "keydown", (e) => {
      if (e.key === "Escape") closePopover();
    });
    decorate();
    applyTheme();
  }
  function renderTitle() {
    if (!context?.title) return;
    if (!context.originalTitle)
      context.originalTitle = context.title.textContent;
    context.title.textContent = context.appliedTitle =
      space.title || nicknames[context.peer] || context.originalTitle;
  }
  function decorate() {
    if (!context) return;
    for (const mark of context.messages.querySelectorAll("[data-sp-effect]")) {
      const row = mark.closest(".chat-message,.message");
      if (!row) continue;
      row.tabIndex = 0;
      row.title = mark.title;
      const key = context.id + ":" + (row.dataset.messageKey || row.id),
        repeating = mark.dataset.spLoop === "1" && context.type === "dm";
      if (repeating && !loops.has(row)) {
        loops.set(row, true);
        intersection?.observe(row);
        if (pref("skip_effect_loops"))
          animate(mark.dataset.spEffect, row, true);
      }
      if (!seen.has(key)) {
        seen.add(key);
        if (seen.size > 2000) seen.delete(seen.values().next().value);
        if (!repeating && document.visibilityState === "visible")
          animate(mark.dataset.spEffect, row);
      }
    }
    decorateGames();
    syncLoops();
  }
  function decorateGames() {
    if (!context || context.type !== "dm") return;
    for (const card of context.messages.querySelectorAll("[data-sp-game]")) {
      const g =
        games[card.dataset.spGame] ||
        (selectedGame === card.dataset.spGame ? gameRecord : null);
      if (!g) continue;
      const sig = JSON.stringify(g);
      if (gameSignatures.get(card) === sig) continue;
      gameSignatures.set(card, sig);
      const result = gameResult(g);
      card.querySelector(".sp-invite-status").textContent =
        g.status === "invite"
          ? g.guest === context.me
            ? "Your friend wants to play"
            : "Invitation sent · waiting for your friend"
          : g.status === "closed"
            ? "Game closed"
            : result === "draw"
              ? "It’s a draw"
              : result
                ? "Game finished"
                : g.turn === context.me
                  ? "Your turn"
                  : "Your friend’s turn";
      card.querySelector(".sp-invite-actions").innerHTML =
        g.status === "invite" && g.guest === context.me
          ? '<button data-game-action="accept" class="sp-primary">Accept</button><button data-game-action="close">Decline</button>'
          : g.status === "invite"
            ? '<button data-game-action="open">View game</button><button data-game-action="close">Cancel</button>'
            : '<button data-game-action="open">' +
              (result || g.status === "closed" ? "View board" : "Play") +
              "</button>";
    }
  }
  async function handleMessages(e) {
    const action = e.target.closest("[data-game-action]");
    if (action) {
      e.preventDefault();
      try {
        const c = current(true);
        selectGame(action.closest("[data-sp-game]").dataset.spGame);
        if (action.dataset.gameAction !== "open")
          await changeGame(action.dataset.gameAction);
        still(c);
        if (action.dataset.gameAction !== "close") open("games");
      } catch (err) {
        fail(err);
      }
      return;
    }
    const file = e.target.closest("[data-sp-file]");
    if (file) {
      const row = file.closest("[data-message-key],.message"),
        m = context?.getMessage?.(
          row?.dataset.messageKey || row?.id?.replace(/^msg-/, ""),
        ),
        f = m?.skipFile;
      if (
        !f ||
        typeof f.data !== "string" ||
        f.data.length > 850000 ||
        !/^data:application\/octet-stream;base64,[A-Za-z0-9+/]+=*$/.test(f.data)
      )
        return;
      const bytes = Uint8Array.from(atob(f.data.split(",")[1]), (c) =>
          c.charCodeAt(0),
        ),
        url = URL.createObjectURL(
          new Blob([bytes], { type: "application/octet-stream" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = f.name || "attachment";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    replay(e);
  }
  function ensurePopover() {
    if (popover) return;
    popover = document.createElement("div");
    popover.className = "sp-popover";
    popover.setAttribute("popover", "manual");
    popover.setAttribute("role", "dialog");
    popover.tabIndex = -1;
    document.body.append(popover);
  }
  function closePopover() {
    if (!popoverKind) return;
    popoverKind = "";
    popover?.querySelectorAll(".sp-preview-bubble").forEach(stopAnimation);
    try {
      popover.hidePopover?.();
    } catch {}
    popover.style.display = "none";
    context?.attachButton?.setAttribute("aria-expanded", "false");
    lastFocus?.isConnected && lastFocus.focus();
  }
  function positionPopover() {
    if (!popoverKind || !context) return;
    const box = context.composer.getBoundingClientRect(),
      v = window.visualViewport,
      left = v?.offsetLeft || 0,
      top = v?.offsetTop || 0,
      width = v?.width || innerWidth,
      height = v?.height || innerHeight,
      w = Math.min(popoverKind === "effects" ? 360 : 280, width - 24),
      bottom = Math.max(top + 130, Math.min(box.top - 8, top + height - 12));
    popover.style.width = w + "px";
    popover.style.left =
      Math.max(
        left + 12,
        Math.min(
          popoverKind === "effects" ? box.right - w : box.left,
          left + width - w - 12,
        ),
      ) + "px";
    popover.style.top = bottom + "px";
    popover.style.maxHeight = Math.max(120, bottom - top - 12) + "px";
  }
  function showPopover(kind) {
    ensurePopover();
    closePopover();
    popoverKind = kind;
    popover.classList.toggle("sp-effect-sheet", kind === "effects");
    popover.setAttribute(
      "aria-label",
      kind === "effects" ? "Send with an effect" : "Attachments and more",
    );
    lastFocus = document.activeElement;
    popover.style.display = "block";
    try {
      popover.showPopover?.();
    } catch {}
    positionPopover();
    context.attachButton.setAttribute("aria-expanded", "true");
  }
  function open(page) {
    if (page === "appearance") {
      editorScope = "global";
      editorDraft = normalizeChatTheme(globalTheme);
      openDialog("theme");
      return;
    }
    current(page === "theme" || page === "room" || page === "games");
    if (page === "menu") {
      showPopover("menu");
      const items = [
        ["gallery", "Gallery"],
        ["camera", "Take photo"],
        ["file", "Open files"],
        ...(context.type === "dm"
          ? [
              ["games", "Games"],
              ["theme", "Edit DM"],
            ]
          : []),
        ...(context.shareSchedule ? [["calendar", "Share schedule"]] : []),
      ];
      popover.innerHTML =
        '<div class="sp-menu">' +
        items
          .map(
            ([id, label]) =>
              '<button type="button" data-menu="' +
              id +
              '"><span class="sp-menu-icon ' +
              id +
              '">' +
              icon(id) +
              "</span><span>" +
              label +
              "</span></button>",
          )
          .join("") +
        "</div>";
      for (const b of popover.querySelectorAll("[data-menu]"))
        b.onclick = () => {
          const id = b.dataset.menu;
          closePopover();
          if (id === "games" || id === "theme") open(id);
          else if (id === "calendar") context.shareSchedule();
          else context.pickFile(id);
        };
      popover.querySelector("button")?.focus();
      return;
    }
    if (page === "effects") {
      if (!context.input.value.trim()) {
        toast("Write a message first, then hold Send.");
        context.input.focus();
        return;
      }
      showPopover("effects");
      renderEffects();
      return;
    }
    editorScope = "dm";
    editorDraft = normalizeChatTheme(
      space.appearance || space.theme || "default",
    );
    openDialog(page === "games" ? "games" : "theme");
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement("dialog");
    dialog.className = "sp-dialog";
    dialog.innerHTML =
      '<header><div><small id="sp-eyebrow"></small><h2 id="sp-title"></h2></div><button type="button" id="sp-close" aria-label="Close">×</button></header><div id="sp-body"></div><p id="sp-error" role="alert"></p>';
    dialog.setAttribute("aria-labelledby", "sp-title");
    document.body.append(dialog);
    dialog.querySelector("#sp-close").onclick = () => dialog.close();
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      editorSession++;
      lastFocus?.isConnected && lastFocus.focus();
    });
  }
  function openDialog(page) {
    closePopover();
    ensureDialog();
    lastFocus = document.activeElement;
    dialog.dataset.page = page;
    dialog.querySelector("#sp-eyebrow").textContent =
      page === "games"
        ? "PLAY TOGETHER"
        : editorScope === "global"
          ? "MAKE SKIP YOURS"
          : "JUST THIS CONVERSATION";
    dialog.querySelector("#sp-title").textContent =
      page === "games"
        ? "Choose a game"
        : editorScope === "global"
          ? "Appearance"
          : "Edit DM";
    dialog.querySelector("#sp-error").textContent = "";
    if (!dialog.open) dialog.showModal();
    if (page === "games") renderGames();
    else renderThemeEditor();
  }
  const body = () => dialog.querySelector("#sp-body");
  function bind(id, fn) {
    const el = dialog.querySelector("#" + id);
    if (!el) return;
    el.onclick = async () => {
      el.disabled = true;
      try {
        await fn();
      } catch (e) {
        dialog.querySelector("#sp-error").textContent = e.message;
        fail(e);
      } finally {
        el.disabled = false;
      }
    };
  }
  function renderEffects() {
    const options =
      context.type === "server" ? SERVER_EFFECTS : Object.keys(EFFECTS);
    popover.innerHTML =
      '<div class="sp-effects-heading"><b>Send with an effect</b><button data-close aria-label="Close">×</button></div><div class="sp-effect-preview"><div class="sp-preview-bubble"></div></div><div class="sp-effect-options">' +
      options
        .map(
          (id) =>
            '<button data-effect-choice="' +
            id +
            '" aria-pressed="' +
            (selectedEffect === id) +
            '"><span>' +
            {
              confetti: "🎊",
              reveal: "◌",
              bounce: "↟",
              gentle: "〜",
              slam: "↓",
              echo: "◎",
              sparkle: "✧",
              float: "↑",
            }[id] +
            "</span>" +
            EFFECTS[id] +
            "</button>",
        )
        .join("") +
      '</div><label class="sp-toggle"><span>Loop continuously</span><input type="checkbox" id="sp-loop" ' +
      (loop ? "checked " : "") +
      (context.type === "server" ? "disabled" : "") +
      "></label>" +
      (context.type === "server"
        ? '<p class="sp-note">Servers use quiet bubble effects. Loops are off.</p>'
        : "") +
      '<div class="sp-effects-actions"><button id="sp-clear-effect">No effect</button><button id="sp-effect-send" class="sp-primary" ' +
      (!selectedEffect ? "disabled" : "") +
      ">Send" +
      (selectedEffect ? " with " + EFFECTS[selectedEffect] : "") +
      '</button></div><details class="sp-playback"><summary>Playback on this device</summary><label>Play effects<input id="sp-play-effects" type="checkbox" ' +
      (pref("skip_effects_enabled") ? "checked" : "") +
      '></label><label>Play loops<input id="sp-play-loops" type="checkbox" ' +
      (pref("skip_effect_loops") ? "checked" : "") +
      "></label></details>";
    const preview = popover.querySelector(".sp-preview-bubble");
    preview.textContent = context.input.value.trim().slice(0, 250);
    if (selectedEffect)
      animate(selectedEffect, preview, loop && context.type === "dm");
    for (const b of popover.querySelectorAll("[data-effect-choice]"))
      b.onclick = () => {
        selectedEffect = b.dataset.effectChoice;
        context.sendButton.dataset.effectReady = selectedEffect;
        stopAnimation(preview);
        renderEffects();
      };
    popover.querySelector("[data-close]").onclick = closePopover;
    popover.querySelector("#sp-loop").onchange = (e) => {
      loop = e.target.checked;
      stopAnimation(preview);
      renderEffects();
    };
    popover.querySelector("#sp-clear-effect").onclick = () => {
      stopAnimation(preview);
      clearEffect();
      closePopover();
    };
    popover.querySelector("#sp-effect-send").onclick = () => {
      stopAnimation(preview);
      closePopover();
      suppressUntil = 0;
      holdConsumed = false;
      context.sendButton.click();
    };
    for (const [id, key] of [
      ["sp-play-effects", "skip_effects_enabled"],
      ["sp-play-loops", "skip_effect_loops"],
    ])
      popover.querySelector("#" + id).onchange = (e) => {
        try {
          localStorage.setItem(key, String(e.target.checked));
        } catch {}
        if (!effectsOn())
          for (const el of animationTimers.keys()) stopAnimation(el);
        syncLoops();
      };
  }

  function applyTheme() {
    const choice =
        context?.type === "dm" && dmVisible
          ? space.appearance || (space.theme !== "inherit" ? space.theme : null)
          : null,
      raw = choice || (appName === "skip" ? globalTheme : null),
      key = raw ? JSON.stringify(raw) : "";
    if (key === themeCache) return;
    themeCache = key;
    const root = document.documentElement;
    if (!raw) {
      root.classList.remove("sk-themed");
      if (baseline) {
        for (const [k, v] of Object.entries(baseline))
          v ? root.style.setProperty(k, v) : root.style.removeProperty(k);
        baseline = null;
      }
      wallpaper?.remove();
      wallpaper = null;
      return;
    }
    const theme = normalizeChatTheme(raw),
      tokens = themeTokens(theme);
    if (!baseline)
      baseline = Object.fromEntries(
        Object.keys(tokens).map((k) => [k, root.style.getPropertyValue(k)]),
      );
    for (const [k, v] of Object.entries(tokens)) root.style.setProperty(k, v);
    root.classList.add("sk-themed");
    root.dataset.skMode = theme.mode;
    if (!wallpaper) {
      wallpaper = document.createElement("div");
      wallpaper.className = "sk-wallpaper";
      wallpaper.setAttribute("aria-hidden", "true");
      document.body.prepend(wallpaper);
    }
    paintWallpaper(wallpaper, theme);
  }
  function setVisible(v) {
    dmVisible = v;
    closePopover();
    applyTheme();
  }
  function setUser(user) {
    globalOff?.();
    globalOff = null;
    globalUid = user?.uid || null;
    globalTheme = null;
    themeCache = "__reset";
    applyTheme();
    if (!globalUid || appName !== "skip") return;
    const uid = globalUid;
    globalOff = onValue(
      ref(db, "skip_preferences/" + uid + "/theme"),
      (s) => {
        if (globalUid !== uid) return;
        globalTheme = s.val();
        applyTheme();
      },
      fail,
    );
  }
  async function saveTheme(value) {
    const t = normalizeChatTheme(value);
    if (editorScope === "global") {
      const uid = auth.currentUser?.uid;
      if (!uid) throw Error("Sign in to save your theme.");
      await set(ref(db, "skip_preferences/" + uid + "/theme"), t);
      if (uid === auth.currentUser?.uid) {
        globalTheme = t;
        applyTheme();
      }
    } else {
      const c = current(true);
      const result = await runTransaction(
        ref(db, "dm_spaces/" + c.id),
        (old) => {
          still(c);
          return {
            revision: (old?.revision || 0) + 1,
            title: old?.title || "",
            theme: t.preset,
            appearance: t,
          };
        },
        { applyLocally: false },
      );
      if (!result.committed) throw Error("Theme could not be saved.");
    }
  }
  function renderThemeEditor() {
    const token = ++editorSession;
    body().innerHTML =
      '<p class="sp-lead">' +
      (editorScope === "global"
        ? "Your colors, everywhere. A DM’s own look takes over only while that conversation is open."
        : "Changes apply immediately for both people, across the full app while this DM is open.") +
      '</p><div class="sp-theme-tabs"><button data-theme-tab="library" class="active">Themes</button><button data-theme-tab="emoji">Emoji</button><button data-theme-tab="image">Photo / GIF</button></div><div id="sp-theme-options"></div><div class="sp-theme-stage"><div id="sp-theme-wall"></div><div class="sp-theme-mock"><aside>skip<br>◌<br>◌</aside><section><b>A little more you</b><p>Hey, I love this look</p><p class="own">This is the one ✨</p></section></div></div><div id="sp-theme-controls"></div><div class="sp-row"><button id="sp-use-theme" class="sp-primary">Use this theme</button><button id="sp-reset-theme">Use my default</button></div>' +
      (editorScope === "dm"
        ? '<hr><label>Conversation name<input id="sp-dm-title" maxlength="40" value="' +
          esc(space.title || "") +
          '" placeholder="A name for this chat"></label><button id="sp-save-title">Save name</button><label>Your nickname<input id="sp-nickname" maxlength="30" value="' +
          esc(nicknames[context.me] || "") +
          '" placeholder="Only in this DM"></label><button id="sp-save-nickname">Save nickname</button>'
        : "");
    let selectedTab = "library";
    const panel = dialog.querySelector("#sp-theme-options"),
      controls = dialog.querySelector("#sp-theme-controls");
    const preview = () => {
      const t = normalizeChatTheme(editorDraft);
      paintWallpaper(dialog.querySelector("#sp-theme-wall"), t);
      for (const [k, v] of Object.entries(themeTokens(t)))
        dialog.querySelector(".sp-theme-stage").style.setProperty(k, v);
    };
    const renderOptions = () => {
      if (selectedTab === "library") {
        panel.innerHTML =
          '<div class="sp-theme-grid">' +
          THEME_LIBRARY.map(
            (t) =>
              '<button data-theme-preset="' +
              esc(t.id) +
              '" class="sp-theme-tile" style="--tile-bg:' +
              esc(t.background) +
              ";--tile-accent:" +
              esc(t.accent) +
              '"><span>' +
              (t.emojis ? esc(t.emojis.split(" ")[0]) : "Aa") +
              "</span><b>" +
              esc(t.name) +
              "</b></button>",
          ).join("") +
          "</div>";
        controls.innerHTML = "";
        for (const b of panel.querySelectorAll("[data-theme-preset]"))
          b.onclick = async () => {
            editorDraft = normalizeChatTheme({ preset: b.dataset.themePreset });
            preview();
            b.disabled = true;
            try {
              await saveTheme(editorDraft);
              if (token === editorSession) toast("Theme applied");
            } catch (e) {
              fail(e);
            } finally {
              b.disabled = false;
            }
          };
      } else {
        editorDraft = { ...editorDraft, kind: selectedTab };
        panel.innerHTML =
          selectedTab === "emoji"
            ? '<label>Emojis <small>Separate with spaces · up to 12</small><input id="sp-emojis" maxlength="100" value="' +
              esc(editorDraft.emojis) +
              '" placeholder="🍒 🪩 ✨"></label>'
            : '<label class="sp-upload-tile">' +
              icon("gallery") +
              '<b>Choose a photo or GIF</b><small>Photos are resized. Animated GIFs: up to 800 KB.</small><input id="sp-theme-photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>';
        controls.innerHTML =
          '<div class="sp-row"><label>Background<input type="color" id="sp-bg" value="' +
          editorDraft.background +
          '"></label><label>Accent<input type="color" id="sp-accent" value="' +
          editorDraft.accent +
          '"></label><label>Style<select id="sp-mode"><option value="dark">Dark</option><option value="light">Light</option></select></label></div>' +
          (selectedTab === "emoji"
            ? '<label>Pattern density<input id="sp-density" type="range" min="12" max="80" value="' +
              editorDraft.density +
              '"></label>'
            : '<label>Background blur<input id="sp-blur" type="range" min="0" max="12" value="' +
              editorDraft.blur +
              '"></label>') +
          '<label>Dim wallpaper<input id="sp-dim" type="range" min="0" max="85" value="' +
          editorDraft.dim +
          '"></label>';
        dialog.querySelector("#sp-mode").value = editorDraft.mode;
        for (const [id, key] of [
          ["sp-bg", "background"],
          ["sp-accent", "accent"],
          ["sp-mode", "mode"],
          ["sp-density", "density"],
          ["sp-blur", "blur"],
          ["sp-dim", "dim"],
          ["sp-emojis", "emojis"],
        ]) {
          const el = dialog.querySelector("#" + id);
          if (el)
            el.oninput = () => {
              editorDraft = {
                ...editorDraft,
                [key]: el.type === "range" ? Number(el.value) : el.value,
              };
              preview();
            };
        }
        const input = dialog.querySelector("#sp-theme-photo");
        if (input)
          input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const button = dialog.querySelector("#sp-use-theme");
            button.disabled = true;
            try {
              const data = await readThemeImage(file);
              if (
                token !== editorSession ||
                !dialog.open ||
                selectedTab !== "image"
              )
                return;
              editorDraft = { ...editorDraft, image: data, kind: "image" };
              preview();
            } catch (e) {
              fail(e);
            } finally {
              button.disabled = false;
            }
          };
      }
      preview();
    };
    for (const b of dialog.querySelectorAll("[data-theme-tab]"))
      b.onclick = () => {
        selectedTab = b.dataset.themeTab;
        for (const x of dialog.querySelectorAll("[data-theme-tab]"))
          x.classList.toggle("active", x === b);
        renderOptions();
      };
    bind("sp-use-theme", async () => {
      await saveTheme(editorDraft);
      toast("Theme applied");
    });
    bind("sp-reset-theme", async () => {
      if (editorScope === "global") {
        await remove(
          ref(db, "skip_preferences/" + auth.currentUser.uid + "/theme"),
        );
        globalTheme = null;
        applyTheme();
      } else {
        const c = current(true);
        await runTransaction(
          ref(db, "dm_spaces/" + c.id),
          (old) => {
            still(c);
            return {
              revision: (old?.revision || 0) + 1,
              title: old?.title || "",
              theme: "inherit",
            };
          },
          { applyLocally: false },
        );
      }
      dialog.close();
    });
    bind("sp-save-title", async () => {
      const c = current(true),
        title = dialog.querySelector("#sp-dm-title").value.trim();
      await runTransaction(
        ref(db, "dm_spaces/" + c.id),
        (old) => {
          still(c);
          return {
            revision: (old?.revision || 0) + 1,
            title,
            theme: old?.theme || "inherit",
            ...(old?.appearance ? { appearance: old.appearance } : {}),
          };
        },
        { applyLocally: false },
      );
      toast("Conversation name saved");
    });
    bind("sp-save-nickname", () => {
      const c = current(true);
      return set(
        ref(db, "dm_nicknames/" + c.id + "/" + c.me),
        dialog.querySelector("#sp-nickname").value.trim() || null,
      );
    });
    renderOptions();
  }

  function selectGame(id) {
    const c = current(true);
    selectedGame = id;
    gameRecord = games[id] || null;
    gameOff?.();
    gameOff = onValue(
      ref(db, "dm_games/" + c.id + "/" + id),
      (s) => {
        if (context !== c || selectedGame !== id) return;
        gameRecord = s.val();
        decorateGames();
        if (dialog?.open && dialog.dataset.page === "games") renderGames();
      },
      fail,
    );
  }
  async function newGame(kind) {
    const c = current(true),
      id = push(ref(db, "dm_games/" + c.id)).key,
      g = {
        kind,
        host: c.me,
        guest: c.peer,
        status: "invite",
        turn: c.me,
        board: Object.fromEntries(
          Array.from({ length: kind === "ttt" ? 9 : 42 }, (_, i) => [i, 0]),
        ),
        ply: 0,
        revision: 0,
        move: -1,
        createdAt: Date.now(),
      };
    await set(ref(db, "dm_games/" + c.id + "/" + id), g);
    still(c);
    selectGame(id);
    try {
      await send(
        {
          text: "Invited you to play " + gameName(kind),
          skipGame: { id, kind },
        },
        c.peer,
      );
    } catch (e) {
      fail(
        Error(
          "The game is ready, but its invitation could not send. Open Games to retry.",
        ),
      );
      return;
    }
    if (context === c) {
      dialog.close();
      toast("Game invitation sent");
    }
  }
  async function changeGame(action, index) {
    const c = current(true),
      id = selectedGame,
      result = await runTransaction(
        ref(db, "dm_games/" + c.id + "/" + id),
        (g) => {
          still(c);
          if (!g) return;
          if (action === "accept") {
            if (g.status !== "invite" || g.guest !== c.me) return;
            return { ...g, status: "playing", revision: g.revision + 1 };
          }
          if (action === "close") {
            if (g.status === "closed") return;
            return { ...g, status: "closed", revision: g.revision + 1 };
          }
          if (g.status !== "playing" || g.turn !== c.me || gameResult(g))
            return;
          let cell = index;
          if (g.kind === "four") {
            cell = -1;
            for (let r = 5; r >= 0; r--)
              if (g.board[r * 7 + index] === 0) {
                cell = r * 7 + index;
                break;
              }
          }
          if (cell < 0 || g.board[cell] !== 0) return;
          return {
            ...g,
            board: { ...g.board, [cell]: g.host === c.me ? 1 : 2 },
            move: cell,
            ply: g.ply + 1,
            revision: g.revision + 1,
            turn: c.me === g.host ? g.guest : g.host,
          };
        },
        { applyLocally: false },
      );
    if (!result.committed)
      throw Error("That move is no longer available. Try the current board.");
  }
  function renderGames() {
    if (!context || !dialog) return;
    const g = gameRecord || games[selectedGame];
    body().innerHTML =
      '<div class="sp-game-picker">' +
      ["ttt", "four"]
        .map(
          (kind) =>
            '<button data-new-game="' +
            kind +
            '"><span class="sp-game-art ' +
            kind +
            '">' +
            (kind === "ttt" ? "× ○<br>○ ×" : "● ● ●<br>● ○ ●") +
            "</span><strong>" +
            gameName(kind) +
            "</strong><small>" +
            (kind === "ttt"
              ? "Three in a row. One perfect move."
              : "Drop a piece. Connect four.") +
            '</small><span class="sp-game-cta">Invite to play ↗</span></button>',
        )
        .join("") +
      '</div><div id="sp-game-board"></div><h3>Recent games</h3><div class="sp-recent-games">' +
      Object.entries(games)
        .sort((a, b) => b[1].createdAt - a[1].createdAt)
        .map(
          ([id, game]) =>
            '<button data-select-game="' +
            esc(id) +
            '">' +
            gameName(game.kind) +
            "<small>" +
            (game.status === "invite"
              ? "Invitation"
              : game.status === "closed"
                ? "Closed"
                : gameResult(game)
                  ? "Finished"
                  : "In play") +
            "</small></button>",
        )
        .join("") +
      "</div>";
    for (const b of dialog.querySelectorAll("[data-new-game]"))
      b.onclick = async () => {
        b.disabled = true;
        try {
          await newGame(b.dataset.newGame);
        } catch (e) {
          fail(e);
          b.disabled = false;
        }
      };
    for (const b of dialog.querySelectorAll("[data-select-game]"))
      b.onclick = () => {
        selectGame(b.dataset.selectGame);
        renderGames();
      };
    if (!g) return;
    const result = gameResult(g),
      token = g.host === context.me ? 1 : 2,
      caption =
        g.status === "invite"
          ? "Ready when you are"
          : g.status === "closed"
            ? "Game closed"
            : result === "draw"
              ? "It’s a draw"
              : result
                ? result === token
                  ? "You won!"
                  : "Your friend won!"
                : g.turn === context.me
                  ? "Your turn"
                  : "Your friend’s turn",
      panel = dialog.querySelector("#sp-game-board");
    panel.innerHTML =
      '<section class="sp-game-panel"><h3>' +
      caption +
      "</h3><p>" +
      gameName(g.kind) +
      '</p><div class="sp-board ' +
      g.kind +
      '">' +
      Array.from(
        { length: g.kind === "four" ? 42 : 9 },
        (_, i) =>
          '<button data-cell="' +
          i +
          '" class="token-' +
          g.board[i] +
          '" aria-label="Row ' +
          (Math.floor(i / (g.kind === "four" ? 7 : 3)) + 1) +
          ", column " +
          ((i % (g.kind === "four" ? 7 : 3)) + 1) +
          (g.board[i] ? ", player " + g.board[i] : ", empty") +
          '" ' +
          (g.status !== "playing" ||
          g.turn !== context.me ||
          result ||
          (g.kind === "ttt" && g.board[i])
            ? "disabled"
            : "") +
          ">" +
          (g.kind === "four"
            ? "●"
            : g.board[i] === 1
              ? "×"
              : g.board[i] === 2
                ? "○"
                : "") +
          "</button>",
      ).join("") +
      '</div><div class="sp-row">' +
      (g.status === "invite" && g.guest === context.me
        ? '<button id="sp-join-game" class="sp-primary">Accept invitation</button>'
        : "") +
      (g.status !== "closed"
        ? '<button id="sp-close-game">' +
          (g.status === "invite" ? "Decline / cancel" : "Close game") +
          "</button>"
        : "") +
      (g.status === "invite" && g.host === context.me
        ? '<button id="sp-resend-game">Resend invitation</button>'
        : "") +
      "</div></section>";
    bind("sp-join-game", () => changeGame("accept"));
    bind("sp-close-game", () => changeGame("close"));
    bind("sp-resend-game", () =>
      send(
        {
          text: "Invited you to play " + gameName(g.kind),
          skipGame: { id: selectedGame, kind: g.kind },
        },
        current(true).peer,
      ),
    );
    for (const b of panel.querySelectorAll("[data-cell]"))
      b.onclick = async () => {
        b.disabled = true;
        try {
          await changeGame(
            "move",
            g.kind === "four"
              ? Number(b.dataset.cell) % 7
              : Number(b.dataset.cell),
          );
        } catch (e) {
          fail(e);
          renderGames();
        }
      };
  }

  return {
    attach,
    detach,
    decorate,
    open,
    setUser,
    setVisible,
    effectPayload,
    clearEffect,
    markup: socialMessageMarkup,
  };
}
