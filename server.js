import { createServer, fetch } from 'http';
import * as os from 'os';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const START_TIME = Date.now();
const REQUEST_LOG = [];       // circular buffer of last 100 requests
const MAX_LOG = 100;
let totalRequests = 0;

function logRequest(method, url, status) {
  totalRequests++;
  REQUEST_LOG.push({ ts: Date.now(), method, url, status });
  if (REQUEST_LOG.length > MAX_LOG) REQUEST_LOG.shift();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseUrl(raw) {
  const qIdx = raw.indexOf('?');
  const pathname = qIdx === -1 ? raw : raw.slice(0, qIdx);
  const search = qIdx === -1 ? '' : raw.slice(qIdx + 1);
  const params = {};
  if (search) {
    search.split('&').forEach(pair => {
      const [k, ...rest] = pair.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(rest.join('='));
    });
  }
  return { pathname, params };
}

function json(resp, code, data) {
  resp.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  resp.end(JSON.stringify(data));
}

function text(resp, code, body, contentType) {
  resp.writeHead(code, { 'Content-Type': contentType || 'text/plain; charset=utf-8' });
  resp.end(body);
}

function chunkToString(chunk) {
  if (chunk === undefined || chunk === null) return '';
  if (typeof chunk === 'string') return chunk;

  function bytesToString(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (chunk instanceof ArrayBuffer) {
      return bytesToString(new Uint8Array(chunk));
    }
    if (ArrayBuffer.isView && ArrayBuffer.isView(chunk)) {
      return bytesToString(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
    }
  }
  return String(chunk);
}

function collectBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunkToString(chunk); });
    req.on('end', () => resolve(body));
    req.on('error', () => resolve(body));
    try { if (typeof req.resume === 'function') req.resume(); } catch (_) {}
  });
}

function safeName(name) {
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return null;
  return name;
}

// ---------------------------------------------------------------------------
// Route: GET /api/runtime
// ---------------------------------------------------------------------------
function handleRuntime(req, resp) {
  const info = {
    os: {
      type: os.type(),
      platform: os.platform(),
      arch: os.arch(),
      homedir: os.homedir(),
      tmpdir: os.tmpdir(),
    },
    process: {
      argv: typeof globalThis.args !== 'undefined' ? globalThis.args : [],
      env: typeof globalThis.env !== 'undefined' ? globalThis.env : {},
      uptime_ms: Date.now() - START_TIME,
    },
    server: {
      totalRequests,
      startTime: START_TIME,
    },
    wasm: {
      note: 'This application runs inside WasmEdge QuickJS — a JavaScript engine compiled to WebAssembly.',
      codesignFree: 'No native binary exists. No code signing is required. The entire app is a WASM sandbox.',
    },
  };
  json(resp, 200, info);
}

// ---------------------------------------------------------------------------
// Route: /api/fetch  — proxy outbound HTTP requests
// ---------------------------------------------------------------------------
async function handleFetch(req, resp) {
  try {
    let targetUrl, method, body, headers;

    if (req.method === 'GET') {
      const { params } = parseUrl(req.url);
      targetUrl = params.url;
      method = (params.method || 'GET').toUpperCase();
      body = params.body || undefined;
      headers = {};
    } else {
      const raw = await collectBody(req);
      let payload;
      try { payload = JSON.parse(raw); } catch (_) { payload = {}; }
      targetUrl = payload.url;
      method = (payload.method || 'POST').toUpperCase();
      body = payload.body;
      headers = payload.headers || {};
    }

    if (!targetUrl) {
      json(resp, 400, { error: 'Missing "url" parameter' });
      return;
    }

    const t0 = Date.now();
    const fetchOpts = { method };
    if (body) fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (Object.keys(headers).length) fetchOpts.headers = headers;

    const upstream = await fetch(targetUrl, fetchOpts);
    const responseText = await upstream.text();
    const elapsed = Date.now() - t0;

    json(resp, 200, {
      status: upstream.status || 200,
      elapsed_ms: elapsed,
      url: targetUrl,
      method,
      body: responseText,
    });
  } catch (e) {
    json(resp, 502, { error: String(e), message: 'Outbound fetch failed' });
  }
}

// ---------------------------------------------------------------------------
// Route: /api/files — CRUD on host-mapped /data directory
// ---------------------------------------------------------------------------
const DATA_DIR = '/data';

function dataAvailable() {
  try { fs.accessSync(DATA_DIR); return true; } catch (_) { return false; }
}

function handleFilesList(req, resp) {
  if (!dataAvailable()) {
    json(resp, 503, { error: 'Host directory not mounted. Run with: --dir /host/path:/data' });
    return;
  }
  try {
    const entries = fs.readdirSync(DATA_DIR);
    const files = entries.map(name => {
      try {
        const s = fs.statSync(DATA_DIR + '/' + name);
        return { name, size: s.size, isDir: s.isDirectory(), mtime: s.mtimeMs };
      } catch (_) {
        return { name, size: 0, isDir: false, mtime: 0 };
      }
    });
    json(resp, 200, { path: DATA_DIR, files });
  } catch (e) {
    json(resp, 500, { error: String(e) });
  }
}

function handleFileRead(req, resp, name) {
  if (!dataAvailable()) { json(resp, 503, { error: 'Host dir not mounted' }); return; }
  const safe = safeName(name);
  if (!safe) { json(resp, 400, { error: 'Invalid filename' }); return; }
  try {
    const content = fs.readFileSync(DATA_DIR + '/' + safe, 'utf-8');
    const stat = fs.statSync(DATA_DIR + '/' + safe);
    json(resp, 200, { name: safe, content, size: stat.size, mtime: stat.mtimeMs });
  } catch (e) {
    json(resp, 404, { error: 'File not found: ' + safe });
  }
}

async function handleFileWrite(req, resp, name) {
  if (!dataAvailable()) { json(resp, 503, { error: 'Host dir not mounted' }); return; }
  const safe = safeName(name);
  if (!safe) { json(resp, 400, { error: 'Invalid filename' }); return; }
  try {
    const body = await collectBody(req);
    let content;
    try {
      const parsed = JSON.parse(body);
      content = parsed.content !== undefined ? parsed.content : body;
    } catch (_) {
      content = body;
    }
    fs.writeFileSync(DATA_DIR + '/' + safe, content);
    json(resp, 200, { ok: true, name: safe, size: content.length });
  } catch (e) {
    json(resp, 500, { error: String(e) });
  }
}

function handleFileDelete(req, resp, name) {
  if (!dataAvailable()) { json(resp, 503, { error: 'Host dir not mounted' }); return; }
  const safe = safeName(name);
  if (!safe) { json(resp, 400, { error: 'Invalid filename' }); return; }
  try {
    fs.unlinkSync(DATA_DIR + '/' + safe);
    json(resp, 200, { ok: true, deleted: safe });
  } catch (e) {
    json(resp, 404, { error: 'Cannot delete: ' + String(e) });
  }
}

function handleFileStat(req, resp, name) {
  if (!dataAvailable()) { json(resp, 503, { error: 'Host dir not mounted' }); return; }
  const safe = safeName(name);
  if (!safe) { json(resp, 400, { error: 'Invalid filename' }); return; }
  try {
    const s = fs.statSync(DATA_DIR + '/' + safe);
    json(resp, 200, {
      name: safe,
      size: s.size,
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
      atimeMs: s.atimeMs,
      mtimeMs: s.mtimeMs,
      ctimeMs: s.ctimeMs,
      mode: s.mode,
    });
  } catch (e) {
    json(resp, 404, { error: 'Not found: ' + safe });
  }
}

// ---------------------------------------------------------------------------
// Route: /api/internal-fs — demonstrate internal container FS
// ---------------------------------------------------------------------------
function handleInternalFs(req, resp) {
  const results = [];
  const tmpFile = './tmp_demo_' + Date.now() + '.txt';
  try {
    fs.writeFileSync(tmpFile, 'Hello from inside the WASM container! Timestamp: ' + Date.now());
    results.push({ op: 'write', file: tmpFile, ok: true });

    const content = fs.readFileSync(tmpFile, 'utf-8');
    results.push({ op: 'read', file: tmpFile, content, ok: true });

    const stat = fs.statSync(tmpFile);
    results.push({ op: 'stat', file: tmpFile, size: stat.size, ok: true });

    fs.unlinkSync(tmpFile);
    results.push({ op: 'delete', file: tmpFile, ok: true });
  } catch (e) {
    results.push({ op: 'error', message: String(e), ok: false });
  }
  json(resp, 200, { note: 'Internal container filesystem operations (ephemeral, inside WASM sandbox)', results });
}

