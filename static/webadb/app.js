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
const mgmtSummaryEl = $("mgmtSummary"), mgmtSecurityEl = $("mgmtSecurity"),
      mgmtPoliciesEl = $("mgmtPolicies"), mgmtAppPoliciesEl = $("mgmtAppPolicies"),
      mgmtAppconfigEl = $("mgmtAppconfig"), mgmtRawEl = $("mgmtRaw"),
      mgmtEffectiveEl = $("mgmtEffective"), mgmtCertsEl = $("mgmtCerts"),
      mgmtNetworkEl = $("mgmtNetwork"), mgmtDiagEl = $("mgmtDiag");
const effOnlyIssuesEl = $("effOnlyIssues"), diagLogcatBtn = $("diagLogcat"),
      diagExportBtn = $("diagExport"), diagStatusEl = $("diagStatus");
const mgmtRefreshBtns = [...document.querySelectorAll(".mgmt-refresh")];
const mgmtStatusEls = [...document.querySelectorAll(".mgmt-status")];
function setMgmtStatus(t) { for (const e of mgmtStatusEls) e.textContent = t; }
function setMgmtRefreshDisabled(d) { for (const b of mgmtRefreshBtns) b.disabled = d; }
const themeToggle = $("themeToggle");
const mirrorStartBtn = $("mirrorStart"), mirrorStopBtn = $("mirrorStop"),
      mirrorFsBtn = $("mirrorFs"), mirrorShotBtn = $("mirrorShot"),
      mirrorRecBtn = $("mirrorRec"), audioEnEl = $("audioEn"), maxSizeEl = $("maxSize"),
      mirrorStatusEl = $("mirrorStatus"), screenCanvas = $("screen"),
      screenEmpty = $("screenEmpty"), screenWrap = $("screenWrap"), fsExitBtn = $("fsExit");
const filesUpBtn = $("filesUp"), filesPathEl = $("filesPath"), filesGoBtn = $("filesGo"),
      filesRefreshBtn = $("filesRefresh"), uploadFileEl = $("uploadFile"), uploadBtn = $("uploadBtn"),
      filesStatusEl = $("filesStatus"), filesListEl = $("filesList");
const apkFileEl = $("apkFile"), installBtn = $("installBtn"), appsStatusEl = $("appsStatus"),
      appsFilterEl = $("appsFilter"), appsSystemEl = $("appsSystem"), appsRefreshBtn = $("appsRefresh"),
      appsListEl = $("appsList"), appsProfileEl = $("appsProfile"), appsInstallerEl = $("appsInstaller");
const navItems = [...document.querySelectorAll(".nav-item")];

let adb = null;
let deviceSerial = null;        // current device serial (namespaces the icon cache)
let logProcess = null;          // running logcat process
let scrcpyClient = null;        // running scrcpy client
let scrcpyDecoder = null;       // running video decoder
let scrcpyAudioCtx = null;      // AudioContext fed by raw scrcpy PCM
let scrcpyAudioDest = null;     // MediaStreamDestination (audio track for recording)
let scrcpyAudioReader = null;   // raw-audio stream reader (cancelled on stop)
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
  if (name.startsWith("mgmt-") && adb && !mgmtLoaded) { mgmtLoaded = true; loadManagement(); }
}
let mgmtLoaded = false;
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
    filesLoaded = false; appsLoaded = false; mgmtLoaded = false;
    appObserver?.disconnect();
    appInfoCache.clear();
    appProfiles = new Map(); dpcPkgsGlobal = new Set();
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
  setMgmtRefreshDisabled(!on);
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
    const wantAudio = audioEnEl.checked;
    audioEnEl.disabled = true;
    // AdbScrcpyOptionsLatest takes a PLAIN init object (not a ScrcpyOptions
    // instance) plus client options carrying the server version. Use the raw
    // (uncompressed s16le) audio codec so playback needs no Opus/AAC decoder.
    const options = new AdbScrcpyOptionsLatest(
      { video: true, audio: wantAudio, audioCodec: "raw", control: false, maxSize },
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
    mirrorShotBtn.disabled = false;
    mirrorRecBtn.disabled = false;
    mirrorStatusEl.textContent = "Mirroring";
    dlog("scrcpy ✓ streaming", `${video.width}x${video.height}`);

    // Pipe decoded video to the renderer until the stream ends.
    video.stream.pipeTo(decoder.writable).catch((err) => {
      console.error("[scrcpy] video stream ended:", err);
    });

    if (wantAudio) {
      try {
        const audio = await client.audioStream;   // union: success | disabled | errored
        if (audio.type === "success") { startScrcpyAudio(audio.stream); dlog("scrcpy ♪ audio (raw)"); }
        else { dlog("scrcpy audio unavailable:", audio.type); mirrorStatusEl.textContent = `Mirroring (audio ${audio.type})`; }
      } catch (e) {
        dlog("scrcpy audio error:", e?.message ?? e);
      }
    }
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
  if (mediaRecorder) stopRecording();
  stopScrcpyAudio();
  try { decoder?.dispose(); } catch {}
  try { await client?.close(); } catch {}
  audioEnEl.disabled = false;
  setFullscreen(false);
  screenCanvas.hidden = true;
  screenEmpty.hidden = false;
  mirrorStartBtn.disabled = !adb;
  mirrorStopBtn.disabled = true;
  mirrorShotBtn.disabled = true;
  mirrorRecBtn.disabled = true;
  mirrorFsBtn.disabled = !adb;
  if (mirrorStatusEl.textContent === "Mirroring") mirrorStatusEl.textContent = "Stopped";
}

function setFullscreen(on) {
  screenWrap.classList.toggle("fullscreen", on);
  fsExitBtn.hidden = !on;
}

// ---- Raw audio playback (scrcpy audioCodec: raw → s16le, 48kHz stereo) ------

const SCRCPY_AUDIO_RATE = 48000, SCRCPY_AUDIO_CH = 2;

async function startScrcpyAudio(stream) {
  const ctx = new AudioContext({ sampleRate: SCRCPY_AUDIO_RATE });
  if (ctx.state === "suspended") ctx.resume().catch(() => {});   // autoplay policy
  scrcpyAudioCtx = ctx;
  scrcpyAudioDest = ctx.createMediaStreamDestination();   // tapped by the recorder
  let playHead = ctx.currentTime + 0.15;                  // small lead to absorb jitter
  const reader = stream.getReader();
  scrcpyAudioReader = reader;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // Packets are { type: "configuration" | "data", data: Uint8Array, ... }.
      if (!value || value.type !== "data" || !value.data?.byteLength) continue;
      const bytes = value.data;
      // Copy into an aligned buffer so Int16Array can view it (offset may be odd).
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const i16 = new Int16Array(ab);
      const frames = Math.floor(i16.length / SCRCPY_AUDIO_CH);
      if (!frames) continue;
      const buf = ctx.createBuffer(SCRCPY_AUDIO_CH, frames, SCRCPY_AUDIO_RATE);
      for (let ch = 0; ch < SCRCPY_AUDIO_CH; ch++) {
        const out = buf.getChannelData(ch);
        for (let i = 0; i < frames; i++) out[i] = i16[i * SCRCPY_AUDIO_CH + ch] / 32768;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);       // speakers
      src.connect(scrcpyAudioDest);       // recording tap
      if (playHead < ctx.currentTime) playHead = ctx.currentTime + 0.05;   // re-sync after a stall
      src.start(playHead);
      playHead += buf.duration;
    }
  } catch (e) {
    if (scrcpyAudioReader === reader) dlog("scrcpy audio stream ended:", e?.message ?? e);
  }
}

function stopScrcpyAudio() {
  const reader = scrcpyAudioReader, ctx = scrcpyAudioCtx;
  scrcpyAudioReader = null; scrcpyAudioCtx = null; scrcpyAudioDest = null;
  if (reader) { try { reader.cancel(); } catch {} }
  if (ctx) { try { ctx.close(); } catch {} }
}

// ---- Screenshot + recording (from the live scrcpy canvas) ------------------

let mediaRecorder = null;       // active MediaRecorder while recording
let recChunks = null;           // collected webm blobs

