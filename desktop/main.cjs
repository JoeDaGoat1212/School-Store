/*
 * Firebirds Nest, the desktop app: the store's 3D world in its own window,
 * full screen, on your computer's most powerful graphics card.
 *
 * It opens the real website (so your account, cash, house and cars are the
 * same as on the web, and the game updates by itself), but without a
 * browser around it: no other tabs or extensions competing for the
 * computer, the fast graphics card switched on (laptops often have two and
 * browsers pick the slow, battery-saving one), the graphics card's
 * blocklist ignored, nothing slowed down in the background, and the
 * graphics set to Ultra to start with (it drops a level by itself if the
 * computer can't keep up, and you can change it with the Graphics button).
 */
const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const LIVE = "https://school-store-steel.vercel.app";
// The preview of changes that aren't on the live site yet (you sign in to Vercel the first time).
const PREVIEW = "https://school-store-git-city-heist-joeyahlmain-6513s-projects.vercel.app";
const START = "/store";

// ---- Graphics: the fast GPU, every GPU feature, nothing held back ----
app.commandLine.appendSwitch("force_high_performance_gpu");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("enable-features", "CanvasOopRasterization,WebGLDraftExtensions");

// ---- Remembered settings (which version to open) ----
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");
function load() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
}
function save(s) {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(s));
  } catch {
    // Not a problem.
  }
}
let settings = {};
const site = () => (settings.preview ? PREVIEW : LIVE);

let win = null;

function offlinePage() {
  return (
    "data:text/html;charset=utf-8," +
    encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Firebirds Nest</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#000;color:#fff;font:16px system-ui,sans-serif;text-align:center">
<div><div style="font-size:64px">🔥</div><h1 style="margin:8px 0">Can't reach the Nest</h1>
<p style="color:#aaa">Firebirds Nest needs the internet. Check you're online, then</p>
<button onclick="location.href='${site()}${START}'" style="font:inherit;font-weight:700;padding:12px 22px;border-radius:999px;border:0;background:#FF5A1F;color:#000;cursor:pointer">Try again</button></div>`)
  );
}

function open() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: "#000000",
    title: "Firebirds Nest",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      backgroundThrottling: false,
      spellcheck: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  // The website knows it's in the app (and starts the graphics on Ultra).
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} FirebirdsNestApp/${app.getVersion()}`);
  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
  });
  // Links that open a new window (the help pages, socials…) go to your normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3 && !url.startsWith("data:")) win.loadURL(offlinePage());
  });
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
    if (input.key === "F5") {
      win.webContents.reload();
      e.preventDefault();
    }
  });
  win.loadURL(site() + START);
}

function menu() {
  const choose = (preview) => {
    settings.preview = preview;
    save(settings);
    menu();
    win?.loadURL(site() + START);
  };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
      {
        label: "Game",
        submenu: [
          { label: "Home", accelerator: "CmdOrCtrl+H", click: () => win?.loadURL(site() + START) },
          { label: "Reload", accelerator: "F5", click: () => win?.webContents.reload() },
          { type: "separator" },
          { label: "Live site", type: "radio", checked: !settings.preview, click: () => choose(false) },
          { label: "Preview (newest changes, sign in to Vercel)", type: "radio", checked: !!settings.preview, click: () => choose(true) },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "View",
        submenu: [
          { label: "Full screen", accelerator: "F11", click: () => win?.setFullScreen(!win.isFullScreen()) },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
        ],
      },
      {
        label: "Help",
        submenu: [
          {
            label: "Graphics card in use",
            click: async () => {
              const info = await app.getGPUInfo("basic").catch(() => null);
              const gpus = (info?.gpuDevice ?? []).map((g) => `${g.active ? "▶ " : "   "}${g.vendorString || g.vendorId} ${g.deviceString || g.deviceId}`.trim());
              dialog.showMessageBox(win, { message: "Graphics", detail: gpus.join("\n") || "Couldn't tell.", buttons: ["OK"] });
            },
          },
          { label: "Open in browser", click: () => shell.openExternal(site() + START) },
        ],
      },
    ]),
  );
}

// One copy at a time (opening it again brings the window back).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    settings = load();
    menu();
    open();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) open();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
