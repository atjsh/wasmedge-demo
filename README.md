**English** | [한국어](README-ko.md)

# WasmEdge Demo — Codesign-Free GUI Web App

## Overview

This repository contains a reference demo of a browser-based GUI served from inside a WasmEdge WebAssembly container. The application runs on `wasmedge_quickjs.wasm`, exposes an HTTP server from `server.js`, and renders its interface in the browser with inline HTML, CSS, and JavaScript.

It also includes a [critical comparison](#comparison-wasmedge-vs-npm--npx-vs-native-apps) between WasmEdge, Node.js, and native apps.

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

## Comparison: WasmEdge vs `npm` / `npx` vs Native Apps

This demo uses WasmEdge because it changes the delivery model, not because it is automatically better than every Node.js or native approach.

The current published WasmEdge artifact for this repository is about `2.0 MiB` when pulled locally, and the application logic itself is a single `31 KiB` `server.js`. That is a real advantage for this particular demo, but it should be compared against the right alternatives and with the right caveats.

| Aspect | WasmEdge / OCI app | Node.js + `npm` / `npx` app | Native OS app |
| --- | --- | --- | --- |
| Delivery unit | OCI/WASM image from a registry such as GHCR | Package from the npm registry | Platform-specific binary, archive, or installer |
| Measured example in this repo | **~2.0 MiB** image (scratch base)<br>**31 KiB** app payload (`server.js`) | Not measured here; assumes preinstalled Node.js runtime | Not measured here; usually requires separate assets per OS/arch |
| Target prerequisites | Docker Desktop with Wasm support, or a WasmEdge CLI install | A working Node.js + npm environment | Per-platform install or download flow |
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

- If your audience already has Node.js installed, `npx some-tool@version` is often lower-friction than asking them to enable Docker Wasm support or install WasmEdge.
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

## Running the Demo

### Option 1: Run the published GHCR image

Use this when you want to run the published image directly instead of building locally.

```bash
mkdir -p demo-data

docker run --rm -p 8080:8080 \
  --runtime=io.containerd.wasmedge.v1 \
  --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  ghcr.io/atjsh/wasmedge-demo:latest
```

Then open `http://localhost:8080`.

### Option 2: Docker Compose

This is the simplest local workflow when you want the repository to build the image for you.

```bash
mkdir -p demo-data
docker compose up --build
```

Then open `http://localhost:8080`.

### Option 3: Local Docker build / `docker run`

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

### Option 4: WasmEdge CLI

```bash
# Install WasmEdge
curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash
source "$HOME/.wasmedge/env"

# Bootstrap the pinned runtime assets
./scripts/sync-wasmedge-quickjs.sh
#
# The script downloads the pinned v0.6.1-alpha wasm release and source tarball
# listed in ./wasmedge-quickjs.lock, verifies both SHA256 values, extracts the
# matching modules/ tree from the upstream tag, applies this repo's small
# modules/http.js patch, and regenerates modules.zip.
#
# Generated runtime assets are intentionally gitignored. This repo uses a
# bootstrap script instead of a git submodule because it only needs a generated
# runtime subset plus one local patch.

# Create the host directory used by the file I/O demo
mkdir -p demo-data

# Run the app
wasmedge --dir .:. --dir /data:./demo-data wasmedge_quickjs.wasm server.js
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

## CLI Mode — Confluence Toolkit

The application supports a second operating mode controlled by the `MODE` environment variable. When `MODE=cli`, the HTTP server is not started. Instead, the process runs as a command-line toolkit for the Atlassian Confluence REST API and exits when the command completes.

```bash
wasmedge --dir .:. --dir /data:./demo-data \
  --env MODE=cli \
  wasmedge_quickjs.wasm -- server.js confluence <resource> <action> [flags]
```

The default mode (`MODE=gui`) starts the HTTP server on port 8080 exactly as described in the sections above. You do not need to set `MODE` at all for the existing browser-based demo.

### Quick Start

1. Store your Confluence credentials:

```bash
wasmedge --dir .:. --dir /data:./demo-data \
  --env MODE=cli \
  wasmedge_quickjs.wasm -- server.js confluence auth login \
  --site mysite.atlassian.net \
  --email me@example.com \
  --token ATATT3x...
```

Credentials are saved to `/data/auth.json` (host path `./demo-data/auth.json`).

2. Run your first query:

```bash
wasmedge --dir .:. --dir /data:./demo-data \
  --env MODE=cli \
  wasmedge_quickjs.wasm -- server.js confluence space list --pretty
```

### HTTPS / TLS

The generated runtime is pinned to `second-state/wasmedge-quickjs` `v0.6.1-alpha`, which includes the newer TLS-enabled networking stack. Public HTTPS endpoints such as Atlassian Cloud should work directly in local WasmEdge CLI runs and in the Docker image.

For custom or self-signed certificate chains, point `SSL_CERT_FILE` at a PEM bundle that is mounted into the runtime:

```bash
wasmedge --dir .:. --dir /data:./demo-data --dir /etc/ssl:/etc/ssl:readonly \
  --env MODE=cli \
  --env SSL_CERT_FILE=/etc/ssl/certs/custom-ca.pem \
  wasmedge_quickjs.wasm -- server.js confluence space list --pretty
```

### Command Reference

All commands follow the pattern `confluence <resource> <action> [flags]`.

| Resource | Action | Description | Key Flags |
| --- | --- | --- | --- |
| `auth` | `login` | Store credentials to `/data/auth.json` | `--site`, `--email`, `--token` |
| `page` | `list` | List pages in a space | `--space-id`, `--limit`, `--all` |
| `page` | `get` | Retrieve a single page | positional page ID, `--pretty` |
| `page` | `create` | Create a new page | `--space-id`, `--title`, `--body` |
| `space` | `list` | List spaces | `--limit`, `--all`, `--pretty` |
| `search` | *(default)* | Search content with CQL | `--cql`, `--limit`, `--all` |
| `comment` | `list` | List comments on a page | `--page-id`, `--limit` |
| `label` | `add` | Add labels to a page | `--page-id`, `--label` (comma-separated) |
| `version` | `list` | List page versions | positional page ID, `--limit` |
| `attachment` | `list` | List attachments on a page | `--page-id`, `--limit` |
| `property` | `list` | List content properties | positional page ID |
| `bulk` | `export` | Export multiple pages | `--space-id`, `--format` |

Pass `--help` to any command to see its full flag list.

### Authentication

Credentials can be provided in two ways. Environment variables take precedence when both are present.

**Environment variables** — useful for CI pipelines and one-off commands:

```bash
wasmedge --dir .:. --dir /data:./demo-data \
  --env MODE=cli \
  --env CONFLUENCE_SITE=mysite.atlassian.net \
  --env CONFLUENCE_EMAIL=me@example.com \
  --env CONFLUENCE_TOKEN=ATATT3x... \
  wasmedge_quickjs.wasm -- server.js confluence page list --space-id 12345
```

**Stored credentials** — saved once with `auth login` and reused across commands:

```bash
wasmedge --dir .:. --dir /data:./demo-data \
  --env MODE=cli \
  wasmedge_quickjs.wasm -- server.js confluence auth login \
  --site mysite.atlassian.net \
  --email me@example.com \
  --token ATATT3x...
```

The file is written to `/data/auth.json` inside the container, which maps to `./demo-data/auth.json` on the host.

### Output & Error Handling

All successful output is written to **stdout** as JSON. The default format is compact (single line). Add `--pretty` to any command for indented output.

Errors are written to **stderr** as structured JSON objects with `error` and `message` fields.

| Exit Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | General / unexpected error |
| `2` | Authentication error (missing or invalid credentials) |
| `3` | Not found (page, space, or resource does not exist) |
| `4` | Validation error (missing required flags or bad input) |

Use `--verbose` on any command to print debug information (request URLs, response status codes) to stderr.

Pagination is supported on list-style commands with `--limit N` to set the page size and `--all` to automatically follow pagination and return every result.

### Docker CLI Mode

You can run CLI commands through Docker Compose or `docker run` by overriding the command and passing `MODE=cli`.

```bash
docker run --rm \
  --runtime=io.containerd.wasmedge.v1 \
  --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence space list --pretty
```

Or add a dedicated service to `docker-compose.yml`:

```yaml
services:
  confluence-cli:
    image: ghcr.io/atjsh/wasmedge-demo:latest
    runtime: io.containerd.wasmedge.v1
    platform: wasi/wasm
    volumes:
      - ./demo-data:/data
    environment:
      MODE: cli
      CONFLUENCE_SITE: mysite.atlassian.net
      CONFLUENCE_EMAIL: me@example.com
      CONFLUENCE_TOKEN: ${CONFLUENCE_TOKEN}
    command: ["confluence", "space", "list", "--pretty"]
```

Then run with `docker compose run --rm confluence-cli`.

The container image bundles `/etc/ssl/certs/ca-certificates.crt` and sets `SSL_CERT_FILE` automatically, so public HTTPS endpoints do not need extra mounts. Override `SSL_CERT_FILE` only when you need a custom CA bundle.

## Filesystem Model

The File I/O tab is intentionally limited to `/data`. When using Docker Compose or `docker run`, `/data` is backed by `./demo-data`. When using the WasmEdge CLI directly, expose the same directory with `--dir /data:./demo-data`.

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
2. run `./scripts/sync-wasmedge-quickjs.sh` using the pinned URLs and SHA256 values in `./wasmedge-quickjs.lock`
3. apply AOT compilation with `wasmedgec`
4. copy the runtime, `server.js`, `modules/`, and a CA bundle into a `scratch` image

This repository does not commit generated runtime assets. The same bootstrap script is used for local WasmEdge CLI setup and for Docker builds.

## CI/CD Demo

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

## Notes and Limitations

- The GUI is delivered through the browser; this project does not create native OS windows.
- The primary registry target in this repository is GHCR: `ghcr.io/atjsh/wasmedge-demo`.
- Public GHCR visibility still needs to be verified after the first publish because package access permissions and package visibility are handled separately.
- Outbound HTTPS behavior depends on the WasmEdge runtime environment and may require additional TLS support.
- `demo-data/` is intentionally excluded from version control because it is used as mutable host-mounted storage.

## Technology References

- [WasmEdge documentation](https://wasmedge.org/docs/)
- [WasmEdge QuickJS](https://github.com/second-state/wasmedge-quickjs)
- [Docker Desktop Wasm support](https://docs.docker.com/desktop/features/wasm/)

## License

MIT