function tsName() {
  // device serial + wall-clock — Date is fine in the browser
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function captureScreenshot() {
  if (!scrcpyClient || screenCanvas.hidden) return;
  screenCanvas.toBlob((blob) => {
    if (!blob) { mirrorStatusEl.textContent = "Screenshot failed."; return; }
    downloadBlob(blob, `screenshot-${tsName()}.png`);
    dlog("screenshot ✓", `${screenCanvas.width}x${screenCanvas.height}`);
  }, "image/png");
}

function pickRecMime() {
  const cands = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return cands.find((m) => MediaRecorder.isTypeSupported(m)) || "";
}

function startRecording() {
  if (mediaRecorder || !scrcpyClient || screenCanvas.hidden) return;
  // captureStream pulls frames straight from the canvas the decoder paints to.
  const stream = screenCanvas.captureStream(30);
  // Merge device audio (if mirroring with audio enabled) into the recording.
  if (scrcpyAudioDest) for (const t of scrcpyAudioDest.stream.getAudioTracks()) stream.addTrack(t);
  const mimeType = pickRecMime();
  let rec;
  try {
    rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (err) {
    mirrorStatusEl.textContent = `Record unsupported: ${err?.message ?? err}`;
    return;
  }
  recChunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(recChunks, { type: rec.mimeType || "video/webm" });
    recChunks = null;
    if (blob.size) { downloadBlob(blob, `recording-${tsName()}.webm`); dlog("recording ✓", `${blob.size} bytes`); }
    stream.getTracks().forEach((t) => t.stop());
  };
  mediaRecorder = rec;
  rec.start(1000);   // emit a chunk every second so long recordings stay bounded
  mirrorRecBtn.textContent = "■ Stop recording";
  mirrorRecBtn.classList.add("danger-outline");
  mirrorStatusEl.textContent = "Recording…";
  dlog("recording ▶", mimeType || "default");
}

function stopRecording() {
  const rec = mediaRecorder;
  mediaRecorder = null;
  mirrorRecBtn.textContent = "● Record";
  mirrorRecBtn.classList.remove("danger-outline");
  if (rec && rec.state !== "inactive") { try { rec.stop(); } catch {} }
  if (mirrorStatusEl.textContent === "Recording…") mirrorStatusEl.textContent = "Mirroring";
}

mirrorStartBtn.addEventListener("click", startMirror);
mirrorStopBtn.addEventListener("click", () => { stopMirror(); });
mirrorFsBtn.addEventListener("click", () => setFullscreen(!screenWrap.classList.contains("fullscreen")));
mirrorShotBtn.addEventListener("click", captureScreenshot);
mirrorRecBtn.addEventListener("click", () => { mediaRecorder ? stopRecording() : startRecording(); });
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
let appProfiles = new Map();     // pkg -> [{ user, managed, installer }]
let dpcPkgsGlobal = new Set();   // DPC package names (for installer badges)
let appUsers = [{ id: 0, managed: false }];   // profiles to query for icons

function shortInstaller(inst) {
  if (!inst) return "preinstalled/side";
  if (dpcPkgsGlobal.has(inst)) return "DPC";
  if (inst === "com.android.vending") return "Play";
  if (/packageinstaller/.test(inst)) return "sideload";
  if (inst === "com.android.shell") return "adb";
  if (inst === "com.google.android.apps.nbu.files") return "Files";
  return inst.split(".").pop();
}
let iconStore = {};              // pkg -> { v, icon } persisted in IndexedDB
let iconStoreSerial = null;      // serial the loaded iconStore belongs to

function iconCacheKey() { return `icons:v2:${deviceSerial}`; }
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
async function ensureDexPushed() {
  if (dexPushed) return;
  dlog("applist ▶ push dex");
  const buf = new Uint8Array(await (await fetch("./applist.dex")).arrayBuffer());
  const s = await getSync();
  await s.write({
    filename: DEX_DEVICE_PATH,
    file: new ReadableStream({ start(c) { c.enqueue(buf); c.close(); } }),
  });
  dexPushed = true;
}

async function loadBulkAppInfo(userId = 0) {
  await ensureDexPushed();
  dlog(`applist ▶ app_process run (user ${userId})`);
  const out = await sh(`CLASSPATH=${DEX_DEVICE_PATH} app_process / Main labels ${userId}`);
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
    appsStatusEl.textContent = `${baseStatus} · loading icons…`;
    let n = 0;
    // Render icons per profile so work-profile-only apps get theirs too.
    // User 0 first, then others; an icon already set is not overwritten.
    for (const u of appUsers) {
      dlog(`appicons ▶ app_process run (user ${u.id})`);
      const out = await sh(`CLASSPATH=${DEX_DEVICE_PATH} app_process / Main icons ${u.id}`).catch(() => "");
      for (const line of out.split("\n")) {
        const tab = line.indexOf("\t");
        if (tab < 0) continue;
        const pkg = line.slice(0, tab);
        const b64 = line.slice(tab + 1);
        if (!pkg || !b64) continue;
        const info = appInfoCache.get(pkg) || {};
        if (info.icon) continue;   // already have it (user 0 wins)
        info.icon = `data:image/png;base64,${b64}`;
        appInfoCache.set(pkg, info);
        iconStore[pkg] = { v: info.version || "", icon: info.icon };   // persist
        const row = appsListEl.querySelector(`[data-pkg="${CSS.escape(pkg)}"]`);
        if (row) applyAppInfo(row, pkg, info);
        n++;
      }
    }
    // Mark apps that have no icon as resolved (icon:null) so they aren't
    // refetched on every load.
    for (const pkg of allPackages) {
      if (!iconStore[pkg]) iconStore[pkg] = { v: appInfoCache.get(pkg)?.version || "", icon: null };
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

    // Per-profile presence + installer of record. Query each user (work profile
    // is a separate user) and record where each package is installed.
    const [pmUsersOut, ownersOut] = await Promise.all([
      sh("pm list users").catch(() => ""),
      sh("cmd device_policy list-owners").catch(() => ""),
    ]);
    dpcPkgsGlobal = new Set([...ownersOut.matchAll(/\{([\w.]+)\/[\w.$]+\}/g)].map((mm) => mm[1]));
    const users = parseUsers(pmUsersOut, []);
    appUsers = users;
    const perUser = await Promise.all(
      users.map((u) => sh(`pm list packages -i --user ${u.id}`).catch(() => "")),
    );
    appProfiles = new Map();
    users.forEach((u, idx) => {
      for (const line of perUser[idx].split("\n")) {
        const mm = line.match(/package:(\S+)\s+installer=(\S+)/);
        if (!mm) continue;
        const inst = mm[2] === "null" ? null : mm[2];
        (appProfiles.get(mm[1]) || appProfiles.set(mm[1], []).get(mm[1])).push({ user: u.id, managed: u.managed, installer: inst });
      }
    });

    // Labels/versions for work-profile-only apps (the user-0 dex misses them).
    for (const u of users) {
      if (u.id === 0) continue;
      try {
        const extra = await loadBulkAppInfo(u.id);
        for (const [pkg, info] of extra) if (!appInfoCache.has(pkg)) appInfoCache.set(pkg, { label: info.label, version: info.version });
      } catch (e) { dlog("applist ✗ user labels", u.id, e?.message); }
    }

    // Package set = union(profiles across users, bulk filtered by system toggle).
    const set = new Set();
    for (const [pkg, profs] of appProfiles) {
      const isSystem = appsBulk.get(pkg)?.system;
      if (wantSystem || !isSystem) set.add(pkg);
      // mark profiles unknown-system as third-party (work-only apps)
    }
    for (const [pkg, info] of appsBulk) if (wantSystem || !info.system) set.add(pkg);
    allPackages = [...set].sort((a, b) =>
      (appInfoCache.get(a)?.label || a).localeCompare(appInfoCache.get(b)?.label || b));
    renderApps();   // cached icons show instantly
    appsStatusEl.textContent = `${allPackages.length} packages`;
    appsRefreshBtn.disabled = false; appsSystemEl.disabled = false;

    // Only run the (heavier) icon dump if some app is new or version-changed.
    const needIcons = allPackages.some((p) => {
      const c = iconStore[p];
      return !c || c.v !== (appInfoCache.get(p)?.version || "");
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

function installerCategory(inst) {
  if (!inst) return "sideloaded";
  if (dpcPkgsGlobal.has(inst)) return "dpc";
  if (inst === "com.android.vending") return "play";
  if (/packageinstaller/.test(inst) || inst === "com.android.shell" || inst === "com.google.android.apps.nbu.files") return "sideloaded";
  return "other";
}

function renderApps() {
  const filter = appsFilterEl.value.trim().toLowerCase();
  const profileFilter = appsProfileEl?.value || "all";
  const installerFilter = appsInstallerEl?.value || "all";

  const list = allPackages.filter((p) => {
    if (filter) {
      const label = (appInfoCache.get(p)?.label || "").toLowerCase();
      if (!p.toLowerCase().includes(filter) && !label.includes(filter)) return false;
    }
    const profs = appProfiles.get(p) || [];
    if (profileFilter === "personal" && !profs.some((x) => !x.managed) && profs.length) return false;
    if (profileFilter === "work" && !profs.some((x) => x.managed)) return false;
    if (installerFilter !== "all") {
      const cats = profs.length ? profs.map((x) => installerCategory(x.installer)) : ["sideloaded"];
      if (!cats.includes(installerFilter)) return false;
    }
    return true;
  });

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

    // Profile badges: which user(s) it's installed on + per-profile installer.
    const profs = appProfiles.get(pkg) || [];
    if (profs.length) {
      const pb = document.createElement("span"); pb.className = "profiles";
      for (const p of profs) {
        const b = document.createElement("span");
        b.className = "prof-badge clickable" + (p.managed ? " work" : "");
        b.textContent = `${p.managed ? "Work" : "Personal"} · ${shortInstaller(p.installer)}`;
        b.title = `user ${p.user} · installer=${p.installer || "preinstalled/sideloaded"} — click for full source`;
        b.addEventListener("click", () => inspectInstallSource(pkg, p.user, b, pb));
        pb.append(b);
      }
      name.append(pb);
    }

    const actions = document.createElement("span"); actions.className = "actions";
    const mkBtn = (label, fn, danger) => {
      const b = document.createElement("button");
      b.textContent = label; if (danger) b.className = "danger";
      b.addEventListener("click", () => fn(pkg));
      return b;
    };
    actions.append(mkBtn("Details", () => openAppDetail(pkg, primaryUser(pkg))));

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

// ---- App detail modal ------------------------------------------------------

const appModal = $("appModal"), appModalTitle = $("appModalTitle"),
      appModalBody = $("appModalBody"), appModalClose = $("appModalClose");

function primaryUser(pkg) {
  const profs = appProfiles.get(pkg) || [];
  return (profs.find((p) => !p.managed) || profs[0] || { user: 0 }).user;
}
function closeAppModal() { appModal.hidden = true; appModalBody.replaceChildren(); }
appModalClose.addEventListener("click", closeAppModal);
appModal.addEventListener("click", (e) => { if (e.target === appModal) closeAppModal(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !appModal.hidden) closeAppModal(); });

const fmtDateTime = (ms) => { if (!ms) return "—"; try { return new Date(ms).toLocaleString(); } catch { return String(ms); } };

async function launchComponent(comp, userId, statusEl) {
  if (!/^[A-Za-z0-9_.$/]+$/.test(comp)) { statusEl.textContent = "invalid component"; return; }
  statusEl.textContent = `Launching ${comp}…`;
  try {
    const res = await sh(`am start --user ${userId} -n '${comp}'`);
    statusEl.textContent = /error|exception/i.test(res) ? res : `Started ${comp}`;
    dlog("am start", comp, res);
  } catch (e) { statusEl.textContent = `Error: ${e?.message ?? e}`; }
}

function logcatForApp(pkg) {
  pkgEl.value = pkg; tagsEl.value = "";
  closeAppModal();
  showView("logcat");
  for (const n of navItems) n.classList.toggle("active", n.dataset.view === "logcat");
  if (!logProcess) startLogcat();
}

async function openAppDetail(pkg, userId) {
  appModalTitle.textContent = pkg;
  appModalBody.replaceChildren(loaderEl("Loading details…"));
  appModal.hidden = false;
  try {
    const [json, dp] = await Promise.all([
      sh(`CLASSPATH=${DEX_DEVICE_PATH} app_process / Main detail ${pkg} ${userId}`),
      sh("dumpsys device_policy").catch(() => ""),
    ]);
    let d;
    try { d = JSON.parse(json); } catch { appModalBody.replaceChildren(); mgmtNote(appModalBody, `Could not parse details: ${json.slice(0, 200)}`); return; }
    const configs = dp ? extractManagedConfigs(dp).filter((b) => b.pkg === pkg) : [];
    renderAppDetail(d, userId, configs);
  } catch (e) {
    appModalBody.replaceChildren(); mgmtNote(appModalBody, `Error: ${e?.message ?? e}`);
  }
}

function renderAppDetail(d, userId, configs) {
  appModalTitle.textContent = `${d.label || d.package}  ·  user ${userId}`;
  appModalBody.replaceChildren();
  const status = document.createElement("div"); status.className = "muted"; status.style.minHeight = "1.2em";

  // Profile selector — drives which user the detail + launch target.
  const profs = appProfiles.get(d.package) || [];
  if (profs.length > 1) {
    const row = document.createElement("div"); row.className = "row";
    const lbl = document.createElement("label"); lbl.className = "inline"; lbl.textContent = "Profile";
    const sel = document.createElement("select");
    for (const p of profs) {
      const o = document.createElement("option"); o.value = String(p.user);
      o.textContent = p.managed ? `Work profile (user ${p.user})` : `Personal (user ${p.user})`;
      if (p.user === userId) o.selected = true;
      sel.append(o);
    }
    sel.addEventListener("change", () => openAppDetail(d.package, Number(sel.value)));
    lbl.append(sel); row.append(lbl); appModalBody.append(row);
  }

  // Action row
  const launchRow = document.createElement("div"); launchRow.className = "row";
  const mkAct = (label, cls, fn) => {
    const b = document.createElement("button"); b.className = `btn ${cls}`; b.textContent = label;
    b.addEventListener("click", fn); launchRow.append(b); return b;
  };
  if (d.launchActivity && d.launchActivity !== null) {
    mkAct("Launch app", "", () => launchComponent(d.launchActivity, userId, status));
  }
  mkAct("Logcat for this app", "outline", () => logcatForApp(d.package));
  mkAct("Force-stop", "outline", async () => {
    status.textContent = "Stopping…";
    status.textContent = await sh(`am force-stop --user ${userId} ${d.package}`).then(() => "Force-stopped").catch((e) => `Error: ${e.message}`);
  });
  mkAct("Clear data", "outline", async () => {
    if (!confirm(`Clear all data of ${d.package} (user ${userId})? Irreversible.`)) return;
    status.textContent = "Clearing…";
    status.textContent = await sh(`pm clear --user ${userId} ${d.package}`).catch((e) => `Error: ${e.message}`);
  });
  mkAct("Uninstall", "outline", async () => {
    if (!confirm(`Uninstall ${d.package} from user ${userId}?`)) return;
    status.textContent = "Uninstalling…";
    try {
      const r = await sh(`pm uninstall --user ${userId} ${d.package}`);
      status.textContent = `Uninstall: ${r || "done"}`;
      iconsLoaded = false;
      closeAppModal();
      if (appsLoaded) listApps();
    } catch (e) { status.textContent = `Error: ${e?.message ?? e}`; }
  }).classList.add("danger-outline");
  appModalBody.append(launchRow, status);

  // Info
  const h1 = document.createElement("h4"); h1.textContent = "Info"; appModalBody.append(h1);
  const dl = document.createElement("dl"); dl.className = "kv";
  kvRow(dl, "Package", d.package);
  kvRow(dl, "Version", `${d.versionName ?? "—"} (${d.versionCode ?? "—"})`);
  kvRow(dl, "SDK", `min ${d.minSdk ?? "—"} · target ${d.targetSdk ?? "—"}`);
  kvRow(dl, "UID", String(d.uid ?? "—"));
  kvRow(dl, "Installer", d.installer || "—");
  kvRow(dl, "Flags", [d.system && "system", d.debuggable && "debuggable", d.enabled === false && "disabled"].filter(Boolean).join(", ") || "—");
  kvRow(dl, "First install", fmtDateTime(d.firstInstall));
  kvRow(dl, "Last update", fmtDateTime(d.lastUpdate));
  kvRow(dl, "Data dir", d.dataDir || "—");
  kvRow(dl, "APK", d.sourceDir || "—");
  appModalBody.append(dl);

  // Managed configuration — capability (declared by app) + values (set by MDM).
  const schema = d.appConfigSchema || [];
  const h2 = document.createElement("h4"); h2.textContent = "Managed configuration"; appModalBody.append(h2);
  const supLine = document.createElement("p"); supLine.className = "muted";
  supLine.textContent = d.supportsAppConfig
    ? `✓ App supports managed configuration — ${schema.length} key${schema.length === 1 ? "" : "s"} available.`
    : "✗ App does not declare a managed-configuration schema.";
  appModalBody.append(supLine);
  if (schema.length) {
    const det = document.createElement("details"); det.className = "dump"; det.open = true;
    const sum = document.createElement("summary"); sum.textContent = "Available keys (declared by app)";
    const tree = document.createElement("div"); tree.style.padding = "0 1rem 1rem";
    appendSchemaTree(tree, schema, 0);
    det.append(sum, tree); appModalBody.append(det);
  }
  if (configs.length) {
    for (const b of configs) appModalBody.append(detailsBlock(b.admin ? `Values set by MDM — enforced by ${b.admin}` : "Values set by MDM", prettyBundle(b.body)));
  } else if (d.supportsAppConfig) {
    const n = document.createElement("p"); n.className = "muted"; n.textContent = "No values currently set by an MDM."; appModalBody.append(n);
  }

  // Permissions
  const perms = d.permissions || [];
  const grantedN = perms.filter((p) => p.granted).length;
  const ph = document.createElement("h4"); ph.textContent = `Permissions (${grantedN}/${perms.length} granted)`; appModalBody.append(ph);
  const pwrap = document.createElement("div");
  for (const p of perms.sort((a, b) => (b.granted - a.granted) || a.name.localeCompare(b.name))) {
    const row = document.createElement("div"); row.className = "perm-row";
    const dot = document.createElement("span"); dot.className = `perm-dot ${p.granted ? "granted" : "denied"}`;
    const nm = document.createElement("span"); nm.textContent = p.name.replace(/^android\.permission\./, "");
    row.append(dot, nm); pwrap.append(row);
  }
  appModalBody.append(pwrap);

  // Activities (launchable) + other components
  appModalBody.append(componentSection("Activities", d.activities, true, d.package, userId, status));
  appModalBody.append(detailsBlock(`Services (${(d.services || []).length})`, (d.services || []).map((c) => `${c.name}${c.exported ? "  [exported]" : ""}`).join("\n") || "(none)"));
  appModalBody.append(detailsBlock(`Receivers (${(d.receivers || []).length})`, (d.receivers || []).map((c) => `${c.name}${c.exported ? "  [exported]" : ""}`).join("\n") || "(none)"));
  appModalBody.append(detailsBlock(`Providers (${(d.providers || []).length})`, (d.providers || []).map((c) => `${c.name}${c.exported ? "  [exported]" : ""}`).join("\n") || "(none)"));
}

// Recursively render the app-config schema (bundle / bundle-array nest).
function appendSchemaTree(container, entries, depth) {
  for (const e of entries) {
    const row = document.createElement("div");
    row.style.cssText = `padding:.15rem 0;padding-left:${depth * 1.3}rem;font-size:.82rem;`;
    const k = document.createElement("span");
    k.style.cssText = "color:var(--accent);font-family:ui-monospace,Menlo,Consolas,monospace;";
    k.textContent = e.key;
    const t = document.createElement("span"); t.className = "muted";
    t.textContent = `  ${e.type}${e.title ? ` · ${e.title}` : ""}${e.description ? ` — ${e.description}` : ""}`;
    row.append(k, t); container.append(row);
    if (e.children && e.children.length) appendSchemaTree(container, e.children, depth + 1);
  }
}

function componentSection(title, list, launchable, pkg, userId, status) {
  const wrap = document.createElement("div");
  const h = document.createElement("h4"); h.textContent = `${title} (${(list || []).length})`; wrap.append(h);
  for (const c of (list || [])) {
    const row = document.createElement("div"); row.className = "comp-row";
    const badge = document.createElement("span"); badge.className = `exp-badge ${c.exported ? "exported" : ""}`; badge.textContent = c.exported ? "exported" : "internal";
    const name = document.createElement("span"); name.className = "cname"; name.textContent = c.name;
    row.append(badge, name);
    if (launchable) {
      const b = document.createElement("button"); b.textContent = "Launch";
      const comp = `${pkg}/${c.name}`;
      b.addEventListener("click", () => launchComponent(comp, userId, status));
      row.append(b);
    }
    wrap.append(row);
  }
  return wrap;
}

appsRefreshBtn.addEventListener("click", listApps);
appsFilterEl.addEventListener("input", renderApps);
appsProfileEl.addEventListener("change", renderApps);
appsInstallerEl.addEventListener("change", renderApps);
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

// ---- Device management -----------------------------------------------------

function detailsBlock(title, text) {
  const d = document.createElement("details"); d.className = "dump";
  const s = document.createElement("summary"); s.textContent = title;
  const pre = document.createElement("pre"); pre.textContent = text && text.trim() ? text : "(empty)";
  d.append(s, pre);
  return d;
}

function kvRow(dl, key, valueNode) {
  const dt = document.createElement("dt"); dt.textContent = key;
  const dd = document.createElement("dd");
  if (valueNode instanceof Node) dd.append(valueNode); else dd.textContent = valueNode || "—";
  dl.append(dt, dd);
}

// Parse `getprop` output into a Map.
function parseProps(out) {
  const m = new Map();
  for (const line of out.split("\n")) {
    const mm = line.match(/^\[(.+?)\]:\s*\[(.*)\]$/);
    if (mm) m.set(mm[1], mm[2]);
  }
  return m;
}
// Parse "key=value" lines (one per line) into a Map; trims, normalizes "null".
function parseKv(out) {
  const m = new Map();
  for (const line of out.split("\n")) {
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if (v === "null") v = "";
    m.set(line.slice(0, i).trim(), v);
  }
  return m;
}
const yn = (v) => v === "1" ? "yes" : v === "0" ? "no" : (v || "—");

// Extract a component string ("pkg/cls") from a line, ignoring "null".
function extractComponent(s) {
  if (!s) return null;
  // Matches ComponentInfo{pkg/cls} and plain {pkg/cls} (list-owners form).
  const c = s.match(/\{([\w.]+\/[\w.$]+)\}/);
  if (c) return c[1];
  const t = s.trim();
  if (t && t.toLowerCase() !== "null" && /^[\w.]+\/[\w.$]+$/.test(t)) return t;
  return null;
}

// Robustly determine owners from the actual dumps — NOT from section headers
// (which are always present, even when no owner is set). Prefers the explicit
// `list-owners` output, then parses `dumpsys device_policy` for ComponentInfo.
function deriveManagement(owners, dp) {
  let deviceOwner = null;
  const profileOwners = [];   // { user, comp }

  // 1) list-owners (authoritative when present and not "no owners").
  const lo = (owners || "").trim();
  if (lo && !/no device( policy)? owners?/i.test(lo)) {
    for (const line of lo.split("\n")) {
      const comp = extractComponent(line);
      if (!comp) continue;
      if (/device owner/i.test(line)) deviceOwner = comp;
      else {
        const u = line.match(/user\s*(\d+)/i);
        profileOwners.push({ user: u ? +u[1] : 0, comp });
      }
    }
  }

  // 2) Parse the dump for real ComponentInfo under owner sections (handles
  //    "Device Owner:" header followed by an admin= line, and "null").
  if (!deviceOwner && !profileOwners.length) {
    const lines = dp.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const doH = lines[i].match(/^\s*Device Owner:?\s*(.*)$/i);
      if (doH) {
        const comp = extractComponent(doH[1]) || lookaheadComponent(lines, i);
        if (comp) deviceOwner = comp;
        continue;
      }
      const poH = lines[i].match(/^\s*Profile Owner(?:\s*\(User (\d+)\))?:?\s*(.*)$/i);
      if (poH) {
        const comp = extractComponent(poH[2]) || lookaheadComponent(lines, i);
        if (comp) profileOwners.push({ user: poH[1] ? +poH[1] : 0, comp });
      }
    }
  }

  const managed = !!deviceOwner || profileOwners.length > 0;
  let mode;
  if (deviceOwner) mode = "Fully managed (Device Owner)";
  else if (profileOwners.some((p) => p.user > 0)) mode = "Work profile (Profile Owner on secondary user)";
  else if (profileOwners.length) mode = "Profile Owner on primary user (COPE / financed)";
  else mode = "Unmanaged (no device policy owner)";

  const components = [deviceOwner, ...profileOwners.map((p) => p.comp)].filter(Boolean);
  return { mode, managed, components, deviceOwner, profileOwners };
}

// Scan a few lines after an owner header for "admin=ComponentInfo{...}".
function lookaheadComponent(lines, i) {
  for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
    const l = lines[j];
    if (/^\s*(Device Owner|Profile Owner|Current|Enabled|Registered)/i.test(l)) break;
    const c = extractComponent(l);
    if (c) return c;
    if (!l.trim()) break;
  }
  return null;
}

// Pull a value out of the device_policy dump with the first matching regex.
function dpField(dp, ...regexes) {
  for (const re of regexes) { const m = dp.match(re); if (m) return (m[1] ?? "").trim(); }
  return "";
}

// Extract managed-configuration bundles (BundlePolicyValue / app restrictions)
// from the dump, with the owning package where we can infer it. Brace-balanced.
function balancedBraces(str, fromIdx) {
  const open = str.indexOf("{", fromIdx);
  if (open < 0) return null;
  let d = 0;
  for (let p = open; p < str.length; p++) {
    const c = str[p];
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return str.slice(open, p + 1); }
  }
  return null;
}

function extractManagedConfigs(dp) {
  let out = [];

  // Newer DevicePolicyEngine format:
  //   PackagePolicyKey{ mPolicyKey= applicationRestrictions; mPackageName= <pkg> }
  //     Per-admin Policy:
  //       EnforcingAdmin { ... mComponentName= ComponentInfo{<dpc>} ... mUserId= N }
  //         BundlePolicyValue { mValue= Bundle[{...}] }
  const keyRe = /PackagePolicyKey\{[^}]*mPolicyKey=\s*applicationRestrictions;\s*mPackageName=\s*([\w.]+)[^}]*\}/g;
  let km;
  while ((km = keyRe.exec(dp))) {
    const pkg = km[1];
    const nextKey = dp.indexOf("PackagePolicyKey", km.index + 1);
    const region = dp.slice(km.index, nextKey < 0 ? dp.length : nextKey);
    const bIdx = region.indexOf("Bundle[{");
    if (bIdx < 0) continue;
    const body = balancedBraces(region, bIdx);
    if (!body) continue;
    const admin = (region.match(/mComponentName=\s*ComponentInfo\{([^}]+)\}/) || [])[1]
      || (region.match(/EnforcingAdmin\s*\{[^}]*mPackageName=\s*([\w.]+)/) || [])[1] || null;
    const userId = (region.match(/mUserId=\s*(\d+)/) || [])[1] || null;
    out.push({ pkg, admin, userId, body });
  }

  // Fallback (older inline format):  <pkg> :|= [BundlePolicyValue …] Bundle[{…}]
  if (!out.length) {
    const start = /(?:([A-Za-z][\w.]+)\s*[:=]\s*)?(?:BundlePolicyValue\s*\{\s*mValue=\s*)?Bundle\[\{/g;
    let mm;
    while ((mm = start.exec(dp))) {
      const bIdx = dp.indexOf("Bundle[{", mm.index);
      if (bIdx < 0) break;
      const body = balancedBraces(dp, bIdx);
      if (!body) break;
      out.push({ pkg: mm[1] || null, admin: null, userId: null, body });
      start.lastIndex = mm.index + dp.indexOf("Bundle[{", mm.index) - mm.index + body.length;
    }
  }

  // Dedupe identical (pkg, body).
  const seen = new Set();
  return out.filter((b) => { const k = (b.pkg || "") + b.body; if (seen.has(k)) return false; seen.add(k); return true; });
}

// Indent a Bundle[{...}] / [...] string for readability (depth-aware).
function prettyBundle(s) {
  let out = "", indent = 0;
  const pad = () => "  ".repeat(Math.max(0, indent));
  for (let p = 0; p < s.length; p++) {
    const c = s[p];
    if (c === "{" || c === "[") { indent++; out += c + "\n" + pad(); }
    else if (c === "}" || c === "]") { indent--; out += "\n" + pad() + c; }
    else if (c === ",") { out += ",\n" + pad(); if (s[p + 1] === " ") p++; }
    else out += c;
  }
  return out;
}

// Parse the per-admin policy blocks out of `dumpsys device_policy`.
function parseAdmins(dp) {
  const admins = [];
  let user = null, cur = null, mode = null;
  for (const raw of dp.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    // Track the current user from any owning section header.
    const uh = line.match(/(?:Enabled |Registered )?Device Admins? \(User (\d+)/i);
    if (uh) { user = +uh[1]; continue; }
    const ph = line.match(/Profile Owner \(User (\d+)\)/i);
    if (ph) { user = +ph[1]; continue; }
    if (/^\s*Device Owner\b/i.test(line)) { user = 0; continue; }   // DO runs on user 0
    const am = line.match(/^(\s*)admin=ComponentInfo\{([^}]+)\}/);
    if (am) { cur = { comp: am[2], user, indent: am[1].length, policies: [], kv: [] }; admins.push(cur); mode = null; continue; }
    if (!cur) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (line.trim() && indent <= cur.indent) { cur = null; mode = null; continue; }
    const t = line.trim();
    if (t === "policies:") { mode = "pol"; continue; }
    if (mode === "pol" && t && !t.includes("=")) { cur.policies.push(t); continue; }
    mode = null;
    const kv = t.match(/^([\w.]+)=(.*)$/);
    if (kv) cur.kv.push([kv[1], kv[2]]);
  }
  return admins;
}

// Parse `pm list users` into [{ id, name, managed }]. Managed-profile detection
// uses the UserInfo flag (0x20), the name, or a profile owner on that user.
function parseUsers(pmUsers, profileOwners) {
  const poUsers = new Set((profileOwners || []).filter((p) => p.user > 0).map((p) => p.user));
  const out = [];
  for (const line of pmUsers.split("\n")) {
    const mm = line.match(/UserInfo\{(\d+):([^:]*):([0-9a-fA-F]+)\}/);
    if (!mm) continue;
    const id = +mm[1], name = mm[2].trim(), flags = parseInt(mm[3], 16);
    const managed = !!(flags & 0x20) || /profile/i.test(name) || poUsers.has(id);
    out.push({ id, name, managed });
  }
  if (!out.length) out.push({ id: 0, name: "Owner", managed: false });
  return out;
}
// Show the real install provenance for one package (installer of record +
// initiating + originating package, from dumpsys package).
async function inspectInstallSource(pkg, userId, chip, container) {
  if (chip._src) { chip._src.remove(); chip._src = null; return; }
  const line = document.createElement("span"); line.className = "src-line"; line.textContent = `${pkg}: …`;
  chip._src = line; container.append(line);
  try {
    const esc = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const [instLine, dump] = await Promise.all([
      sh(`pm list packages -i --user ${userId} ${pkg}`),   // per-USER installer of record
      sh(`dumpsys package ${pkg}`),
    ]);
    // installer of record for THIS profile (per-user)
    const userInstaller = (instLine.match(new RegExp(`package:${esc}\\s+installer=(\\S+)`)) || [])[1] || "—";
    // initiator/origin are package-level (shared across profiles)
    const initiating = (dump.match(/installInitiatingPackageName=(\S+)/) || [])[1] || "—";
    const originating = (dump.match(/installOriginatingPackageName=(\S+)/) || [])[1] || "—";
    // per-user first-install time from the "User N:" block
    const block = (dump.match(new RegExp(`User ${userId}:[\\s\\S]*?(?=\\n\\s*User \\d+:|$)`)) || [])[0] || "";
    const firstInstall = ((block.match(/firstInstallTime=([^\n]+)/) || [])[1] || "—").trim();
    line.textContent = `${pkg} (user ${userId})  ·  installer=${userInstaller}  ·  initiator=${initiating} (shared)  ·  origin=${originating} (shared)  ·  firstInstall=${firstInstall}`;
  } catch (e) {
    line.textContent = `${pkg}: error — ${e?.message ?? e}`;
  }
}

function userLabel(u) {
  return u.managed ? `User ${u.id} — Work profile` : u.id === 0 ? `User 0 — Personal` : `User ${u.id} — ${u.name || "secondary"}`;
}

// Extract package-name tokens from a string.
function pkgTokens(s) {
  return [...new Set((s || "").split(/[\s,]+/)
    .map((x) => x.replace(/^[\[{"']+|[\]}"',;]+$/g, "").trim())
    .filter((x) => /^[a-zA-Z][\w]*(\.[\w]+)+$/.test(x)))];
}
// Find a package list either inline (key=[...] / "Header: [...]") or as an
// indented block under a header line.
function extractPkgs(dp, headerWordRe, inlineRes) {
  for (const re of inlineRes) { const m = dp.match(re); if (m) { const t = pkgTokens(m[1]); if (t.length) return t; } }
  const lines = dp.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!headerWordRe.test(lines[i])) continue;
    const ind = lines[i].match(/^\s*/)[0].length;
    const acc = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l.trim() || l.match(/^\s*/)[0].length <= ind) break;
      acc.push(l.trim());
    }
    const t = pkgTokens(acc.join(" "));
    if (t.length) return t;
  }
  return [];
}

// App-level policy categories (package lists).
const APP_POLICY_CATS = [
  ["Lock-task (kiosk) packages", /lock ?task packages/i, [/mLockTaskPackages\s*=\s*\[([^\]]*)\]/i, /lock ?task packages?:?\s*\[?([^\]\n]+)\]?/i]],
  ["Suspended packages", /suspended packages/i, [/mSuspendedPackages\s*=\s*\[([^\]]*)\]/i, /suspended packages?:?\s*\[?([^\]\n]+)\]?/i]],
  ["Hidden packages", /hidden packages/i, [/hidden packages?:?\s*\[?([^\]\n]+)\]?/i]],
  ["Uninstall-blocked packages", /uninstall[- ]?blocked/i, [/uninstall[- ]?blocked[^:\n]*:?\s*\[?([^\]\n]+)\]?/i]],
  ["Cross-profile packages", /cross[- ]?profile packages/i, [/mCrossProfilePackages\s*=\s*\[([^\]]*)\]/i, /cross[- ]?profile packages?:?\s*\[?([^\]\n]+)\]?/i]],
  ["Metered-data disabled", /metered/i, [/metered[^:\n]*disabled[^:\n]*:?\s*\[?([^\]\n]+)\]?/i]],
  ["Keep-uninstalled packages", /keep[- ]?uninstalled/i, [/keep[- ]?uninstalled packages?:?\s*\[?([^\]\n]+)\]?/i]],
  ["Enabled system apps", /enabled system apps/i, [/enabled system apps[^:\n]*:?\s*\[?([^\]\n]+)\]?/i]],
  ["Protected packages", /protected packages/i, [/protected packages?:?\s*\[?([^\]\n]+)\]?/i]],
];
// App-control user restrictions worth highlighting.
const APP_RESTRICTIONS = new Set([
  "no_install_apps", "no_uninstall_apps", "no_install_unknown_sources",
  "no_install_unknown_sources_globally", "no_control_apps", "no_apps_control",
  "no_debugging_features", "disallow_install_apps", "disallow_uninstall_apps",
]);

