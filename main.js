const { app, BrowserWindow, Tray, Menu, globalShortcut, screen, shell, nativeImage, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// 배포한 웹 주소. 빌드 전에 바꾸거나 APP_URL 환경변수로 넘긴다.
const APP_URL = process.env.APP_URL || "https://example.com";

const cfgPath = path.join(app.getPath("userData"), "window.json");
const defaults = { w: 380, h: 780, x: null, y: null, top: true, widget: true };

function loadCfg() {
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(cfgPath, "utf8")) }; }
  catch (e) { return { ...defaults }; }
}
function saveCfg(c) {
  try { fs.writeFileSync(cfgPath, JSON.stringify(c)); } catch (e) { /* 저장 실패는 무시 */ }
}

let win = null;
let tray = null;
let cfg = loadCfg();

// 인스턴스 하나만
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => { if (win) { win.show(); win.focus(); } });
}

function defaultPos() {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - cfg.w - 24, y: workArea.y + 24 };
}

function createWindow() {
  const pos = cfg.x != null && cfg.y != null ? { x: cfg.x, y: cfg.y } : defaultPos();

  win = new BrowserWindow({
    width: cfg.w,
    height: cfg.h,
    x: pos.x,
    y: pos.y,
    minWidth: 320,
    minHeight: 420,
    frame: false,
    show: false,
    alwaysOnTop: cfg.top,
    skipTaskbar: false,
    backgroundColor: "#FFFFFF",
    title: "오늘 업무",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (cfg.top) win.setAlwaysOnTop(true, "floating");
  win.loadURL(APP_URL);

  win.webContents.on("did-finish-load", () => {
    // 상단 바를 잡고 창을 끌 수 있게. 버튼과 입력창은 제외.
    win.webContents.insertCSS(`
      [data-drag] { -webkit-app-region: drag; }
      button, input, textarea, select, a, [data-nodrag] { -webkit-app-region: no-drag; }
      body { overflow-x: hidden; }
      ::-webkit-scrollbar { width: 8px; }
      ::-webkit-scrollbar-thumb { background: #D6D6D2; border-radius: 4px; }
    `);
    win.show();
  });

  win.webContents.on("did-fail-load", (_e, code, desc) => {
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`
      <body style="font-family:sans-serif;padding:40px;color:#333">
        <h3 style="margin:0 0 8px">연결하지 못했습니다</h3>
        <p style="font-size:14px;color:#666;line-height:1.6">
          ${desc} (${code})<br>
          학교 업무망에서 외부 접속이 막혀 있을 수 있습니다.<br>
          네트워크를 확인한 뒤 창을 닫았다 다시 열어 주세요.
        </p>
      </body>`));
    win.show();
  });

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });

  const remember = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const b = win.getBounds();
    cfg = { ...cfg, w: b.width, h: b.height, x: b.x, y: b.y };
    saveCfg(cfg);
  };
  win.on("resize", remember);
  win.on("move", remember);

  // 닫기는 트레이로 숨기기
  win.on("close", (e) => {
    if (!app.isQuiting) { e.preventDefault(); win.hide(); }
  });
}

function trayIcon() {
  // 16x16 단색 아이콘을 코드로 생성 (별도 파일 불필요)
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = Math.floor(i / size);
    const on = x >= 2 && x <= 13 && y >= 3 && y <= 12;
    const bar = on && (y === 5 || y === 8 || y === 11) && x <= 10;
    buf[i * 4] = bar ? 0xff : 0x40;     // B
    buf[i * 4 + 1] = bar ? 0xff : 0x0e; // G
    buf[i * 4 + 2] = bar ? 0xff : 0x3f; // R
    buf[i * 4 + 3] = on ? 0xff : 0x00;  // A
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function buildTray() {
  tray = new Tray(trayIcon());
  const menu = Menu.buildFromTemplate([
    { label: "보이기", click: () => { win.show(); win.focus(); } },
    { label: "숨기기", click: () => win.hide() },
    { type: "separator" },
    {
      label: "항상 위에 두기", type: "checkbox", checked: cfg.top,
      click: (mi) => {
        cfg.top = mi.checked;
        win.setAlwaysOnTop(cfg.top, "floating");
        saveCfg(cfg);
      },
    },
    {
      label: "컴퓨터 켤 때 실행", type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked, args: [] }),
    },
    { type: "separator" },
    {
      label: "창 위치 초기화",
      click: () => { const p = defaultPos(); win.setBounds({ ...p, width: defaults.w, height: defaults.h }); },
    },
    { type: "separator" },
    { label: "종료", click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setToolTip("오늘 업무");
  tray.setContextMenu(menu);
  tray.on("click", () => { if (win.isVisible()) win.hide(); else { win.show(); win.focus(); } });
}

ipcMain.on("win:minimize", () => { if (win) win.minimize(); });
ipcMain.on("win:hide", () => { if (win) win.hide(); });
ipcMain.handle("win:toggleTop", () => {
  if (!win) return false;
  cfg.top = !cfg.top;
  win.setAlwaysOnTop(cfg.top, "floating");
  saveCfg(cfg);
  return cfg.top;
});

app.whenReady().then(() => {
  createWindow();
  buildTray();

  // Ctrl+Shift+Space 로 보이기/숨기기
  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    if (!win) return;
    if (win.isVisible()) win.hide();
    else { win.show(); win.focus(); }
  });

  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