// ---------------------------------------------------------------------------
// Route: /api/server-info
// ---------------------------------------------------------------------------
function handleServerInfo(req, resp) {
  json(resp, 200, {
    uptime_ms: Date.now() - START_TIME,
    totalRequests,
    recentRequests: REQUEST_LOG.slice(-30).reverse(),
  });
}

// ---------------------------------------------------------------------------
// Route: /api/echo
// ---------------------------------------------------------------------------
async function handleEcho(req, resp) {
  const body = await collectBody(req);
  json(resp, 200, {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body,
    timestamp: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// HTML — The entire GUI as an inline template
// ---------------------------------------------------------------------------
function getHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WasmEdge Demo — Codesign-Free GUI</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --border: #2a2d3a;
    --text: #e1e4ed;
    --muted: #8b8fa3;
    --accent: #6c63ff;
    --accent2: #00d4aa;
    --danger: #ff5555;
    --success: #00d4aa;
    --radius: 8px;
    --mono: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg); color: var(--text); line-height: 1.6;
    min-height: 100vh;
  }
  header {
    background: var(--surface); border-bottom: 1px solid var(--border);
    padding: 16px 24px; display: flex; align-items: center; gap: 16px;
  }
  header h1 { font-size: 1.25rem; font-weight: 600; }
  header h1 span { color: var(--accent); }
  header .badge {
    background: var(--accent); color: #fff; font-size: 0.7rem;
    padding: 2px 8px; border-radius: 12px; font-weight: 600;
  }
  nav {
    display: flex; gap: 0; background: var(--surface);
    border-bottom: 1px solid var(--border); padding: 0 24px;
  }
  nav button {
    background: none; border: none; color: var(--muted);
    padding: 12px 20px; cursor: pointer; font-size: 0.9rem;
    border-bottom: 2px solid transparent; transition: all 0.2s;
  }
  nav button:hover { color: var(--text); }
  nav button.active { color: var(--accent); border-bottom-color: var(--accent); }
  main { max-width: 960px; margin: 0 auto; padding: 24px; }
  .tab { display: none; }
  .tab.active { display: block; }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 20px; margin-bottom: 16px;
  }
  .card h2 { font-size: 1.1rem; margin-bottom: 12px; color: var(--accent2); }
  .card h3 { font-size: 0.95rem; margin: 12px 0 8px; color: var(--muted); }
  pre, code {
    font-family: var(--mono); font-size: 0.85rem;
    background: var(--bg); border-radius: 4px;
  }
  pre { padding: 12px; overflow-x: auto; max-height: 400px; overflow-y: auto; }
  code { padding: 2px 6px; }
  .kv { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; }
  .kv dt { color: var(--muted); font-size: 0.85rem; }
  .kv dd { font-family: var(--mono); font-size: 0.85rem; word-break: break-all; }
  input, textarea, select {
    background: var(--bg); border: 1px solid var(--border); color: var(--text);
    border-radius: 4px; padding: 8px 12px; font-size: 0.9rem; width: 100%;
    font-family: inherit;
  }
  textarea { font-family: var(--mono); resize: vertical; min-height: 80px; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent); }
  button.btn {
    background: var(--accent); color: #fff; border: none;
    padding: 8px 16px; border-radius: 4px; cursor: pointer;
    font-size: 0.85rem; font-weight: 500; transition: opacity 0.2s;
  }
  button.btn:hover { opacity: 0.85; }
  button.btn.danger { background: var(--danger); }
  button.btn.outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
  .row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  .row > * { flex: 1; }
  .row > select { max-width: 120px; flex: none; }
  .file-list { list-style: none; }
  .file-list li {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 12px; border-bottom: 1px solid var(--border);
    cursor: pointer; transition: background 0.15s;
  }
  .file-list li:hover { background: var(--bg); }
  .file-list .fname { font-family: var(--mono); font-size: 0.85rem; }
  .file-list .fmeta { color: var(--muted); font-size: 0.75rem; }
  .log-entry {
    font-family: var(--mono); font-size: 0.8rem; padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  .log-entry .method { font-weight: 600; }
  .log-entry .ts { color: var(--muted); }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .status-dot.green { background: var(--success); }
  .empty { color: var(--muted); font-style: italic; padding: 20px; text-align: center; }
  .banner {
    background: linear-gradient(135deg, #1a1040, #0a2040);
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 24px; margin-bottom: 16px; text-align: center;
  }
  .banner h2 { font-size: 1.3rem; margin-bottom: 8px; }
  .banner p { color: var(--muted); max-width: 600px; margin: 0 auto; }
  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border);
    border-top-color: var(--accent); border-radius: 50%; animation: spin 0.6s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 640px) {
    nav { padding: 0 8px; }
    nav button { padding: 10px 12px; font-size: 0.8rem; }
    main { padding: 16px; }
  }
</style>
</head>
<body>
<header>
  <h1><span>&#9670;</span> WasmEdge Demo</h1>
  <div class="badge">WASM</div>
  <div class="badge" style="background:var(--accent2);color:#000;">CODESIGN-FREE</div>
</header>
<nav>
  <button class="active" onclick="showTab('runtime')">&#127968; Runtime</button>
  <button onclick="showTab('http')">&#127760; HTTP</button>
  <button onclick="showTab('files')">&#128193; Files</button>
  <button onclick="showTab('server')">&#128268; Server</button>
</nav>
<main>

<!-- TAB: Runtime Info -->
<div id="tab-runtime" class="tab active">
  <div class="banner">
    <h2>&#9670; Running Inside WasmEdge</h2>
    <p>This GUI is served by a JavaScript HTTP server running inside a WebAssembly sandbox. No native binary. No code signing. Just WASM.</p>
  </div>
  <div class="card">
    <h2>Environment</h2>
    <div id="runtime-info"><div class="spinner"></div> Loading...</div>
  </div>
  <div class="card">
    <h2>What Makes This Special?</h2>
    <dl class="kv">
      <dt>No Code Signing</dt><dd>The entire app is a .wasm file — no Mach-O, PE, or ELF binary that requires codesigning</dd>
      <dt>~2MB Image</dt><dd>The OCI container image is FROM scratch — no OS, no libraries, just WASM + JS</dd>
      <dt>Instant Startup</dt><dd>WASM containers start in milliseconds, not seconds</dd>
      <dt>Sandboxed</dt><dd>WASI capability-based security — only accesses what you explicitly grant via --dir</dd>
      <dt>Cross-Platform</dt><dd>Same image runs on any OS/CPU that Docker supports (wasi/wasm platform)</dd>
    </dl>
  </div>
</div>

<!-- TAB: HTTP Demo -->
<div id="tab-http" class="tab">
  <div class="card">
    <h2>Outbound HTTP Requests</h2>
    <p style="color:var(--muted);margin-bottom:12px;">Make HTTP requests from inside the WASM container to external services.</p>
    <div class="row">
      <select id="http-method">
        <option>GET</option><option>POST</option><option>PUT</option>
      </select>
      <input id="http-url" placeholder="https://httpbin.org/get" value="http://httpbin.org/get">
      <button class="btn" onclick="doFetch()" style="flex:none;">Send</button>
    </div>
    <div id="http-body-row" style="display:none;margin-bottom:8px;">
      <textarea id="http-body" placeholder='Request body (text or JSON)'></textarea>
    </div>
    <div id="http-result" style="display:none;">
      <h3>Response <span id="http-meta" style="font-weight:normal;"></span></h3>
      <pre id="http-response"></pre>
    </div>
  </div>
  <div class="card">
    <h2>Quick Examples</h2>
    <button class="btn outline" onclick="quickFetch('GET','http://httpbin.org/get')">GET httpbin.org/get</button>
    <button class="btn outline" onclick="quickFetch('POST','http://httpbin.org/post','hello wasm')">POST httpbin.org/post</button>
    <button class="btn outline" onclick="quickFetch('GET','http://httpbin.org/headers')">GET httpbin.org/headers</button>
  </div>
</div>