const POLICY_LABELS = {
  passwordQuality: "Password quality",
  minimumPasswordLength: "Min password length",
  passwordHistoryLength: "Password history length",
  minimumPasswordLetters: "Min letters", minimumPasswordUpperCase: "Min uppercase",
  minimumPasswordLowerCase: "Min lowercase", minimumPasswordNumeric: "Min digits",
  minimumPasswordSymbols: "Min symbols", minimumPasswordNonLetter: "Min non-letters",
  maximumFailedPasswordsForWipe: "Max failed attempts → wipe",
  maximumTimeToUnlock: "Max time to lock",
  passwordExpirationTimeout: "Password expiration",
  passwordExpirationDate: "Password expires",
  strongAuthUnlockTimeout: "Strong-auth timeout",
  disableCamera: "Camera disabled",
  encryptionRequested: "Encryption required",
  disabledKeyguardFeatures: "Disabled keyguard features",
  requireAutoTime: "Require auto time",
  permittedAccessiblityServices: "Permitted accessibility services",
  permittedInputMethods: "Permitted input methods",
  organizationName: "Organization name",
  shortSupportMessage: "Short support message",
  longSupportMessage: "Long support message",
};
const PW_QUALITY = {
  0: "Unspecified", 0x8000: "Biometric weak", 0x10000: "Something",
  0x20000: "Numeric", 0x30000: "Numeric (complex)", 0x40000: "Alphabetic",
  0x50000: "Alphanumeric", 0x60000: "Complex", 0x80000: "Managed",
};
const KEYGUARD_FLAGS = [
  [1, "Widgets"], [2, "Secure camera"], [4, "Secure notifications"],
  [8, "Unredacted notifications"], [16, "Trust agents"], [32, "Fingerprint"],
  [64, "Remote input"], [128, "Face"], [256, "Iris"], [512, "Shortcuts"],
];
function decodePwQuality(v) { const n = parseInt(v); return PW_QUALITY[n] !== undefined ? `${PW_QUALITY[n]} (${v})` : v; }
function decodeKeyguard(v) {
  const n = parseInt(v);
  if (isNaN(n)) return v;
  if (n === 0) return "none";
  if (n < 0 || n >= 0x7fffffff) return "all features";
  const out = KEYGUARD_FLAGS.filter(([b]) => n & b).map(([, name]) => name);
  return out.length ? out.join(", ") : String(n);
}
function decodePolicyValue(key, v) {
  if (key === "passwordQuality") return decodePwQuality(v);
  if (key === "disabledKeyguardFeatures") return decodeKeyguard(v);
  // Hide noisy "not set" sentinels.
  if (/^(-1|0|9223372036854775807|false|null|\{\}|\[\])$/.test(v) &&
      /Timeout|Expiration|History|minimum|maximum|Failed/i.test(key)) return v;
  return v;
}

