**English** | [한국어](README-ko.md)

# WasmEdge Demo — Codesign-Free GUI Web App

A fully functional web GUI that runs entirely inside a **WasmEdge WASM container**. No native binaries, no code signing, no OS-specific GUI frameworks — just `docker run` and open your browser.

## What Is This?

This is a **demo/showcase application** proving that a rich web GUI can be:

1. **Written in JavaScript** — using WasmEdge's QuickJS runtime (Node.js-compatible)
2. **Packaged as a ~2MB OCI image** — `FROM scratch`, containing only the WASM runtime + JS app
3. **Distributed via Docker Hub** — standard `docker pull` / `docker run`
4. **Run without code signing** — no native binary = no codesign required
5. **Fully sandboxed** — WASM provides memory safety and capability-based security

## Quick Start

### Option 1: Docker Desktop

> **Prerequisites**: Docker Desktop with [Wasm support enabled](https://docs.docker.com/desktop/features/wasm/)

```bash
# Create a directory for the file I/O demo
mkdir -p demo-data

# Run the container
docker run -dp 8080:8080 \
  --rm \
  --runtime=io.containerd.wasmedge.v1 \
  --platform=wasi/wasm \
  -v $(pwd)/demo-data:/data \
  wasmedge-demo:latest
```

Open **http://localhost:8080** in your browser.

### Option 2: Docker Compose

```bash
mkdir -p demo-data
docker compose up
```

### Option 3: WasmEdge CLI (Development)

```bash
# Install WasmEdge
curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash
source $HOME/.wasmedge/env

# Download the QuickJS runtime
curl -OL https://github.com/second-state/wasmedge-quickjs/releases/download/v0.5.0-alpha/wasmedge_quickjs.wasm
curl -OL https://github.com/second-state/wasmedge-quickjs/releases/download/v0.5.0-alpha/modules.zip
unzip modules.zip

# Create demo data directory
mkdir -p demo-data

# Run
wasmedge --dir .:. --dir ./demo-data:/data wasmedge_quickjs.wasm server.js
```

Open **http://localhost:8080** in your browser.

## Demo Features

The web UI has **4 interactive tabs**:

### 🏠 Runtime Info
- WasmEdge environment details (`os.type()` → "wasmedge", `os.platform()` → "wasi", `os.arch()` → "wasm")
- Process information (argv, env, uptime)
- Explains the codesign-free concept

### 🌐 HTTP Demo
- Make outbound HTTP requests from inside the WASM container
- Supports GET, POST, PUT methods
- Custom URL input with JSON response viewer
- Latency measurement for each request

### 📁 File I/O Demo
- Browse files in a host-mapped directory (`/data`)
- Create, read, edit, and delete files from the web UI
- View file metadata (size, timestamps)
- Demonstrates WASI directory preopens (`--dir` flag)

### 🔌 Server Info
- Live request log (all HTTP requests the server has handled)
- Server uptime and total request count
- Echo endpoint for testing

## Architecture

```
Browser (http://localhost:8080)
    │
    ▼
┌─────────────────────────────────┐
│ WasmEdge Runtime                │
│  └─ wasmedge_quickjs.wasm       │
│     └─ server.js (HTTP server)  │
│        ├── Inline HTML/CSS/JS   │
│        ├── /api/* endpoints     │
│        └── modules/ (Node.js)   │
├─────────────────────────────────┤
│ WASI Preopens                   │
│  --dir .:. (internal FS)        │
│  --dir ./demo-data:/data (host) │
└─────────────────────────────────┘
```

- **~2MB total image size** (vs 300MB+ for Node.js)
- **Millisecond startup** (vs seconds for Linux containers)
- **Cross-platform** — runs on any OS/CPU Docker supports

## Building

```bash
docker buildx build --platform wasi/wasm -t wasmedge-demo .
```

## Technology

- [WasmEdge](https://wasmedge.org/) — CNCF sandbox project, lightweight WASM runtime
- [WasmEdge QuickJS](https://github.com/second-state/wasmedge-quickjs) — JavaScript engine for WasmEdge
- [Docker + WASM](https://docs.docker.com/desktop/features/wasm/) — OCI-compliant WASM containers

## License

MIT
