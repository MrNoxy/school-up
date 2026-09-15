export const SPACE_THEMES = {
  default: { name: "Original", accent: "#8c9eff", bg: "" },
  midnight: {
    name: "Midnight",
    accent: "#aeb9ff",
    bg: "radial-gradient(ellipse at top right,#30336a,transparent 70%),#10121e",
  },
  blossom: {
    name: "Blossom",
    accent: "#ff9dcc",
    bg: "radial-gradient(ellipse at top left,#532842,transparent 70%),#1c121b",
  },
  arcade: {
    name: "Arcade",
    accent: "#a3ffb5",
    bg: "linear-gradient(135deg,#162b28,#211b38)",
  },
  tide: {
    name: "Tide",
    accent: "#80deed",
    bg: "radial-gradient(ellipse at bottom right,#154b59,transparent 70%),#101e2b",
  },
  sunset: {
    name: "Sunset",
    accent: "#ffbd88",
    bg: "linear-gradient(145deg,#452744,#281c29 50%,#452c24)",
  },
};
export const EFFECTS = {
  confetti: "Confetti",
  reveal: "Reveal",
  bounce: "Bounce",
};
export function winningLines(kind) {
  if (kind === "ttt")
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
  const lines = [];
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 7; c++)
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ]) {
        if (r + 3 * dr < 6 && c + 3 * dc >= 0 && c + 3 * dc < 7)
          lines.push([0, 1, 2, 3].map((i) => (r + i * dr) * 7 + c + i * dc));
      }
  return lines;
}
export function gameResult(game) {
  if (!game || !["ttt", "four"].includes(game.kind)) return null;
  const board = game.board || {};
  for (const line of winningLines(game.kind))
    if (board[line[0]] && line.every((i) => board[i] === board[line[0]]))
      return board[line[0]];
  return Object.values(board).filter((v) => v === 1 || v === 2).length ===
    (game.kind === "ttt" ? 9 : 42)
    ? "draw"
    : null;
}
export function availableSlots(schedule, date, start, end) {
  const minute = (t) =>
    /^\d\d:\d\d$/.test(t)
      ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
      : NaN;
  const from = minute(start),
    to = minute(end);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    from >= 1440 ||
    to <= from ||
    to > 1440 ||
    Number(start.slice(3)) > 59 ||
    Number(end.slice(3)) > 59 ||
    Number.isNaN(new Date(date + "T12:00:00Z").getTime())
  )
    throw Error("Choose a valid date and time window.");
  const day = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][new Date(date + "T12:00:00Z").getUTCDay()];
  const busy = schedule?.days?.[day] || [];
  return Array.from({ length: 288 }, (_, i) => {
    const a = i * 5,
      b = a + 5;
    return a >= from &&
      b <= to &&
      !busy.some((s) => minute(s.start) < b && minute(s.end) > a)
      ? "1"
      : "0";
  }).join("");
}
export function commonWindows(a, b, date) {
  if (
    !a ||
    !b ||
    a.date !== date ||
    b.date !== date ||
    a.zone !== b.zone ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]{288})$/.test(a.slots) ||
    !/^([01]{288})$/.test(b.slots)
  )
    return [];
  const result = [];
  let start = -1;
  for (let i = 0; i <= 288; i++) {
    const free = i < 288 && a.slots[i] === "1" && b.slots[i] === "1";
    if (free && start < 0) start = i;
    if (!free && start >= 0) {
      if (i - start >= 3) result.push([start * 5, i * 5]);
      start = -1;
    }
  }
  return result;
}
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const safe = (email) => email.replace(/\./g, ",");
const clock = (n) =>
  String(Math.floor(n / 60)).padStart(2, "0") +
  ":" +
  String(n % 60).padStart(2, "0");