const SETTINGS_GLOBAL = [
  "device_provisioned", "adb_enabled", "development_settings_enabled",
  "package_verifier_user_consent", "package_verifier_enable", "stay_on_while_plugged_in",
  "always_on_vpn_app", "always_on_vpn_lockdown", "http_proxy",
  "global_http_proxy_host", "global_http_proxy_port",
  "private_dns_mode", "private_dns_specifier", "wifi_device_owner_configs_lockdown",
];
const SETTINGS_SECURE = [
  "user_setup_complete", "install_non_market_apps", "location_mode",
  "managed_provisioning_dpc_downloaded", "lockscreen.disabled", "default_input_method",
];

// ---- Management deep parsers ----

function condensePolicyValue(s) {
  if (!s) return "";
  s = s.trim();
  if (/^null$/i.test(s)) return "null";
  const mv = s.match(/mValue=\s*([\s\S]*?)\s*\}\s*$/);
  if (mv) { let v = mv[1].trim(); if (v.startsWith("Bundle[")) return "Bundle[…]"; return v; }
  if (s.startsWith("Bundle[")) return "Bundle[…]";
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}

// Parse DevicePolicyEngine policy states: configured per-admin value(s) vs the
// resolved/effective value. Flags policies that did not apply (resolved null).
function parsePolicyStates(dp) {
  const lines = dp.split("\n");
  const entries = [];
  let cur = null, section = null;
  const keyRe = /(\w*PolicyKey)\s*\{([^}]*)\}/;
  for (const line of lines) {
    const t = line.trim();
    const km = line.match(keyRe);
    if (km && /mPolicyKey=/.test(km[2])) {
      if (cur) entries.push(cur);
      const inner = km[2];
      const key = (inner.match(/mPolicyKey=\s*([^;,}]+)/) || [])[1]?.trim() || km[1];
      const pkg = (inner.match(/mPackageName=\s*([\w.]+)/) || [])[1];
      const restr = (inner.match(/mRestriction=\s*([\w.]+)/) || [])[1];
      let label = key; if (pkg) label += ` (${pkg})`; if (restr) label += `: ${restr}`;
      cur = { label, pkg, admins: [], resolved: null }; section = null;
      continue;
    }
    if (!cur) continue;
    if (/Per-admin Policy:/i.test(t)) { section = "admin"; continue; }
    if (/Resolved Policy/i.test(t)) { section = "resolved"; continue; }
    if (section === "admin") {
      const am = line.match(/EnforcingAdmin\s*\{[^}]*?(?:mComponentName=\s*ComponentInfo\{([^}]+)\}|mPackageName=\s*([\w.]+))/);
      if (am) { cur.admins.push({ admin: am[1] || am[2], value: null }); continue; }
      // Only accept real policy values — skip metadata lines (counts, hashcodes).
      if (cur.admins.length && (/PolicyValue/.test(t) || /^(true|false|null)$/i.test(t))) {
        const last = cur.admins[cur.admins.length - 1];
        if (last.value == null) last.value = condensePolicyValue(t);
      }
      continue;
    }
    if (section === "resolved") { if (t) { cur.resolved = condensePolicyValue(t); section = null; } continue; }
  }
  if (cur) entries.push(cur);
  return entries.map((e) => ({ ...e, applied: !!e.resolved && e.resolved.toLowerCase() !== "null" }));
}

