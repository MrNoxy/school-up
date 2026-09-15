import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  onValue,
  update,
  remove,
  push,
  query,
  orderByChild,
  limitToLast,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { SKIP_CONFIG } from "./skip-config.js?v=dmfix3";
import { createSkipData } from "./skip-data.js?v=dmfix3";
const S = window.SchoolUp,
  $ = (id) => document.getElementById(id),
  esc = S.esc,
  icon = S.icon;
const app = initializeApp(SKIP_CONFIG.firebase, "schoolup-skip");
const auth = getAuth(app),
  db = getDatabase(app);
const skipData = createSkipData({
  auth,
  db,
  sdk: { ref, get, update, runTransaction },
});
const safe = (email) => email.replace(/\./g, ","),
  dmId = (a, b) => [a, b].sort().join("_");
let user = null,
  profile = null,
  session = null,
  ready = false,
  mode = "login",
  authError = "",
  registrationName = "",
  generation = 0,
  authLoading = true;
let unsubs = [],
  contactUnsubs = new Map(),
  profiles = new Map(),
  friends = {},
  requests = {},
  metas = {},
  activePeer = null,
  messageUnsub = null,
  messages = new Map(),
  messageLimit = 100;
let syncReady = false,
  revision = 0,
  dirty = false,
  writing = false,
  saveTimer = null,
  changeNumber = 0,
  conflict = null,
  savePromise = null,
  pendingRemote = null;
