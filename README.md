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
- A default browser GUI with four tabs: Runtime, HTTP, Files, and Server
- A second `MODE=cli` execution path for the bundled Confluence toolkit
- Outbound HTTP requests initiated from inside the WASM container
- File access through a host-mapped `/data` directory plus an internal filesystem demo
- Runtime inspection, request logging, and echo/debug endpoints exposed through the web UI

## Comparison: WasmEdge vs `npm` / `npx` vs Native Apps

This demo uses WasmEdge because it changes the delivery model, not because it is automatically better than every Node.js or native approach.

The current published WasmEdge artifact for this repository is about `2.0 MiB` when pulled locally, and the application logic itself is a single `31 KiB` `server.js`. That is a real advantage for this particular demo, but it should be compared against the right alternatives and with the right caveats.

| Aspect | WasmEdge / OCI app | Node.js + `npm` / `npx` app | Native OS app |
| --- | --- | --- | --- |
| Delivery unit | OCI/WASM image from a registry such as GHCR | Package from the npm registry | Platform-specific binary, archive, or installer |
| Measured example in this repo | **~2.0 MiB** image (scratch base)<br>**31 KiB** app payload (`server.js`) | Not measured here; assumes preinstalled Node.js runtime | Not measured here; usually requires separate assets per OS/arch |
| Target prerequisites | Podman with Wasm support, or a WasmEdge CLI install | A working Node.js + npm environment | Per-platform install or download flow |
| Version management | OCI tags and digests make pinning and rollback explicit | Semver is familiar, but `npx` still relies on npm resolution behavior unless versions are pinned carefully | Usually handled through release assets, installers, and app-specific update channels |
| Language story | WasmEdge docs highlight app development in Rust, JavaScript, Go, and Python, plus standard Wasm compiled from languages such as C/C++, Swift, AssemblyScript, and Kotlin | Excellent for JavaScript and TypeScript; other languages usually enter through bindings or external processes | Depends on the chosen native stack, but often becomes more platform-specific over time |
| Isolation model | Sandboxed runtime with explicit WASI preopens and controlled host access | Runs with normal Node.js process permissions unless separately sandboxed | Usually has the deepest OS access and the broadest integration surface |
| GUI model | Browser-delivered UI; no native windowing toolkit required | Often CLI-first, browser-based, or Electron-style | Best fit for real native windows, menus, system integrations, and device access |

### Why the WasmEdge route is attractive here

- The published artifact is genuinely small for this repo's current shape: about `2.0 MiB` pulled, with a single-file app payload.
- OCI registries give you explicit pull, pin, promote, and rollback mechanics by tag or digest instead of relying on informal install instructions.
- The delivery model is not locked to JavaScript alone. WasmEdge's docs position it as a runtime for Wasm apps developed in multiple languages, which matters if the app boundary grows beyond a JS-only tool.
- The sandbox and WASI preopen model make the host access story more explicit than "run a process and let it see the machine."

### Where `npm` / `npx` is still better

- If your audience already has Node.js installed, `npx some-tool@version` is often lower-friction than asking them to install Podman or WasmEdge.
- The JavaScript tooling ecosystem, package discovery, debugging ergonomics, and developer familiarity are all better in the Node.js path today.
- If the product is fundamentally just a JS CLI, WasmEdge can add runtime novelty without enough user-facing payoff.

### Where native apps are still better

- A browser-served GUI is not the same thing as a native desktop application. Native apps still win when you need real windows, file pickers, menus, notifications, tray behavior, or deeper device and OS integration.
- Native distribution can feel more direct to end users when you ship a polished installer, even though the release pipeline is usually heavier.
- If the product depends on first-class desktop UX or tight platform integration, forcing it into a browser + container model is the wrong trade.

### Critical takeaways

- WasmEdge does not magically remove version-management problems, but OCI registries do give you cleaner and more reproducible deployment units than ad hoc binary sharing or loosely specified install steps.
- WasmEdge is compelling here because the app is small, browser-based, and easy to describe as a pinned OCI/WASM artifact.
- That does not mean it replaces `npm` / `npx` for everyday JS tooling, or native apps for serious desktop integration.

## Published GHCR Image

