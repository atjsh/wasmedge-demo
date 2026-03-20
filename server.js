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

function collectBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
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
    json(resp, 503, { error: 'Host directory not mounted. Run with: --dir /data:/host/path' });
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
      Requires: <code>--dir /data:/host/path</code>
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
  // WasmEdge QuickJS may expose lowercase method names.
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

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = 8080;

createServer((req, resp) => {
  try {
    route(req, resp);
  } catch (e) {
    print('Error handling request:', e);
    try { json(resp, 500, { error: String(e) }); } catch (_) {}
  }
}).listen(PORT, () => {
  print('WasmEdge Demo server listening on port ' + PORT);
  print('Open http://localhost:' + PORT + ' in your browser');
});