const guestBeforeLogin = S.getGuestState();
const pendingKey = (uid) => "schoolup_pending:" + uid;
const readLocal = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};
function errorMessage(err) {
  const code = err?.code || "";
  if (/invalid-credential|wrong-password|user-not-found/.test(code))
    return "Those sign-in details did not match. Please try again.";
  if (/email-already-in-use/.test(code))
    return "That email already has a Skip account. Choose “Sign in”.";
  if (/too-many-requests|resource-exhausted/.test(code))
    return "Too many attempts. Try later, or recover access with your Skip email.";
  if (/weak-password/.test(code))
    return "Choose a password with at least 8 characters.";
  if (/network-request-failed|unavailable/.test(code))
    return "Skip account services could not be reached. The app owner may still need to activate this update.";
  if (/permission-denied/.test(code))
    return "Access was denied. Reconnect your account; the app owner may need to update the privacy rules.";
  return (
    err?.message?.replace(/^Firebase:\s*/, "").slice(0, 240) ||
    "Something went wrong. Please try again."
  );
}
function showError(err) {
  authError = errorMessage(err);
  const el = $("account-error");
  if (el) {
    el.textContent = authError;
    el.hidden = false;
  } else S.toast(authError);
}
function field(id, label, type = "text", attrs = "") {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" ${attrs} required></div>`;
}
function authBrand() {
  return '<div class="auth-brand">School Up <span>×</span> <b>Skip</b></div>';
}
function openAccount(nextMode) {
  if (nextMode) mode = nextMode;
  authError = "";
  renderAccount();
  S.openDialog("skip-auth");
}
function renderAccount() {
  const body = $("skip-auth-body");
  $("skip-auth-title").textContent = user
    ? "Your account"
    : "Welcome to School Up";
  let html = authBrand();
  if (authLoading) {
    body.innerHTML = html + '<p class="muted">Connecting to Skip…</p>';
    return;
  }
  if (user) {
    if (!ready) {
      html += `<h3 class="auth-heading">Connected to Skip</h3><p class="muted">${esc(user.email)}</p><p class="account-notice">${esc(authError || "Loading your account…")}</p><button class="primary full" data-skip-action="retry-session">Retry connection</button>${!user.emailVerified ? '<button class="text-button full" data-skip-action="verify-email">Verify my email</button>' : ""}<button class="text-button full" data-skip-action="signout">Sign out</button>`;
    } else if (!session.handle && mode !== "account") {
      html += `<h3 class="auth-heading">Your very own @tag</h3><p class="auth-description">Choose a unique name so friends can find you in School Up. You’ll sign in with your Skip email and password.</p><form id="link-account-form">${field("link-handle", "Unique School Up tag", "text", 'minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocomplete="nickname" autocapitalize="none" spellcheck="false" placeholder="your_tag"')}<p class="hint">3–24 letters, numbers, or underscores. Tags ignore capitalization and are permanent once chosen.</p><button class="primary full" type="submit">Claim my tag</button></form><button class="text-button full" data-skip-action="skip-onboarding">Set up later</button>`;
    } else {
      html += `<div class="account-identity"><span class="large-avatar">${esc((profile.username || "S")[0].toUpperCase())}</span><h3>${esc(session.handle ? "@" + session.handle : profile.username)}</h3><p class="muted">Skip · ${esc(profile.username)}#${esc(profile.tag || "")}</p></div><div class="account-status"><span>Schedules</span><b id="account-sync-status">${esc($("sync-indicator").textContent)}</b></div>${!session.handle ? `<button class="settings-link" data-skip-action="setup-tag"><span class="settings-link-icon">${icon("lock")}</span><span><b>Choose your School Up tag</b><small>A unique name for finding friends</small></span>${icon("chevron")}</button>` : '<p class="hint">Sign in on any device with your Skip email and password. Your session is remembered in this browser.</p>'}<button class="settings-link" data-skip-action="import-device"><span class="settings-link-icon">${icon("copy")}</span><span><b>Copy device schedules into account</b><small>Your original device copy is kept</small></span>${icon("chevron")}</button>${SKIP_CONFIG.skipUrl && validUrl(SKIP_CONFIG.skipUrl) ? `<a class="secondary full link-button" href="${esc(SKIP_CONFIG.skipUrl)}" target="_blank" rel="noopener noreferrer">Open Skip</a>` : ""}${!user.emailVerified ? '<button class="text-button full" data-skip-action="verify-email">Verify my email</button>' : ""}<button class="text-button full" data-skip-action="signout">Sign out</button>`;
    }
  } else {
    html += `<p class="auth-description">Powered by Skip. One account for your chats, friends, and school week.</p><div class="auth-tabs" role="group" aria-label="Sign-in method">${[
      ["login", "Sign in"],
      ["register", "Create account"],
    ]
      .map(
        ([id, label]) =>
          `<button data-auth-mode="${id}" class="${mode === id ? "active" : ""}" aria-pressed="${mode === id}">${label}</button>`,
      )
      .join("")}</div>`;
    if (mode === "register") {
      html += `<form id="skip-register-form">${field("register-name", "Skip display name", "text", 'minlength="2" maxlength="20" pattern="[A-Za-z0-9_]{2,20}" autocomplete="nickname"')}${field("register-email", "Email", "email", 'autocomplete="email"')}${field("register-password", "Password", "password", 'minlength="8" autocomplete="new-password"')}${field("register-confirm", "Confirm password", "password", 'minlength="8" autocomplete="new-password"')}<p class="hint">This creates a Skip account you can use in both apps.</p><button class="primary full" type="submit">Create Skip account</button></form>`;
    } else {
      html += `<form id="skip-login-form">${field("login-email", "Skip email", "email", 'autocomplete="email"')}${field("login-password", "Skip password", "password", 'autocomplete="current-password"')}<button class="primary full" type="submit">Continue with Skip</button></form><button class="text-button full" data-skip-action="reset-password">Forgot password?</button>`;
    }
    html +=
      '<button class="text-button full auth-local" data-skip-action="local">Continue on this device without an account</button>';
  }
  html += `<p id="account-error" class="error" role="alert" ${authError ? "" : "hidden"}>${esc(authError)}</p>`;
  body.innerHTML = html;
  if ($("link-handle") && session?.handle) {
    $("link-handle").value = session.handle;
    $("link-handle").readOnly = true;
  }
  bindForms();
}
function bindForm(id, handler) {
  const form = $(id);
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("button[type=submit]"),
      old = button.textContent;
    button.disabled = true;
    button.textContent = "One moment…";
    authError = "";
    $("account-error").hidden = true;
    try {
      await handler(form);
    } catch (err) {
      showError(err);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  };
}
function bindForms() {
  bindForm("skip-login-form", async () => {
    await signInWithEmailAndPassword(
      auth,
      $("login-email").value.trim(),
      $("login-password").value,
    );
    if ($("login-password")) $("login-password").value = "";
  });
  bindForm("skip-register-form", async () => {
    if ($("register-password").value !== $("register-confirm").value)
      throw Error("Your passwords do not match.");
    registrationName = $("register-name").value.trim();
    const credential = await createUserWithEmailAndPassword(
      auth,
      $("register-email").value.trim(),
      $("register-password").value,
    );
    try {
      await sendEmailVerification(credential.user);
      S.toast("Account created. Check your email to verify it.");
    } catch {
      S.toast(
        "Account created. You can send a verification email from your account later.",
      );
    }
  });
  bindForm("link-account-form", async () => {
    const result = await skipData.claimHandle($("link-handle").value);
    session = { ...session, handle: result };
    S.setAccount({ name: profile.username, handle: result });
    mode = "account";
    renderAccount();
    S.toast("Your School Up tag is connected");
  });
}