// Pull readable fields from an Android cacert file (PEM + openssl text dump).
function parseCertText(t) {
  if (!t) return { raw: "" };
  const cn = (re) => { const m = t.match(re); if (!m) return null; const c = m[1].match(/CN\s*=\s*([^,\/\n]+)/i); return (c ? c[1] : m[1]).trim(); };
  return {
    raw: t,
    subject: cn(/Subject:\s*(.+)/),
    issuer: cn(/Issuer:\s*(.+)/),
    notAfter: (t.match(/Not After\s*:?\s*(.+)/i) || [])[1]?.trim(),
    notBefore: (t.match(/Not Before\s*:?\s*(.+)/i) || [])[1]?.trim(),
  };
}

function parseCerts(dp) {
  const caLines = dp.split("\n").map((l) => l.trim())
    .filter((l) => /ca[\s_-]?cert|installed ca|trusted certificate/i.test(l) && l);
  const keyPairs = dp.split("\n").map((l) => l.trim())
    .filter((l) => /keypair|key pair|keychain|granted.*alias|mKeyGrants/i.test(l) && l);
  const aliasRe = /(?:cert_?alias|certificate_?alias|login_certificate|signing_certificate|keypair_alias|client_certificate)\s*=\s*([^,}\]\n]+)/gi;
  const aliases = [...new Set([...dp.matchAll(aliasRe)]
    .map((m) => m[1].trim())
    .filter((v) => v && !/^[{[]/.test(v) && !v.includes("=") && !/^(true|false|\$DEFAULT\$|null)$/i.test(v)))];
  return { caLines: [...new Set(caLines)], keyPairs: [...new Set(keyPairs)], aliases };
}

function parseAccounts(dump) {
  const out = [];   // { user, type, name }
  let user = null;
  for (const line of dump.split("\n")) {
    const um = line.match(/User\s+UserInfo\{(\d+)|^\s*User\s+(\d+)/);
    if (um) { user = um[1] || um[2]; continue; }
    const am = line.match(/Account\s*\{name=(.+?),\s*type=([\w.]+)\}/);
    if (am) out.push({ user, name: am[1], type: am[2] });
  }
  return out;
}

function parseWifi(list) {
  // Devices list each saved network once per security type (WPA2/WPA3
  // transition) with a trailing "^" marker — group by SSID, merge types.
  const map = new Map();
  for (const line of list.split("\n")) {
    const m = line.match(/^\s*\d+\s+(\S.*?)\s{2,}(\S.*)$/);
    if (!m || /Network Id/i.test(line)) continue;
    const ssid = m[1].trim();
    const sec = m[2].trim().replace(/\^+$/, "").trim();
    const set = map.get(ssid) || map.set(ssid, new Set()).get(ssid);
    if (sec) set.add(sec);
  }
  return [...map.entries()]
    .map(([ssid, set]) => ({ ssid, security: [...set].join(", ") }))
    .sort((a, b) => a.ssid.localeCompare(b.ssid));
}

let lastMgmt = null;   // gathered data for the diagnostics export

async function loadManagement() {
  setMgmtRefreshDisabled(true);
  setMgmtStatus("Loading…");
  mgmtSummaryEl.replaceChildren(loaderEl("Reading device policy…"));
  mgmtSecurityEl.replaceChildren();
  mgmtPoliciesEl.replaceChildren();
  mgmtAppPoliciesEl.replaceChildren();
  mgmtAppconfigEl.replaceChildren();
  mgmtEffectiveEl.replaceChildren();
  mgmtCertsEl.replaceChildren();
  mgmtNetworkEl.replaceChildren();
  mgmtDiagEl.replaceChildren();
  mgmtRawEl.replaceChildren();
  dlog("management ▶");
  try {
    const gCmd = `for k in ${SETTINGS_GLOBAL.join(" ")}; do echo "$k=$(settings get global $k)"; done`;
    const sCmd = `for k in ${SETTINGS_SECURE.join(" ")}; do echo "$k=$(settings get secure $k)"; done`;
    const [owners, dp, usersDump, pmUsers, disabled, propsRaw, selinux, gRaw, sRaw, dpmOwners] =
      await Promise.all([
        sh("cmd device_policy list-owners").catch(() => ""),
        sh("dumpsys device_policy").catch(() => ""),
        sh("dumpsys user").catch(() => ""),
        sh("pm list users").catch(() => ""),
        sh("pm list packages -d").catch(() => ""),
        sh("getprop").catch(() => ""),
        sh("getenforce").catch(() => ""),
        sh(gCmd).catch(() => ""),
        sh(sCmd).catch(() => ""),
        sh("dpm list-owners 2>/dev/null").catch(() => ""),
      ]);
    const [accountsDump, wifiList] = await Promise.all([
      sh("dumpsys account").catch(() => ""),
      sh("cmd wifi list-networks 2>/dev/null").catch(() => ""),
    ]);

    const props = parseProps(propsRaw);
    const g = parseKv(gRaw), s = parseKv(sRaw);
    const m = deriveManagement(owners, dp);

    // ---- Summary ----
    mgmtSummaryEl.replaceChildren();
    const modeTag = document.createElement("span");
    modeTag.className = `tag ${m.managed ? "managed" : "unmanaged"}`;
    modeTag.textContent = m.managed ? "Managed" : "Unmanaged";
    const modeWrap = document.createElement("span");
    modeWrap.append(modeTag, document.createTextNode(" " + m.mode));
    kvRow(mgmtSummaryEl, "Mode", modeWrap);
    kvRow(mgmtSummaryEl, "DPC component(s)", m.components.length ? m.components.join("\n") : "none");
    const org = dpField(dp, /Organization name:\s*(.+)/i, /mOrganizationName=(.+)/);
    kvRow(mgmtSummaryEl, "Organization", org || "—");
    const enrollSpecificId = dpField(dp, /Enrollment specific id:\s*(.+)/i, /mEnrollmentSpecificId='?([^'\n]+)/i);
    if (enrollSpecificId) kvRow(mgmtSummaryEl, "Enrollment-specific ID", enrollSpecificId);
    const affiliation = dpField(dp, /Affiliation ids?:\s*\{?([^}\n]*)\}?/i, /mAffiliationIds=\{?([^}\n]*)\}?/i)
      .replace(/^[{\s]+|[}\s]+$/g, "").trim();
    kvRow(mgmtSummaryEl, "Affiliation IDs", affiliation || "none");
    kvRow(mgmtSummaryEl, "Device provisioned", yn(g.get("device_provisioned")));
    kvRow(mgmtSummaryEl, "User setup complete", yn(s.get("user_setup_complete")));
    const userLines = pmUsers.split("\n").filter((l) => l.includes("UserInfo")).map((l) => l.trim());
    kvRow(mgmtSummaryEl, "Users", userLines.length ? userLines.join("\n") : "—");

    // ---- Security & policy state ----
    const secCard = document.createElement("div"); secCard.className = "card";
    const secTitle = document.createElement("h3"); secTitle.textContent = "Security & policy state";
    secTitle.style.cssText = "margin:.25rem 0 .9rem;font-size:1rem;font-weight:500;";
    const secDl = document.createElement("dl"); secDl.className = "kv";
    const proxy = g.get("http_proxy") || [g.get("global_http_proxy_host"), g.get("global_http_proxy_port")].filter(Boolean).join(":");
    const vpnApp = g.get("always_on_vpn_app");
    [
      ["SELinux", selinux.trim() || "—"],
      ["Bootloader", props.get("ro.boot.flash.locked") === "1" ? "locked" : props.get("ro.boot.flash.locked") === "0" ? "UNLOCKED" : "—"],
      ["Verified boot", props.get("ro.boot.verifiedbootstate") || "—"],
      ["dm-verity", props.get("ro.boot.veritymode") || "—"],
      ["Encryption", [props.get("ro.crypto.state"), props.get("ro.crypto.type")].filter(Boolean).join(" / ") || "—"],
      ["Security patch", props.get("ro.build.version.security_patch") || "—"],
      ["Android", [props.get("ro.build.version.release"), props.get("ro.build.version.sdk") && `API ${props.get("ro.build.version.sdk")}`].filter(Boolean).join(" ")],
      ["ADB enabled", yn(g.get("adb_enabled"))],
      ["Developer settings", yn(g.get("development_settings_enabled"))],
      ["Unknown sources", yn(s.get("install_non_market_apps"))],
      ["Package verifier", yn(g.get("package_verifier_enable"))],
      ["Private DNS", [g.get("private_dns_mode"), g.get("private_dns_specifier")].filter(Boolean).join(": ") || "—"],
      ["HTTP proxy", proxy || "none"],
      ["Always-on VPN", vpnApp ? `${vpnApp}${g.get("always_on_vpn_lockdown") === "1" ? " (lockdown)" : ""}` : "none"],
      ["Location mode", s.get("location_mode") || "—"],
    ].forEach(([k, v]) => kvRow(secDl, k, v));
    secCard.append(secTitle, secDl);

    // ---- Parsed policy highlights from device_policy ----
    const KW = /password|lock ?task|restriction|always[- ]on vpn|system update|permission policy|organization|affiliation|cross[- ]profile|suspend|keyguard|status bar|wipe|maximum failed|disabled features|ca cert|trusted credential|min(imum)?[\s_]?(password)?[\s_]?length|complexity|expir|global proxy|short support|long support/i;
    const seenHi = new Set();
    const highlights = dp.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => {
      const t = l.trim();
      if (!t || !KW.test(l) || seenHi.has(t)) return false;
      seenHi.add(t);   // drop duplicate lines repeated across per-user sections
      return true;
    });

    // ---- Managed app configs / app restrictions ----
    const restr = (dp.match(/Application Restrictions[\s\S]*?(?=\n\S|\n\n|$)/i) || [])[0]
      || (dp.match(/mApplicationRestrictions[\s\S]*?(?=\n\S|\n\n|$)/i) || [])[0];

    // ---- Active admins (per user) ----
    const adminsBlock = (dp.match(/Enabled Device Admins[\s\S]*?(?=\n[A-Z][a-z]+ \w|\n\n\S|$)/i) || [])[0];

    // ---- Render into the split views ----
    // Security
    mgmtSecurityEl.replaceChildren(secCard);

    // Policies — structured per-admin cards (dedupe repeated admin= blocks).
    const adminMap = new Map();
    for (const a of parseAdmins(dp)) {
      if (a.user == null) a.user = 0;
      const key = `${a.comp}@${a.user}`;
      const e = adminMap.get(key);
      if (!e) { adminMap.set(key, a); continue; }
      e.policies = [...new Set([...e.policies, ...a.policies])];
      const have = new Set(e.kv.map((x) => x[0]));
      for (const [k, v] of a.kv) if (!have.has(k)) e.kv.push([k, v]);
    }
    const admins = [...adminMap.values()];
    const restrTokens = [...new Set(
      [...(dp + "\n" + usersDump).matchAll(/\b((?:no_|disallow_|ensure_)[a-z0-9_]+)/gi)].map((mm) => mm[1].toLowerCase()),
    )].sort();

    mgmtPoliciesEl.replaceChildren();
    if (admins.length) {
      for (const a of admins) {
        const card = document.createElement("div"); card.className = "card policy-card";
        const h = document.createElement("h3");
        const comp = document.createElement("span"); comp.className = "comp"; comp.textContent = a.comp;
        h.append(comp, document.createTextNode(`  (User ${a.user ?? 0})`));
        card.append(h);

        if (a.policies.length) {
          const chips = document.createElement("div"); chips.className = "chips";
          for (const p of a.policies) {
            const c = document.createElement("span"); c.className = "chip"; c.textContent = p; chips.append(c);
          }
          card.append(chips);
        }

        // Only show meaningful settings (skip uid/packageName/etc and unset).
        const skip = /^(uid|packageName|testOnlyAdmin|name|getPolicyValue|isPermissionBased)$/i;
        const dl = document.createElement("dl"); dl.className = "kv";
        for (const [k, v] of a.kv) {
          if (skip.test(k)) continue;
          if (/^(|null|\{\}|\[\]|-1|false)$/.test(v) && !POLICY_LABELS[k]) continue;
          kvRow(dl, POLICY_LABELS[k] || k, decodePolicyValue(k, v));
        }
        if (dl.childElementCount) card.append(dl);
        mgmtPoliciesEl.append(card);
      }
    } else {
      const none = document.createElement("p"); none.className = "muted";
      none.textContent = "No active device admins parsed.";
      mgmtPoliciesEl.append(none);
    }

    if (restrTokens.length) {
      const rcard = document.createElement("div"); rcard.className = "card policy-card";
      const rh = document.createElement("h3"); rh.textContent = `User restrictions (${restrTokens.length})`;
      const chips = document.createElement("div"); chips.className = "chips";
      for (const t of restrTokens) { const c = document.createElement("span"); c.className = "chip"; c.textContent = t; chips.append(c); }
      rcard.append(rh, chips);
      mgmtPoliciesEl.append(rcard);
    }

    const hi = detailsBlock(`Policy highlights — raw lines (${highlights.length})`, highlights.join("\n"));
    mgmtPoliciesEl.append(hi, detailsBlock("Active admins (raw block)", adminsBlock || "(not found in dump)"));

    // ---- App policies ----
    const chipCard = (title, items) => {
      const card = document.createElement("div"); card.className = "card policy-card";
      const h = document.createElement("h3"); h.textContent = `${title} (${items.length})`;
      const chips = document.createElement("div"); chips.className = "chips";
      for (const it of items) { const c = document.createElement("span"); c.className = "chip"; c.textContent = it; chips.append(c); }
      card.append(h, chips); return card;
    };
    mgmtAppPoliciesEl.replaceChildren();
    let anyAppPolicy = false;

    // Single-value app policies.
    const permPolicy = dpField(dp, /permission policy:?\s*([A-Z_]+|\d+)/i, /mPermissionPolicy=(\S+)/i);
    const lockFeatures = dpField(dp, /mLockTaskFeatures\s*=\s*(\S+)/i, /lock ?task features?:?\s*(\S+)/i);
    if (permPolicy || lockFeatures) {
      const card = document.createElement("div"); card.className = "card policy-card";
      const h = document.createElement("h3"); h.textContent = "App control modes"; card.append(h);
      const dl = document.createElement("dl"); dl.className = "kv";
      if (permPolicy) kvRow(dl, "Permission grant policy", permPolicy);
      if (lockFeatures) kvRow(dl, "Lock-task features", lockFeatures);
      card.append(dl); mgmtAppPoliciesEl.append(card); anyAppPolicy = true;
    }

    // App-control user restrictions.
    const appRestr = restrTokens.filter((t) => APP_RESTRICTIONS.has(t));
    if (appRestr.length) { mgmtAppPoliciesEl.append(chipCard("App-control restrictions", appRestr)); anyAppPolicy = true; }

    // Package-list categories.
    for (const [title, headerRe, inlineRes] of APP_POLICY_CATS) {
      const pkgs = extractPkgs(dp, headerRe, inlineRes);
      if (pkgs.length) { mgmtAppPoliciesEl.append(chipCard(title, pkgs)); anyAppPolicy = true; }
    }

    // Permission grant states & delegated scopes (raw filtered lines).
    const seenP = new Set();
    const permGrants = dp.split("\n").map((l) => l.trim())
      .filter((l) => /=\s*(granted|denied|default)\b/i.test(l) && /[\w.]+\.[\w.]+/.test(l))
      .filter((l) => !seenP.has(l) && seenP.add(l));
    // Delegated scopes: package -> real delegation-* scopes (not a loose grep).
    const delegMap = new Map();
    for (const line of dp.split("\n")) {
      const scopes = [...line.matchAll(/delegation-[\w-]+/g)].map((x) => x[0]);
      if (!scopes.length) continue;
      const pkg = (line.match(/\b([a-z][\w]+(?:\.[\w]+){2,})\b/) || [])[1] || "(unknown)";
      const set = delegMap.get(pkg) || delegMap.set(pkg, new Set()).get(pkg);
      scopes.forEach((sc) => set.add(sc));
    }
    if (permGrants.length) mgmtAppPoliciesEl.append(detailsBlock(`Permission grant states (${permGrants.length})`, permGrants.join("\n")));
    if (delegMap.size) {
      const card = document.createElement("div"); card.className = "card policy-card";
      const h = document.createElement("h3"); h.textContent = `Delegated scopes (${delegMap.size})`; card.append(h);
      const dl = document.createElement("dl"); dl.className = "kv";
      for (const [pkg, scopes] of delegMap) kvRow(dl, pkg, [...scopes].join(", "));
      card.append(dl); mgmtAppPoliciesEl.append(card); anyAppPolicy = true;
    }

    if (!anyAppPolicy && !permGrants.length) {
      const none = document.createElement("p"); none.className = "muted";
      none.textContent = "No app-level policies detected in the device_policy dump.";
      mgmtAppPoliciesEl.append(none);
    }

    // App config — parsed managed-configuration bundles per app.
    mgmtAppconfigEl.replaceChildren();
    const bundles = extractManagedConfigs(dp);
    if (bundles.length) {
      for (const b of bundles) {
        const title = b.pkg
          ? `Managed config — ${b.pkg}${b.userId ? ` (user ${b.userId})` : ""}`
          : "Managed config";
        const text = (b.admin ? `enforced by: ${b.admin}\n\n` : "") + prettyBundle(b.body);
        const blk = detailsBlock(title, text);
        blk.open = bundles.length <= 3;
        mgmtAppconfigEl.append(blk);
      }
    }
    // Keep the raw restrictions block too, as a fallback.
    mgmtAppconfigEl.append(
      detailsBlock("Raw application restrictions block", restr || "(none found in device_policy dump)"),
    );
    if (!bundles.length) {
      const note = document.createElement("p"); note.className = "muted";
      note.textContent = "No managed configurations (BundlePolicyValue) found in the dump.";
      mgmtAppconfigEl.prepend(note);
    }

    // ---- Effective policy (configured vs resolved) ----
    const policyStates = parsePolicyStates(dp);
    // Installed packages across all profiles — to tell "no target" apart from
    // a real apply failure.
    const instRaw = await Promise.all(
      parseUsers(pmUsers, m.profileOwners).map((u) => sh(`pm list packages --user ${u.id}`).catch(() => "")),
    );
    const installedSet = new Set(instRaw.join("\n").split("\n").map((l) => l.replace(/^package:/, "").trim()).filter(Boolean));
    renderEffective(policyStates, installedSet);

    // ---- Certificates ----
    const certs = parseCerts(dp);
    // Enumerate trusted CAs via the dex (AndroidCAStore, parsed X509) — no root,
    // system + user/DPC-added, with subject/issuer/validity.
    certs.dexCerts = [];
    try {
      await ensureDexPushed();
      const out = await sh(`CLASSPATH=${DEX_DEVICE_PATH} app_process / Main certs`);
      const seenCert = new Set();
      certs.dexCerts = out.split("\n").map((line) => line.split("\t"))
        .filter((f) => f.length === 6 && /^(system|user-\d+)$/.test(f[0]))
        .map(([source, subject, issuer, serial, nb, na]) => ({ source, subject, issuer, serial, notBefore: +nb, notAfter: +na }))
        .filter((c) => { const k = `${c.source}|${c.serial}|${c.subject}`; if (seenCert.has(k)) return false; seenCert.add(k); return true; });
      dlog(`certs ✓ (${certs.dexCerts.length})`);
    } catch (e) { dlog("certs dex ✗", e?.message ?? e); }
    // Work-profile user ids — used to flag the read limitation in the UI.
    certs.workUsers = parseUsers(pmUsers, m.profileOwners).filter((u) => u.managed).map((u) => u.id);
    renderCerts(certs);

    // ---- Accounts & network ----
    const accounts = parseAccounts(accountsDump);
    const wifi = parseWifi(wifiList);
    renderNetwork(accounts, wifi, g, s, m);

    // ---- Diagnostics ----
    lastMgmt = { m, dp, owners, dpmOwners, usersDump, accountsDump, wifiList, propsRaw, gRaw, sRaw, selinux, policyStates, installedSet, certs, accounts };
    renderDiag(policyStates, certs, accounts);

    // Raw dumps
    mgmtRawEl.replaceChildren(
      detailsBlock("Owners (cmd device_policy list-owners)", owners + (dpmOwners && dpmOwners !== owners ? "\n\n--- dpm list-owners ---\n" + dpmOwners : "")),
      detailsBlock("Disabled / suspended packages (pm list packages -d)", disabled),
      detailsBlock("Users (dumpsys user)", usersDump),
      detailsBlock("Accounts (dumpsys account)", accountsDump),
      detailsBlock("Wi-Fi networks (cmd wifi list-networks)", wifiList),
      detailsBlock("Full device policy (dumpsys device_policy)", dp),
    );

    setMgmtStatus(m.managed ? "Managed" : "Unmanaged");
    dlog("management ✓", m.mode);
  } catch (err) {
    console.error(err);
    mgmtSummaryEl.replaceChildren();
    setMgmtStatus(`Error: ${err?.message ?? err}`);
  } finally {
    setMgmtRefreshDisabled(!adb);
  }
}
function mgmtNote(parent, text) {
  const p = document.createElement("p"); p.className = "muted"; p.textContent = text; parent.append(p);
}

