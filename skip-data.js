// Shared by School Up and Skip. All writes are authorized by Realtime Database rules.
// No Cloud Functions, server credentials, or PINs are used by this module.
export function createSkipData({ auth, db, sdk }) {
  const { ref, get, update, runTransaction } = sdk;
  const safe = (email) => email.replace(/\./g, ",");
  const actor = () => {
    const user = auth.currentUser;
    if (!user?.uid || !user.email)
      throw Error("Sign in with your Skip account first.");
    return { uid: user.uid, email: user.email, key: safe(user.email) };
  };
  const unchanged = (owner) => {
    if (auth.currentUser?.uid !== owner.uid)
      throw Error("Your account changed. Please try again.");
  };
  const normalizeHandle = (raw) => {
    const handle = String(raw || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    if (
      !/^[a-z0-9_]{3,24}$/.test(handle) ||
      ["__proto__", "constructor", "prototype"].includes(handle)
    )
      throw Error("Use 3–24 letters, numbers, or underscores for your tag.");
    return handle;
  };
  async function ensureProfile(displayName = "") {
    const owner = actor(),
      path = "users/" + owner.key;
    const existing = (await get(ref(db, path))).val();
    unchanged(owner);
    if (existing?.uid && existing.uid !== owner.uid)
      throw Error(
        "This Skip profile belongs to another account. Contact the app owner.",
      );
    if (existing?.username && existing?.tag) {
      const patch = {};
      if (!existing.uid) patch[path + "/uid"] = owner.uid;
      if (!existing.email) patch[path + "/email"] = owner.email;
      if (Object.keys(patch).length) await update(ref(db), patch);
      return { ...existing, uid: owner.uid, email: owner.email };
    }
    const username = (displayName || owner.email.split("@")[0])
      .replace(/[^A-Za-z0-9_]/g, "_")
      .slice(0, 20)
      .padEnd(2, "_");
    // Reserve before writing the profile, so simultaneous registrations cannot duplicate a Skip tag.
    for (let attempt = 0; attempt < 30; attempt++) {
      const tag = String(
        1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000),
      );
      const reservation = await runTransaction(
        ref(db, "user_tags/" + username + "_" + tag),
        (current) =>
          current === null || current === owner.key ? owner.key : undefined,
        { applyLocally: false },
      );
      unchanged(owner);
      if (!reservation.committed) continue;
      // Another browser might have finished profile creation while the tag was being claimed.
      const fresh = (await get(ref(db, path))).val();
      if (fresh?.username && fresh?.tag) return fresh;
      const profile = {
        uid: owner.uid,
        email: owner.email,
        username,
        tag,
        avatar: existing?.avatar || "",
        status: "online",
      };
      await update(
        ref(db),
        Object.fromEntries(
          Object.entries(profile).map(([k, v]) => [path + "/" + k, v]),
        ),
      );
      return profile;
    }
    throw Error("No Skip tag was available for that name. Please try again.");
  }
  async function session(displayName) {
    const owner = actor();
    const profile = await ensureProfile(displayName);
    const handle = (
      await get(ref(db, "schoolup_accounts/" + owner.uid + "/handle"))
    ).val();
    unchanged(owner);
    return { profile, handle: handle || null };
  }
  async function claimHandle(raw) {
    const owner = actor(),
      handle = normalizeHandle(raw);
    const accountRef = ref(db, "schoolup_accounts/" + owner.uid + "/handle");
    const current = (await get(accountRef)).val();
    if (current) {
      if (current === handle) return current;
      throw Error(
        "Your School Up tag is already @" +
          current +
          ". Tags cannot be changed.",
      );
    }
    const claim = await runTransaction(
      ref(db, "schoolup_handles/" + handle),
      (value) =>
        value === null || value.uid === owner.uid
          ? { uid: owner.uid, safeEmail: owner.key }
          : undefined,
      { applyLocally: false },
    );
    unchanged(owner);
    if (!claim.committed)
      throw Error("That tag is already taken. Try another one.");
    const linked = await runTransaction(
      accountRef,
      (value) => (value === null || value === handle ? handle : undefined),
      { applyLocally: false },
    );
    unchanged(owner);
    if (!linked.committed)
      throw Error(
        "A tag was already chosen in another tab. Reconnect to load it.",
      );
    return handle;
  }
  async function findHandle(raw) {
    actor();
    const value = (
      await get(ref(db, "schoolup_handles/" + normalizeHandle(raw)))
    ).val();
    return value?.safeEmail || null;
  }
  async function ensureDM(other) {
    const owner = actor();
    if (
      typeof other !== "string" ||
      /[.#$\[\]\/]/.test(other) ||
      !other.includes("@") ||
      other === owner.key
    )
      throw Error("Choose a different Skip account.");
    const [a, b] = [owner.key, other].sort(),
      dmId = a + "_" + b;
    const memberRef = ref(db, "dm_members/" + dmId);
    try {
      const result = await runTransaction(
        memberRef,
        (current) =>
          current === null
            ? { a, b }
            : current.a === a && current.b === b
              ? current
              : undefined,
        { applyLocally: false },
      );
      unchanged(owner);
      if (!result.committed)
        throw Error(
          "This conversation has a conflicting member record. Contact the app owner.",
        );
    } catch (err) {
      if (/permission[-_]denied/i.test(err.code || err.message || ""))
        throw Error(
          "This conversation needs the Skip privacy update. Ask the app owner to apply the new database rules and prepare existing chats (SETUP.md).",
        );
      throw err;
    }
    return { dmId };
  }
  return { session, claimHandle, findHandle, ensureDM };
}
