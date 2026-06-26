// Single self-contained bundle (esbuild) of @yume-chan/adb +
// adb-daemon-webusb + adb-credential-web with all shared internals inlined
// exactly once. No runtime dependency resolution, no duplicate class
// identities — the auth handshake completes. Rebuild via scratchpad esbuild
// if bumping versions.
import {
  Adb, AdbDaemonTransport, AdbDaemonWebUsbDeviceManager, AdbWebCredentialStore,
  AdbScrcpyClient, AdbScrcpyOptionsLatest, DefaultServerPath,
  WebCodecsVideoDecoder, BitmapVideoFrameRenderer, ReadableStream,
  Terminal, FitAddon,
} from "./tango.js";

const SCRCPY_VERSION = "3.3.3";   // must match the pushed scrcpy-server binary

const $ = (id) => document.getElementById(id);
const statusEl = $("status"), statusDot = $("statusDot");
const connectBtn = $("connect"), connectBtn2 = $("connect2"), disconnectBtn = $("disconnect");
const shellRestartBtn = $("shellRestart"), shellFsBtn = $("shellFs"),
      shellStatusEl = $("shellStatus"), termWrap = $("termWrap"),
      termEl = $("term"), termFsExitBtn = $("termFsExit");
const pkgEl = $("pkg"), tagsEl = $("tags"), levelEl = $("level"),
      clearFirstEl = $("clearfirst"), autoscrollEl = $("autoscroll"),
      logStartBtn = $("logStart"), logStopBtn = $("logStop"),
      logClearBtn = $("logClear"), logEl = $("log"), logStatusEl = $("logStatus");
const deviceInfoEl = $("deviceInfo"), refreshInfoBtn = $("refreshInfo");
const bugGenBtn = $("bugGen"), bugStatusEl = $("bugStatus"),
      bugProgressEl = $("bugProgress"), bugBarEl = $("bugBar");
const themeToggle = $("themeToggle");
const mirrorStartBtn = $("mirrorStart"), mirrorStopBtn = $("mirrorStop"),
      mirrorFsBtn = $("mirrorFs"), maxSizeEl = $("maxSize"),
      mirrorStatusEl = $("mirrorStatus"), screenCanvas = $("screen"),
      screenEmpty = $("screenEmpty"), screenWrap = $("screenWrap"), fsExitBtn = $("fsExit");
const filesUpBtn = $("filesUp"), filesPathEl = $("filesPath"), filesGoBtn = $("filesGo"),
      filesRefreshBtn = $("filesRefresh"), uploadFileEl = $("uploadFile"), uploadBtn = $("uploadBtn"),
      filesStatusEl = $("filesStatus"), filesListEl = $("filesList");
const apkFileEl = $("apkFile"), installBtn = $("installBtn"), appsStatusEl = $("appsStatus"),
      appsFilterEl = $("appsFilter"), appsSystemEl = $("appsSystem"), appsRefreshBtn = $("appsRefresh"),
      appsListEl = $("appsList");
const navItems = [...document.querySelectorAll(".nav-item")];

let adb = null;
let deviceSerial = null;        // current device serial (namespaces the icon cache)
let logProcess = null;          // running logcat process
let scrcpyClient = null;        // running scrcpy client
let scrcpyDecoder = null;       // running video decoder
const MAX_LOG_LINES = 5000;     // bound the DOM/memory
let logTail = "";               // partial (unterminated) logcat line buffer
const credentialStore = new AdbWebCredentialStore();
const manager = AdbDaemonWebUsbDeviceManager.BROWSER;

function setStatus(msg) { statusEl.textContent = msg; }

// ---- Debug logging ---------------------------------------------------------
// Every device operation logs to the console under the [adb] prefix.
const t0 = performance.now();
function dlog(op, ...args) {
  console.debug(`[adb +${((performance.now() - t0) / 1000).toFixed(2)}s] ${op}`, ...args);
}

// ---- Persistent icon cache (IndexedDB) -------------------------------------
// Base64 PNG icons are too big for localStorage, so use IndexedDB. Keyed per
// device serial; entries carry the app version so updated apps refetch.
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("webadb", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("icons");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const rq = db.transaction("icons", "readonly").objectStore("icons").get(key);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("icons", "readwrite");
    tx.objectStore("icons").put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// Spinner + label element for "loading" states.
function loaderEl(text = "Loading…") {
  const d = document.createElement("div");
  d.className = "loader";
  const s = document.createElement("span"); s.className = "spinner";
  const t = document.createElement("span"); t.textContent = text;
  d.append(s, t);
  return d;
}

// ---- Theme -----------------------------------------------------------------
// No data-theme attr = follow OS. Toggle stores an explicit choice.

function applyTheme(theme) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
  const dark = theme
    ? theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;
  themeToggle.textContent = dark ? "☀️" : "🌙";
}
applyTheme(localStorage.getItem("webadb-theme"));   // null → follow OS
themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark"
    || (!document.documentElement.hasAttribute("data-theme")
        && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = isDark ? "light" : "dark";
  localStorage.setItem("webadb-theme", next);
  applyTheme(next);
});

// ---- View switching --------------------------------------------------------

function showView(name) {
  for (const v of document.querySelectorAll(".view")) {
    v.classList.toggle("active", v.id === `view-${name}`);
  }
  for (const n of navItems) n.classList.toggle("active", n.dataset.view === name);
  // Lazily start the shell the first time its view is shown, and (re)fit once
  // the terminal element is visible.
  if (name === "shell" && adb) {
    startShell();
    requestAnimationFrame(fitTerminal);
  }
  if (name === "files" && adb && !filesLoaded) { filesLoaded = true; listDir(currentPath); }
  if (name === "apps" && adb && !appsLoaded) { appsLoaded = true; listApps(); }
}
for (const n of navItems) {
  n.addEventListener("click", () => { if (!n.disabled) showView(n.dataset.view); });
}