function stopListeners() {
  for (const fn of unsubs) fn();
  unsubs = [];
  for (const fn of contactUnsubs.values()) fn();
  contactUnsubs.clear();
  messageUnsub?.();
  messageUnsub = null;
  profiles.clear();
  messages.clear();
  friends = {};
  requests = {};
  metas = {};
  activePeer = null;
  clearTimeout(saveTimer);
  syncReady = false;
  dirty = false;
  conflict = null;
  writing = false;
  savePromise = null;
  pendingRemote = null;
  $("friends-screen").classList.remove("chat-open");
  $("friends-screen").innerHTML = "";
  $("friends-count").hidden = true;
  renderSyncNotice();
}
async function connectUser(nextUser) {
  const run = ++generation;
  stopListeners();
  user = nextUser;
  profile = null;
  session = null;
  ready = false;
  authLoading = false;
  if (!user) {
    S.setAccount(null);
    S.setSync("On this device");
    if (S.getWorkspaceUid()) {
      S.useWorkspace(
        null,
        S.getGuestState() || guestBeforeLogin || S.blankState(),
      );
    }
    renderFriends();
    if ($("skip-auth").open) renderAccount();
    return;
  }
  S.setAccount({ name: user.email?.split("@")[0] || "Skip", handle: null });
  S.useWorkspace(user.uid, S.getCachedWorkspace(user.uid) || S.blankState());
  S.setSync("Connecting…");
  if ($("skip-auth").open) renderAccount();
  try {
    const result = await skipData.session(registrationName);
    registrationName = "";
    if (run !== generation) return;
    session = result;
    profile = result.profile;
    ready = true;
    S.setAccount({ name: profile.username, handle: session.handle });
    await connectWorkspace(run);
    if (run !== generation) return;
    listenContacts();
    renderFriends();
    mode = session.handle ? "account" : "tag";
    if ($("skip-auth").open || !session.handle) openAccount(mode);
  } catch (err) {
    if (run !== generation) return;
    ready = false;
    authError = errorMessage(err);
    S.setSync("Account unavailable");
    renderFriends();
    if ($("skip-auth").open) renderAccount();
  }
}
function parseCloud(value) {
  if (
    !value ||
    !Number.isInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.dataJson !== "string"
  )
    throw Error(
      "Your synced schedule data could not be read. Your device copy has been kept.",
    );
  return {
    revision: value.revision,
    state: S.normalizeWorkspace(JSON.parse(value.dataJson)),
  };
}
async function connectWorkspace(run) {
  const uid = user.uid,
    path = ref(db, "schoolup_accounts/" + uid + "/workspace"),
    snap = await get(path);
  if (run !== generation) return;
  const cloud = snap.exists() ? parseCloud(snap.val()) : null,
    cached = S.getCachedWorkspace(uid);
  let pending = null;
  try {
    pending = JSON.parse(readLocal(pendingKey(uid)) || "null");
  } catch {}
  revision = cloud?.revision || 0;
  dirty = !!pending && !!cached;
  conflict = dirty && pending.baseRevision !== revision ? cloud : null;
  if (dirty) {
    revision = pending.baseRevision || 0;
    S.useWorkspace(uid, cached);
  } else S.useWorkspace(uid, cloud?.state || cached || S.blankState());
  syncReady = true;
  S.setSync(
    conflict
      ? "Sync needs attention"
      : dirty
        ? "Saving…"
        : cloud
          ? "Synced with Skip"
          : "Ready to sync",
  );
  unsubs.push(
    onValue(
      path,
      (snapshot) => {
        if (run !== generation || !snapshot.exists()) return;
        if (writing) {
          pendingRemote = snapshot.val();
          return;
        }
        receiveWorkspace(snapshot.val(), run, uid);
      },
      (err) => {
        S.setSync("Sync unavailable");
        S.toast(errorMessage(err));
      },
    ),
  );
  if (!cloud && !dirty) queueSave();
  else if (dirty && !conflict) queueSave();
  renderSyncNotice();
}
function receiveWorkspace(value, run, uid) {
  if (run !== generation) return;
  try {
    const incoming = parseCloud(value);
    if (incoming.revision <= revision) return;
    if (dirty || $("editor").open || $("name-dialog").open) {
      conflict = incoming;
      S.setSync("Sync needs attention");
      renderSyncNotice();
    } else {
      revision = incoming.revision;
      S.useWorkspace(uid, incoming.state);
      S.setSync("Synced with Skip");
    }
  } catch (err) {
    S.setSync("Sync unavailable");
    S.toast(errorMessage(err));
  }
}
function queueSave() {
  if (!ready || !syncReady || !user) return;
  dirty = true;
  changeNumber++;
  writeLocal(pendingKey(user.uid), JSON.stringify({ baseRevision: revision }));
  clearTimeout(saveTimer);
  if (conflict) {
    renderSyncNotice();
    return;
  }
  S.setSync(navigator.onLine ? "Saving…" : "Saved on device");
  saveTimer = setTimeout(() => flushSave(), 900);
}
async function flushSave() {
  if (savePromise) return savePromise;
  if (!navigator.onLine) return;
  if (!dirty || !syncReady || !user || conflict) return;
  const uid = user.uid,
    saveGeneration = generation,
    base = revision,
    seq = changeNumber,
    dataJson = JSON.stringify(S.getState());
  if (dataJson.length > 3500000) {
    S.setSync("Too large to sync");
    S.toast(
      "This account is too large to sync. Export a backup and remove an oversized background.",
    );
    return;
  }
  writing = true;
  savePromise = (async () => {
    try {
      const r = await runTransaction(
        ref(db, "schoolup_accounts/" + uid + "/workspace"),
        (old) => {
          if (auth.currentUser?.uid !== uid) return;
          if ((old?.revision || 0) !== base) return;
          return { revision: base + 1, dataJson, updatedAt: serverTimestamp() };
        },
        { applyLocally: false },
      );
      if (user?.uid !== uid || saveGeneration !== generation) return;
      if (!r.committed) {
        conflict = r.snapshot.exists()
          ? parseCloud(r.snapshot.val())
          : { revision: 0, state: S.blankState() };
        S.setSync("Sync needs attention");
        renderSyncNotice();
        return;
      }
      revision = base + 1;
      dirty = seq !== changeNumber;
      if (!dirty) {
        try {
          localStorage.removeItem(pendingKey(uid));
        } catch {}
        S.setSync("Synced with Skip");
      } else {
        writeLocal(pendingKey(uid), JSON.stringify({ baseRevision: revision }));
        saveTimer = setTimeout(flushSave, 300);
      }
    } catch (err) {
      if (user?.uid === uid) {
        S.setSync("Saved on device");
        S.toast("Cloud sync paused. Your changes are kept on this device.");
      }
    } finally {
      if (saveGeneration === generation) {
        writing = false;
        savePromise = null;
        if (pendingRemote) {
          const pending = pendingRemote;
          pendingRemote = null;
          receiveWorkspace(pending, saveGeneration, uid);
        }
      }
    }
  })();
  return savePromise;
}
function renderSyncNotice() {
  let notice = $("sync-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "sync-notice";
    notice.className = "sync-notice";
    $("schedule-screen").prepend(notice);
  }
  notice.hidden = !conflict;
  notice.innerHTML = conflict
    ? '<p>Your account changed on another device. Keep your edits as copies, or load the synced version.</p><button class="secondary" data-sync-action="merge">Keep both as copies</button><button class="text-button" data-sync-action="load">Load synced version</button>'
    : "";
}
function resolveSync(action) {
  if (!conflict) return;
  const incoming = conflict,
    local = S.getState();
  if (action === "merge") {
    const merged = structuredClone(incoming.state);
    for (const schedule of local.schedules) {
      const existing = merged.schedules.find((s) => s.id === schedule.id);
      if (existing && JSON.stringify(existing) === JSON.stringify(schedule))
        continue;
      merged.schedules.push({
        ...schedule,
        id: crypto.randomUUID(),
        name: (schedule.name + " · device copy").slice(0, 70),
      });
    }
    S.useWorkspace(user.uid, merged);
    revision = incoming.revision;
    conflict = null;
    queueSave();
  } else
    S.confirmAction(
      "Load synced schedules?",
      "The account version will replace the working copy on this device. Export a backup first if you want to keep unsynced edits.",
      "Load schedules",
      () => {
        S.useWorkspace(user.uid, incoming.state);
        revision = incoming.revision;
        conflict = null;
        dirty = false;
        try {
          localStorage.removeItem(pendingKey(user.uid));
        } catch {}
        S.setSync("Synced with Skip");
        renderSyncNotice();
      },
    );
  renderSyncNotice();
}
function validUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
function avatarHtml(p) {
  const src =
    typeof p?.avatar === "string" &&
    (validUrl(p.avatar) ||
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(p.avatar))
      ? p.avatar
      : null;
  return src
    ? `<img class="friend-avatar" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="friend-avatar initial">${esc((p?.username || "?")[0].toUpperCase())}</span>`;
}
function listenContacts() {
  const me = safe(user.email),
    listen = (path, setter) =>
      unsubs.push(
        onValue(
          ref(db, path),
          (snap) => {
            setter(snap.val() || {});
            syncProfileListeners();
            renderFriendList();
          },
          (err) => S.toast(errorMessage(err)),
        ),
      );
  listen("friends/" + me, (v) => (friends = v));
  listen("friend_requests/" + me, (v) => (requests = v));
  listen("dm_meta/" + me, (v) => (metas = v));
}
function syncProfileListeners() {
  const ids = new Set([
    ...Object.keys(friends),
    ...Object.keys(requests),
    ...Object.keys(metas),
    ...(activePeer ? [activePeer] : []),
  ]);
  for (const [id, off] of contactUnsubs)
    if (!ids.has(id)) {
      off();
      contactUnsubs.delete(id);
      profiles.delete(id);
    }
  for (const id of ids) {
    if (contactUnsubs.has(id)) continue;
    contactUnsubs.set(
      id,
      onValue(
        ref(db, "users/" + id),
        (snap) => {
          profiles.set(id, snap.val() || {});
          renderFriendList();
          if (activePeer === id && $("chat-peer-name"))
            $("chat-peer-name").textContent =
              profiles.get(id).username || "Skip friend";
        },
        (err) => S.toast(errorMessage(err)),
      ),
    );
  }
}
function renderFriends() {
  const root = $("friends-screen");
  if (!user || !ready) {
    root.innerHTML = `<div class="empty"><div class="empty-icon">${icon("people")}</div><h2>${user ? "Let’s reconnect." : "Your friends are already here."}</h2><p>${user ? esc(authError || "Connecting to your Skip account…") : "Connect your Skip account to chat and share your week."}</p><button class="primary" data-account-action="open">${user ? "Open account" : "Connect with Skip"}</button></div>`;
    return;
  }
  if (!$("friends-list")) {
    root.innerHTML = `<div class="friends-heading"><div><h2>Friends</h2><p class="muted">Connected with Skip</p></div><button class="secondary" data-skip-action="add-friend">${icon("plus")} Add friend</button></div><div class="social-layout"><aside class="friends-sidebar"><div id="friend-search-form" hidden><form id="find-friend-form"><label for="friend-tag">School Up @tag or Skip Name#1234</label><div class="search-row"><input id="friend-tag" placeholder="@your_friend" autocomplete="off" required maxlength="50"><button class="primary" type="submit" aria-label="Send friend request">${icon("plus")}</button></div><p class="hint" id="friend-search-error" role="status"></p></form></div><div id="friends-list"></div></aside><section class="conversation" id="conversation" aria-label="Conversation"><div class="chat-empty">${icon("chat")}<h3>Say hi. Share your week.</h3><p>Choose a friend to open your Skip conversation.</p></div></section></div>`;
    bindFriendSearch();
  }
  renderFriendList();
}
function renderFriendList() {
  const total = Object.keys(requests).length;
  $("friends-count").textContent = String(total);
  $("friends-count").hidden = !total;
  const list = $("friends-list");
  if (!list) return;
  let html = "";
  if (total) {
    html += '<h3 class="list-label">Requests</h3>';
    for (const [id, req] of Object.entries(requests)) {
      const p = profiles.get(id) || req;
      html += `<div class="request-row">${avatarHtml(p)}<div><b>${esc(p.username || "Skip user")}</b><small>wants to be friends</small><div class="request-actions"><button class="secondary" data-accept-request="${esc(id)}">Accept</button><button class="text-button" data-decline-request="${esc(id)}">Decline</button></div></div></div>`;
    }
  }
  const friendIds = Object.keys(friends).filter((id) => friends[id] === true);
  html += `<h3 class="list-label">Friends · ${friendIds.length}</h3>`;
  if (!friendIds.length)
    html +=
      '<p class="friends-empty">Add a friend by tag, or accept a request to get started.</p>';
  const renderRow = (id, isFriend) => {
    const p = profiles.get(id) || {},
      tag = p.tag ? "#" + p.tag : "";
    return `<div class="contact-row ${id === activePeer ? "active" : ""}"><button class="contact-main" data-open-chat="${esc(id)}">${avatarHtml(p)}<span><b>${esc(p.username || "Skip friend")}</b><small>${esc(tag || "Skip account")}</small></span></button>${isFriend ? `<button class="contact-action" data-unfriend="${esc(id)}" aria-label="Remove ${esc(p.username || "friend")}">${icon("x")}</button>` : ""}</div>`;
  };
  html += friendIds
    .sort((a, b) =>
      (profiles.get(a)?.username || a).localeCompare(
        profiles.get(b)?.username || b,
      ),
    )
    .map((id) => renderRow(id, true))
    .join("");
  const recent = Object.keys(metas)
    .filter((id) => !friends[id] && !metas[id].hidden)
    .sort(
      (a, b) => (metas[b].lastActivity || 0) - (metas[a].lastActivity || 0),
    );
  if (recent.length)
    html +=
      '<h3 class="list-label">Conversations</h3>' +
      recent.map((id) => renderRow(id, false)).join("");
  list.innerHTML = html;
}
function bindFriendSearch() {
  $("find-friend-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector("button");
    button.disabled = true;
    $("friend-search-error").textContent = "";
    try {
      const input = $("friend-tag").value.trim().replace(/^@/, ""),
        me = safe(user.email);
      let target;
      if (input.includes("#")) {
        if (!/^[A-Za-z0-9_.]{2,20}#[0-9]{4}$/.test(input))
          throw Error("Use a School Up @tag or a full Skip Name#1234.");
        const snap = await get(
          ref(db, "user_tags/" + input.replace("#", "_").replace(/\./g, ",")),
        );
        target = snap.val();
      } else target = await skipData.findHandle(input);
      if (!target) throw Error("No account has that tag.");
      if (target === me) throw Error("That’s your own account.");
      if (friends[target]) throw Error("You’re already friends.");
      await update(ref(db), {
        ["friend_requests/" + target + "/" + me]: {
          username: profile.username,
          avatar: profile.avatar || "",
          timestamp: serverTimestamp(),
        },
      });
      $("friend-search-error").textContent =
        "Friend request sent. You’ll see them here when they accept.";
      $("friend-tag").value = "";
    } catch (err) {
      $("friend-search-error").textContent = errorMessage(err);
    } finally {
      button.disabled = false;
    }
  };
}
async function acceptRequest(other) {
  const me = safe(user.email);
  await update(ref(db), {
    ["friends/" + me + "/" + other]: true,
    ["friends/" + other + "/" + me]: true,
  });
  await remove(ref(db, "friend_requests/" + me + "/" + other));
  S.toast("Friend request accepted");
}
async function openChat(other) {
  if (!ready) return;
  const me = safe(user.email),
    run = generation;
  messageUnsub?.();
  messageUnsub = null;
  messages.clear();
  activePeer = other;
  messageLimit = 100;
  renderFriends();
  const panel = $("conversation");
  panel.innerHTML =
    '<div class="chat-empty"><p>Opening your Skip conversation…</p></div>';
  $("friends-screen").classList.add("chat-open");
  renderFriendList();
  try {
    const result = await skipData.ensureDM(other);
    if (run !== generation || activePeer !== other) return;
    const p = profiles.get(other) || {};
    await update(ref(db, "dm_meta/" + me + "/" + other), {
      dmId: result.dmId,
      hidden: false,
    });
    if (run !== generation || activePeer !== other) return;
    panel.innerHTML = `<div class="chat-header"><button class="icon-button chat-back" data-skip-action="chat-back" aria-label="Back to friends">${icon("chevron")}</button>${avatarHtml(p)}<div><b id="chat-peer-name">${esc(p.username || "Skip friend")}</b><small>Skip conversation</small></div><button class="icon-button" data-skip-action="share" aria-label="Share a schedule" title="Share a schedule">${icon("share")}</button></div><div class="chat-messages" id="chat-messages" role="log" aria-label="Messages" aria-live="polite"><p class="muted">Loading messages…</p></div><form class="chat-composer" id="chat-composer"><textarea id="chat-text" placeholder="Message your friend…" rows="1" maxlength="4000" aria-label="Message"></textarea><button type="submit" class="primary" aria-label="Send message">${icon("send")}</button></form><p class="chat-error" id="chat-error" role="status"></p>`;
    listenMessages(result.dmId);
    $("chat-composer").onsubmit = async (e) => {
      e.preventDefault();
      const text = $("chat-text").value.trim();
      if (!text) return;
      const input = $("chat-text"),
        button = e.target.querySelector("button");
      button.disabled = true;
      try {
        await sendChat({ text }, other);
        if (activePeer === other && input.value.trim() === text)
          input.value = "";
      } catch (err) {
        $("chat-error").textContent = errorMessage(err);
      } finally {
        button.disabled = false;
      }
    };
    $("chat-text").onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        $("chat-composer").requestSubmit();
      }
    };
  } catch (err) {
    if (run !== generation || activePeer !== other) return;
    panel.innerHTML = `<div class="chat-empty"><p>${esc(errorMessage(err))}</p><button class="secondary" data-open-chat="${esc(other)}">Retry</button></div>`;
  }
}
function listenMessages(id) {
  messageUnsub?.();
  messageUnsub = onValue(
    query(
      ref(db, "dms/" + id),
      orderByChild("timestamp"),
      limitToLast(messageLimit),
    ),
    (snap) => {
      messages = new Map();
      snap.forEach((child) => messages.set(child.key, child.val()));
      renderMessages();
      if (S.getState && document.visibilityState === "visible")
        update(ref(db, "users/" + safe(user.email) + "/lastRead"), {
          [id]: Date.now(),
        }).catch(() => {});
    },
    (err) => {
      $("chat-error").textContent = errorMessage(err);
    },
  );
}
function readShared(message) {
  try {
    const share = message.schoolupSchedule;
    if (
      share?.version !== 1 ||
      typeof share.json !== "string" ||
      share.json.length > 120000
    )
      return null;
    const raw = JSON.parse(share.json);
    const normalized = S.normalizeWorkspace({
      version: 2,
      schedules: [raw],
      activeId: raw.id,
    });
    return normalized.schedules[0];
  } catch {
    return null;
  }
}
function renderMessages() {
  const container = $("chat-messages");
  if (!container) return;
  const nearBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight < 120;
  const beforeHeight = container.scrollHeight,
    beforeTop = container.scrollTop;
  let html =
    messages.size >= messageLimit
      ? '<button class="text-button load-messages" data-skip-action="older">Load earlier messages</button>'
      : "";
  if (!messages.size)
    html += '<p class="chat-start">The start of your conversation. Say hi!</p>';
  for (const [id, m] of messages) {
    const own = m.sender === user.email,
      share = readShared(m),
      date = Number.isFinite(m.timestamp)
        ? new Date(m.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
    let content =
      typeof m.text === "string"
        ? `<p class="message-text">${esc(m.text)}</p>`
        : "";
    if (share) {
      const count = Object.values(share.days).reduce(
        (n, day) => n + day.length,
        0,
      );
      content = `<button class="shared-schedule-card" data-view-shared="${esc(id)}">${icon("calendar")}<b>${esc(share.name)}</b><span>${count} subjects · schedule copy</span><small>Preview & add to your schedules ${icon("chevron")}</small></button>`;
    }
    for (const key of [
      "imageUrl",
      "gifUrl",
      "videoUrl",
      "audioUrl",
      "fileUrl",
    ]) {
      const src = m[key];
      if (
        typeof src !== "string" ||
        !(
          validUrl(src) ||
          (key === "imageUrl" &&
            /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(
              src,
            ))
        )
      )
        continue;
      if (key === "imageUrl" || key === "gifUrl")
        content += `<img class="chat-image" src="${esc(src)}" alt="Shared image" loading="lazy" referrerpolicy="no-referrer">`;
      else if (key === "videoUrl")
        content += `<video class="chat-image" controls playsinline src="${esc(src)}"></video>`;
      else if (key === "audioUrl")
        content += `<audio controls src="${esc(src)}"></audio>`;
      else
        content += `<a href="${esc(src)}" target="_blank" rel="noopener noreferrer">${esc(m.fileName || "Open attachment")}</a>`;
    }
    html += `<article class="chat-message ${own ? "own" : ""}" data-message-key="${esc(id)}"><div class="message-bubble">${content || '<p class="muted">Open Skip to view this message.</p>'}</div><div class="message-meta"><span>${esc(own ? "You" : m.username || "Friend")} · ${esc(date)}${m.edited ? " · edited" : ""}</span>${own ? `<button data-delete-message="${esc(id)}" aria-label="Delete message">${icon("trash")}</button>` : ""}</div></article>`;
  }
  // Preserve unchanged rows and media when another message arrives.
  const staging = document.createElement("div");
  staging.innerHTML = html;
  const existing = new Map(
    [...container.querySelectorAll("[data-message-key]")].map((el) => [
      el.dataset.messageKey,
      el,
    ]),
  );
  let cursor = container.firstElementChild;
  for (const candidate of [...staging.children]) {
    const previous = existing.get(candidate.dataset.messageKey);
    const node =
      previous && previous.outerHTML === candidate.outerHTML
        ? previous
        : candidate;
    if (node === cursor) cursor = cursor.nextElementSibling;
    else container.insertBefore(node, cursor);
  }
  while (cursor) {
    const next = cursor.nextElementSibling;
    cursor.remove();
    cursor = next;
  }
  if (nearBottom) container.scrollTop = container.scrollHeight;
  else
    container.scrollTop =
      beforeTop + Math.max(0, container.scrollHeight - beforeHeight);
}
async function sendChat(extra, recipient = activePeer) {
  if (!user || !ready || !recipient)
    throw Error("Choose a conversation first.");
  const uid = user.uid,
    me = safe(user.email),
    id = dmId(me, recipient);
  await skipData.ensureDM(recipient);
  if (user?.uid !== uid)
    throw Error("Your account changed. Open the conversation again.");
  const messageId = push(ref(db, "dms/" + id)).key;
  const payload = {
    sender: user.email,
    username: profile.username,
    avatar: profile.avatar || "",
    timestamp: serverTimestamp(),
    roleId: "member",
    ...extra,
  };
  await update(ref(db), {
    ["dms/" + id + "/" + messageId]: payload,
    ["dm_meta/" + me + "/" + recipient]: {
      dmId: id,
      hidden: false,
      lastActivity: serverTimestamp(),
    },
    ["dm_meta/" + recipient + "/" + me]: {
      dmId: id,
      hidden: false,
      lastActivity: serverTimestamp(),
    },
  });
}
function previewSchedule(schedule) {
  const ds = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  return (
    '<div class="share-preview">' +
    ds
      .filter((d) => schedule.days[d]?.length)
      .map(
        (d) =>
          `<div><h3>${d}</h3>${[...schedule.days[d]]
            .sort((a, b) => a.start.localeCompare(b.start))
            .map(
              (x) =>
                `<p><span>${esc(x.start)}–${esc(x.end)}</span><b>${esc(x.name)}</b></p>`,
            )
            .join("")}</div>`,
      )
      .join("") +
    "</div>"
  );
}
function openShare() {
  if (!activePeer) return;
  const recipient = activePeer,
    all = S.getState(),
    selected = all.activeId;
  $("share-title").textContent =
    "Share with " + (profiles.get(recipient)?.username || "your friend");
  $("schedule-share-body").innerHTML =
    `<label for="share-schedule-select">Choose a schedule</label><select id="share-schedule-select">${all.schedules.map((s) => `<option value="${esc(s.id)}" ${s.id === selected ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select><div id="share-preview-container"></div><p class="hint">Sends a copy of subjects and times. Your account, themes, and photos are not included.</p><button class="primary full" id="send-schedule">${icon("send")} Send schedule copy</button><p class="error" id="share-error" role="alert"></p>`;
  const draw = () => {
    $("share-preview-container").innerHTML = previewSchedule(
      all.schedules.find((s) => s.id === $("share-schedule-select").value),
    );
  };
  $("share-schedule-select").onchange = draw;
  draw();
  $("send-schedule").onclick = async () => {
    const button = $("send-schedule");
    button.disabled = true;
    try {
      const schedule = all.schedules.find(
          (s) => s.id === $("share-schedule-select").value,
        ),
        json = JSON.stringify(schedule);
      if (json.length > 120000)
        throw Error(
          "This schedule is too large to send in chat. Export it as JSON instead.",
        );
      await sendChat(
        {
          text: "Shared a schedule from School Up.",
          schoolupSchedule: { version: 1, json },
        },
        recipient,
      );
      S.closeDialog($("schedule-share"));
      S.toast("Schedule shared");
    } catch (err) {
      $("share-error").textContent = errorMessage(err);
    } finally {
      button.disabled = false;
    }
  };
  S.openDialog("schedule-share");
}
function previewShared(id) {
  const schedule = readShared(messages.get(id) || {});
  if (!schedule) return;
  $("share-title").textContent = schedule.name;
  $("schedule-share-body").innerHTML =
    previewSchedule(schedule) +
    '<p class="hint">Add this copy as a new schedule. It will not replace one you already have.</p><button class="primary full" id="import-shared">Add to my schedules</button>';
  $("import-shared").onclick = () => {
    S.closeDialog($("schedule-share"));
    S.importSchedule(schedule);
  };
  S.openDialog("schedule-share");
}
function importDeviceSchedules() {
  const guest = S.getGuestState() || guestBeforeLogin;
  if (
    !guest ||
    !guest.schedules.some((s) => Object.values(s.days).some((d) => d.length))
  ) {
    S.toast("There are no device-only subjects to copy.");
    return;
  }
  S.confirmAction(
    "Copy device schedules?",
    `Add ${guest.schedules.length} device schedule(s) to this Skip account? Existing account schedules and your device originals will be kept.`,
    "Copy schedules",
    () => {
      const current = S.getState();
      for (const s of guest.schedules)
        current.schedules.push({
          ...s,
          id: crypto.randomUUID(),
          name: (s.name + " · device copy").slice(0, 70),
        });
      S.useWorkspace(user.uid, current);
      queueSave();
      S.toast("Device schedules copied into your account");
    },
  );
}
async function accountAction(action) {
  if (action === "local") {
    writeLocal("schoolup_guest_chosen", "true");
    S.closeDialog($("skip-auth"));
    return;
  }
  if (action === "reset-password") {
    const email = $("login-email")?.value.trim();
    if (!email)
      throw Error("Enter your Skip email first, then choose Forgot password.");
    await sendPasswordResetEmail(auth, email);
    S.toast("If that account exists, a reset email has been sent.");
    return;
  }
  if (action === "retry-session") {
    await connectUser(auth.currentUser);
    return;
  }
  if (action === "signout") {
    await Promise.race([
      flushSave(),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
    await signOut(auth);
    mode = "login";
    S.closeDialog($("skip-auth"));
    S.showAppPage("schedule");
    return;
  }
  if (action === "setup-tag") {
    mode = "tag";
    renderAccount();
    return;
  }
  if (action === "skip-onboarding") {
    mode = "account";
    renderAccount();
    return;
  }
  if (action === "verify-email") {
    await sendEmailVerification(auth.currentUser);
    S.toast("Verification email sent");
    return;
  }
  if (action === "refresh-email") {
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    user = auth.currentUser;
    renderAccount();
    return;
  }
  if (action === "import-device") {
    importDeviceSchedules();
    return;
  }
  if (action === "add-friend") {
    $("friend-search-form").hidden = !$("friend-search-form").hidden;
    if (!$("friend-search-form").hidden) $("friend-tag").focus();
    return;
  }
  if (action === "share") {
    openShare();
    return;
  }
  if (action === "chat-back") {
    $("friends-screen").classList.remove("chat-open");
    return;
  }
  if (action === "older") {
    messageLimit += 100;
    listenMessages(dmId(safe(user.email), activePeer));
    return;
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.authMode) {
    mode = d.authMode;
    authError = "";
    renderAccount();
  }
  if (d.skipAction) accountAction(d.skipAction).catch(showError);
  if (d.openChat) openChat(d.openChat);
  if (d.acceptRequest)
    acceptRequest(d.acceptRequest).catch((err) => S.toast(errorMessage(err)));
  if (d.declineRequest)
    remove(
      ref(db, "friend_requests/" + safe(user.email) + "/" + d.declineRequest),
    ).catch((err) => S.toast(errorMessage(err)));
  if (d.unfriend) {
    const other = d.unfriend,
      me = safe(user.email);
    S.confirmAction(
      "Remove friend?",
      "Your conversation will be kept in both apps.",
      "Delete",
      () =>
        update(ref(db), {
          ["friends/" + me + "/" + other]: null,
          ["friends/" + other + "/" + me]: null,
        }).catch((err) => S.toast(errorMessage(err))),
    );
  }
  if (d.viewShared) previewShared(d.viewShared);
  if (d.deleteMessage) {
    const id = d.deleteMessage,
      path = "dms/" + dmId(safe(user.email), activePeer) + "/" + id;
    S.confirmAction(
      "Delete message?",
      "This removes your message from this conversation in both apps.",
      "Delete",
      () => remove(ref(db, path)).catch((err) => S.toast(errorMessage(err))),
    );
  }
  if (d.syncAction) {
    try {
      resolveSync(d.syncAction);
    } catch (err) {
      S.toast(errorMessage(err));
    }
  }
});
window.addEventListener("schoolup:changed", (e) => {
  if (e.detail.uid === user?.uid) queueSave();
});
window.addEventListener("schoolup:page", (e) => {
  if (e.detail === "friends") renderFriends();
});
window.addEventListener("online", () => {
  if (dirty) flushSave();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && dirty) flushSave();
});
window.SkipIntegration = {
  openAccount,
  showFriends: () => {
    S.showAppPage("friends");
    renderFriends();
  },
};
try {
  await setPersistence(auth, browserLocalPersistence);
} catch {}
onAuthStateChanged(auth, async (current) => {
  await connectUser(current);
  if (!current && !readLocal("schoolup_guest_chosen")) openAccount("login");
});