// Classify a policy's effective status using the resolved value AND whether its
// target package is installed (so "no target" ≠ a real failure).
function effectiveStatus(s, installedSet) {
  const resolved = s.resolved && s.resolved.toLowerCase() !== "null" ? s.resolved : null;
  if (s.pkg && installedSet && !installedSet.has(s.pkg)) return { cls: "muted-st", text: "target not installed" };
  if (resolved) return { cls: "ok", text: "✓ effective" };
  // configured but engine resolved null on an installed/global target
  return { cls: "warn-st", text: "set · not resolved" };
}

function renderEffective(states, installedSet) {
  mgmtEffectiveEl.replaceChildren();
  if (!states.length) { mgmtNote(mgmtEffectiveEl, "No policy-engine states found (older Android, or no policies set)."); return; }
  for (const s of states) s._st = effectiveStatus(s, installedSet);

  const onlyIssues = effOnlyIssuesEl?.checked;
  const issues = states.filter((s) => s._st.cls === "warn-st");
  const noTarget = states.filter((s) => s._st.cls === "muted-st");
  const list = onlyIssues ? issues : states;
  mgmtNote(mgmtEffectiveEl, `${states.length} policies · ${issues.length} set-but-unresolved · ${noTarget.length} target not installed`);

  const tbl = document.createElement("table"); tbl.className = "ptable";
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const h of ["Policy", "Configured (by admin)", "Resolved (effective)", "Status"]) {
    const th = document.createElement("th"); th.textContent = h; hr.append(th);
  }
  thead.append(hr); tbl.append(thead);
  const tb = document.createElement("tbody");
  for (const s of list) {
    const tr = document.createElement("tr"); if (s._st.cls === "warn-st") tr.className = "warn-row";
    const c1 = document.createElement("td"); c1.textContent = s.label;
    const am = new Map();
    for (const a of s.admins) {
      if (a.value == null) continue;
      const k = shortInstaller((a.admin || "").split("/")[0]);
      (am.get(k) || am.set(k, new Set()).get(k)).add(a.value);
    }
    const c2 = document.createElement("td");
    c2.textContent = [...am.entries()].map(([adm, set]) => `${adm}=${[...set].join(" / ")}`).join("; ") || "—";
    const c3 = document.createElement("td"); c3.textContent = s.resolved ?? "—";
    const c4 = document.createElement("td"); c4.textContent = s._st.text;
    if (s._st.cls === "ok") c4.className = "ok";
    else if (s._st.cls === "warn-st") c4.style.color = "#b06000";
    else if (s._st.cls === "muted-st") c4.style.color = "var(--muted)";
    tr.append(c1, c2, c3, c4); tb.append(tr);
  }
  tbl.append(tb); mgmtEffectiveEl.append(tbl);
}
effOnlyIssuesEl?.addEventListener("change", () => { if (lastMgmt) renderEffective(lastMgmt.policyStates, lastMgmt.installedSet); });

