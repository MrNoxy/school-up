// Theme library: add a new object here and ship this file to both apps.
// Optional wallpaper: a relative asset path or an HTTPS image/GIF URL you own.
export const THEME_LIBRARY = [
  {
    id: "default",
    name: "Skip original",
    background: "#0f1115",
    accent: "#79a5ff",
    mode: "dark",
  },
  {
    id: "midnight",
    name: "After hours",
    background: "#16172f",
    accent: "#b9baff",
    mode: "dark",
  },
  {
    id: "blossom",
    name: "Cherry soda",
    background: "#301728",
    accent: "#ffa3cd",
    mode: "dark",
  },
  {
    id: "tide",
    name: "Deep sea",
    background: "#102c38",
    accent: "#8be8e8",
    mode: "dark",
  },
  {
    id: "arcade",
    name: "Arcade",
    background: "#182b27",
    accent: "#b0f6aa",
    mode: "dark",
  },
  {
    id: "sunset",
    name: "Golden hour",
    background: "#38221f",
    accent: "#ffc392",
    mode: "dark",
  },
  {
    id: "orchid",
    name: "Orchid",
    background: "#e9def9",
    accent: "#7541ac",
    mode: "light",
  },
  {
    id: "matcha",
    name: "Matcha milk",
    background: "#e1ecd8",
    accent: "#42672c",
    mode: "light",
  },
  {
    id: "peach",
    name: "Peach club",
    background: "#f9dfd7",
    accent: "#a64453",
    mode: "light",
  },
  {
    id: "ice",
    name: "Ice blue",
    background: "#ddebf6",
    accent: "#326293",
    mode: "light",
  },
  {
    id: "strawberry",
    name: "Strawberry fields",
    background: "#f8e1e7",
    accent: "#ab315c",
    mode: "light",
    emojis: "🍓 🌼 🍒",
  },
  {
    id: "cosmic",
    name: "Cosmic",
    background: "#19182c",
    accent: "#cac0ff",
    mode: "dark",
    emojis: "🪐 ✨ 🌙",
  },
];
const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : fallback);
export function normalizeChatTheme(value, library = THEME_LIBRARY) {
  const raw = typeof value === "string" ? { preset: value } : value || {};
  const preset = library.find((t) => t.id === raw.preset) || library[0];
  const image =
    typeof raw.image === "string" &&
    raw.image.length <= 1100000 &&
    (/^(https:\/\/[^\s"'<>]+)$/.test(raw.image) ||
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(
        raw.image,
      ))
      ? raw.image
      : "";
  return {
    preset: preset.id,
    mode: raw.mode === "light" || raw.mode === "dark" ? raw.mode : preset.mode,
    background: hex(raw.background, preset.background),
    accent: hex(raw.accent, preset.accent),
    kind: ["none", "emoji", "image"].includes(raw.kind)
      ? raw.kind
      : preset.emojis
        ? "emoji"
        : preset.wallpaper
          ? "image"
          : "none",
    emojis:
      typeof raw.emojis === "string"
        ? raw.emojis.slice(0, 100)
        : preset.emojis || "🌸 ✨ 🪩",
    image:
      image ||
      (/^(https:\/\/|\.\/|assets\/)/.test(preset.wallpaper || "")
        ? new URL(preset.wallpaper, location.href).href
        : ""),
    density: Math.max(12, Math.min(80, Math.round(Number(raw.density) || 36))),
    dim: Math.max(0, Math.min(85, Number(raw.dim) || 0)),
    blur: Math.max(0, Math.min(12, Number(raw.blur) || 0)),
  };
}
export function colorMix(a, b, weight) {
  const parts = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (
    "#" +
    parts(a)
      .map((v, i) =>
        Math.round(v * (1 - weight) + parts(b)[i] * weight)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function themeTokens(theme) {
  const light = theme.mode === "light",
    base = theme.background;
  const surface = colorMix(
    base,
    light ? "#ffffff" : "#ffffff",
    light ? 0.68 : 0.06,
  );
  const strong = light ? "#20212c" : "#f7f5fc",
    muted = light ? "#545261" : "#bfbdca";
  const a = theme.accent,
    channels = [1, 3, 5]
      .map((i) => parseInt(a.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const ink =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] > 0.179
      ? "#14141c"
      : "#ffffff";
  return {
    "--sk-base": base,
    "--sk-surface": surface,
    "--sk-text": strong,
    "--sk-muted": muted,
    "--sk-accent": a,
    "--sk-ink": ink,
    "--bg-main": base,
    "--bg-secondary": surface,
    "--bg-tertiary": colorMix(base, "#ffffff", light ? 0.8 : 0.1),
    "--bg-hover": colorMix(base, light ? "#000000" : "#ffffff", 0.13),
    "--border-color": colorMix(base, light ? "#000000" : "#ffffff", 0.2),
    "--text-main": strong,
    "--text-bright": strong,
    "--text-muted": muted,
    "--accent-primary": a,
    "--accent-hover": colorMix(a, light ? "#000000" : "#ffffff", 0.13),
    "--bg": base,
    "--surface": surface,
    "--surface-2": colorMix(base, "#ffffff", 0.12),
    "--text": strong,
    "--muted": muted,
    "--accent": a,
    "--accent-text": ink,
    "--ink": ink,
    "--raised": colorMix(base, light ? "#ffffff" : "#ffffff", light ? 0.8 : 0.12),
    "--line": colorMix(base, light ? "#000000" : "#ffffff", 0.2),
    "--border": colorMix(base, light ? "#000000" : "#ffffff", 0.2),
  };
}
export function paintWallpaper(target, theme) {
  target.replaceChildren();
  target.style.backgroundColor = theme.background;
  target.style.backgroundImage = "none";
  target.style.filter = `blur(${theme.blur}px)`;
  if (theme.kind === "image" && theme.image) {
    target.style.backgroundImage = `linear-gradient(#000000${Math.round(
      theme.dim * 2.55,
    )
      .toString(16)
      .padStart(2, "0")},#000000${Math.round(theme.dim * 2.55)
      .toString(16)
      .padStart(2, "0")}),url("${theme.image}")`;
    target.style.backgroundSize = "cover";
    target.style.backgroundPosition = "center";
  }
  if (theme.kind === "emoji") {
    const emoji = theme.emojis.trim().split(/\s+/).filter(Boolean).slice(0, 12);
    if (!emoji.length) return;
    for (let i = 0; i < theme.density; i++) {
      const el = document.createElement("span");
      el.textContent = emoji[i % emoji.length];
      el.style.cssText = `position:absolute;left:${(i * 37.43 + 7) % 96}%;top:${(i * 23.79 + 4) % 96}%;font-size:${22 + ((i * 13) % 30)}px;transform:rotate(${((i * 47) % 76) - 38}deg);opacity:${1 - theme.dim / 100};line-height:1;`;
      target.append(el);
    }
  }
}
export async function readThemeImage(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file?.type || ""))
    throw Error("Choose a JPG, PNG, WebP, or GIF.");
  if (file.size > 15 * 1024 * 1024)
    throw Error("Choose an image smaller than 15 MB.");
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error("This file could not be read."));
    reader.readAsDataURL(file);
  });
  if (file.type === "image/gif") {
    if (data.length > 1100000)
      throw Error("Choose a GIF under 800 KB to keep chats quick.");
    return data;
  }
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(Error("This picture could not be opened."));
    img.src = data;
  });
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const compressed = canvas.toDataURL("image/webp", 0.78);
  if (compressed.length > 1100000)
    throw Error("This image is too detailed. Try a smaller picture.");
  return compressed;
}