<!-- TAB: File I/O -->
<div id="tab-files" class="tab">
  <div class="card">
    <h2>Host Filesystem — <code>/data</code></h2>
    <p style="color:var(--muted);margin-bottom:12px;">
      Read &amp; write files on the host machine via WASI directory preopens.
      Requires: <code>--dir /host/path:/data</code>
    </p>
    <div class="row" style="margin-bottom:12px;">
      <button class="btn" onclick="loadFiles()">&#x21bb; Refresh</button>
      <button class="btn outline" onclick="showNewFile()">+ New File</button>
      <button class="btn outline" onclick="doInternalFs()">&#128300; Internal FS Demo</button>
    </div>
    <div id="new-file-form" style="display:none;margin-bottom:12px;">
      <div class="row">
        <input id="new-fname" placeholder="filename.txt">
        <button class="btn" onclick="createFile()" style="flex:none;">Create</button>
        <button class="btn outline" onclick="hideNewFile()" style="flex:none;">Cancel</button>
      </div>
      <textarea id="new-fcontent" placeholder="File contents..." style="margin-top:6px;"></textarea>
    </div>
    <ul id="file-list" class="file-list"><li class="empty">Loading...</li></ul>
  </div>
  <div id="file-viewer" class="card" style="display:none;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <h2 id="fv-name">file.txt</h2>
      <div style="display:flex;gap:6px;">
        <button class="btn" onclick="saveFile()">Save</button>
        <button class="btn danger" onclick="deleteFile()">Delete</button>
        <button class="btn outline" onclick="closeViewer()">Close</button>
      </div>
    </div>
    <div id="fv-meta" style="color:var(--muted);font-size:0.8rem;margin:6px 0;"></div>
    <textarea id="fv-content" style="min-height:200px;margin-top:8px;"></textarea>
  </div>
  <div id="internal-fs-result" class="card" style="display:none;">
    <h2>Internal Container FS</h2>
    <pre id="internal-fs-output"></pre>
  </div>
</div>

<!-- TAB: Server Info -->
<div id="tab-server" class="tab">
  <div class="card">
    <h2>Server Status</h2>
    <div class="kv">
      <dt>Status</dt><dd><span class="status-dot green"></span>Running</dd>
      <dt>Uptime</dt><dd id="srv-uptime">—</dd>
      <dt>Total Requests</dt><dd id="srv-total">—</dd>
    </div>
    <button class="btn outline" style="margin-top:12px;" onclick="loadServerInfo()">&#x21bb; Refresh</button>
  </div>
  <div class="card">
    <h2>Echo Endpoint</h2>
    <p style="color:var(--muted);margin-bottom:8px;">POST to <code>/api/echo</code> — mirrors back your request.</p>
    <div class="row">
      <input id="echo-input" placeholder="Type something to echo..." value="Hello from the browser!">
      <button class="btn" onclick="doEcho()" style="flex:none;">Send</button>
    </div>
    <pre id="echo-result" style="margin-top:8px;display:none;"></pre>
  </div>
  <div class="card">
    <h2>Recent Requests</h2>
    <div id="request-log"><div class="empty">No requests yet.</div></div>
  </div>
</div>

</main>
<script>
// --- Tab switching ---
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelectorAll('nav button').forEach(b => {
    if (b.textContent.toLowerCase().includes(name.slice(0, 4))) b.classList.add('active');
  });
  if (name === 'files') loadFiles();
  if (name === 'server') loadServerInfo();
}

// --- Runtime tab ---
async function loadRuntime() {
  try {
    const r = await fetch('/api/runtime');
    const d = await r.json();
    const el = document.getElementById('runtime-info');
    el.innerHTML = '<dl class="kv">' +
      '<dt>os.type()</dt><dd>' + d.os.type + '</dd>' +
      '<dt>os.platform()</dt><dd>' + d.os.platform + '</dd>' +
      '<dt>os.arch()</dt><dd>' + d.os.arch + '</dd>' +
      '<dt>os.homedir()</dt><dd>' + d.os.homedir + '</dd>' +
      '<dt>os.tmpdir()</dt><dd>' + d.os.tmpdir + '</dd>' +
      '<dt>Uptime</dt><dd>' + fmt(d.process.uptime_ms) + '</dd>' +
      '<dt>argv</dt><dd>' + (d.process.argv||[]).join(' ') + '</dd>' +
      '</dl>';
  } catch (e) {
    document.getElementById('runtime-info').textContent = 'Error: ' + e;
  }
}
loadRuntime();

function fmt(ms) {
  const s = Math.floor(ms/1000); const m = Math.floor(s/60); const h = Math.floor(m/60);
  if (h > 0) return h + 'h ' + (m%60) + 'm ' + (s%60) + 's';
  if (m > 0) return m + 'm ' + (s%60) + 's';
  return s + 's';
}

// --- HTTP tab ---
document.getElementById('http-method').addEventListener('change', function() {
  document.getElementById('http-body-row').style.display = this.value === 'GET' ? 'none' : 'block';
});

async function doFetch() {
  const method = document.getElementById('http-method').value;
  const url = document.getElementById('http-url').value;
  const body = document.getElementById('http-body').value;
  document.getElementById('http-result').style.display = 'block';
  document.getElementById('http-response').textContent = 'Loading...';
  document.getElementById('http-meta').textContent = '';
  try {
    const payload = { url, method };
    if (method !== 'GET' && body) payload.body = body;
    const r = await fetch('/api/fetch', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    document.getElementById('http-meta').textContent =
      '— Status: ' + d.status + ' | ' + d.elapsed_ms + 'ms';
    let pretty = d.body;
    try { pretty = JSON.stringify(JSON.parse(d.body), null, 2); } catch(_){}
    document.getElementById('http-response').textContent = pretty;
  } catch (e) {
    document.getElementById('http-response').textContent = 'Error: ' + e;
  }
}

function quickFetch(method, url, body) {
  document.getElementById('http-method').value = method;
  document.getElementById('http-url').value = url;
  document.getElementById('http-body').value = body || '';
  document.getElementById('http-body-row').style.display = method === 'GET' ? 'none' : 'block';
  doFetch();
}

// --- Files tab ---
let currentFile = null;

async function loadFiles() {
  const el = document.getElementById('file-list');
  el.innerHTML = '<li class="empty"><span class="spinner"></span> Loading...</li>';
  try {
    const r = await fetch('/api/files');
    const d = await r.json();
    if (d.error) { el.innerHTML = '<li class="empty">' + d.error + '</li>'; return; }
    if (!d.files || d.files.length === 0) {
      el.innerHTML = '<li class="empty">No files. Create one!</li>'; return;
    }
    el.innerHTML = d.files.map(f =>
      '<li onclick="openFile(\\'' + f.name.replace(/'/g,"\\\\'") + '\\')">' +
      '<div><span class="fname">' + (f.isDir ? '&#128193; ' : '&#128196; ') + esc(f.name) + '</span></div>' +
      '<span class="fmeta">' + fmtSize(f.size) + '</span></li>'
    ).join('');
  } catch (e) {
    el.innerHTML = '<li class="empty">Error: ' + e + '</li>';
  }
}

function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  return (b/1024/1024).toFixed(1) + ' MB';
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function openFile(name) {
  currentFile = name;
  try {
    const r = await fetch('/api/files/' + encodeURIComponent(name));
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    document.getElementById('fv-name').textContent = d.name;
    document.getElementById('fv-meta').textContent = 'Size: ' + fmtSize(d.size);
    document.getElementById('fv-content').value = d.content;
    document.getElementById('file-viewer').style.display = 'block';
  } catch (e) { alert('Error: ' + e); }
}

async function saveFile() {
  if (!currentFile) return;
  const content = document.getElementById('fv-content').value;
  try {
    const r = await fetch('/api/files/' + encodeURIComponent(currentFile), {
      method: 'POST', body: JSON.stringify({ content }),
    });
    const d = await r.json();
    if (d.ok) { loadFiles(); } else { alert(d.error); }
  } catch (e) { alert('Error: ' + e); }
}

async function deleteFile() {
  if (!currentFile || !confirm('Delete ' + currentFile + '?')) return;
  try {
    await fetch('/api/files/' + encodeURIComponent(currentFile), { method: 'DELETE' });
    closeViewer(); loadFiles();
  } catch (e) { alert('Error: ' + e); }
}

function closeViewer() {
  currentFile = null;
  document.getElementById('file-viewer').style.display = 'none';
}

function showNewFile() { document.getElementById('new-file-form').style.display = 'block'; }
function hideNewFile() { document.getElementById('new-file-form').style.display = 'none'; }

async function createFile() {
  const name = document.getElementById('new-fname').value.trim();
  const content = document.getElementById('new-fcontent').value;
  if (!name) { alert('Enter a filename'); return; }
  try {
    const r = await fetch('/api/files/' + encodeURIComponent(name), {
      method: 'POST', body: JSON.stringify({ content }),
    });
    const d = await r.json();
    if (d.ok) { hideNewFile(); loadFiles(); document.getElementById('new-fname').value = ''; document.getElementById('new-fcontent').value = ''; }
    else { alert(d.error); }
  } catch (e) { alert('Error: ' + e); }
}