function setConnected(on) {
  connectBtn.disabled = on;
  disconnectBtn.disabled = !on;
  statusDot.classList.toggle("on", on);
  for (const n of navItems) n.disabled = !on;

  if (on) {
    showView("device");
  } else {
    showView("disconnected");
    stopLogcat();
    stopMirror();
    stopShell();
    disposeSync();
    filesLoaded = false; appsLoaded = false;
    appObserver?.disconnect();
    appInfoCache.clear();
    aaptBin = undefined;
    dexPushed = false; appsBulk = null; iconsLoaded = false;
  }
  // Stop buttons only enabled while their stream runs.
  logStopBtn.disabled = true;
  mirrorStartBtn.disabled = !on || !!scrcpyClient;
  mirrorStopBtn.disabled = !scrcpyClient;
  mirrorFsBtn.disabled = !on;   // fullscreen available whenever connected
  shellRestartBtn.disabled = !on;
  shellFsBtn.disabled = !on;
  bugGenBtn.disabled = !on;
}

if (!manager) {
  setStatus("WebUSB not available in this browser");
  connectBtn.disabled = true;
  if (connectBtn2) connectBtn2.disabled = true;
}

// ---- Connect / disconnect --------------------------------------------------

async function connect(existing) {
  if (adb) return;   // already connected
  try {
    let device = existing;
    if (!device) {
      setStatus("Requesting device…");
      device = await manager.requestDevice();   // shows the USB picker
      if (!device) { setStatus("No device selected"); return; }
    }
    dlog("device selected", device.serial);

    // Claiming the USB interface. If another process (host `adb` server,
    // Android Studio, scrcpy, another tab) holds it, this step hangs.
    setStatus("Claiming USB interface… (if this hangs, run `adb kill-server`)");
    dlog("device.connect() ▶");
    const connection = await device.connect();
    dlog("device.connect() ✓ — authenticating");

    setStatus("Authenticating… unlock the phone and accept the prompt");
    const authPromise = AdbDaemonTransport.authenticate({
      serial: device.serial,
      connection,
      credentialStore,
      readTimeLimit: 15000,
    });
    // The initial handshake waits for the on-device RSA prompt; if the screen
    // is locked it never appears. Force a clear failure after 25s.
    const transport = await Promise.race([
      authPromise,
      new Promise((_, reject) => setTimeout(() =>
        reject(new Error("Handshake timed out (25s). The device never authorized. " +
          "Unlock the phone, accept the 'Allow USB debugging?' prompt, then reload and connect ONCE.")),
        25000)),
    ]);
    dlog("authenticated ✓", device.serial);
    adb = new Adb(transport);
    deviceSerial = device.serial;

    const model = await prop("ro.product.model");
    setStatus(`Connected — ${model || device.serial}`);
    setConnected(true);
    await loadDeviceInfo();
  } catch (err) {
    console.error(err);
    dlog("connect ✗", err?.message ?? err);
    setStatus(`Error: ${err?.message ?? err}`);
  }
}

connectBtn.addEventListener("click", () => connect());
if (connectBtn2) connectBtn2.addEventListener("click", () => connect());

async function doDisconnect() {
  dlog("disconnect ▶");
  try { await adb?.close(); } catch {}
  adb = null;
  setConnected(false);
  setStatus("Disconnected");
  dlog("disconnect ✓");
}
disconnectBtn.addEventListener("click", doDisconnect);

// Auto-connect to a previously-authorized device (WebUSB persists the grant, so
// a permitted device IS one we connected to before). Runs on load and whenever
// such a device is plugged in.
async function tryAutoConnect() {
  if (adb || !manager) return;
  try {
    const devices = await manager.getDevices();
    if (devices.length) {
      dlog("autoconnect ▶", devices[0].serial);
      setStatus("Auto-connecting…");
      await connect(devices[0]);
    }
  } catch (e) {
    dlog("autoconnect ✗", e?.message ?? e);
  }
}

if (navigator.usb) {
  navigator.usb.addEventListener("connect", () => tryAutoConnect());
  navigator.usb.addEventListener("disconnect", (e) => {
    // Our device was unplugged → tear down.
    if (adb && deviceSerial && e.device?.serialNumber === deviceSerial) {
      dlog("device unplugged", deviceSerial);
      doDisconnect();
    }
  });
}

// ---- Helpers ---------------------------------------------------------------

async function sh(cmd) {
  const started = performance.now();
  dlog("shell ▶", cmd);
  try {
    const out = (await adb.subprocess.noneProtocol.spawnWaitText(cmd)).trim();
    const ms = (performance.now() - started).toFixed(0);
    dlog(`shell ✓ (${ms}ms) ${cmd}`, out.length > 200 ? out.slice(0, 200) + "…" : out);
    return out;
  } catch (err) {
    dlog(`shell ✗ ${cmd}`, err?.message ?? err);
    throw err;
  }
}
async function prop(name) { return sh(`getprop ${name}`); }

// ---- Device info -----------------------------------------------------------

// Render key/value rows with textContent only — device-supplied values are
// never inserted as HTML (prevents XSS from a hostile/odd device).
function renderKV(rows) {
  deviceInfoEl.replaceChildren();
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v || "—";
    deviceInfoEl.append(dt, dd);
  }
}