- `ghcr.io/atjsh/wasmedge-demo:latest`
- `ghcr.io/atjsh/wasmedge-demo:sha-<git-sha>`

## Quick Start

This is the easiest way to try the demo for the first time.

### Requirements

- Podman installed and ready to run Wasm workloads
- a writable `demo-data/` directory for the file I/O tab
- browser access to `http://localhost:8080`

On macOS and Windows, Podman usually means a working `podman machine`. See the [Podman installation guide](https://podman.io/docs/installation) and the [Podman Desktop Wasm guide](https://podman-desktop.io/blog/wasm-workloads-on-macos-and-windows-with-podman).

### 1. Prepare local data directory

```bash
mkdir -p demo-data
```

### 2. Run the published GHCR image with Podman

```bash
podman run --rm --platform=wasi/wasm -p 8080:8080 \
  -v "$(pwd)/demo-data:/data" \
  ghcr.io/atjsh/wasmedge-demo:latest
```

### 3. Open the GUI

```text
http://localhost:8080
```

### 4. Stop the demo

```text
Press Ctrl+C in the terminal where `podman run` is running.
```

## Web UI Reference

The default `MODE=gui` experience is a browser UI with four tabs backed by the same `server.js` process.

### Runtime Info

- Shows runtime details such as `os.type()`, `os.platform()`, `os.arch()`, `os.homedir()`, and `os.tmpdir()`
- Shows process data including uptime and argv
- Explains the purpose of the codesign-free packaging model and the WASI sandbox boundary
- Try it:
  Open the first tab after startup and verify the runtime details load correctly.

### HTTP Demo

- Sends outbound requests from inside the WASM container
- Supports ad hoc GET, POST, and PUT requests
- Includes quick example buttons for `httpbin.org`
- Displays response payloads and simple request timing
- Try it:
  Use one of the built-in example buttons in the HTTP tab and inspect the returned payload.
- Known limitation:
  Outbound hostname-based `fetch()` under Podman Wasm is still under investigation. The same request may work under direct WasmEdge CLI but fail under Podman Wasm with hostname resolution errors.

### File I/O Demo

- Lists files in the host-mapped `/data` directory
- Creates, reads, updates, and deletes files from the browser
- Shows file metadata and demonstrates the WASI preopen model
- Includes an internal filesystem demo to contrast host-mounted `/data` with files written inside the WASM runtime
- Try it:
  Create a file in the Files tab, refresh the list, and verify the file appears inside `./demo-data` on the host.

### Server Info

- Displays recent request history captured by the server
- Reports uptime and request counters
- Includes an echo endpoint for request/response testing
- Lets you refresh live server status from the UI
- Try it:
  Visit the Server tab, send an echo request, and refresh the server info panel.

## CLI Mode — Confluence Toolkit

The application also supports `MODE=cli`, which skips the HTTP server and runs as a command-line toolkit for the Atlassian Confluence REST API.

### Podman CLI Requirements

- Podman with Wasm support
- `./demo-data` mounted to `/data`
- valid Confluence credentials

Prepare local storage once:

```bash
mkdir -p demo-data
```

### Copy-paste CLI commands

#### Auth login

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence auth login \
  --site mysite.atlassian.net \
  --email me@example.com \
  --token ATATT3x...
```

#### Auth status

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence auth status --pretty
```

#### Space list

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence space list --pretty
```

#### Page list

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence page list --space-id 12345 --pretty
```

#### Page get

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence page get 12345 --pretty
```

#### Page create

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence page create \
  --space-id 12345 \
  --title "Demo Page" \
  --body "<p>Hello from WasmEdge Demo</p>" \
  --body-format storage \
  --pretty
```

#### Page update

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence page update 12345 \
  --title "Updated Demo Page" \
  --body "<p>Updated body</p>" \
  --body-format storage \
  --version 2 \
  --pretty
```

#### Search

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence search --cql 'type=page order by lastmodified desc' --limit 10 --pretty
```

#### Comment list

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence comment list --page-id 12345 --pretty
```

#### Comment create

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence comment create \
  --page-id 12345 \
  --body "Hello from WasmEdge Demo" \
  --pretty
```

#### Label list

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence label list --page-id 12345 --pretty
```

#### Label add

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence label add --page-id 12345 --label demo --pretty
```

#### Attachment list

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence attachment list --page-id 12345 --pretty
```

#### Attachment upload

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence attachment upload --page-id 12345 --file /data/example.txt --pretty
```

#### Attachment download

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence attachment download ATTACHMENT_ID --output /data/downloaded.bin --pretty
```

#### Bulk export

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence bulk export --space-id 12345 --output-dir /data/backup --pretty
```

#### Bulk import

```bash
podman run --rm --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence bulk import --space-id 12345 --input-dir /data/backup --pretty
```

### CLI Feature Summary

- `auth`: store credentials, inspect the active login source, and clear stored auth
- `page`: list, get, create, update, delete, and traverse child trees
- `space`: list spaces or retrieve a single space by ID
- `search`: run CQL queries with pagination controls
- `comment`: list, create, and delete footer comments on a page
- `label`: list, add, and remove page labels
- `version`: list page versions or fetch a specific version
- `attachment`: list, upload, and download attachments through `/data`
- `property`: list, read, and set content properties
- `bulk`: export page JSON files to `/data` or import page JSON files from `/data`
- Global flags: `--pretty`, `--verbose`, `--limit`, `--all`, `--help`

### Command Reference

| Resource | Actions | Description | Key Flags |
| --- | --- | --- | --- |
| `auth` | `login`, `logout`, `status` | Manage stored and environment-based authentication | `--site`, `--email`, `--token` |
| `page` | `list`, `get`, `create`, `update`, `delete`, `tree` | Manage pages and page hierarchies | `--space-id`, `--title`, `--body`, `--parent-id`, `--version`, `--purge`, `--depth`, `--body-format` |
| `space` | `list`, `get` | Browse spaces and inspect one space by ID | `--limit`, `--all` |
| `search` | default action | Search Confluence content with CQL | `--cql`, `--limit`, `--all` |
| `comment` | `list`, `create`, `delete` | Manage footer comments on a page | `--page-id`, `--body`, `--limit` |
| `label` | `list`, `add`, `remove` | Manage page labels | `--page-id`, `--label` |
| `version` | `list`, `get` | Inspect page version history | positional page ID, `--version`, `--limit` |
| `attachment` | `list`, `upload`, `download` | Manage attachments via `/data` paths | `--page-id`, `--file`, `--output`, `--limit` |
| `property` | `list`, `get`, `set` | Inspect and update content properties | `--page-id`, `--key`, `--value` |
| `bulk` | `export`, `import` | Export/import page JSON files in bulk | `--space-id`, `--output-dir`, `--input-dir` |

Pass `--help` to any command to see its full flag list.

## Advanced Workflows

### Local Podman build and run scripts

Use this when you want to build the image locally instead of running the published GHCR image.

```bash
./scripts/podman-build.sh
./scripts/podman-run.sh
```

Optional overrides:

```bash
IMAGE_NAME=localhost/wasmedge-demo:dev ./scripts/podman-build.sh
HOST_PORT=18080 DATA_DIR="$HOME/wasmedge-demo-data" ./scripts/podman-run.sh
ENABLE_AOT=1 IMAGE_NAME=localhost/wasmedge-demo:aot ./scripts/podman-build.sh
```

`ENABLE_AOT=1` is a local opt-in for same-machine performance testing only. The published portable image keeps AOT disabled by default because AOT output is host-specific.

The helper scripts target macOS/Linux shells. On Windows, run the equivalent raw Podman commands instead:

```bash
podman build --platform=wasi/wasm -t localhost/wasmedge-demo:latest .
podman run --rm --platform=wasi/wasm -p 8080:8080 \
  -v "<host-demo-data-path>:/data" \
  localhost/wasmedge-demo:latest
```

### WasmEdge CLI direct run

Use this when you want a non-container path or when you need to compare Podman runtime behavior with direct WasmEdge CLI behavior.

```bash
curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash
source "$HOME/.wasmedge/env"
./scripts/sync-wasmedge-quickjs.sh
mkdir -p demo-data
wasmedge --dir .:. --dir /data:./demo-data wasmedge_quickjs.wasm server.js
```

### HTTPS / TLS

The generated runtime is pinned to `second-state/wasmedge-quickjs` `v0.6.1-alpha`, which includes the newer TLS-enabled networking stack. Public HTTPS endpoints such as Atlassian Cloud should work directly in local WasmEdge CLI runs and in the container image when the runtime supports them.

For custom or self-signed certificate chains, point `SSL_CERT_FILE` at a PEM bundle that is mounted into the runtime:

```bash
wasmedge --dir .:. --dir /data:./demo-data --dir /etc/ssl:/etc/ssl:readonly \
  --env MODE=cli \
  --env SSL_CERT_FILE=/etc/ssl/certs/custom-ca.pem \
  wasmedge_quickjs.wasm -- server.js confluence space list --pretty
```

### Filesystem Model

The File I/O tab is intentionally limited to `/data`. When using Podman, `/data` is backed by `./demo-data`. When using the WasmEdge CLI directly, expose the same directory with `--dir /data:./demo-data`.

The application does not browse arbitrary host paths. Access is limited to the directories explicitly preopened through WASI.

### Architecture

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

### Building the Image

```bash
./scripts/podman-build.sh
```

Equivalent raw command:

```bash
podman build --platform=wasi/wasm -t localhost/wasmedge-demo:latest .
```

The Dockerfile follows a compact multi-stage flow:

1. install WasmEdge in the build stage
2. run `./scripts/sync-wasmedge-quickjs.sh` using the pinned URLs and SHA256 values in `./wasmedge-quickjs.lock`
3. optionally apply AOT compilation with `wasmedgec` only when `ENABLE_AOT=1`
4. copy the runtime, `server.js`, `modules/`, and a CA bundle into a `scratch` image

This repository does not commit generated runtime assets. The same bootstrap script is used for local WasmEdge CLI setup and for Podman builds.

Published GHCR images are built with `ENABLE_AOT=0` so `latest` remains portable across runtimes. Use `ENABLE_AOT=1` only for local builds on the same machine that will run the image.

## Other Documentation

### CI/CD Demo

The repository includes a GitHub Actions workflow at `.github/workflows/publish-ghcr.yml`.

- Triggered by `workflow_dispatch`
- Triggered automatically on every push to `main`
- Publishes an immutable `sha-<git-sha>` tag first
- Sets the GHCR package visibility to `public`
- Verifies anonymous access to the SHA-tagged manifest from GHCR
- Promotes `latest` only after verification succeeds

GitHub-hosted Linux runners cannot directly `docker pull` `wasi/wasm` images and report `operating system is not supported`, so the CI check uses anonymous manifest inspection instead of a runtime pull.

### Manual fallback publish

If you want to publish from a local shell instead of GitHub Actions, check your GitHub CLI auth first. If it lacks `write:packages`, refresh it:

```bash
gh auth refresh -s write:packages
```

Then login and publish:

```bash
echo "$(gh auth token)" | docker login ghcr.io -u atjsh --password-stdin

SHA_TAG="sha-$(git rev-parse --short=12 HEAD)"

docker buildx build --platform wasi/wasm \
  -t "ghcr.io/atjsh/wasmedge-demo:${SHA_TAG}" \
  --push .

gh api --method PATCH user/packages/container/wasmedge-demo -f visibility=public

docker buildx imagetools create \
  --tag ghcr.io/atjsh/wasmedge-demo:latest \
  "ghcr.io/atjsh/wasmedge-demo:${SHA_TAG}"
```

### Notes and Limitations

- The GUI is delivered through the browser; this project does not create native OS windows.
- The primary registry target in this repository is GHCR: `ghcr.io/atjsh/wasmedge-demo`.
- Public GHCR visibility still needs to be verified after the first publish because package access permissions and package visibility are handled separately.
- Outbound HTTPS behavior depends on the WasmEdge runtime environment and may require additional TLS support.
- `demo-data/` is intentionally excluded from version control because it is used as mutable host-mounted storage.

### Technology References

- [WasmEdge documentation](https://wasmedge.org/docs/)
- [WasmEdge QuickJS](https://github.com/second-state/wasmedge-quickjs)
- [Podman installation](https://podman.io/docs/installation)
- [Wasm workloads on Podman Desktop](https://podman-desktop.io/blog/wasm-workloads-on-macos-and-windows-with-podman)

## License

MIT