async function doInternalFs() {
  const el = document.getElementById('internal-fs-result');
  el.style.display = 'block';
  document.getElementById('internal-fs-output').textContent = 'Running...';
  try {
    const r = await fetch('/api/internal-fs');
    const d = await r.json();
    document.getElementById('internal-fs-output').textContent = JSON.stringify(d, null, 2);
  } catch (e) {
    document.getElementById('internal-fs-output').textContent = 'Error: ' + e;
  }
}

// --- Server tab ---
async function loadServerInfo() {
  try {
    const r = await fetch('/api/server-info');
    const d = await r.json();
    document.getElementById('srv-uptime').textContent = fmt(d.uptime_ms);
    document.getElementById('srv-total').textContent = d.totalRequests;
    const logEl = document.getElementById('request-log');
    if (!d.recentRequests || d.recentRequests.length === 0) {
      logEl.innerHTML = '<div class="empty">No requests recorded yet.</div>';
    } else {
      logEl.innerHTML = d.recentRequests.map(r =>
        '<div class="log-entry">' +
        '<span class="ts">' + new Date(r.ts).toLocaleTimeString() + '</span> ' +
        '<span class="method">' + r.method + '</span> ' +
        esc(r.url) +
        '</div>'
      ).join('');
    }
  } catch (e) {
    document.getElementById('srv-uptime').textContent = 'Error';
  }
}

async function doEcho() {
  const input = document.getElementById('echo-input').value;
  const el = document.getElementById('echo-result');
  el.style.display = 'block';
  el.textContent = 'Sending...';
  try {
    const r = await fetch('/api/echo', { method: 'POST', body: input });
    const d = await r.json();
    el.textContent = JSON.stringify(d, null, 2);
  } catch (e) { el.textContent = 'Error: ' + e; }
}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function route(req, resp) {
  const { pathname } = parseUrl(req.url);
  // WasmEdge QuickJS may expose lowercase method names
  const method = String(req.method || '').toUpperCase();

  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    logRequest(method, pathname, 200);
    text(resp, 200, getHtml(), 'text/html; charset=utf-8');
    return;
  }

  if (method === 'GET' && pathname === '/api/runtime') {
    logRequest(method, pathname, 200);
    handleRuntime(req, resp);
    return;
  }

  if (pathname === '/api/fetch') {
    logRequest(method, pathname, 200);
    handleFetch(req, resp);
    return;
  }

  if (method === 'GET' && pathname === '/api/files') {
    logRequest(method, pathname, 200);
    handleFilesList(req, resp);
    return;
  }

  if (method === 'GET' && pathname === '/api/internal-fs') {
    logRequest(method, pathname, 200);
    handleInternalFs(req, resp);
    return;
  }

  if (method === 'GET' && pathname === '/api/server-info') {
    logRequest(method, pathname, 200);
    handleServerInfo(req, resp);
    return;
  }

  if (pathname === '/api/echo') {
    logRequest(method, pathname, 200);
    handleEcho(req, resp);
    return;
  }

  // /api/files/:name  and  /api/files/:name/stat
  const filesMatch = pathname.match(/^\/api\/files\/([^/]+)(\/stat)?$/);
  if (filesMatch) {
    const name = decodeURIComponent(filesMatch[1]);
    const isStat = !!filesMatch[2];
    logRequest(method, pathname, 200);

    if (isStat && method === 'GET') { handleFileStat(req, resp, name); return; }
    if (method === 'GET') { handleFileRead(req, resp, name); return; }
    if (method === 'POST') { handleFileWrite(req, resp, name); return; }
    if (method === 'DELETE') { handleFileDelete(req, resp, name); return; }
  }

  // Favicon — return empty
  if (pathname === '/favicon.ico') {
    resp.writeHead(204);
    resp.end();
    return;
  }

  logRequest(method, pathname, 404);
  json(resp, 404, { error: 'Not found', path: pathname });
}

// ===========================================================================
// CLI TOOLKIT — Atlassian Confluence CLI
// ===========================================================================

// ---------------------------------------------------------------------------
// Utility: Base64 Encoder (manual, no btoa dependency)
// ---------------------------------------------------------------------------
function base64Encode(str) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var result = '';
  for (var i = 0; i < str.length; i += 3) {
    var a = str.charCodeAt(i);
    var b = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
    var c = i + 2 < str.length ? str.charCodeAt(i + 2) : 0;
    var n = (a << 16) | (b << 8) | c;
    result += chars[(n >> 18) & 63];
    result += chars[(n >> 12) & 63];
    result += i + 1 < str.length ? chars[(n >> 6) & 63] : '=';
    result += i + 2 < str.length ? chars[n & 63] : '=';
  }
  return result;
}

// ---------------------------------------------------------------------------
// Utility: Exit with code
// ---------------------------------------------------------------------------
function exitProcess(code) {
  try { globalThis.exit(code); } catch (e) {}
  try { if (typeof process !== 'undefined' && process.exit) process.exit(code); } catch (e2) {}
  throw new Error('EXIT_' + code);
}

// ---------------------------------------------------------------------------
// Utility: Print to stderr
// ---------------------------------------------------------------------------
var CLI_DATA_DIR = (globalThis.env && globalThis.env.CLI_DATA_DIR) || '/data';

function printErr(msg) {
  try {
    var buf = [];
    for (var i = 0; i < msg.length; i++) buf.push(msg.charCodeAt(i));
    buf.push(10);
    var arr = new Uint8Array(buf);
    os.write(2, arr.buffer, 0, arr.length);
  } catch (e) {
    print('[STDERR] ' + msg);
  }
}

// ---------------------------------------------------------------------------
// Utility: Output formatter
// ---------------------------------------------------------------------------
function cliOutput(data, flags) {
  if (flags && flags.pretty) {
    print(JSON.stringify(data, null, 2));
  } else {
    print(JSON.stringify(data));
  }
}

// ---------------------------------------------------------------------------
// Known flags definitions
// ---------------------------------------------------------------------------
var BOOLEAN_FLAGS = ['help', 'pretty', 'verbose', 'all', 'purge'];
var KNOWN_FLAGS = [
  'help', 'h', 'pretty', 'verbose', 'all', 'limit',
  'space-id', 'body-format', 'title', 'body', 'parent-id', 'version',
  'purge', 'depth', 'cql', 'page-id', 'label', 'file', 'output',
  'site', 'email', 'token', 'key', 'value', 'output-dir', 'input-dir'
];

var KNOWN_RESOURCES = ['auth', 'page', 'space', 'search', 'comment', 'label', 'version', 'attachment', 'property', 'bulk'];

// ---------------------------------------------------------------------------
// Argument Parser
// ---------------------------------------------------------------------------
function parseArgs() {
  var rawArgs = (globalThis.args || []).slice(1);
  var idx = 0;

  // Skip 'confluence' prefix if present
  if (rawArgs.length > 0 && rawArgs[0] === 'confluence') {
    idx++;
  }

  var resource = null;
  var action = null;
  var positional = [];
  var flags = {};

  // Parse resource
  if (idx < rawArgs.length && rawArgs[idx] && rawArgs[idx].charAt(0) !== '-') {
    resource = rawArgs[idx];
    idx++;
  }

  // Parse action
  if (idx < rawArgs.length && rawArgs[idx] && rawArgs[idx].charAt(0) !== '-') {
    if (KNOWN_RESOURCES.indexOf(resource) !== -1) {
      action = rawArgs[idx];
      idx++;
    }
  }

  // Parse remaining args
  while (idx < rawArgs.length) {
    var arg = rawArgs[idx];
    if (arg === '-h') {
      flags.help = true;
      idx++;
    } else if (arg.indexOf('--') === 0) {
      var flagName = arg.slice(2);
      if (KNOWN_FLAGS.indexOf(flagName) === -1) {
        printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown flag: ' + arg }));
        exitProcess(1);
      }
      if (BOOLEAN_FLAGS.indexOf(flagName) !== -1) {
        flags[flagName] = true;
        idx++;
      } else {
        if (idx + 1 >= rawArgs.length || rawArgs[idx + 1].indexOf('--') === 0) {
          printErr(JSON.stringify({ error: true, code: 4, message: 'Missing value for flag: ' + arg }));
          exitProcess(4);
        }
        flags[flagName] = rawArgs[idx + 1];
        idx += 2;
      }
    } else {
      positional.push(arg);
      idx++;
    }
  }

  return { resource: resource, action: action, positional: positional, flags: flags };
}