async function loadDeviceInfo() {
  renderKV([["Loading…", ""]]);
  try {
    const [manufacturer, model, android, sdk, build, serial, battery] = await Promise.all([
      prop("ro.product.manufacturer"),
      prop("ro.product.model"),
      prop("ro.build.version.release"),
      prop("ro.build.version.sdk"),
      prop("ro.build.display.id"),
      prop("ro.serialno"),
      sh("dumpsys battery | grep level").catch(() => ""),
    ]);
    const batteryPct = (battery.match(/level:\s*(\d+)/) || [])[1];
    renderKV([
      ["Manufacturer", manufacturer],
      ["Model", model],
      ["Android version", android && sdk ? `${android} (API ${sdk})` : android],
      ["Build", build],
      ["Serial", serial],
      ["Battery", batteryPct ? `${batteryPct}%` : "—"],
    ]);
  } catch (err) {
    console.error(err);
    renderKV([["Error", err?.message ?? String(err)]]);
  }
}
refreshInfoBtn.addEventListener("click", loadDeviceInfo);

// ---- Interactive shell (PTY terminal) --------------------------------------

let term = null, fitAddon = null, shellProc = null, shellWriter = null;

function ensureTerminal() {
  if (term) return;
  term = new Terminal({
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: 13, cursorBlink: true,
    theme: { background: "#000000" },
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(termEl);
  // Send user keystrokes to the device shell.
  const enc = new TextEncoder();
  term.onData((data) => { shellWriter?.write(enc.encode(data)).catch(() => {}); });
}

async function startShell() {
  if (shellProc || !adb) return;
  const svc = adb.subprocess.shellProtocol;
  if (!svc) {
    shellStatusEl.textContent = "shell protocol unsupported (needs Android 7+)";
    return;
  }
  ensureTerminal();
  dlog("shell-pty ▶ open");
  try {
    const proc = await svc.pty({ terminalType: "xterm-256color" });
    shellProc = proc;
    shellWriter = proc.input.getWriter();
    shellStatusEl.textContent = "connected";
    dlog("shell-pty ✓ open");
    fitTerminal();

    // Stream device output into the terminal.
    const reader = proc.output.getReader();
    proc._reader = reader;
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) term.write(value);
        }
      } catch { /* stream ended */ }
      finally {
        if (shellProc === proc) { shellProc = null; shellWriter = null; }
        shellStatusEl.textContent = "shell exited";
      }
    })();
  } catch (err) {
    console.error(err);
    shellStatusEl.textContent = `error: ${err?.message ?? err}`;
  }
}

async function stopShell() {
  const proc = shellProc;
  shellProc = null;
  try { shellWriter?.releaseLock?.(); } catch {}
  shellWriter = null;
  if (!proc) return;
  dlog("shell-pty ■ stop");
  try { await proc._reader?.cancel(); } catch {}
  try { await proc.kill?.(); } catch {}
}

function fitTerminal() {
  if (!term || !fitAddon || termEl.offsetWidth === 0) return;
  try {
    fitAddon.fit();
    shellProc?.resize?.(term.rows, term.cols);
  } catch {}
}

async function restartShell() {
  await stopShell();
  term?.clear();
  await startShell();
}

shellRestartBtn.addEventListener("click", restartShell);
window.addEventListener("resize", () => { if (isShellView()) fitTerminal(); });

function isShellView() {
  return document.getElementById("view-shell").classList.contains("active");
}

function setTermFullscreen(on) {
  termWrap.classList.toggle("fullscreen", on);
  termFsExitBtn.hidden = !on;
  requestAnimationFrame(fitTerminal);
}
shellFsBtn.addEventListener("click", () => setTermFullscreen(!termWrap.classList.contains("fullscreen")));
termFsExitBtn.addEventListener("click", () => setTermFullscreen(false));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && termWrap.classList.contains("fullscreen")) setTermFullscreen(false);
});

// ---- Live logcat -----------------------------------------------------------

// threadtime format: "MM-DD HH:MM:SS.mmm  PID  TID L Tag: message"
// The single letter before the tag is the priority level.
const LEVEL_RE = /^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+\d+\s+\d+\s+([VDIWEF])\s/;

function clearLog() { logEl.replaceChildren(); logTail = ""; }

function appendLog(chunk) {
  const atBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 4;
  logTail += chunk;
  const parts = logTail.split("\n");
  logTail = parts.pop();   // keep the last (possibly partial) line buffered

  for (const line of parts) {
    const span = document.createElement("span");
    span.className = "line";
    const lvl = (line.match(LEVEL_RE) || [])[1];
    if (lvl) span.classList.add(`lvl-${lvl}`);
    span.textContent = line + "\n";   // textContent → no HTML injection
    logEl.append(span);
  }

  // Bound DOM: drop oldest lines beyond MAX_LOG_LINES.
  let excess = logEl.childElementCount - MAX_LOG_LINES;
  while (excess-- > 0 && logEl.firstChild) logEl.removeChild(logEl.firstChild);

  if (autoscrollEl.checked && atBottom) logEl.scrollTop = logEl.scrollHeight;
}

// Build a logcat filterspec from package + tags + level.
async function buildLogcatArgs() {
  const level = levelEl.value;
  let args = "-v threadtime";

  const pkg = pkgEl.value.trim();
  if (pkg) {
    // logcat can't filter by package directly — resolve to PID(s).
    const pidText = await sh(`pidof ${pkg}`);
    if (!pidText) {
      throw new Error(`"${pkg}" is not running (no PID). Launch the app, then start logcat.`);
    }
    for (const pid of pidText.split(/\s+/)) args += ` --pid=${pid}`;
  }

  const tags = tagsEl.value.split(",").map(t => t.trim()).filter(Boolean);
  if (tags.length) {
    // Show listed tags at >= level, silence everything else.
    for (const t of tags) args += ` ${t}:${level}`;
    args += " *:S";
  } else {
    args += ` *:${level}`;   // no tag filter: apply level globally
  }
  return args;
}

