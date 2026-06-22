const { app, BrowserWindow, shell, Menu, Tray, nativeImage, dialog } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = 39147;
let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverReady = false;

// ── Resolve server paths (works both dev and packaged) ──────────────────────
function getServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "server", "dist", "index.mjs");
  }
  return path.join(__dirname, "..", "api-server", "dist", "index.mjs");
}

function getPublicPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "server", "public");
  }
  return path.join(__dirname, "..", "ftm-coder-ai", "dist");
}

// ── Start the embedded Express server ──────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const serverEntry = getServerPath();
    const publicDir = getPublicPath();

    serverProcess = spawn(process.execPath, [serverEntry], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: "production",
        STATIC_DIR: publicDir,
        AI_BASE_URL: process.env.AI_BASE_URL || "http://localhost:11434/v1",
        AI_MODEL: process.env.AI_MODEL || "glm4",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stdout.on("data", (d) => {
      const msg = d.toString();
      console.log("[server]", msg.trim());
      if (!serverReady) {
        pollServer(resolve);
      }
    });

    serverProcess.stderr.on("data", (d) =>
      console.error("[server-err]", d.toString().trim())
    );

    serverProcess.on("exit", (code) => {
      console.log("[server] exited with code", code);
      serverProcess = null;
    });

    // Fallback: start polling after 500ms regardless of stdout
    setTimeout(() => pollServer(resolve), 500);

    serverProcess.on("error", reject);
  });
}

function pollServer(resolve) {
  if (serverReady) return;
  const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
    if (res.statusCode < 500) {
      serverReady = true;
      resolve();
    } else {
      setTimeout(() => pollServer(resolve), 400);
    }
  });
  req.on("error", () => setTimeout(() => pollServer(resolve), 400));
  req.end();
}

// ── Create the main window ─────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "FTM-CODER-AI",
    backgroundColor: "#0f0f0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://localhost:${PORT}`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Remove default menu (keeps it clean)
  Menu.setApplicationMenu(buildMenu());
}

// ── App menu ───────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: "FTM-CODER-AI",
      submenu: [
        { label: "About FTM-CODER-AI", role: "about" },
        { type: "separator" },
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => mainWindow?.webContents.loadURL(`http://localhost:${PORT}/#/settings`),
        },
        { type: "separator" },
        { label: "Quit", accelerator: "CmdOrCtrl+Q", role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        {
          label: "Developer Tools",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

// ── Splash / loading window ────────────────────────────────────────────────
function createSplash() {
  const splash = new BrowserWindow({
    width: 420,
    height: 240,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    webPreferences: { contextIsolation: true },
  });

  splash.loadURL(`data:text/html,
    <html>
    <body style="margin:0;background:#0f0f0f;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:monospace;color:#fff;">
      <div style="font-size:28px;font-weight:bold;letter-spacing:4px;margin-bottom:12px;">FTM-CODER-AI</div>
      <div style="color:#666;font-size:13px;margin-bottom:24px;">Starting server…</div>
      <div style="width:200px;height:3px;background:#1a1a1a;border-radius:2px;overflow:hidden;">
        <div id="bar" style="height:100%;width:0%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:2px;transition:width 0.3s;"></div>
      </div>
      <script>
        let w = 0;
        setInterval(() => { w = Math.min(w + Math.random() * 12, 90); document.getElementById('bar').style.width = w + '%'; }, 200);
      </script>
    </body></html>
  `);
  return splash;
}

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  const splash = createSplash();

  try {
    await startServer();
  } catch (err) {
    dialog.showErrorBox("Server failed to start", String(err));
    app.quit();
    return;
  }

  splash.close();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
});