// ---------------------------------------------------------------------------
// Auth Module
// ---------------------------------------------------------------------------
function getAuth() {
  var env = globalThis.env || {};

  // Check env vars first
  if (env.CONFLUENCE_SITE && env.CONFLUENCE_EMAIL && env.CONFLUENCE_TOKEN) {
    return { site: env.CONFLUENCE_SITE, email: env.CONFLUENCE_EMAIL, token: env.CONFLUENCE_TOKEN, source: 'env' };
  }

  // Fall back to /data/auth.json
  try {
    var content = fs.readFileSync(CLI_DATA_DIR + '/auth.json', 'utf-8');
    var data = JSON.parse(content);
    if (data.site && data.email && data.token) {
      return { site: data.site, email: data.email, token: data.token, source: 'stored' };
    }
  } catch (e) {
    // File doesn't exist or isn't valid JSON
  }

  return null;
}

async function handleAuth(parsed) {
  var action = parsed.action;
  var flags = parsed.flags;

  if (flags.help || !action) {
    showHelp('auth');
    exitProcess(0);
  }

  switch (action) {
    case 'login': {
      if (!flags.site) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --site' }));
        exitProcess(4);
      }
      if (!flags.email) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --email' }));
        exitProcess(4);
      }
      if (!flags.token) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --token' }));
        exitProcess(4);
      }
      var authData = JSON.stringify({ site: flags.site, email: flags.email, token: flags.token });
      fs.writeFileSync(CLI_DATA_DIR + '/auth.json', authData);
      cliOutput({ ok: true, site: flags.site }, flags);
      break;
    }
    case 'logout': {
      try { fs.unlinkSync(CLI_DATA_DIR + '/auth.json'); } catch (e) { /* ignore if not exists */ }
      cliOutput({ ok: true, message: 'Logged out' }, flags);
      break;
    }
    case 'status': {
      var auth = getAuth();
      if (!auth) {
        printErr(JSON.stringify({ error: true, code: 2, message: 'Not authenticated. Run: confluence auth login --site SITE --email EMAIL --token TOKEN' }));
        exitProcess(2);
      }
      cliOutput({ authenticated: true, site: auth.site, email: auth.email, source: auth.source }, flags);
      break;
    }
    default:
      printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown auth action: ' + action + '. Valid: login, logout, status' }));
      exitProcess(1);
  }
}