async function startLogcat() {
  if (logProcess) return;
  try {
    if (clearFirstEl.checked) {
      await adb.subprocess.noneProtocol.spawnWaitText("logcat -c");
      clearLog();
    }
    const args = await buildLogcatArgs();
    const proc = await adb.subprocess.noneProtocol.spawn(`logcat ${args}`);
    logProcess = proc;
    logStartBtn.disabled = true;
    logStopBtn.disabled = false;
    logStatusEl.textContent = `streaming (${args})`;
    dlog("logcat ▶", `logcat ${args}`);

    const reader = proc.output.pipeThrough(new TextDecoderStream()).getReader();
    logProcess._reader = reader;
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) appendLog(value);
        }
      } catch (err) {
        if (logProcess) appendLog(`\n[stream error: ${err?.message ?? err}]\n`);
      } finally {
        if (logProcess === proc) logProcess = null;
        logStartBtn.disabled = false;
        logStopBtn.disabled = true;
      }
    })();
  } catch (err) {
    console.error(err);
    logStatusEl.textContent = `error: ${err?.message ?? err}`;
    logStartBtn.disabled = false;
    logStopBtn.disabled = true;
    logProcess = null;
  }
}

async function stopLogcat() {
  const proc = logProcess;
  logProcess = null;
  if (!proc) return;
  dlog("logcat ■ stop");
  try { await proc._reader?.cancel(); } catch {}
  try { await proc.kill?.(); } catch {}
  logStartBtn.disabled = !adb;
  logStopBtn.disabled = true;
}

logStartBtn.addEventListener("click", startLogcat);
logStopBtn.addEventListener("click", () => { stopLogcat(); logStatusEl.textContent = "stopped"; });
logClearBtn.addEventListener("click", clearLog);

// ---- Screen mirror (scrcpy) ------------------------------------------------

let serverBufferCache = null;
async function loadScrcpyServer() {
  if (!serverBufferCache) {
    const res = await fetch("./scrcpy-server");
    if (!res.ok) throw new Error(`Failed to fetch scrcpy-server (${res.status})`);
    serverBufferCache = new Uint8Array(await res.arrayBuffer());
  }
  return serverBufferCache;
}

async function startMirror() {
  if (scrcpyClient || !adb) return;
  if (!WebCodecsVideoDecoder.isSupported) {
    mirrorStatusEl.textContent = "WebCodecs H.264 decoder not supported in this browser.";
    return;
  }
  mirrorStartBtn.disabled = true;
  mirrorStatusEl.textContent = "Pushing scrcpy server…";
  dlog("scrcpy ▶ push server + start");
  try {
    const server = await loadScrcpyServer();
    // Push the server binary to the device.
    await AdbScrcpyClient.pushServer(
      adb,
      new ReadableStream({ start(c) { c.enqueue(server); c.close(); } }),
      DefaultServerPath,
    );

    const maxSize = Number(maxSizeEl.value) || 0;
    // AdbScrcpyOptionsLatest takes a PLAIN init object (not a ScrcpyOptions
    // instance) plus client options carrying the server version.
    const options = new AdbScrcpyOptionsLatest(
      { video: true, audio: false, control: false, maxSize },
      { version: SCRCPY_VERSION },
    );

    mirrorStatusEl.textContent = "Starting…";
    const client = await AdbScrcpyClient.start(adb, DefaultServerPath, options);
    scrcpyClient = client;

    // Surface server log lines to the console for debugging.
    client.output.pipeTo(new WritableStream({
      write(line) { console.log("[scrcpy]", line); },
    })).catch(() => {});

    const video = await client.videoStream;   // { metadata, stream }
    const renderer = new BitmapVideoFrameRenderer(screenCanvas);
    const decoder = new WebCodecsVideoDecoder({ codec: video.metadata.codec, renderer });
    scrcpyDecoder = decoder;
    decoder.sizeChanged(({ width, height }) => {
      screenCanvas.width = width; screenCanvas.height = height;
    });

    screenCanvas.hidden = false;
    screenEmpty.hidden = true;
    mirrorStopBtn.disabled = false;
    mirrorStatusEl.textContent = "Mirroring";
    dlog("scrcpy ✓ streaming", `${video.width}x${video.height}`);

    // Pipe decoded video to the renderer until the stream ends.
    video.stream.pipeTo(decoder.writable).catch((err) => {
      console.error("[scrcpy] video stream ended:", err);
    });
  } catch (err) {
    console.error(err);
    mirrorStatusEl.textContent = `Error: ${err?.message ?? err}`;
    await stopMirror();
  } finally {
    mirrorStartBtn.disabled = !adb || !!scrcpyClient;
  }
}

async function stopMirror() {
  const client = scrcpyClient, decoder = scrcpyDecoder;
  scrcpyClient = null; scrcpyDecoder = null;
  if (client) dlog("scrcpy ■ stop");
  try { decoder?.dispose(); } catch {}
  try { await client?.close(); } catch {}
  setFullscreen(false);
  screenCanvas.hidden = true;
  screenEmpty.hidden = false;
  mirrorStartBtn.disabled = !adb;
  mirrorStopBtn.disabled = true;
  mirrorFsBtn.disabled = !adb;
  if (mirrorStatusEl.textContent === "Mirroring") mirrorStatusEl.textContent = "Stopped";
}

function setFullscreen(on) {
  screenWrap.classList.toggle("fullscreen", on);
  fsExitBtn.hidden = !on;
}