function certCN(dn) { return (dn && dn.match(/CN=([^,]+)/) || [])[1] || dn || "—"; }
function fmtDate(ms) { if (!ms) return "—"; try { return new Date(ms).toLocaleDateString(); } catch { return String(ms); } }

function sourceLabel(src) {
  if (src === "system") return "System";
  const m = (src || "").match(/user-(\d+)/);
  if (!m) return src || "User";
  return m[1] === "0" ? "Personal (user 0)" : `Work profile (user ${m[1]})`;
}

function renderCerts(c) {
  mgmtCertsEl.replaceChildren();
  const dex = c.dexCerts || [];
  const now = Date.now();
  if (!dex.length) mgmtNote(mgmtCertsEl, "Could not read the CA store (dex/app_process unavailable).");

  // User-added CAs grouped by profile (Personal / Work) — what MDMs push.
  const userCerts = dex.filter((x) => x.source !== "system");
  const bySource = new Map();
  for (const ca of userCerts) (bySource.get(ca.source) || bySource.set(ca.source, []).get(ca.source)).push(ca);
  const order = [...bySource.keys()].sort((a, b) => (a === "user-0" ? -1 : b === "user-0" ? 1 : a.localeCompare(b)));

  const uh = document.createElement("h3"); uh.className = "section-h";
  uh.textContent = `User-added CA certificates (${userCerts.length})`;
  mgmtCertsEl.append(uh);
  if (!userCerts.length && dex.length) mgmtNote(mgmtCertsEl, "No user- or admin-installed CA certificates on the personal profile.");

  // Explicit limitation: work-profile user CAs we couldn't read.
  for (const uid of (c.workUsers || [])) {
    if (dex.some((x) => x.source === `user-${uid}`)) continue;
    const w = document.createElement("p"); w.className = "warn";
    w.textContent = `Work-profile (user ${uid}) user-installed CA certificates can't be read over ADB without root. ` +
      `The cert files are owned by the system (permission-denied to shell), and the per-user KeyChain service can't be bound from app_process ` +
      `("Unable to find app for caller"). Reading them requires root, the device's DPC, or a companion app inside the work profile. ` +
      `System CAs and personal-profile user CAs above are complete.`;
    mgmtCertsEl.append(w);
  }
  for (const src of order) {
    const grpH = document.createElement("h3"); grpH.className = "section-h"; grpH.style.fontSize = ".9rem";
    grpH.textContent = sourceLabel(src);
    if (/user-[1-9]/.test(src)) { const t = document.createElement("span"); t.className = "tag managed"; t.textContent = "Work"; t.style.marginLeft = ".5rem"; grpH.append(t); }
    mgmtCertsEl.append(grpH);
    for (const ca of bySource.get(src).sort((a, b) => certCN(a.subject).localeCompare(certCN(b.subject)))) {
      mgmtCertsEl.append(certCard(ca, now));
    }
  }

  // Certificate aliases referenced in managed configs.
  if (c.aliases.length) {
    const card = document.createElement("div"); card.className = "card policy-card";
    const h = document.createElement("h3"); h.textContent = `Certificate aliases (referenced in configs) (${c.aliases.length})`;
    const chips = document.createElement("div"); chips.className = "chips";
    for (const a of c.aliases) { const sp = document.createElement("span"); sp.className = "chip"; sp.textContent = a; chips.append(sp); }
    card.append(h, chips); mgmtCertsEl.append(card);
  }

  // System trusted CAs — collapsible (subject + expiry).
  const sysCerts = dex.filter((x) => x.source === "system");
  if (sysCerts.length) {
    const txt = sysCerts
      .sort((a, b) => certCN(a.subject).localeCompare(certCN(b.subject)))
      .map((x) => `${certCN(x.subject)}  —  expires ${fmtDate(x.notAfter)}`).join("\n");
    mgmtCertsEl.append(detailsBlock(`System trusted CAs (${sysCerts.length})`, txt));
  }
  if (c.keyPairs.length) mgmtCertsEl.append(detailsBlock(`Key-pair grants / KeyChain (${c.keyPairs.length})`, c.keyPairs.join("\n")));
}