// ---------------------------------------------------------------------------
// Confluence HTTP Client
// ---------------------------------------------------------------------------
async function confluenceApi(method, path, body, flags) {
  var auth = getAuth();
  if (!auth) {
    printErr(JSON.stringify({ error: true, code: 2, message: 'Not authenticated. Run: confluence auth login --site SITE --email EMAIL --token TOKEN' }));
    exitProcess(2);
  }

  var env = globalThis.env || {};
  var baseUrl = env.CONFLUENCE_BASE_URL || ('https://' + auth.site + '/wiki/api/v2');
  var url = baseUrl + path;

  var headers = {
    'Authorization': 'Basic ' + base64Encode(auth.email + ':' + auth.token),
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  if (flags && flags.verbose) {
    printErr(JSON.stringify({ debug: true, request: { method: method, url: url, headers: { 'Authorization': 'Basic ***' } } }));
  }

  var fetchOpts = { method: method, headers: headers };
  if (body) fetchOpts.body = JSON.stringify(body);

  var resp;
  try {
    resp = await fetch(url, fetchOpts);
  } catch (e) {
    var errorMessage = String(e);
    var errorBody = {
      error: true,
      code: 1,
      message: 'Network request failed: ' + errorMessage,
      url: url
    };
    if (errorMessage.indexOf('Illegal response') !== -1) {
      errorBody.hint = 'The WasmEdge QuickJS fetch runtime rejected the HTTP response before JSON parsing completed.';
    }
    printErr(JSON.stringify(errorBody));
    exitProcess(1);
  }
  var data;
  try {
    data = await resp.json();
  } catch (e) {
    data = {};
  }

  if (resp.status === 401 || resp.status === 403) {
    printErr(JSON.stringify({ error: true, code: 2, message: data.message || 'Authentication failed (HTTP ' + resp.status + ')', status: resp.status }));
    exitProcess(2);
  }
  if (resp.status === 404) {
    printErr(JSON.stringify({ error: true, code: 3, message: 'Not found' + (data.message ? ': ' + data.message : ''), status: 404 }));
    exitProcess(3);
  }
  if (resp.status >= 400) {
    printErr(JSON.stringify({ error: true, code: 1, message: data.message || 'API error (HTTP ' + resp.status + ')', status: resp.status }));
    exitProcess(1);
  }

  return data;
}

// Raw fetch for binary responses (attachment download)
async function confluenceRawFetch(method, path, flags) {
  var auth = getAuth();
  if (!auth) {
    printErr(JSON.stringify({ error: true, code: 2, message: 'Not authenticated.' }));
    exitProcess(2);
  }

  var env = globalThis.env || {};
  var baseUrl = env.CONFLUENCE_BASE_URL || ('https://' + auth.site + '/wiki/api/v2');
  var url = baseUrl + path;

  var headers = {
    'Authorization': 'Basic ' + base64Encode(auth.email + ':' + auth.token),
    'Accept': '*/*'
  };

  if (flags && flags.verbose) {
    printErr(JSON.stringify({ debug: true, request: { method: method, url: url } }));
  }

  var resp;
  try {
    resp = await fetch(url, { method: method, headers: headers });
  } catch (e) {
    var errorMessage = String(e);
    var errorBody = {
      error: true,
      code: 1,
      message: 'Network request failed: ' + errorMessage,
      url: url
    };
    if (errorMessage.indexOf('Illegal response') !== -1) {
      errorBody.hint = 'The WasmEdge QuickJS fetch runtime rejected the HTTP response before the body could be read.';
    }
    printErr(JSON.stringify(errorBody));
    exitProcess(1);
  }

  if (resp.status === 401 || resp.status === 403) {
    printErr(JSON.stringify({ error: true, code: 2, message: 'Authentication failed' }));
    exitProcess(2);
  }
  if (resp.status === 404) {
    printErr(JSON.stringify({ error: true, code: 3, message: 'Not found' }));
    exitProcess(3);
  }
  if (resp.status >= 400) {
    printErr(JSON.stringify({ error: true, code: 1, message: 'API error (HTTP ' + resp.status + ')' }));
    exitProcess(1);
  }

  return resp;
}

// ---------------------------------------------------------------------------
// Pagination Handler
// ---------------------------------------------------------------------------
async function paginatedFetch(path, flags) {
  if (!flags.all) {
    var sep = path.indexOf('?') !== -1 ? '&' : '?';
    var url = flags.limit ? path + sep + 'limit=' + flags.limit : path;
    return await confluenceApi('GET', url, null, flags);
  }

  // --all: follow cursor links
  var basePath = path.indexOf('?') !== -1 ? path.split('?')[0] : path;
  var allResults = [];
  var nextPath = flags.limit ? path + (path.indexOf('?') !== -1 ? '&' : '?') + 'limit=' + flags.limit : path;
  while (nextPath) {
    // If nextPath is relative (starts with ?), prepend the base path
    if (nextPath.charAt(0) === '?') {
      nextPath = basePath + nextPath;
    }
    var data = await confluenceApi('GET', nextPath, null, flags);
    allResults = allResults.concat(data.results || []);
    nextPath = (data._links && data._links.next) ? data._links.next : null;
  }
  return { results: allResults, _meta: { total_fetched: allResults.length }, _links: {} };
}

// ---------------------------------------------------------------------------
// Help System
// ---------------------------------------------------------------------------
function showHelp(resource, action) {
  if (!resource) {
    print('USAGE');
    print('  confluence <command> [options]');
    print('');
    print('COMMANDS');
    print('  auth          Manage authentication');
    print('  page          Manage pages');
    print('  space         Manage spaces');
    print('  search        Search content');
    print('  comment       Manage comments');
    print('  label         Manage labels');
    print('  version       Manage page versions');
    print('  attachment    Manage attachments');
    print('  property      Manage content properties');
    print('  bulk          Bulk operations');
    print('');
    print('GLOBAL FLAGS');
    print('  --help, -h    Show help');
    print('  --pretty      Pretty-print JSON output');
    print('  --verbose     Show debug information');
    print('  --all         Fetch all pages (pagination)');
    print('  --limit N     Limit results per page');
    return;
  }

  switch (resource) {
    case 'auth':
      print('USAGE');
      print('  confluence auth <action> [options]');
      print('');
      print('ACTIONS');
      print('  login         Log in to Confluence');
      print('  logout        Log out and remove stored credentials');
      print('  status        Show current authentication status');
      print('');
      print('FLAGS');
      print('  --site SITE     Confluence site (e.g. mysite.atlassian.net)');
      print('  --email EMAIL   User email address');
      print('  --token TOKEN   API token');
      print('');
      print('EXAMPLES');
      print('  confluence auth login --site mysite.atlassian.net --email user@example.com --token ATATT...');
      print('  confluence auth status');
      print('  confluence auth logout');
      break;

    case 'page':
      if (action === 'create') {
        print('USAGE');
        print('  confluence page create [options]');
        print('');
        print('FLAGS');
        print('  --space-id ID     Space ID (required)');
        print('  --title TITLE     Page title (required)');
        print('  --body BODY       Page body (HTML)');
        print('  --parent-id PID   Parent page ID');
        print('');
        print('EXAMPLES');
        print('  confluence page create --space-id 456 --title "My Page"');
        print('  confluence page create --space-id 456 --title "Child" --parent-id 123 --body "<p>Hello</p>"');
        return;
      }
      if (action === 'update') {
        print('USAGE');
        print('  confluence page update <id> [options]');
        print('');
        print('FLAGS');
        print('  --title TITLE     New page title');
        print('  --version N       Version number (required)');
        print('  --body BODY       New page body (HTML)');
        print('');
        print('EXAMPLES');
        print('  confluence page update 123 --title "Updated Title" --version 4');
        return;
      }
      print('USAGE');
      print('  confluence page <action> [options]');
      print('');
      print('ACTIONS');
      print('  list          List pages');
      print('  get           Get a page by ID');
      print('  create        Create a new page');
      print('  update        Update a page');
      print('  delete        Delete a page');
      print('  tree          Get page tree (children)');
      print('');
      print('FLAGS');
      print('  --space-id ID        Filter by space ID');
      print('  --body-format FMT    Body format (storage, atlas_doc_format)');
      print('  --title TITLE        Page title');
      print('  --body BODY          Page body content');
      print('  --parent-id PID      Parent page ID');
      print('  --version N          Version number');
      print('  --purge              Permanently delete');
      print('  --depth N            Tree depth');
      print('');
      print('EXAMPLES');
      print('  confluence page list --space-id 456');
      print('  confluence page get 123');
      print('  confluence page create --space-id 456 --title "New Page"');
      print('  confluence page delete 123 --purge');
      print('  confluence page tree 123 --depth 2');
      break;

    case 'space':
      print('USAGE');
      print('  confluence space <action> [options]');
      print('');
      print('ACTIONS');
      print('  list          List spaces');
      print('  get           Get a space by ID');
      print('');
      print('FLAGS');
      print('  --limit N     Limit results');
      print('');
      print('EXAMPLES');
      print('  confluence space list');
      print('  confluence space get 456');
      break;

    case 'search':
      print('USAGE');
      print('  confluence search [options]');
      print('');
      print('FLAGS');
      print('  --cql QUERY   CQL search query (required)');
      print('  --limit N     Limit results');
      print('  --all         Fetch all results');
      print('');
      print('EXAMPLES');
      print('  confluence search --cql "type=page AND space=DEV"');
      print('  confluence search --cql "title~test" --limit 10');
      break;

    case 'comment':
      print('USAGE');
      print('  confluence comment <action> [options]');
      print('');
      print('ACTIONS');
      print('  list          List comments on a page');
      print('  create        Create a comment');
      print('  delete        Delete a comment');
      print('');
      print('FLAGS');
      print('  --page-id ID  Page ID (required for list/create)');
      print('  --body BODY   Comment body (required for create)');
      print('');
      print('EXAMPLES');
      print('  confluence comment list --page-id 123');
      print('  confluence comment create --page-id 123 --body "<p>Nice!</p>"');
      print('  confluence comment delete 555');
      break;

    case 'label':
      print('USAGE');
      print('  confluence label <action> [options]');
      print('');
      print('ACTIONS');
      print('  list          List labels on a page');
      print('  add           Add labels to a page');
      print('  remove        Remove a label from a page');
      print('');
      print('FLAGS');
      print('  --page-id ID    Page ID (required)');
      print('  --label NAMES   Label name(s), comma-separated');
      print('');
      print('EXAMPLES');
      print('  confluence label list --page-id 123');
      print('  confluence label add --page-id 123 --label "reviewed,approved"');
      print('  confluence label remove --page-id 123 --label "draft"');
      break;

    case 'version':
      print('USAGE');
      print('  confluence version <action> [options]');
      print('');
      print('ACTIONS');
      print('  list          List page versions');
      print('  get           Get a specific version');
      print('');
      print('FLAGS');
      print('  --version N   Version number (required for get)');
      print('');
      print('EXAMPLES');
      print('  confluence version list 123');
      print('  confluence version get 123 --version 2');
      break;

    case 'attachment':
      print('USAGE');
      print('  confluence attachment <action> [options]');
      print('');
      print('ACTIONS');
      print('  list          List attachments on a page');
      print('  upload        Upload an attachment');
      print('  download      Download an attachment');
      print('');
      print('FLAGS');
      print('  --page-id ID    Page ID (required for list/upload)');
      print('  --file PATH     File path to upload');
      print('  --output PATH   Output file path for download');
      print('');
      print('EXAMPLES');
      print('  confluence attachment list --page-id 123');
      print('  confluence attachment upload --page-id 123 --file /data/doc.pdf');
      print('  confluence attachment download ATT1 --output /data/out.pdf');
      break;

    case 'property':
      print('USAGE');
      print('  confluence property <action> [options]');
      print('');
      print('ACTIONS');
      print('  list          List content properties');
      print('  get           Get a content property');
      print('  set           Set a content property');
      print('');
      print('FLAGS');
      print('  --page-id ID    Page ID (required)');
      print('  --key KEY       Property key');
      print('  --value JSON    Property value (JSON string)');
      print('');
      print('EXAMPLES');
      print('  confluence property list --page-id 123');
      print('  confluence property get --page-id 123 --key "metadata"');
      print('  confluence property set --page-id 123 --key "status" --value \'{"done":true}\'');
      break;

    case 'bulk':
      print('USAGE');
      print('  confluence bulk <action> [options]');
      print('');
      print('ACTIONS');
      print('  export        Export all pages in a space');
      print('  import        Import pages into a space');
      print('');
      print('FLAGS');
      print('  --space-id ID       Space ID (required)');
      print('  --output-dir PATH   Output directory for export');
      print('  --input-dir PATH    Input directory for import');
      print('');
      print('EXAMPLES');
      print('  confluence bulk export --space-id 456 --output-dir /data/backup');
      print('  confluence bulk import --space-id 456 --input-dir /data/backup');
      break;

    default:
      showHelp();
  }
}

// ---------------------------------------------------------------------------
// Resource Handlers: Page
// ---------------------------------------------------------------------------
async function handlePage(parsed) {
  var action = parsed.action;
  var flags = parsed.flags;
  var positional = parsed.positional;

  if (flags.help || !action) {
    showHelp('page', action);
    exitProcess(0);
  }

  switch (action) {
    case 'list': {
      var path = '/pages';
      if (flags['space-id']) path += '?space-id=' + encodeURIComponent(flags['space-id']);
      var data = await paginatedFetch(path, flags);
      cliOutput(data, flags);
      break;
    }
    case 'get': {
      if (positional.length < 1) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required argument: <page-id>' }));
        exitProcess(4);
      }
      var pageId = positional[0];
      var path = '/pages/' + encodeURIComponent(pageId);
      if (flags['body-format']) path += '?body-format=' + encodeURIComponent(flags['body-format']);
      var data = await confluenceApi('GET', path, null, flags);
      cliOutput(data, flags);
      break;
    }
    case 'create': {
      if (!flags['space-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --space-id' }));
        exitProcess(4);
      }
      if (!flags.title) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --title' }));
        exitProcess(4);
      }
      var body = { spaceId: flags['space-id'], title: flags.title, status: 'current' };
      if (flags.body) body.body = { storage: { value: flags.body, representation: 'storage' } };
      if (flags['parent-id']) body.parentId = flags['parent-id'];
      var data = await confluenceApi('POST', '/pages', body, flags);
      cliOutput(data, flags);
      break;
    }
    case 'update': {
      if (positional.length < 1) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required argument: <page-id>' }));
        exitProcess(4);
      }
      if (!flags.version) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --version' }));
        exitProcess(4);
      }
      var pageId = positional[0];
      var body = { id: pageId, status: 'current', version: { number: parseInt(flags.version, 10), message: '' } };
      if (flags.title) body.title = flags.title;
      if (flags.body) body.body = { storage: { value: flags.body, representation: 'storage' } };
      var data = await confluenceApi('PUT', '/pages/' + encodeURIComponent(pageId), body, flags);
      cliOutput(data, flags);
      break;
    }
    case 'delete': {
      if (positional.length < 1) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required argument: <page-id>' }));
        exitProcess(4);
      }
      var pageId = positional[0];
      var path = '/pages/' + encodeURIComponent(pageId);
      if (flags.purge) path += '?purge=true';
      var data = await confluenceApi('DELETE', path, null, flags);
      if (flags.purge) data.purged = true;
      cliOutput(data, flags);
      break;
    }
    case 'tree': {
      if (positional.length < 1) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required argument: <page-id>' }));
        exitProcess(4);
      }
      var pageId = positional[0];
      var depth = flags.depth ? parseInt(flags.depth, 10) : 1;

      async function fetchChildren(pid, d) {
        if (d <= 0) return [];
        var data = await confluenceApi('GET', '/pages/' + encodeURIComponent(pid) + '/children', null, flags);
        var children = data.results || [];
        for (var i = 0; i < children.length; i++) {
          children[i].children = await fetchChildren(children[i].id, d - 1);
        }
        return children;
      }

      var children = await fetchChildren(pageId, depth);
      cliOutput({ id: pageId, children: children }, flags);
      break;
    }
    default: {
      if (flags.help) { showHelp('page', action); exitProcess(0); }
      printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown page action: ' + action + '. Valid: list, get, create, update, delete, tree' }));
      exitProcess(1);
    }
  }
}

