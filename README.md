**English** | [한국어](README-ko.md)

# WasmEdge Demo — Codesign-Free GUI Web App

## Overview

This repository contains a reference demo of a browser-based GUI served from inside a WasmEdge WebAssembly container. The application runs on `wasmedge_quickjs.wasm`, exposes an HTTP server from `server.js`, and renders its interface in the browser with inline HTML, CSS, and JavaScript.

The project is meant to demonstrate a "codesign-free" delivery model:

- no native desktop executable
- no OS-specific GUI toolkit
- no platform-specific code-signing or notarization flow
- a standard OCI/WASM runtime launch process

In practice, the user runs a container and opens `http://localhost:8080`. The browser becomes the GUI surface, while WasmEdge and WASI provide the runtime and sandbox boundary.

## What the Demo Covers

- A single-file JavaScript HTTP server running on WasmEdge QuickJS
- A browser UI delivered as regular HTML/CSS/JS instead of a native windowing framework
- Outbound HTTP requests initiated from inside the WASM container
- File access through a host-mapped `/data` directory
- Runtime inspection and request logging endpoints exposed through the web UI

## Runtime Requirements

- Docker Desktop with [Wasm support](https://docs.docker.com/desktop/features/wasm/) enabled, or a local WasmEdge CLI installation
- A writable `demo-data/` directory if you want to use the file I/O tab
- Network access for the outbound HTTP demo

## Running the Demo

### Option 1: Docker Compose

This is the simplest local workflow because the compose file builds the image, maps `./demo-data` to `/data`, and publishes port `8080`.

```bash
mkdir -p demo-data
docker compose up --build
```

Then open `http://localhost:8080`.

### Option 2: Docker Desktop / `docker run`

Build the image locally first:

```bash
docker buildx build --platform wasi/wasm -t wasmedge-demo:latest .
```

If your `buildx` driver does not automatically load images into the local Docker image store, add `--load`.

Run the container:

```bash
mkdir -p demo-data

docker run --rm -p 8080:8080 \
  --runtime=io.containerd.wasmedge.v1 \
  --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  wasmedge-demo:latest
```

Then open `http://localhost:8080`.

### Option 3: WasmEdge CLI

```bash
# Install WasmEdge
curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash
source "$HOME/.wasmedge/env"

# Download the QuickJS runtime and compatibility modules
curl -OL https://github.com/second-state/wasmedge-quickjs/releases/download/v0.5.0-alpha/wasmedge_quickjs.wasm
curl -OL https://github.com/second-state/wasmedge-quickjs/releases/download/v0.5.0-alpha/modules.zip
unzip modules.zip

# Create the host directory used by the file I/O demo
mkdir -p demo-data

# Run the app
wasmedge --dir .:. --dir ./demo-data:/data wasmedge_quickjs.wasm server.js
```

Then open `http://localhost:8080`.

## Web UI Reference

### Runtime Info

- Reports runtime details such as `os.type()`, `os.platform()`, and `os.arch()`
- Shows process data including uptime and selected environment information
- Explains the purpose of the codesign-free packaging model

### HTTP Demo

- Sends outbound requests from inside the WASM container
- Supports GET, POST, and PUT
- Displays response payloads and simple request timing

### File I/O Demo

- Lists files in the host-mapped `/data` directory
- Creates, reads, updates, and deletes files from the browser
- Shows file metadata and demonstrates the WASI preopen model

### Server Info

- Displays recent request history captured by the server
- Reports uptime and request counters
- Includes an echo endpoint for request/response testing

## Filesystem Model

The File I/O tab is intentionally limited to `/data`. When using Docker Compose or `docker run`, `/data` is backed by `./demo-data`. When using the WasmEdge CLI directly, expose the same directory with `--dir ./demo-data:/data`.

The application does not browse arbitrary host paths. Access is limited to the directories explicitly preopened through WASI.

## Architecture

```text
Browser (http://localhost:8080)
    |
    v
server.js
    |
    v
wasmedge_quickjs.wasm
    |
    +-- inline HTML/CSS/JS
    +-- /api/runtime
    +-- /api/fetch
    +-- /api/files/*
    +-- /api/server-info
    |
    v
WASI preopens
    +-- .             (project files inside the runtime)
    +-- /data         (host-mapped demo-data directory)
```

## Building the Image

```bash
docker buildx build --platform wasi/wasm -t wasmedge-demo:latest .
```

The Dockerfile follows a compact multi-stage flow:

1. install WasmEdge in the build stage
2. download `wasmedge_quickjs.wasm` and `modules.zip`
3. apply AOT compilation with `wasmedgec`
4. copy only the runtime, `server.js`, and `modules/` into a `scratch` image

## Notes and Limitations

- The GUI is delivered through the browser; this project does not create native OS windows.
- This repository documents local build-and-run workflows. If you want remote distribution, push the resulting OCI image to Docker Hub or another OCI registry after building it.
- Outbound HTTPS behavior depends on the WasmEdge runtime environment and may require additional TLS support.
- `demo-data/` is intentionally excluded from version control because it is used as mutable host-mounted storage.

## Technology References

- [WasmEdge documentation](https://wasmedge.org/docs/)
- [WasmEdge QuickJS](https://github.com/second-state/wasmedge-quickjs)
- [Docker Desktop Wasm support](https://docs.docker.com/desktop/features/wasm/)

## License

MIT
