const { app, BrowserWindow, Tray, Menu, globalShortcut, screen, shell, nativeImage, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// 배포한 웹 주소. 빌드 전에 바꾸거나 APP_URL 환경변수로 넘긴다.
const APP_URL = process.env.APP_URL || "https://seoul-educaion.web.app";

const cfgPath = path.join(app.getPath("userData"), "window.json");
const defaults = { w: 380, h: 780, x: null, y: null, top: true };

function loadCfg() {
  try { return { ...defaults, ...JSON.parse(fs.readFileSync(cfgPath, "utf8")) }; }
  catch (e) { return { ...defaults }; }
}
function saveCfg(c) {
  try { fs.writeFileSync(cfgPath, JSON.stringify(c)); } catch (e) { /* 저장 실패는 무시 */ }
}

let win = null;
let tray = null;
let trayMenu = null;
let saveTimer = null;
let cfg = loadCfg();

const alive = () => win && !win.isDestroyed();

function showWin() {
  if (!alive()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function toggleWin() {
  if (!alive()) return;
  if (win.isVisible() && !win.isMinimized()) win.hide();
  else showWin();
}

// 트레이 체크 표시와 창 상태가 따로 놀지 않게 한 곳에서만 바꾼다.
function setTop(v) {
  cfg.top = v;
  if (alive()) win.setAlwaysOnTop(v, "floating");
  saveCfg(cfg);
  const mi = trayMenu && trayMenu.getMenuItemById("top");
  if (mi) mi.checked = v;
  return v;
}

// 인스턴스 하나만
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => showWin());
}

function defaultPos() {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - cfg.w - 24, y: workArea.y + 24 };
}

// 저장된 자리가 지금 연결된 화면 밖이면(노트북을 도킹에서 뺀 경우 등) 기본 자리로.
function startPos() {
  if (cfg.x == null || cfg.y == null) return defaultPos();
  const seen = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    const ow = Math.min(cfg.x + cfg.w, a.x + a.width) - Math.max(cfg.x, a.x);
    const oh = Math.min(cfg.y + cfg.h, a.y + a.height) - Math.max(cfg.y, a.y);
    return ow >= 120 && oh >= 40;
  });
  return seen ? { x: cfg.x, y: cfg.y } : defaultPos();
}

function createWindow() {
  const pos = startPos();

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

  win.webContents.on("did-fail-load", (_e, code, desc, _url, isMainFrame) => {
    // 하위 프레임 실패나 취소된 이동(-3)까지 오류 화면으로 덮어쓰지 않는다.
    if (!isMainFrame || code === -3) return;
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`
      <body style="font-family:sans-serif;padding:40px;color:#333">
        <h3 style="margin:0 0 8px">연결하지 못했습니다</h3>
        <p style="font-size:14px;color:#666;line-height:1.6">
          ${desc} (${code})<br>
          학교 업무망에서 외부 접속이 막혀 있을 수 있습니다.<br>
          네트워크를 확인한 뒤, 트레이 아이콘을 오른쪽 클릭해 "다시 불러오기"를 눌러 주세요.
        </p>
      </body>`));
    win.show();
  });

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });

  const remember = () => {
    if (!alive() || win.isMinimized()) return;
    const b = win.getBounds();
    cfg = { ...cfg, w: b.width, h: b.height, x: b.x, y: b.y };
    // 끄는 동안 매 이벤트마다 디스크에 쓰면 창이 끊긴다. 멈춘 뒤 한 번만.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveCfg(cfg), 400);
  };
  win.on("resize", remember);
  win.on("move", remember);

  // 닫기는 트레이로 숨기기
  win.on("close", (e) => {
    if (!app.isQuiting) { e.preventDefault(); win.hide(); }
  });
  win.on("closed", () => { win = null; });
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

function buildTray(shortcutOk) {
  tray = new Tray(trayIcon());
  trayMenu = Menu.buildFromTemplate([
    { label: "보이기", click: () => showWin() },
    { label: "숨기기", click: () => { if (alive()) win.hide(); } },
    { label: "다시 불러오기", click: () => { if (alive()) win.loadURL(APP_URL); } },
    { type: "separator" },
    {
      id: "top", label: "항상 위에 두기", type: "checkbox", checked: cfg.top,
      click: (mi) => setTop(mi.checked),
    },
    {
      label: "컴퓨터 켤 때 실행", type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked, args: [] }),
    },
    { type: "separator" },
    {
      label: "창 위치 초기화",
      click: () => { if (alive()) win.setBounds({ ...defaultPos(), width: defaults.w, height: defaults.h }); },
    },
    { type: "separator" },
    { label: "종료", click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setToolTip(shortcutOk ? "오늘 업무" : "오늘 업무 (Ctrl+Shift+Space 를 다른 프로그램이 쓰고 있습니다)");
  tray.setContextMenu(trayMenu);
  tray.on("click", () => toggleWin());
}

ipcMain.on("win:minimize", () => { if (alive()) win.minimize(); });
ipcMain.on("win:hide", () => { if (alive()) win.hide(); });
ipcMain.handle("win:toggleTop", () => setTop(!cfg.top));

app.whenReady().then(() => {
  createWindow();

  // Ctrl+Shift+Space 로 보이기/숨기기. 다른 프로그램이 선점했으면 false 가 온다.
  const shortcutOk = globalShortcut.register("CommandOrControl+Shift+Space", () => toggleWin());
  if (!shortcutOk) console.warn("단축키 Ctrl+Shift+Space 를 등록하지 못했습니다");

  buildTray(shortcutOk);

  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// 트레이 "종료" 말고 로그오프나 Cmd+Q 로도 실제로 꺼지게 한다.
app.on("before-quit", () => { app.isQuiting = true; });

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  clearTimeout(saveTimer); // 창 위치를 아직 못 썼으면 지금 쓴다
  saveCfg(cfg);
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