export function socialMessageMarkup(message) {
  let html = "";
  if (
    message?.skipGame &&
    /^[A-Za-z0-9_-]{1,80}$/.test(message.skipGame.id) &&
    ["ttt", "four"].includes(message.skipGame.kind)
  )
    html += `<button class="sp-game-card" data-sp-game="${escape(message.skipGame.id)}">${message.skipGame.kind === "four" ? "● Four in a row" : "× Tic-tac-toe"}<small>Open the game board</small></button>`;
  if (Object.hasOwn(EFFECTS, message?.skipEffect || ""))
    html += `<button class="sp-effect-badge" data-sp-effect="${escape(message.skipEffect)}" aria-label="Play ${EFFECTS[message.skipEffect]} effect">✦ ${EFFECTS[message.skipEffect]}</button>`;
  return html;
}
export function createSkipSocial({
  auth,
  db,
  sdk,
  ensureDM,
  getWorkspace,
  send,
  toast,
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
  let context = null,
    epoch = 0,
    offs = [],
    space = null,
    availability = {},
    nicknames = {},
    games = {},
    selectedGame = null,
    tab = "room",
    selectedEffect = "",
    dialog = null,
    observer = null,
    frame = 0;
  let sharedDate = "",
    schedules = [],
    loadedWorkspace = false,
    lastFocus = null,
    gameOff = null,
    selectedGameRecord = null,
    reportedPermission = false;
  const seenEffects = new Set(),
    boundButtons = new WeakSet();
  const effectsEnabled = () => {
    try {
      return localStorage.getItem("skip_effects_enabled") !== "false";
    } catch {
      return true;
    }
  };
  const today = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  };
  function current() {
    if (!context || auth.currentUser?.uid !== context.uid)
      throw Error("Open a conversation while signed in.");
    return context;
  }
  function still(c) {
    if (c !== context || auth.currentUser?.uid !== c.uid)
      throw Error("The conversation changed. Please try again.");
  }
  function fail(err) {
    const denied = /permission[-_]denied/i.test(err.code || err.message || "");
    if (denied && reportedPermission) return;
    if (denied) reportedPermission = true;
    toast(
      denied
        ? "These features need the updated database rules. Your regular chat still works."
        : err.message || "Please try again.",
    );
  }
  function detach() {
    epoch++;
    gameOff?.();
    gameOff = null;
    selectedGameRecord = null;
    reportedPermission = false;
    for (const off of offs) off();
    offs = [];
    observer?.disconnect();
    observer = null;
    cancelAnimationFrame(frame);
    context?.surface?.classList.remove("sp-room");
    context?.surface?.style.removeProperty("--sp-room-bg");
    context?.surface?.style.removeProperty("--sp-accent");
    context?.surface?.querySelector(".sp-controls")?.remove();
    context?.surface?.querySelector(".sp-room-label")?.remove();
    context = null;
    space = null;
    games = {};
    availability = {};
    nicknames = {};
    selectedEffect = "";
    selectedGame = null;
    schedules = [];
    loadedWorkspace = false;
    if (dialog?.open) dialog.close();
  }
  function attach(c) {
    detach();
    context = {
      ...c,
      uid: auth.currentUser?.uid,
      me: safe(auth.currentUser?.email || ""),
    };
    const captured = context,
      run = epoch;
    sharedDate = today();
    const bar = document.createElement("div");
    bar.className = "sp-controls";
    for (const [key, label] of [
      ["room", "◈ Room"],
      ["free", "◷ Free together"],
      ["games", "▦ Games"],
      ["effects", "✦ Effects"],
    ]) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.onclick = () => open(key);
      bar.append(b);
    }
    c.header.append(bar);
    function watch(path, fn) {
      offs.push(
        onValue(
          ref(db, path),
          (s) => {
            if (epoch !== run) return;
            fn(s.val() || {});
            applyRoom();
            if (dialog?.open) refreshLive();
          },
          fail,
        ),
      );
    }
    watch("dm_spaces/" + c.id, (v) => (space = v));
    watch("dm_availability/" + c.id, (v) => (availability = v));
    watch("dm_nicknames/" + c.id, (v) => (nicknames = v));
    offs.push(
      onValue(
        query(
          ref(db, "dm_games/" + c.id),
          orderByChild("createdAt"),
          limitToLast(20),
        ),
        (s) => {
          if (epoch !== run) return;
          games = s.val() || {};
          if (dialog?.open && tab === "games") renderGames();
        },
        fail,
      ),
    );
    observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (context === captured) decorate();
      });
    });
    observer.observe(c.messages, { childList: true, subtree: true });
    decorate();
  }
  function applyRoom() {
    if (!context) return;
    const theme = SPACE_THEMES[space?.theme] || SPACE_THEMES.default;
    const surface = context.surface;
    surface.classList.toggle("sp-room", !!theme.bg);
    surface.style.setProperty("--sp-room-bg", theme.bg || "transparent");
    surface.style.setProperty("--sp-accent", theme.accent);
    let label = surface.querySelector(".sp-room-label");
    if (!label) {
      label = document.createElement("div");
      label.className = "sp-room-label";
      context.header.append(label);
    }
    label.textContent = [
      space?.title,
      nicknames[context.me] ? "You: " + nicknames[context.me] : "",
      nicknames[context.peer] ? "Friend: " + nicknames[context.peer] : "",
    ]
      .filter(Boolean)
      .join(" · ");
    label.hidden = !label.textContent;
  }
  function playEffect(kind, target) {
    if (
      !Object.hasOwn(EFFECTS, kind) ||
      !effectsEnabled() ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const el = target?.closest(".chat-message,.message") || target;
    if (!el) return;
    el.classList.remove("sp-fx-confetti", "sp-fx-reveal", "sp-fx-bounce");
    void el.offsetWidth;
    el.classList.add("sp-fx-" + kind);
    setTimeout(() => el.classList.remove("sp-fx-" + kind), 1300);
  }
  function decorate() {
    if (!context) return;
    for (const b of context.messages.querySelectorAll("[data-sp-effect]")) {
      if (boundButtons.has(b)) continue;
      boundButtons.add(b);
      b.onclick = () => playEffect(b.dataset.spEffect, b);
      const row = b.closest("[data-message-key],.message"),
        key = context.id + ":" + (row?.dataset.messageKey || row?.id || "");
      if (!seenEffects.has(key)) {
        seenEffects.add(key);
        if (document.visibilityState === "visible")
          playEffect(b.dataset.spEffect, b);
      }
    }
    for (const b of context.messages.querySelectorAll("[data-sp-game]")) {
      if (boundButtons.has(b)) continue;
      boundButtons.add(b);
      b.onclick = () => {
        selectGame(b.dataset.spGame);
        open("games");
      };
    }
  }
  function selectGame(id) {
    const c = current();
    selectedGame = id;
    selectedGameRecord = games[id] || null;
    gameOff?.();
    gameOff = onValue(
      ref(db, "dm_games/" + c.id + "/" + id),
      (snap) => {
        if (context !== c || selectedGame !== id) return;
        selectedGameRecord = snap.val();
        if (dialog?.open && tab === "games") renderGames();
      },
      fail,
    );
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement("dialog");
    dialog.className = "sp-dialog";
    dialog.innerHTML =
      '<div class="sp-dialog-head"><h2 id="sp-title">Your shared room</h2><button id="sp-close" aria-label="Close">×</button></div><div class="sp-tabs"></div><div id="sp-body"></div><p class="sp-error" id="sp-error" role="alert"></p>';
    dialog.setAttribute("aria-labelledby", "sp-title");
    document.body.append(dialog);
    dialog.querySelector("#sp-close").onclick = () => dialog.close();
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    dialog.addEventListener(
      "close",
      () => lastFocus?.isConnected && lastFocus.focus(),
    );
  }
  function open(next) {
    current();
    ensureDialog();
    tab = next;
    lastFocus = document.activeElement;
    render();
    if (!dialog.open) dialog.showModal();
  }
  const body = () => dialog.querySelector("#sp-body");
  function bind(id, fn) {
    const el = dialog.querySelector("#" + id);
    if (!el) return;
    el.onclick = async () => {
      const c = current();
      el.disabled = true;
      dialog.querySelector("#sp-error").textContent = "";
      try {
        await fn(c);
      } catch (err) {
        dialog.querySelector("#sp-error").textContent =
          err.message || "Please try again.";
        fail(err);
      } finally {
        el.disabled = false;
      }
    };
  }
  function render() {
    if (!context) return;
    dialog.querySelector("#sp-title").textContent = {
      room: "Your shared room",
      free: "Free together",
      games: "A little friendly competition",
      effects: "Make a message special",
    }[tab];
    dialog.querySelector(".sp-tabs").innerHTML = [
      "room",
      "free",
      "games",
      "effects",
    ]
      .map(
        (t) =>
          `<button data-tab="${t}" class="${tab === t ? "active" : ""}">${{ room: "Room", free: "Free together", games: "Games", effects: "Effects" }[t]}</button>`,
      )
      .join("");
    for (const b of dialog.querySelectorAll("[data-tab]"))
      b.onclick = () => {
        tab = b.dataset.tab;
        render();
      };
    ({
      room: renderRoom,
      free: renderFree,
      games: renderGames,
      effects: renderEffects,
    })[tab]();
  }
  function refreshLive() {
    if (tab === "room") renderRoomLive();
    if (tab === "free") renderFreeLive();
  }
  async function roomAction(c, action, proposal) {
    await runTransaction(
      ref(db, "dm_spaces/" + c.id),
      (old) => {
        still(c);
        const base = old || { revision: 0, theme: "default", title: "" };
        if (action === "propose")
          return {
            ...base,
            revision: base.revision + 1,
            proposal: { ...proposal, by: c.me },
          };
        if (!base.proposal) return;
        if (action === "accept" && base.proposal.by === c.me) return;
        return {
          revision: base.revision + 1,
          theme: action === "accept" ? base.proposal.theme : base.theme,
          title: action === "accept" ? base.proposal.title : base.title,
        };
      },
      { applyLocally: false },
    );
  }
  function renderRoom() {
    body().innerHTML = `<p class="sp-lead">A place for just the two of you. A shared look changes after you both agree.</p><div id="sp-room-live"></div><label>Room name<input id="sp-room-name" maxlength="40" placeholder="Our little corner" value="${escape(space?.title || "")}"></label><label>Theme<select id="sp-theme">${Object.entries(
      SPACE_THEMES,
    )
      .map(
        ([id, t]) =>
          `<option value="${id}" ${space?.theme === id ? "selected" : ""}>${t.name}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="sp-theme-preview" id="sp-preview"></div><button class="sp-primary" id="sp-propose">Suggest this room</button><hr><label>Your nickname in this room<input id="sp-nickname" maxlength="30" value="${escape(nicknames[context.me] || "")}" placeholder="Optional"></label><button id="sp-save-nickname">Save my nickname</button><p class="sp-note">Nicknames stay in this room. Your Skip profile stays the same.</p>`;
    const preview = () => {
      const t = SPACE_THEMES[dialog.querySelector("#sp-theme").value];
      const p = dialog.querySelector("#sp-preview");
      p.style.background = t.bg || "#20232d";
      p.style.color = t.accent;
      p.textContent = t.name + " · A little space of our own";
    };
    dialog.querySelector("#sp-theme").onchange = preview;
    preview();
    bind("sp-propose", (c) =>
      roomAction(c, "propose", {
        theme: dialog.querySelector("#sp-theme").value,
        title: dialog.querySelector("#sp-room-name").value.trim(),
      }),
    );
    bind("sp-save-nickname", (c) =>
      set(
        ref(db, "dm_nicknames/" + c.id + "/" + c.me),
        dialog.querySelector("#sp-nickname").value.trim() || null,
      ),
    );
    renderRoomLive();
  }
  function renderRoomLive() {
    const el = dialog.querySelector("#sp-room-live");
    if (!el) return;
    const p = space?.proposal;
    el.innerHTML = p
      ? `<div class="sp-notice"><b>${p.by === context.me ? "Waiting for your friend" : "Your friend suggested a room"}</b><p>${escape(p.title || "Untitled room")} · ${escape(SPACE_THEMES[p.theme]?.name || p.theme)}</p>${p.by !== context.me ? '<button class="sp-primary" id="sp-accept-room">Accept</button>' : ""}<button id="sp-dismiss-room">${p.by === context.me ? "Cancel suggestion" : "Decline"}</button></div>`
      : "";
    bind("sp-accept-room", (c) => roomAction(c, "accept"));
    bind("sp-dismiss-room", (c) => roomAction(c, "dismiss"));
  }
  async function loadWorkspace() {
    const c = current();
    try {
      const data = await getWorkspace();
      still(c);
      schedules = Array.isArray(data?.schedules) ? data.schedules : [];
      loadedWorkspace = true;
      if (dialog.open && tab === "free") {
        const select = dialog.querySelector("#sp-schedule");
        for (const [i, s] of schedules.entries()) {
          const option = document.createElement("option");
          option.value = String(i);
          option.textContent = s.name || "Schedule";
          select.append(option);
        }
        dialog.querySelector("#sp-workspace-note").textContent =
          schedules.length
            ? "Choose a School Up schedule to exclude its classes."
            : "No synced schedules found. You can still share a time window.";
      }
    } catch (err) {
      if (context !== c) return;
      loadedWorkspace = true;
      if (dialog?.open && tab === "free")
        dialog.querySelector("#sp-workspace-note").textContent =
          "Schedules could not load. Reopen this conversation to retry, or share a time window.";
      fail(err);
    }
  }
  function renderFree() {
    body().innerHTML = `<p class="sp-lead">Find time for a call, a game, or a coffee. Only your free time is shared with this friend.</p><label>Date<input type="date" id="sp-date" min="${today()}" value="${sharedDate}"></label><div class="sp-row"><label>From<input type="time" step="300" id="sp-from" value="09:00"></label><label>Until<input type="time" step="300" id="sp-until" value="22:00"></label></div><label>Schedule to subtract<select id="sp-schedule"><option value="">No schedule — share my whole time window</option>${schedules.map((s, i) => `<option value="${i}">${escape(s.name || "Schedule")}</option>`).join("")}</select></label><p class="sp-note"><span id="sp-workspace-note">${loadedWorkspace ? (schedules.length ? "Choose a School Up schedule to exclude its classes." : "No synced School Up schedules found. You can still share a time window.") : "Loading your School Up schedules…"}</span> Times use your device’s timezone: ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}. Share a fresh snapshot after changing your schedule.</p><button class="sp-primary" id="sp-share-free">Share availability for this date</button><button id="sp-revoke-free">Stop sharing my availability</button><div id="sp-free-live" aria-live="polite"></div>`;
    dialog.querySelector("#sp-date").onchange = (e) => {
      sharedDate = e.target.value;
      renderFreeLive();
    };
    bind("sp-share-free", async (c) => {
      const index = dialog.querySelector("#sp-schedule").value;
      const date = dialog.querySelector("#sp-date").value;
      if (date < today()) throw Error("Choose today or a future date.");
      const slots = availableSlots(
        index === "" ? null : schedules[Number(index)],
        date,
        dialog.querySelector("#sp-from").value,
        dialog.querySelector("#sp-until").value,
      );
      await set(ref(db, "dm_availability/" + c.id + "/" + c.me), {
        date,
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        slots,
        updatedAt: Date.now(),
      });
    });
    bind("sp-revoke-free", (c) =>
      remove(ref(db, "dm_availability/" + c.id + "/" + c.me)),
    );
    renderFreeLive();
    if (!loadedWorkspace) loadWorkspace().catch(fail);
  }
  function renderFreeLive() {
    const el = dialog.querySelector("#sp-free-live");
    if (!el || !context) return;
    const mine = availability[context.me],
      peer = availability[context.peer],
      date = sharedDate;
    if (!mine || !peer || mine.date !== date || peer.date !== date) {
      el.innerHTML =
        '<div class="sp-notice">' +
        (!mine || mine.date !== date
          ? "Share your availability above. "
          : "Your availability is shared. ") +
        (!peer || peer.date !== date
          ? "Waiting for your friend to share this date."
          : "Your friend has shared this date.") +
        "</div>";
      return;
    }
    if (mine.zone !== peer.zone) {
      el.innerHTML =
        '<div class="sp-notice">You shared different timezones. Compare a new snapshot using the same device timezone; these times are not being combined.</div>';
      return;
    }
    const windows = commonWindows(mine, peer, date);
    el.innerHTML = `<div class="sp-notice"><b>${windows.length ? "You’re both free" : "No shared free time of 15 minutes or more"}</b><p>${escape(date)} · ${escape(mine.zone)}</p>${windows.map(([a, b]) => `<span class="sp-time-chip">${clock(a)} – ${clock(b)}</span>`).join("")}</div>`;
  }
  async function newGame(kind) {
    const c = current(),
      id = push(ref(db, "dm_games/" + c.id)).key;
    const game = {
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
    await set(ref(db, "dm_games/" + c.id + "/" + id), game);
    still(c);
    selectGame(id);
    try {
      await send(
        {
          text:
            "Want to play " +
            (kind === "ttt" ? "tic-tac-toe" : "four in a row") +
            "?",
          skipGame: { id, kind },
        },
        c.peer,
      );
    } catch (err) {
      if (context === c)
        toast("Game created in Games. The chat invitation could not be sent.");
    }
    if (context === c && dialog?.open && tab === "games") renderGames();
  }
  async function changeGame(action, index) {
    const c = current(),
      id = selectedGame;
    const result = await runTransaction(
      ref(db, "dm_games/" + c.id + "/" + id),
      (game) => {
        still(c);
        if (!game) return;
        if (action === "accept") {
          if (game.status !== "invite" || game.guest !== c.me) return;
          return { ...game, status: "playing", revision: game.revision + 1 };
        }
        if (action === "close")
          return { ...game, status: "closed", revision: game.revision + 1 };
        if (game.status !== "playing" || game.turn !== c.me || gameResult(game))
          return;
        let cell = index;
        if (game.kind === "four") {
          cell = -1;
          for (let r = 5; r >= 0; r--)
            if (game.board[r * 7 + index] === 0) {
              cell = r * 7 + index;
              break;
            }
        }
        if (cell < 0 || game.board[cell] !== 0) return;
        return {
          ...game,
          board: { ...game.board, [cell]: game.host === c.me ? 1 : 2 },
          move: cell,
          ply: game.ply + 1,
          revision: game.revision + 1,
          turn: c.me === game.host ? game.guest : game.host,
        };
      },
      { applyLocally: false },
    );
    if (!result.committed)
      throw Error("That move is no longer available. Try the current board.");
  }
  function renderGames() {
    if (!dialog?.open && tab !== "games") return;
    const game = selectedGame
      ? selectedGameRecord || games[selectedGame]
      : null;
    body().innerHTML =
      '<div class="sp-row"><button class="sp-primary" id="sp-new-ttt">× Tic-tac-toe</button><button id="sp-new-four">● Four in a row</button></div><p class="sp-note">Your friend accepts the invitation first. Take turns whenever you’re online.</p><div id="sp-game-board"></div><h3>Recent games</h3><div class="sp-games-list">' +
      Object.entries(games)
        .sort((a, b) => b[1].createdAt - a[1].createdAt)
        .map(
          ([id, g]) =>
            `<button data-select-game="${escape(id)}">${g.kind === "four" ? "Four in a row" : "Tic-tac-toe"}<small>${g.status === "invite" ? "Invitation" : g.status === "closed" ? "Closed" : gameResult(g) ? "Finished" : "In play"}</small></button>`,
        )
        .join("") +
      "</div>";
    bind("sp-new-ttt", () => newGame("ttt"));
    bind("sp-new-four", () => newGame("four"));
    for (const b of dialog.querySelectorAll("[data-select-game]"))
      b.onclick = () => {
        selectGame(b.dataset.selectGame);
        renderGames();
      };
    const panel = dialog.querySelector("#sp-game-board");
    if (selectedGame && !game) {
      panel.textContent =
        "Loading this game… If it stays unavailable, reopen the conversation.";
      return;
    }
    if (!game) return;
    const result = gameResult(game),
      myToken = game.host === context.me ? 1 : 2;
    let caption =
      game.status === "invite"
        ? "Game invitation"
        : game.status === "closed"
          ? "Game closed"
          : result === "draw"
            ? "It’s a draw"
            : result
              ? result === myToken
                ? "You won!"
                : "Your friend won!"
              : game.turn === context.me
                ? "Your turn"
                : "Your friend’s turn";
    panel.innerHTML = `<div class="sp-notice"><h3>${caption}</h3>${game.status === "invite" && game.guest === context.me ? '<button id="sp-join-game" class="sp-primary">Accept & play</button>' : ""}${game.status !== "closed" ? '<button id="sp-close-game">' + (game.status === "invite" ? "Decline / cancel" : "Close game") + "</button>" : ""}<div class="sp-board ${game.kind === "four" ? "four" : "ttt"}">${Array.from({ length: game.kind === "four" ? 42 : 9 }, (_, i) => `<button data-cell="${i}" class="token-${game.board[i] || 0}" aria-label="${game.kind === "four" ? "Row " + (Math.floor(i / 7) + 1) + ", column " + ((i % 7) + 1) : "Square " + (i + 1)}${game.board[i] ? ", occupied by player " + game.board[i] : ", empty"}" ${game.status !== "playing" || game.turn !== context.me || result ? "disabled" : ""}>${game.kind === "ttt" ? (game.board[i] === 1 ? "×" : game.board[i] === 2 ? "○" : "") : "●"}</button>`).join("")}</div></div>`;
    bind("sp-join-game", () => changeGame("accept"));
    bind("sp-close-game", () => changeGame("close"));
    for (const b of panel.querySelectorAll("[data-cell]"))
      b.onclick = async () => {
        b.disabled = true;
        try {
          await changeGame(
            "move",
            game.kind === "four"
              ? Number(b.dataset.cell) % 7
              : Number(b.dataset.cell),
          );
        } catch (e) {
          fail(e);
          renderGames();
        }
      };
  }
  function renderEffects() {
    body().innerHTML = `<p class="sp-lead">Pick an effect for your next message. It stays with that message in both apps.</p><div class="sp-effect-options">${[["", "None"], ...Object.entries(EFFECTS)].map(([id, label]) => `<button data-effect-choice="${id}" class="${selectedEffect === id ? "selected" : ""}">${id ? "✦ " : ""}${label}</button>`).join("")}</div><label class="sp-check"><input type="checkbox" id="sp-effects-on" ${effectsEnabled() ? "checked" : ""}> Play message effects on this device</label><p class="sp-note">Effects respect Reduce Motion. Reveal is an animation, not a secret or disappearing message.</p><div class="sp-effect-demo message">A little something for you ✨</div>`;
    for (const b of dialog.querySelectorAll("[data-effect-choice]"))
      b.onclick = () => {
        selectedEffect = b.dataset.effectChoice;
        renderEffects();
        if (selectedEffect)
          playEffect(selectedEffect, dialog.querySelector(".sp-effect-demo"));
      };
    dialog.querySelector("#sp-effects-on").onchange = (e) => {
      try {
        localStorage.setItem("skip_effects_enabled", String(e.target.checked));
      } catch {}
    };
  }
  return {
    attach,
    detach,
    decorate,
    open,
    markup: socialMessageMarkup,
    effectPayload: () => (selectedEffect ? { skipEffect: selectedEffect } : {}),
    clearEffect: () => {
      selectedEffect = "";
    },
  };
}