// ---------------------------------------------------------------------------
// Resource Handlers: Space
// ---------------------------------------------------------------------------
async function handleSpace(parsed) {
  var action = parsed.action;
  var flags = parsed.flags;
  var positional = parsed.positional;

  if (flags.help || !action) {
    showHelp('space');
    exitProcess(0);
  }

  switch (action) {
    case 'list': {
      var data = await paginatedFetch('/spaces', flags);
      cliOutput(data, flags);
      break;
    }
    case 'get': {
      if (positional.length < 1) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required argument: <space-id>' }));
        exitProcess(4);
      }
      var data = await confluenceApi('GET', '/spaces/' + encodeURIComponent(positional[0]), null, flags);
      cliOutput(data, flags);
      break;
    }
    default:
      printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown space action: ' + action }));
      exitProcess(1);
  }
}

// ---------------------------------------------------------------------------
// Resource Handlers: Search
// ---------------------------------------------------------------------------
async function handleSearch(parsed) {
  var flags = parsed.flags;

  if (flags.help) {
    showHelp('search');
    exitProcess(0);
  }

  if (!flags.cql) {
    printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --cql' }));
    exitProcess(4);
  }

  var path = '/search?cql=' + encodeURIComponent(flags.cql);
  var data = await paginatedFetch(path, flags);
  cliOutput(data, flags);
}

// ---------------------------------------------------------------------------
// Resource Handlers: Comment
// ---------------------------------------------------------------------------
async function handleComment(parsed) {
  var action = parsed.action;
  var flags = parsed.flags;
  var positional = parsed.positional;

  if (flags.help || !action) {
    showHelp('comment');
    exitProcess(0);
  }

  switch (action) {
    case 'list': {
      if (!flags['page-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --page-id' }));
        exitProcess(4);
      }
      var data = await paginatedFetch('/pages/' + encodeURIComponent(flags['page-id']) + '/footer-comments', flags);
      cliOutput(data, flags);
      break;
    }
    case 'create': {
      if (!flags['page-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --page-id' }));
        exitProcess(4);
      }
      if (!flags.body) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --body' }));
        exitProcess(4);
      }
      var body = { pageId: flags['page-id'], body: { storage: { value: flags.body } } };
      var data = await confluenceApi('POST', '/footer-comments', body, flags);
      cliOutput(data, flags);
      break;
    }
    case 'delete': {
      if (positional.length < 1) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required argument: <comment-id>' }));
        exitProcess(4);
      }
      var data = await confluenceApi('DELETE', '/footer-comments/' + encodeURIComponent(positional[0]), null, flags);
      cliOutput(data, flags);
      break;
    }
    default:
      printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown comment action: ' + action }));
      exitProcess(1);
  }
}

// ---------------------------------------------------------------------------
// Resource Handlers: Label
// ---------------------------------------------------------------------------
async function handleLabel(parsed) {
  var action = parsed.action;
  var flags = parsed.flags;

  if (flags.help || !action) {
    showHelp('label');
    exitProcess(0);
  }

  switch (action) {
    case 'list': {
      if (!flags['page-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --page-id' }));
        exitProcess(4);
      }
      var data = await confluenceApi('GET', '/pages/' + encodeURIComponent(flags['page-id']) + '/labels', null, flags);
      cliOutput(data, flags);
      break;
    }
    case 'add': {
      if (!flags['page-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --page-id' }));
        exitProcess(4);
      }
      if (!flags.label) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --label' }));
        exitProcess(4);
      }
      var labelNames = flags.label.split(',').map(function(l) { return l.trim(); });
      var body = labelNames.map(function(name) { return { name: name, prefix: 'global' }; });
      var data = await confluenceApi('POST', '/pages/' + encodeURIComponent(flags['page-id']) + '/labels', body, flags);
      cliOutput(data, flags);
      break;
    }
    case 'remove': {
      if (!flags['page-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --page-id' }));
        exitProcess(4);
      }
      if (!flags.label) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --label' }));
        exitProcess(4);
      }
      var data = await confluenceApi('DELETE', '/pages/' + encodeURIComponent(flags['page-id']) + '/labels/' + encodeURIComponent(flags.label), null, flags);
      cliOutput(data, flags);
      break;
    }
    default:
      printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown label action: ' + action }));
      exitProcess(1);
  }
}

// ---------------------------------------------------------------------------
// Resource Handlers: Version
// ---------------------------------------------------------------------------
async function handleVersion(parsed) {
  var action = parsed.action;
  var flags = parsed.flags;
  var positional = parsed.positional;

  if (flags.help || !action) {
    showHelp('version');
    exitProcess(0);
  }

  switch (action) {
    case 'list': {
      if (positional.length < 1) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required argument: <page-id>' }));
        exitProcess(4);
      }
      var data = await paginatedFetch('/pages/' + encodeURIComponent(positional[0]) + '/versions', flags);
      cliOutput(data, flags);
      break;
    }
    case 'get': {
      if (positional.length < 1) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required argument: <page-id>' }));
        exitProcess(4);
      }
      if (!flags.version) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --version' }));
        exitProcess(4);
      }
      var data = await confluenceApi('GET', '/pages/' + encodeURIComponent(positional[0]) + '/versions/' + encodeURIComponent(flags.version), null, flags);
      cliOutput(data, flags);
      break;
    }
    default:
      printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown version action: ' + action }));
      exitProcess(1);
  }
}

// ---------------------------------------------------------------------------
// Resource Handlers: Attachment
// ---------------------------------------------------------------------------
async function handleAttachment(parsed) {
  var action = parsed.action;
  var flags = parsed.flags;
  var positional = parsed.positional;

  if (flags.help || !action) {
    showHelp('attachment');
    exitProcess(0);
  }

  switch (action) {
    case 'list': {
      if (!flags['page-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --page-id' }));
        exitProcess(4);
      }
      var data = await paginatedFetch('/pages/' + encodeURIComponent(flags['page-id']) + '/attachments', flags);
      cliOutput(data, flags);
      break;
    }
    case 'upload': {
      if (!flags['page-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --page-id' }));
        exitProcess(4);
      }
      if (!flags.file) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --file' }));
        exitProcess(4);
      }
      var filePath = flags.file;
      var fileContent;
      try {
        fileContent = fs.readFileSync(filePath, 'utf-8');
      } catch (e) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Cannot read file: ' + filePath }));
        exitProcess(4);
      }
      var fileName = filePath.split('/').pop();
      var body = { title: fileName, mediaType: 'application/octet-stream', fileSize: fileContent.length };
      var data = await confluenceApi('POST', '/pages/' + encodeURIComponent(flags['page-id']) + '/attachments', body, flags);
      cliOutput(data, flags);
      break;
    }
    case 'download': {
      if (positional.length < 1) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required argument: <attachment-id>' }));
        exitProcess(4);
      }
      if (!flags.output) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --output' }));
        exitProcess(4);
      }
      var resp = await confluenceRawFetch('GET', '/attachments/' + encodeURIComponent(positional[0]) + '/download', flags);
      var content = await resp.text();
      fs.writeFileSync(flags.output, content);
      cliOutput({ ok: true, path: flags.output, size: content.length }, flags);
      break;
    }
    default:
      printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown attachment action: ' + action }));
      exitProcess(1);
  }
}