function certCard(ca, now) {
  const card = document.createElement("div"); card.className = "card policy-card";
  const h = document.createElement("h3"); h.textContent = certCN(ca.subject);
  if (ca.notAfter && ca.notAfter < now) { const t = document.createElement("span"); t.className = "tag"; t.style.cssText = "background:#fce8e6;color:#c5221f;margin-left:.5rem;"; t.textContent = "EXPIRED"; h.append(t); }
  card.append(h);
  const dl = document.createElement("dl"); dl.className = "kv";
  kvRow(dl, "Subject", ca.subject || "—");
  kvRow(dl, "Issuer", ca.issuer || "—");
  kvRow(dl, "Valid", `${fmtDate(ca.notBefore)} → ${fmtDate(ca.notAfter)}`);
  kvRow(dl, "Serial", ca.serial || "—");
  kvRow(dl, "Alias", ca.alias || "—");
  card.append(dl);
  return card;
}

function renderNetwork(accounts, wifi, g, s, m) {
  mgmtNetworkEl.replaceChildren();
  // Accounts
  const aCard = document.createElement("div"); aCard.className = "card policy-card";
  const ah = document.createElement("h3"); ah.textContent = `Accounts (${accounts.length})`; aCard.append(ah);
  if (accounts.length) {
    const dl = document.createElement("dl"); dl.className = "kv";
    for (const a of accounts) kvRow(dl, `${a.name}`, `${a.type}${a.user != null ? ` · user ${a.user}` : ""}`);
    aCard.append(dl);
  } else { mgmtNote(aCard, "No accounts (or not visible to shell)."); }
  mgmtNetworkEl.append(aCard);

  // Network summary
  const nCard = document.createElement("div"); nCard.className = "card policy-card";
  const nh = document.createElement("h3"); nh.textContent = "Network"; nCard.append(nh);
  const ndl = document.createElement("dl"); ndl.className = "kv";
  const vpnApp = g.get("always_on_vpn_app");
  kvRow(ndl, "Always-on VPN", vpnApp ? `${vpnApp}${g.get("always_on_vpn_lockdown") === "1" ? " (lockdown)" : ""}` : "none");
  kvRow(ndl, "Private DNS", [g.get("private_dns_mode"), g.get("private_dns_specifier")].filter(Boolean).join(": ") || "—");
  kvRow(ndl, "HTTP proxy", g.get("http_proxy") || [g.get("global_http_proxy_host"), g.get("global_http_proxy_port")].filter(Boolean).join(":") || "none");
  nCard.append(ndl); mgmtNetworkEl.append(nCard);

  // Wi-Fi
  const wCard = document.createElement("div"); wCard.className = "card policy-card";
  const wh = document.createElement("h3"); wh.textContent = `Configured Wi-Fi networks (${wifi.length})`; wCard.append(wh);
  if (wifi.length) {
    const chips = document.createElement("div"); chips.className = "chips";
    for (const w of wifi) { const sp = document.createElement("span"); sp.className = "chip"; sp.textContent = `${w.ssid} · ${w.security}`; chips.append(sp); }
    wCard.append(chips);
  } else { mgmtNote(wCard, "None listed (needs Android 11+ / shell Wi-Fi access)."); }
  mgmtNetworkEl.append(wCard);
}

function renderDiag(states, certs, accounts) {
  mgmtDiagEl.replaceChildren();
  const card = document.createElement("div"); card.className = "card policy-card";
  const h = document.createElement("h3"); h.textContent = "Snapshot"; card.append(h);
  const dl = document.createElement("dl"); dl.className = "kv";
  const m = lastMgmt?.m;
  kvRow(dl, "Mode", m?.mode || "—");
  kvRow(dl, "DPC", [...dpcPkgsGlobal].join(", ") || "—");
  kvRow(dl, "Policy states", String(states.length));
  kvRow(dl, "Set · not resolved", String(states.filter((x) => x._st?.cls === "warn-st").length));
  kvRow(dl, "Target not installed", String(states.filter((x) => x._st?.cls === "muted-st").length));
  kvRow(dl, "Certificate aliases", String(certs.aliases.length));
  kvRow(dl, "Accounts", String(accounts.length));
  card.append(dl); mgmtDiagEl.append(card);
}

// Diagnostics actions.
diagLogcatBtn?.addEventListener("click", () => {
  const dpc = [...dpcPkgsGlobal][0];
  if (dpc) pkgEl.value = dpc;
  showView("logcat");
  for (const n of navItems) n.classList.toggle("active", n.dataset.view === "logcat");
  diagStatusEl.textContent = dpc ? `Logcat package filter set to ${dpc}` : "No DPC detected";
});

diagExportBtn?.addEventListener("click", () => {
  if (!lastMgmt) { diagStatusEl.textContent = "Open a Management tab first."; return; }
  const d = lastMgmt;
  const lines = [];
  lines.push(`# Android management diagnostic report`);
  lines.push(`Device: ${deviceSerial}`);
  lines.push(`Mode: ${d.m.mode}`);
  lines.push(`DPC: ${[...dpcPkgsGlobal].join(", ") || "—"}`);
  lines.push("");
  lines.push(`## Policies set but not resolved (installed target, resolved=null)`);
  const bad = d.policyStates.filter((p) => p._st?.cls === "warn-st");
  lines.push(bad.length ? bad.map((p) => `- ${p.label} → resolved=${p.resolved}`).join("\n") : "(none)");
  lines.push("");
  lines.push(`## Policies whose target app is not installed`);
  const noTgt = d.policyStates.filter((p) => p._st?.cls === "muted-st");
  lines.push(noTgt.length ? noTgt.map((p) => `- ${p.label}`).join("\n") : "(none)");
  lines.push("");
  lines.push(`## Certificate aliases`);
  lines.push(d.certs.aliases.join("\n") || "(none)");
  lines.push("");
  lines.push(`## Accounts`);
  lines.push(d.accounts.map((a) => `- ${a.name} (${a.type}) user ${a.user}`).join("\n") || "(none)");
  lines.push("");
  lines.push(`## Raw: cmd device_policy list-owners`);
  lines.push(d.owners);
  lines.push("");
  lines.push(`## Raw: dumpsys account`);
  lines.push(d.accountsDump);
  lines.push("");
  lines.push(`## Raw: dumpsys device_policy`);
  lines.push(d.dp);
  saveBlob(new Blob([lines.join("\n")], { type: "text/markdown" }), `mdm-diagnostic-${deviceSerial}.md`);
  diagStatusEl.textContent = "Report downloaded.";
});

for (const b of mgmtRefreshBtns) b.addEventListener("click", loadManagement);

// Initial state.
setConnected(false);
tryAutoConnect();   // reconnect a previously-authorized device on load