mirrorStartBtn.addEventListener("click", startMirror);
mirrorStopBtn.addEventListener("click", () => { stopMirror(); });
mirrorFsBtn.addEventListener("click", () => setFullscreen(!screenWrap.classList.contains("fullscreen")));
fsExitBtn.addEventListener("click", () => setFullscreen(false));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && screenWrap.classList.contains("fullscreen")) setFullscreen(false);
});

// ---- Files -----------------------------------------------------------------

let currentPath = "/sdcard/";
let syncClient = null;
let filesLoaded = false;

async function getSync() {
  if (!syncClient) { dlog("sync ▶ open"); syncClient = await adb.sync(); dlog("sync ✓ open"); }
  return syncClient;
}
async function disposeSync() {
  const s = syncClient; syncClient = null;
  try { await s?.dispose(); } catch {}
}

function normalizeDir(p) {
  if (!p.startsWith("/")) p = "/" + p;
  if (!p.endsWith("/")) p += "/";
  return p.replace(/\/+/g, "/");
}
function parentDir(p) {
  const t = p.replace(/\/+$/, "");
  const i = t.lastIndexOf("/");
  return i <= 0 ? "/" : t.slice(0, i + 1);
}
function humanSize(n) {
  n = Number(n);
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"]; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(1)} ${u[i]}`;
}