// ---------------------------------------------------------------------------
// Resource Handlers: Property
// ---------------------------------------------------------------------------
async function handleProperty(parsed) {
  var action = parsed.action;
  var flags = parsed.flags;

  if (flags.help || !action) {
    showHelp('property');
    exitProcess(0);
  }

  switch (action) {
    case 'list': {
      if (!flags['page-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --page-id' }));
        exitProcess(4);
      }
      var data = await confluenceApi('GET', '/pages/' + encodeURIComponent(flags['page-id']) + '/properties', null, flags);
      cliOutput(data, flags);
      break;
    }
    case 'get': {
      if (!flags['page-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --page-id' }));
        exitProcess(4);
      }
      if (!flags.key) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --key' }));
        exitProcess(4);
      }
      var data = await confluenceApi('GET', '/pages/' + encodeURIComponent(flags['page-id']) + '/properties?key=' + encodeURIComponent(flags.key), null, flags);
      cliOutput(data, flags);
      break;
    }
    case 'set': {
      if (!flags['page-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --page-id' }));
        exitProcess(4);
      }
      if (!flags.key) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --key' }));
        exitProcess(4);
      }
      if (!flags.value) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --value' }));
        exitProcess(4);
      }
      var val;
      try { val = JSON.parse(flags.value); } catch (e) { val = flags.value; }
      var body = { key: flags.key, value: val };
      var data = await confluenceApi('POST', '/pages/' + encodeURIComponent(flags['page-id']) + '/properties', body, flags);
      cliOutput(data, flags);
      break;
    }
    default:
      printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown property action: ' + action }));
      exitProcess(1);
  }
}

// ---------------------------------------------------------------------------
// Resource Handlers: Bulk
// ---------------------------------------------------------------------------
async function handleBulk(parsed) {
  var action = parsed.action;
  var flags = parsed.flags;

  if (flags.help || !action) {
    showHelp('bulk');
    exitProcess(0);
  }

  switch (action) {
    case 'export': {
      if (!flags['space-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --space-id' }));
        exitProcess(4);
      }
      if (!flags['output-dir']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --output-dir' }));
        exitProcess(4);
      }
      var data = await confluenceApi('GET', '/spaces/' + encodeURIComponent(flags['space-id']) + '/pages', null, flags);
      var pages = data.results || [];
      try { fs.mkdirSync(flags['output-dir']); } catch (e) { /* may already exist */ }
      var exported = 0;
      for (var i = 0; i < pages.length; i++) {
        var page = pages[i];
        var fileName = flags['output-dir'] + '/' + page.id + '.json';
        fs.writeFileSync(fileName, JSON.stringify(page, null, 2));
        exported++;
      }
      cliOutput({ ok: true, exported: exported, spaceId: flags['space-id'], outputDir: flags['output-dir'] }, flags);
      break;
    }
    case 'import': {
      if (!flags['space-id']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --space-id' }));
        exitProcess(4);
      }
      if (!flags['input-dir']) {
        printErr(JSON.stringify({ error: true, code: 4, message: 'Missing required flag: --input-dir' }));
        exitProcess(4);
      }
      var files;
      try { files = fs.readdirSync(flags['input-dir']); } catch (e) { files = []; }
      var imported = 0;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (typeof file === 'object' && file.name) file = file.name;
        if (String(file).indexOf('.json') === -1) continue;
        try {
          var content = fs.readFileSync(flags['input-dir'] + '/' + file, 'utf-8');
          var pageData = JSON.parse(content);
          var body = { spaceId: flags['space-id'], title: pageData.title || file, status: 'current' };
          if (pageData.body) body.body = pageData.body;
          await confluenceApi('POST', '/pages', body, flags);
          imported++;
        } catch (e) {
          // Skip files that can't be imported
        }
      }
      cliOutput({ ok: true, imported: imported, spaceId: flags['space-id'], inputDir: flags['input-dir'] }, flags);
      break;
    }
    default:
      printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown bulk action: ' + action }));
      exitProcess(1);
  }
}

// ---------------------------------------------------------------------------
// Test Runner (MODE=test)
// ---------------------------------------------------------------------------
function runTests() {
  var testName = (globalThis.args || [])[1];
  if (testName === 'test-base64') {
    runBase64Tests();
  } else {
    print('Unknown test: ' + testName);
    print('Available tests: test-base64');
    exitProcess(1);
  }
}

function runBase64Tests() {
  var tests = [
    ['', ''],
    ['Hello', 'SGVsbG8='],
    ['Hello, World!', 'SGVsbG8sIFdvcmxkIQ=='],
    ['user@example.com:ATATT3xtoken', 'dXNlckBleGFtcGxlLmNvbTpBVEFUVDN4dG9rZW4='],
    ['A', 'QQ=='],
    ['AB', 'QUI=']
  ];
  var pass = 0;
  var fail = 0;
  for (var i = 0; i < tests.length; i++) {
    var input = tests[i][0];
    var expected = tests[i][1];
    var actual = base64Encode(input);
    if (actual === expected) {
      print('ok ' + (i + 1) + ' - base64("' + input + '")');
      pass++;
    } else {
      print('not ok ' + (i + 1) + ' - expected ' + expected + ', got ' + actual);
      fail++;
    }
  }
  print('# Tests: ' + tests.length + ', Pass: ' + pass + ', Fail: ' + fail);
  exitProcess(fail > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Main CLI Entry Point
// ---------------------------------------------------------------------------
async function runCli() {
  var parsed = parseArgs();

  // Handle --help at top level
  if (parsed.flags.help && !parsed.resource) {
    showHelp();
    exitProcess(0);
  }

  // No resource → show top-level help
  if (!parsed.resource) {
    showHelp();
    exitProcess(0);
  }

  // Check for unknown resource
  if (KNOWN_RESOURCES.indexOf(parsed.resource) === -1) {
    printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown command: ' + parsed.resource }));
    exitProcess(1);
  }

  // Handle resource-level --help
  if (parsed.flags.help) {
    showHelp(parsed.resource, parsed.action);
    exitProcess(0);
  }

  // Route to resource handler
  switch (parsed.resource) {
    case 'auth': await handleAuth(parsed); break;
    case 'page': await handlePage(parsed); break;
    case 'space': await handleSpace(parsed); break;
    case 'search': await handleSearch(parsed); break;
    case 'comment': await handleComment(parsed); break;
    case 'label': await handleLabel(parsed); break;
    case 'version': await handleVersion(parsed); break;
    case 'attachment': await handleAttachment(parsed); break;
    case 'property': await handleProperty(parsed); break;
    case 'bulk': await handleBulk(parsed); break;
    default:
      printErr(JSON.stringify({ error: true, code: 1, message: 'Unknown command: ' + parsed.resource }));
      exitProcess(1);
  }

  exitProcess(0);
}

// ---------------------------------------------------------------------------
// Mode Dispatch
// ---------------------------------------------------------------------------
var MODE = (globalThis.env && globalThis.env.MODE) || 'gui';
var PORT = 8080;

if (MODE === 'cli') {
  runCli();
} else if (MODE === 'test') {
  runTests();
} else if (MODE === 'gui') {
  createServer(function(req, resp) {
    try {
      route(req, resp);
    } catch (e) {
      print('Error handling request:', e);
      try { json(resp, 500, { error: String(e) }); } catch (_) {}
    }
  }).listen(PORT, function() {
    print('WasmEdge Demo server listening on port ' + PORT);
    print('Open http://localhost:' + PORT + ' in your browser');
  });
} else {
  printErr(JSON.stringify({ error: true, code: 1, message: 'Invalid MODE: ' + MODE + '. Valid: gui, cli, test' }));
  exitProcess(1);
}
