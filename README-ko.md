[English](README.md) | **한국어**

# WasmEdge 데모 — 코드서명 불필요 GUI 웹 앱

## 개요

이 저장소는 WasmEdge WebAssembly 컨테이너 내부에서 제공되는 브라우저 기반 GUI 레퍼런스 데모입니다. 애플리케이션은 `wasmedge_quickjs.wasm` 위에서 `server.js`를 실행해 HTTP 서버를 구동하고, 사용자 인터페이스는 인라인 HTML, CSS, JavaScript로 브라우저에 렌더링됩니다.

또한 WasmEdge, Node.js, 네이티브 앱 간의 [비판적 비교(Comparison)](#비교-wasmedge-vs-npm--npx-vs-네이티브-앱) 섹션도 포함하고 있습니다.

이 프로젝트가 보여주려는 "코드서명 불필요" 배포 모델은 다음과 같습니다.

- 네이티브 데스크톱 실행 파일이 없음
- OS별 GUI 툴킷에 의존하지 않음
- 플랫폼별 코드서명 또는 노터라이제이션 절차가 필요 없음
- 표준 OCI/WASM 런타임으로 실행 가능함

실제로는 사용자가 컨테이너를 실행한 뒤 `http://localhost:8080`을 여는 방식으로 사용합니다. 즉, 브라우저가 GUI 표면이 되고 WasmEdge와 WASI가 런타임 및 샌드박스 경계를 담당합니다.

## 데모 범위

- WasmEdge QuickJS에서 동작하는 단일 JavaScript HTTP 서버
- 네이티브 윈도우 프레임워크 대신 일반 HTML/CSS/JS로 제공되는 브라우저 UI
- WASM 컨테이너 내부에서 수행되는 외부 HTTP 요청
- 호스트에 매핑된 `/data` 디렉토리를 통한 파일 접근
- 웹 UI에서 확인할 수 있는 런타임 점검 및 요청 로그 API

## 실행 요구사항

- [Wasm 지원](https://docs.docker.com/desktop/features/wasm/)을 활성화한 Docker Desktop 또는 로컬 WasmEdge CLI 설치
- 파일 I/O 탭을 사용하려면 쓰기 가능한 `demo-data/` 디렉토리 필요
- 외부 HTTP 데모를 위한 네트워크 연결

## 비교: WasmEdge vs `npm` / `npx` vs 네이티브 앱

이 데모가 WasmEdge를 사용하는 이유는 배포 모델을 바꾸기 위해서이지, Node.js 방식이나 네이티브 앱보다 무조건 우월하다고 주장하기 위해서가 아닙니다.

현재 이 저장소의 공개 WasmEdge 아티팩트는 로컬에서 pull했을 때 약 `2.0 MiB`이고, 애플리케이션 로직 자체는 단일 `31 KiB` `server.js` 파일입니다. 이 저장소의 현재 구조에서는 분명한 장점이지만, 어떤 대안과 비교하느냐에 따라 해석은 달라져야 합니다.

| 항목 | WasmEdge / OCI 앱 | Node.js + `npm` / `npx` 앱 | 네이티브 OS 앱 |
| --- | --- | --- | --- |
| 배포 단위 | GHCR 같은 레지스트리에서 가져오는 OCI/WASM 이미지 | npm 레지스트리에서 가져오는 패키지 | OS별 바이너리, 압축 파일, 또는 설치 프로그램 |
| 실측 사례 (본 저장소 기준) | **~2.0 MiB** 이미지 (`scratch` 기반)<br>**31 KiB** 앱 로직 (`server.js`) | 측정하지 않음 (Node.js 런타임 선행 설치 필요) | 측정하지 않음 (보통 OS/아키텍처별 별도 자산 필요) |
| 실행 환경 요구사항 | Wasm 지원 Docker Desktop 또는 WasmEdge CLI 설치 | 동작하는 Node.js + npm 환경 | 플랫폼별 설치 또는 다운로드 절차 |
| 버전 관리 | OCI 태그와 digest로 pinning, promotion, rollback을 명시적으로 다루기 쉬움 | semver는 익숙하지만, `npx` 역시 버전을 명확히 pin하지 않으면 npm 해석 결과에 의존함 | 대체로 release asset, installer, 앱별 업데이트 채널에 의존 |
| 언어 확장성 | WasmEdge 문서는 Rust, JavaScript, Go, Python 기반 앱 개발 경로를 강조하며, C/C++, Swift, AssemblyScript, Kotlin 등에서 컴파일한 표준 Wasm도 실행 가능하다고 설명함 | JavaScript/TypeScript에는 매우 강하지만, 다른 언어는 보통 바인딩이나 외부 프로세스로 연결됨 | 선택한 네이티브 스택에 따라 다르지만, 시간이 갈수록 플랫폼 종속성이 커지는 경우가 많음 |
| 격리 모델 | WASI preopen을 통한 명시적 호스트 접근과 샌드박스 실행 | 별도 샌드박싱을 하지 않으면 일반 Node.js 프로세스 권한으로 실행 | 보통 가장 깊은 OS 접근 권한과 통합 면을 가짐 |
| GUI 모델 | 브라우저에 UI를 제공하며 네이티브 윈도우 툴킷이 필요 없음 | 대체로 CLI 중심이거나 브라우저/Electron 계열 | 실제 네이티브 창, 메뉴, 시스템 통합, 장치 접근에 가장 적합 |

### 이 저장소에서 WasmEdge 경로가 매력적인 이유

- 현재 저장소 형태에서는 공개 아티팩트가 실제로 작습니다. pull 기준 약 `2.0 MiB`이고, 앱 payload도 사실상 단일 파일입니다.
- OCI 레지스트리를 사용하면 태그나 digest 단위로 pull, pin, promote, rollback을 다루기 쉬워져서 설치 문서에만 의존하는 배포보다 재현성이 좋아집니다.
- 이 배포 모델은 JavaScript 전용으로 닫혀 있지 않습니다. WasmEdge 문서는 여러 언어 기반의 Wasm 앱 경로를 강조하므로, 향후 앱 경계가 커질 때 설계 선택지가 넓습니다.
- 샌드박스와 WASI preopen 모델 덕분에 "그냥 프로세스를 실행하고 머신 전체를 보게 하는 방식"보다 호스트 접근 범위를 더 명시적으로 설명할 수 있습니다.

### 그래도 `npm` / `npx`가 더 나은 경우

- 대상 사용자가 이미 Node.js를 갖고 있다면, `npx some-tool@version`은 Docker Wasm 지원을 켜거나 WasmEdge를 설치하게 하는 것보다 훨씬 마찰이 적을 수 있습니다.
- JavaScript 생태계, 패키지 탐색성, 디버깅 경험, 개발자 친숙도는 현재도 Node.js 경로가 더 강합니다.
- 제품이 본질적으로 JS CLI라면, WasmEdge는 사용자 이득보다 런타임의 낯섦만 늘릴 수 있습니다.

### 네이티브 앱이 더 나은 경우

- 브라우저 기반 GUI는 네이티브 데스크톱 앱과 동일하지 않습니다. 실제 창 관리, 파일 선택기, 메뉴, 알림, 트레이 동작, 장치 접근, 깊은 OS 통합이 필요하면 네이티브 앱이 여전히 우위입니다.
- 완성도 높은 설치 프로그램을 제공할 수 있다면, 네이티브 배포가 최종 사용자에게 더 직접적으로 느껴질 수 있습니다. 다만 그만큼 릴리스 파이프라인은 보통 더 무거워집니다.
- 제품의 핵심 가치가 데스크톱 UX나 플랫폼 통합에 있다면, 이를 브라우저 + 컨테이너 모델로 억지로 맞추는 것은 좋은 선택이 아닙니다.

### 핵심 정리

- WasmEdge가 버전 관리 문제를 마법처럼 없애 주는 것은 아니지만, OCI 레지스트리는 즉흥적인 바이너리 배포나 느슨한 설치 절차보다 더 명시적이고 재현 가능한 배포 단위를 제공합니다.
- 이 저장소에서 WasmEdge가 설득력 있는 이유는 앱이 작고, 브라우저 기반이며, pin 가능한 OCI/WASM 아티팩트로 설명하기 쉽기 때문입니다.
- 그렇다고 해서 일상적인 JS 툴링에서 `npm` / `npx`를 대체하거나, 진짜 데스크톱 통합이 필요한 앱에서 네이티브를 대체하는 것은 아닙니다.

## 공개된 GHCR 이미지

- `ghcr.io/atjsh/wasmedge-demo:latest`
- `ghcr.io/atjsh/wasmedge-demo:sha-<git-sha>`

## 실행 방법

### 옵션 1: 공개된 GHCR 이미지 실행

로컬 빌드 없이 공개된 이미지를 바로 실행하려면 이 방법을 사용합니다.

```bash
mkdir -p demo-data

docker run --rm -p 8080:8080 \
  --runtime=io.containerd.wasmedge.v1 \
  --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  ghcr.io/atjsh/wasmedge-demo:latest
```

그다음 `http://localhost:8080`을 엽니다.

### 옵션 2: Docker Compose

저장소에서 이미지를 직접 빌드하게 하려면 이 방법이 가장 간단합니다.

```bash
mkdir -p demo-data
docker compose up --build
```

그다음 `http://localhost:8080`을 엽니다.

### 옵션 3: 로컬 Docker 빌드 / `docker run`

먼저 이미지를 로컬에서 빌드합니다.

```bash
docker buildx build --platform wasi/wasm -t wasmedge-demo:latest .
```

사용 중인 `buildx` 드라이버가 이미지를 로컬 Docker 이미지 저장소에 자동 적재하지 않는다면 `--load`를 추가합니다.

그다음 컨테이너를 실행합니다.

```bash
mkdir -p demo-data

docker run --rm -p 8080:8080 \
  --runtime=io.containerd.wasmedge.v1 \
  --platform=wasi/wasm \
  -v "$(pwd)/demo-data:/data" \
  wasmedge-demo:latest
```

그다음 `http://localhost:8080`을 엽니다.

### 옵션 4: WasmEdge CLI

```bash
# WasmEdge 설치
curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash
source "$HOME/.wasmedge/env"

# 고정된 런타임 자산 생성
./scripts/sync-wasmedge-quickjs.sh
#
# 이 스크립트는 ./wasmedge-quickjs.lock 에 고정된 v0.6.1-alpha wasm
# 릴리스와 소스 tarball 을 내려받고, 두 SHA256 값을 검증한 뒤,
# 업스트림 태그의 modules/ 트리를 추출하고 이 저장소의 작은
# modules/http.js 패치를 적용한 다음 modules.zip 을 다시 생성합니다.
#
# 생성된 런타임 자산은 의도적으로 gitignore 처리합니다. 이 저장소는
# 필요한 것이 "생성된 런타임 일부 + 로컬 패치 1개"이기 때문에,
# git submodule 대신 bootstrap 스크립트를 사용합니다.

# 파일 I/O 데모에 사용할 호스트 디렉토리 생성
mkdir -p demo-data

# 앱 실행
wasmedge --dir .:. --dir /data:./demo-data wasmedge_quickjs.wasm server.js
```

그다음 `http://localhost:8080`을 엽니다.

## Web UI 참고

### 런타임 정보

- `os.type()`, `os.platform()`, `os.arch()` 같은 런타임 정보를 표시합니다.
- 업타임과 일부 환경 정보 등 프로세스 데이터를 보여줍니다.
- 코드서명 불필요 패키징 모델의 목적을 설명합니다.

### HTTP 데모

- WASM 컨테이너 내부에서 외부 요청을 전송합니다.
- GET, POST, PUT 메서드를 지원합니다.
- 응답 본문과 단순 요청 시간을 표시합니다.

### 파일 I/O 데모

- 호스트에 매핑된 `/data` 디렉토리의 파일을 나열합니다.
- 브라우저에서 파일 생성, 읽기, 수정, 삭제를 수행합니다.
- 파일 메타데이터를 표시하고 WASI preopen 모델을 보여줍니다.

### 서버 정보

- 서버가 수집한 최근 요청 기록을 표시합니다.
- 업타임과 요청 카운터를 보고합니다.
- 요청/응답 테스트용 echo 엔드포인트를 포함합니다.

## CLI 모드 — Confluence 툴킷

이 애플리케이션은 두 가지 모드로 실행할 수 있습니다.

- **`MODE=gui`** (기본값): 기존 HTTP 서버 GUI
- **`MODE=cli`**: Atlassian Confluence REST API CLI 툴킷

`MODE=cli`로 실행하면 HTTP 서버를 시작하지 않고, 명령줄에서 Confluence 페이지, 스페이스, 검색 등을 직접 관리할 수 있습니다.

### 빠른 시작

먼저 인증 정보를 설정한 뒤 첫 번째 명령을 실행합니다.

```bash
# 인증
wasmedge --dir .:. --dir /data:./demo-data --env MODE=cli wasmedge_quickjs.wasm -- server.js confluence auth login --site mysite.atlassian.net --email me@example.com --token ATATT3x...

# 페이지 목록
wasmedge --dir .:. --dir /data:./demo-data \
  --env MODE=cli \
  --env CONFLUENCE_SITE=mysite.atlassian.net \
  --env CONFLUENCE_EMAIL=me@example.com \
  --env CONFLUENCE_TOKEN=ATATT3x... \
  wasmedge_quickjs.wasm -- server.js confluence page list --space-id 12345
```

### HTTPS / TLS

이 저장소가 고정(pin)한 생성 런타임은 `second-state/wasmedge-quickjs` `v0.6.1-alpha`이며, 새 TLS 지원 네트워크 스택을 포함합니다. Atlassian Cloud 같은 공개 HTTPS 엔드포인트는 로컬 WasmEdge CLI와 Docker 이미지에서 바로 동작해야 합니다.

자체 서명 인증서나 사설 CA 체인을 써야 한다면, PEM 번들을 런타임에 마운트하고 `SSL_CERT_FILE`로 지정하세요.

```bash
wasmedge --dir .:. --dir /data:./demo-data --dir /etc/ssl:/etc/ssl:readonly \
  --env MODE=cli \
  --env SSL_CERT_FILE=/etc/ssl/certs/custom-ca.pem \
  wasmedge_quickjs.wasm -- server.js confluence space list --pretty
```

### 명령어 참조

| 리소스 | 액션 | 설명 |
|--------|------|------|
| auth | login, logout, status | 인증 관리 |
| page | list, get, create, update, delete, tree | 페이지 관리 |
| space | list, get | 스페이스 관리 |
| search | (default) | CQL 검색 |
| comment | list, create, delete | 댓글 관리 |
| label | list, add, remove | 레이블 관리 |
| version | list, get | 버전 관리 |
| attachment | list, upload, download | 첨부파일 관리 |
| property | list, get, set | 속성 관리 |
| bulk | export, import | 대량 작업 |

### 인증

인증 정보는 두 가지 방법으로 제공할 수 있습니다.

**환경 변수 방식** — 실행 시 환경 변수로 직접 전달합니다.

- `CONFLUENCE_SITE` — Confluence 사이트 (예: `mysite.atlassian.net`)
- `CONFLUENCE_EMAIL` — Atlassian 계정 이메일
- `CONFLUENCE_TOKEN` — Atlassian API 토큰

**저장 방식** — `auth login` 명령으로 인증 정보를 로컬에 저장합니다.

```bash
wasmedge --dir .:. --dir /data:./demo-data --env MODE=cli \
  wasmedge_quickjs.wasm -- server.js confluence auth login \
  --site mysite.atlassian.net --email me@example.com --token ATATT3x...
```

저장된 인증 상태는 `auth status`로 확인하고, `auth logout`으로 삭제할 수 있습니다. 환경 변수가 설정되어 있으면 저장된 인증 정보보다 우선합니다.

### 출력 및 오류 처리

- 모든 명령의 출력은 JSON 형식입니다.
- 성공 시 종료 코드 `0`을 반환합니다.
- 오류 발생 시 0이 아닌 종료 코드를 반환하며, 오류 메시지가 JSON으로 stderr에 출력됩니다.

```bash
# 출력 예시 — jq로 파싱
wasmedge --dir .:. --dir /data:./demo-data --env MODE=cli \
  wasmedge_quickjs.wasm -- server.js confluence page list --space-id 12345 | jq '.results[]'
```

### Docker CLI 모드

Docker Compose를 사용하여 CLI 모드를 실행할 수 있습니다.

```yaml
# docker-compose.yml (CLI 모드 예시)
services:
  cli:
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
    command: ["server.js", "confluence", "page", "list", "--space-id", "12345"]
```

```bash
# Docker Compose로 CLI 명령 실행
CONFLUENCE_TOKEN=ATATT3x... docker compose run --rm cli
```

컨테이너 이미지에는 `/etc/ssl/certs/ca-certificates.crt`가 포함되고 `SSL_CERT_FILE`이 자동으로 설정되므로, 공개 HTTPS 엔드포인트에는 추가 마운트가 필요하지 않습니다. 커스텀 CA 번들이 필요할 때만 `SSL_CERT_FILE`을 덮어쓰면 됩니다.

## 파일시스템 모델

파일 I/O 탭은 의도적으로 `/data`에만 접근합니다. Docker Compose 또는 `docker run`을 사용할 때 `/data`는 `./demo-data`에 연결됩니다. WasmEdge CLI를 직접 사용할 때도 동일한 디렉토리를 `--dir ./demo-data:/data`로 노출해야 합니다.

애플리케이션은 임의의 호스트 경로를 탐색하지 않습니다. 접근 가능한 범위는 WASI를 통해 명시적으로 preopen한 디렉토리로 제한됩니다.

## 아키텍처

```text
브라우저 (http://localhost:8080)
    |
    v
server.js
    |
    v
wasmedge_quickjs.wasm
    |
    +-- 인라인 HTML/CSS/JS
    +-- /api/runtime
    +-- /api/fetch
    +-- /api/files/*
    +-- /api/server-info
    |
    v
WASI preopen
    +-- .             (런타임 내부의 프로젝트 파일)
    +-- /data         (호스트에 매핑된 demo-data 디렉토리)
```

## 이미지 빌드

```bash
docker buildx build --platform wasi/wasm -t wasmedge-demo:latest .
```

Dockerfile은 다음과 같은 간결한 multi-stage 흐름을 따릅니다.

1. build stage에서 WasmEdge를 설치합니다.
2. `./wasmedge-quickjs.lock` 에 고정된 URL과 SHA256 값을 사용해 `./scripts/sync-wasmedge-quickjs.sh` 를 실행합니다.
3. `wasmedgec`로 AOT 컴파일을 적용합니다.
4. 최종 `scratch` 이미지에는 런타임, `server.js`, `modules/`, CA 번들을 복사합니다.

이 저장소는 생성된 런타임 자산을 커밋하지 않습니다. 로컬 WasmEdge CLI 준비와 Docker 빌드 모두 같은 bootstrap 스크립트를 사용합니다.

## CI/CD 데모

이 저장소에는 `.github/workflows/publish-ghcr.yml` GitHub Actions 워크플로가 포함됩니다.

- `workflow_dispatch`로 수동 실행 가능
- `main` 브랜치로의 모든 push에서 자동 실행
- 먼저 불변 `sha-<git-sha>` 태그를 발행
- GHCR 패키지 가시성을 `public`으로 설정
- GHCR에서 SHA 태그 매니페스트에 대한 익명 접근 가능 여부를 검증
- 검증이 성공한 뒤에만 `latest` 태그를 승격

GitHub 호스팅 Linux 러너에서는 `wasi/wasm` 이미지를 직접 `docker pull` 할 때 `operating system is not supported` 오류가 발생하므로, CI 검증은 런타임 pull 대신 익명 매니페스트 확인 방식으로 수행합니다.

### 수동 대체 배포 (Manual fallback publish)

GitHub Actions 대신 로컬 셸에서 직접 배포(publish)하려면, 먼저 GitHub CLI 인증 상태를 확인하세요. `write:packages` 스코프가 없다면 갱신해야 합니다.

```bash
gh auth refresh -s write:packages
```

그 후 로그인하고 배포합니다.

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

## 참고 사항 및 제한

- GUI는 브라우저를 통해 제공되며, 이 프로젝트는 네이티브 OS 창을 생성하지 않습니다.
- 이 저장소의 기본 레지스트리 대상은 GHCR입니다: `ghcr.io/atjsh/wasmedge-demo`
- GHCR에서는 패키지 접근 권한과 공개 가시성이 별도로 관리되므로, 첫 publish 이후 공개 상태를 다시 확인해야 합니다.
- 공개 HTTPS 엔드포인트는 기본 설정으로 동작해야 하며, 커스텀 인증서를 쓸 때만 별도 `SSL_CERT_FILE` 설정이 필요합니다.
- `demo-data/`는 수정 가능한 호스트 마운트 저장소이므로 버전 관리에 포함하지 않습니다.

## 기술 참고 자료

- [WasmEdge 문서](https://wasmedge.org/docs/)
- [WasmEdge QuickJS](https://github.com/second-state/wasmedge-quickjs)
- [Docker Desktop Wasm 지원](https://docs.docker.com/desktop/features/wasm/)

## 라이선스

MIT