async function listDir(path) {
  currentPath = normalizeDir(path);
  filesPathEl.value = currentPath;
  filesListEl.replaceChildren();
  filesStatusEl.textContent = "Loading…";
  try {
    const s = await getSync();
    dlog("readdir ▶", currentPath);
    const entries = await s.readdir(currentPath);
    dlog(`readdir ✓ (${entries.length} entries)`, currentPath);
    entries.sort((a, b) => {
      const ad = a.type === 4, bd = b.type === 4;
      if (ad !== bd) return ad ? -1 : 1;            // dirs first
      return a.name.localeCompare(b.name);
    });
    const frag = document.createDocumentFragment();
    for (const e of entries) {
      if (e.name === "." || e.name === "..") continue;
      const isDir = e.type === 4;
      const row = document.createElement("div");
      row.className = "item";

      const ico = document.createElement("span");
      ico.className = "ico";
      ico.textContent = isDir ? "📁" : (e.type === 10 ? "🔗" : "📄");

      const name = document.createElement("span");
      name.className = "name" + (isDir ? " dir" : "");
      name.textContent = e.name;
      if (isDir) name.addEventListener("click", () => listDir(currentPath + e.name + "/"));

      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = isDir ? "" : humanSize(e.size);

      const actions = document.createElement("span");
      actions.className = "actions";
      if (!isDir) {
        const dl = document.createElement("button");
        dl.textContent = "Download";
        dl.addEventListener("click", () => downloadFile(currentPath + e.name, e.name));
        actions.append(dl);
      }
      row.append(ico, name, meta, actions);
      frag.append(row);
    }
    if (!frag.childElementCount) {
      const empty = document.createElement("div");
      empty.className = "empty"; empty.textContent = "(empty)";
      frag.append(empty);
    }
    filesListEl.append(frag);
    filesStatusEl.textContent = "";
  } catch (err) {
    console.error(err);
    filesStatusEl.textContent = `Error: ${err?.message ?? err}`;
  }
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function downloadFile(path, name) {
  filesStatusEl.textContent = `Downloading ${name}…`;
  dlog("pull ▶", path);
  try {
    const s = await getSync();
    const blob = await new Response(s.read(path)).blob();
    dlog(`pull ✓ (${blob.size} bytes)`, path);
    saveBlob(blob, name);
    filesStatusEl.textContent = "";
  } catch (err) {
    console.error(err);
    filesStatusEl.textContent = `Error: ${err?.message ?? err}`;
  }
}

async function uploadHere() {
  const file = uploadFileEl.files?.[0];
  if (!file) { filesStatusEl.textContent = "Pick a file first."; return; }
  filesStatusEl.textContent = `Uploading ${file.name}…`;
  uploadBtn.disabled = true;
  dlog(`push ▶ ${currentPath}${file.name} (${file.size} bytes)`);
  try {
    const s = await getSync();
    await s.write({ filename: currentPath + file.name, file: file.stream() });
    dlog("push ✓", currentPath + file.name);
    uploadFileEl.value = "";
    filesStatusEl.textContent = `Uploaded ${file.name}`;
    await listDir(currentPath);
  } catch (err) {
    console.error(err);
    filesStatusEl.textContent = `Error: ${err?.message ?? err}`;
  } finally {
    uploadBtn.disabled = false;
  }
}

filesGoBtn.addEventListener("click", () => listDir(filesPathEl.value));
filesPathEl.addEventListener("keydown", (e) => { if (e.key === "Enter") listDir(filesPathEl.value); });
filesUpBtn.addEventListener("click", () => listDir(parentDir(currentPath)));
filesRefreshBtn.addEventListener("click", () => listDir(currentPath));
uploadBtn.addEventListener("click", uploadHere);

// ---- Apps ------------------------------------------------------------------

let appsLoaded = false;
let allPackages = [];
const appInfoCache = new Map();   // pkg -> { label, version } (or { failed: true })
let apkParserMod = null;
let appObserver = null;
let enrichQueue = Promise.resolve();   // serialize APK pulls (single sync socket)
let dexPushed = false;            // applist.dex pushed this connection
let appsBulk = null;             // Map pkg -> { label, version, system } from app_process
let iconsLoaded = false;         // icons already fetched this connection
let iconStore = {};              // pkg -> { v, icon } persisted in IndexedDB
let iconStoreSerial = null;      // serial the loaded iconStore belongs to

function iconCacheKey() { return `icons:${deviceSerial}`; }
async function ensureIconStore() {
  if (iconStoreSerial !== deviceSerial) {
    iconStore = (await idbGet(iconCacheKey()).catch(() => null)) || {};
    iconStoreSerial = deviceSerial;
    dlog(`icon cache loaded (${Object.keys(iconStore).length} entries)`);
  }
  return iconStore;
}

const DEX_DEVICE_PATH = "/data/local/tmp/applist.dex";

// Push the label-dumper dex and run it inside ART via app_process. Returns a
// map of every package -> { label, version, system } in one shot (~150ms),
// or throws if unsupported (old device / blocked hidden API).
async function loadBulkAppInfo() {
  if (!dexPushed) {
    dlog("applist ▶ push dex");
    const buf = new Uint8Array(await (await fetch("./applist.dex")).arrayBuffer());
    const s = await getSync();
    await s.write({
      filename: DEX_DEVICE_PATH,
      file: new ReadableStream({ start(c) { c.enqueue(buf); c.close(); } }),
    });
    dexPushed = true;
  }
  dlog("applist ▶ app_process run");
  const out = await sh(`CLASSPATH=${DEX_DEVICE_PATH} app_process / Main`);
  const map = new Map();
  for (const line of out.split("\n")) {
    if (!line) continue;
    const [pkg, label, ver, sys] = line.split("\t");
    if (pkg) map.set(pkg, { label: label || null, version: ver || "", system: sys === "1" });
  }
  if (map.size === 0) throw new Error("app_process returned no packages");
  dlog(`applist ✓ (${map.size} packages)`);
  return map;
}

function getApkParser() {
  if (!apkParserMod) apkParserMod = import("./apkparser.js");
  return apkParserMod;
}

// Reading the label requires parsing the whole APK (ZIP directory is at the
// end), so the pull cost ~= APK size. Skip apps larger than this to keep the
// list light; they keep their package name. The icon is intentionally not
// extracted — modern adaptive icons are XML and rarely render anyway.
const MAX_APK_PULL = 25 * 1024 * 1024;
let aaptBin;   // undefined = unknown, null = none, string = binary name

// Detect an on-device aapt/aapt2 once per connection. If present, labels can be
// read on-device (cheap, no APK transfer).
async function detectAapt() {
  if (aaptBin !== undefined) return aaptBin;
  for (const c of ["aapt", "aapt2"]) {
    const out = await sh(`command -v ${c} 2>/dev/null || true`).catch(() => "");
    if (out && !/not found/i.test(out)) { aaptBin = c; return aaptBin; }
  }
  aaptBin = null;
  return aaptBin;
}

async function apkPath(pkg) {
  const pathOut = await sh(`pm path ${pkg}`);
  const paths = pathOut.split("\n").map((l) => l.replace(/^package:/, "").trim()).filter(Boolean);
  return paths.find((p) => p.endsWith("base.apk")) || paths[0];
}

async function loadAppInfo(pkg) {
  if (appInfoCache.has(pkg)) return appInfoCache.get(pkg);
  const apk = await apkPath(pkg);
  if (!apk) throw new Error("no apk path");

  // Preferred: parse the label on-device with aapt — no APK transfer.
  const aapt = await detectAapt();
  if (aapt) {
    const out = await sh(`${aapt} dump badging "${apk}" 2>/dev/null`).catch(() => "");
    const label = (out.match(/application-label:'([^']*)'/) || [])[1];
    const version = (out.match(/versionName='([^']*)'/) || [])[1];
    if (label) {
      dlog(`appinfo ✓ via ${aapt}`, pkg, label);
      const res = { label, version };
      appInfoCache.set(pkg, res);
      return res;
    }
    // aapt present but parse failed → fall through to the pull parser.
  }
  dlog("appinfo ▶ pull+parse", pkg, apk);

  // Fallback: pull the APK and parse it in the browser (size-capped, since the
  // whole file must be transferred to read its resources).
  const s = await getSync();
  const stat = await s.lstat(apk);
  if (Number(stat.size) > MAX_APK_PULL) throw new Error("apk too large, skipped");
  const blob = await new Response(s.read(apk)).blob();
  const { AppInfoParser } = await getApkParser();
  const info = await new AppInfoParser(new File([blob], "base.apk")).parse();
  const label = Array.isArray(info.application?.label)
    ? info.application.label[0] : (info.application?.label || info.label);
  const version = info.versionName;
  dlog(`appinfo ✓ via parser (${blob.size} bytes)`, pkg, label);
  const res = { label: label || null, version };
  appInfoCache.set(pkg, res);
  return res;
}

function applyAppInfo(row, pkg, info) {
  if (info.label) row._name.firstChild.textContent = info.label;   // primary = label
  if (row._sub) row._sub.textContent = info.version ? `${pkg} · v${info.version}` : pkg;
  if (info.icon && row._iconEl && row._iconEl.tagName !== "IMG") {
    const img = document.createElement("img");
    img.className = "app-icon"; img.src = info.icon; img.alt = "";
    row._iconEl.replaceWith(img); row._iconEl = img;
  }
}

// Second app_process call: render every app icon (framework rasterizes adaptive
// icons correctly) → base64 PNG. Runs after labels so the list paints fast.
async function loadBulkIcons() {
  if (iconsLoaded) return;
  const baseStatus = appsStatusEl.textContent;
  try {
    dlog("appicons ▶ app_process run");
    appsStatusEl.textContent = `${baseStatus} · loading icons…`;
    const out = await sh(`CLASSPATH=${DEX_DEVICE_PATH} app_process / Main icons`);
    let n = 0;
    for (const line of out.split("\n")) {
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      const pkg = line.slice(0, tab);
      const b64 = line.slice(tab + 1);
      if (!pkg || !b64) continue;
      const info = appInfoCache.get(pkg) || {};
      info.icon = `data:image/png;base64,${b64}`;
      appInfoCache.set(pkg, info);
      iconStore[pkg] = { v: info.version || "", icon: info.icon };   // persist
      const row = appsListEl.querySelector(`[data-pkg="${CSS.escape(pkg)}"]`);
      if (row) applyAppInfo(row, pkg, info);
      n++;
    }
    // Mark apps that have no icon as resolved (icon:null) so they aren't
    // refetched on every load.
    if (appsBulk) for (const [pkg, info] of appsBulk) {
      if (!iconStore[pkg]) iconStore[pkg] = { v: info.version || "", icon: null };
    }
    iconsLoaded = true;
    await idbSet(iconCacheKey(), iconStore).catch((e) => dlog("icon cache save ✗", e?.message));
    dlog(`appicons ✓ (${n}, cached)`);
  } catch (e) {
    dlog("appicons ✗", e?.message ?? e);
  } finally {
    appsStatusEl.textContent = baseStatus;
  }
}

// Used by the per-row lazy fallback (only when the bulk app_process path is
// unavailable). Pulls/parses a single APK on demand.
function enrichRow(pkg, row) {
  const cached = appInfoCache.get(pkg);
  if (cached) { if (!cached.failed) applyAppInfo(row, pkg, cached); return; }
  enrichQueue = enrichQueue.then(async () => {
    if (appInfoCache.has(pkg)) { const c = appInfoCache.get(pkg); if (!c.failed) applyAppInfo(row, pkg, c); return; }
    try { applyAppInfo(row, pkg, await loadAppInfo(pkg)); }
    catch (e) { appInfoCache.set(pkg, { failed: true }); dlog("appinfo ✗", pkg, e?.message); }
  });
}

async function listApps() {
  appsStatusEl.textContent = "Loading…";
  appsListEl.replaceChildren(loaderEl("Loading apps…"));
  appsRefreshBtn.disabled = true; appsSystemEl.disabled = true;
  try {
    // Fast path: one app_process call dumps every label + version at once.
    appsBulk = await loadBulkAppInfo();
    await ensureIconStore();
    const wantSystem = appsSystemEl.checked;
    for (const [pkg, info] of appsBulk) {
      const entry = { label: info.label, version: info.version };
      // Apply a persisted icon if it matches the installed version.
      const cached = iconStore[pkg];
      if (cached && cached.v === (info.version || "")) entry.icon = cached.icon;
      appInfoCache.set(pkg, entry);
    }
    allPackages = [...appsBulk.keys()]
      .filter((p) => wantSystem || !appsBulk.get(p).system)
      .sort((a, b) => (appsBulk.get(a).label || a).localeCompare(appsBulk.get(b).label || b));
    renderApps();   // cached icons show instantly
    appsStatusEl.textContent = `${allPackages.length} packages`;
    appsRefreshBtn.disabled = false; appsSystemEl.disabled = false;

    // Only run the (heavier) icon dump if some app is new or version-changed.
    const needIcons = [...appsBulk.keys()].some((p) => {
      const c = iconStore[p];
      return !c || c.v !== (appsBulk.get(p).version || "");
    });
    if (needIcons) loadBulkIcons();
    else { iconsLoaded = true; dlog("appicons ✓ from cache"); }
    return;
  } catch (err) {
    dlog("applist ✗ bulk failed → fallback", err?.message ?? err);
  }
  // Fallback: package names from pm, labels lazily per row (aapt / APK parse).
  try {
    const flag = appsSystemEl.checked ? "" : "-3";
    const out = await sh(`pm list packages ${flag}`);
    allPackages = out.split("\n")
      .map((l) => l.replace(/^package:/, "").trim())
      .filter(Boolean).sort();
    renderApps();
    appsStatusEl.textContent = `${allPackages.length} packages (names lazy)`;
  } catch (err) {
    console.error(err);
    appsListEl.replaceChildren();
    appsStatusEl.textContent = `Error: ${err?.message ?? err}`;
  } finally {
    appsRefreshBtn.disabled = false; appsSystemEl.disabled = false;
  }
}

function renderApps() {
  const filter = appsFilterEl.value.trim().toLowerCase();
  const list = filter ? allPackages.filter((p) => p.toLowerCase().includes(filter)) : allPackages;

  // Reset the lazy-enrichment observer for this render.
  appObserver?.disconnect();
  appObserver = new IntersectionObserver((entries, obs) => {
    for (const en of entries) {
      if (en.isIntersecting) { enrichRow(en.target.dataset.pkg, en.target); obs.unobserve(en.target); }
    }
  }, { root: appsListEl, rootMargin: "200px" });

  appsListEl.replaceChildren();
  const frag = document.createDocumentFragment();
  for (const pkg of list) {
    const row = document.createElement("div");
    row.className = "item"; row.dataset.pkg = pkg;

    const ico = document.createElement("span"); ico.className = "ico"; ico.textContent = "📦";

    const name = document.createElement("span"); name.className = "name";
    name.append(document.createTextNode(pkg));       // primary line (replaced by label)
    const sub = document.createElement("span"); sub.className = "sub"; sub.textContent = pkg;
    name.append(sub);

    const actions = document.createElement("span"); actions.className = "actions";
    const mkBtn = (label, fn, danger) => {
      const b = document.createElement("button");
      b.textContent = label; if (danger) b.className = "danger";
      b.addEventListener("click", () => fn(pkg));
      return b;
    };
    actions.append(
      mkBtn("Stop", forceStopApp),
      mkBtn("Clear", clearApp, true),
      mkBtn("Uninstall", uninstallApp, true),
    );

    row._iconEl = ico; row._name = name; row._sub = sub;
    row.append(ico, name, actions);
    // Apply already-known info (bulk app_process path) immediately.
    const cached = appInfoCache.get(pkg);
    if (cached && !cached.failed) applyAppInfo(row, pkg, cached);
    frag.append(row);
  }
  if (!frag.childElementCount) {
    const empty = document.createElement("div");
    empty.className = "empty"; empty.textContent = "(no matches)";
    frag.append(empty);
  }
  appsListEl.append(frag);
  // Only lazily enrich rows we don't already know (i.e. the fallback path).
  for (const row of appsListEl.children) {
    if (!row.dataset.pkg) continue;
    const c = appInfoCache.get(row.dataset.pkg);
    if (!c || c.failed) appObserver.observe(row);
  }
}

async function appAction(label, cmd, pkg, refresh) {
  appsStatusEl.textContent = `${label} ${pkg}…`;
  try {
    const res = await sh(cmd);
    appsStatusEl.textContent = `${label} ${pkg}: ${res || "done"}`;
    if (refresh) await listApps();
  } catch (err) {
    console.error(err);
    appsStatusEl.textContent = `Error: ${err?.message ?? err}`;
  }
}
function forceStopApp(pkg) { appAction("Stopped", `am force-stop ${pkg}`, pkg, false); }
function clearApp(pkg) {
  if (!confirm(`Clear all data of ${pkg}? This is irreversible.`)) return;
  appAction("Cleared", `pm clear ${pkg}`, pkg, false);
}
function uninstallApp(pkg) {
  if (!confirm(`Uninstall ${pkg}?`)) return;
  appAction("Uninstalled", `pm uninstall ${pkg}`, pkg, true);
}

async function installApk() {
  const file = apkFileEl.files?.[0];
  if (!file) { appsStatusEl.textContent = "Pick an APK first."; return; }
  installBtn.disabled = true;
  const tmp = "/data/local/tmp/_install.apk";
  try {
    appsStatusEl.textContent = `Pushing ${file.name}…`;
    dlog(`install ▶ push ${file.name} (${file.size} bytes) → ${tmp}`);
    const s = await getSync();
    await s.write({ filename: tmp, file: file.stream() });
    dlog("install ▶ pm install");
    appsStatusEl.textContent = "Installing…";
    const res = await sh(`pm install -r ${tmp}`);
    await sh(`rm -f ${tmp}`).catch(() => {});
    appsStatusEl.textContent = `Install: ${res || "Success"}`;
    apkFileEl.value = "";
    iconsLoaded = false;   // refresh icons (new package added)
    if (appsLoaded) await listApps();
  } catch (err) {
    console.error(err);
    appsStatusEl.textContent = `Error: ${err?.message ?? err}`;
  } finally {
    installBtn.disabled = false;
  }
}

appsRefreshBtn.addEventListener("click", listApps);
appsFilterEl.addEventListener("input", renderApps);
appsSystemEl.addEventListener("change", listApps);
installBtn.addEventListener("click", installApk);

// ---- Bug report ------------------------------------------------------------

async function generateBugreport() {
  if (!adb) return;
  bugGenBtn.disabled = true;
  bugProgressEl.hidden = false;
  bugBarEl.style.width = "0%";
  bugStatusEl.textContent = "Starting…";
  dlog("bugreport ▶");
  try {
    // bugreportz (Android 7+) builds a zip on-device and streams progress.
    const proc = await adb.subprocess.noneProtocol.spawn("bugreportz -p");
    const reader = proc.output.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "", okPath = null, failed = null;
    const handle = (line) => {
      line = line.trim();
      if (!line) return;
      if (line.startsWith("PROGRESS:")) {
        const m = line.match(/PROGRESS:(\d+)\/(\d+)/);
        if (m) {
          const pct = Math.min(99, Math.round((100 * +m[1]) / +m[2]));
          bugBarEl.style.width = pct + "%";
          bugStatusEl.textContent = `Generating… ${pct}%`;
        }
      } else if (line.startsWith("OK:")) okPath = line.slice(3).trim();
      else if (line.startsWith("FAIL:")) failed = line.slice(5).trim();
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    handle(buf);   // trailing line without newline

    if (failed) throw new Error(failed);

    if (okPath) {
      dlog("bugreport ✓ generated", okPath);
      bugStatusEl.textContent = "Downloading…";
      bugBarEl.style.width = "100%";
      const s = await getSync();
      const blob = await new Response(s.read(okPath)).blob();
      saveBlob(blob, okPath.split("/").pop() || "bugreport.zip");
      bugStatusEl.textContent = `Saved (${(blob.size / 1048576).toFixed(1)} MB)`;
      dlog(`bugreport ✓ downloaded (${blob.size} bytes)`);
    } else {
      // Fallback for devices without bugreportz: plain-text bugreport.
      dlog("bugreport ▶ text fallback");
      bugStatusEl.textContent = "bugreportz unavailable — capturing text…";
      const txt = await sh("bugreport");
      saveBlob(new Blob([txt], { type: "text/plain" }), `bugreport-${deviceSerial}.txt`);
      bugStatusEl.textContent = "Saved (text)";
    }
  } catch (err) {
    console.error(err);
    dlog("bugreport ✗", err?.message ?? err);
    bugStatusEl.textContent = `Error: ${err?.message ?? err}`;
  } finally {
    bugGenBtn.disabled = false;
    setTimeout(() => { bugProgressEl.hidden = true; }, 1500);
  }
}
bugGenBtn.addEventListener("click", generateBugreport);

// Initial state.
setConnected(false);
tryAutoConnect();   // reconnect a previously-authorized device on load
