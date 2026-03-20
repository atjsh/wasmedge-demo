[English](README.md) | **한국어**

# WasmEdge 데모 — 코드서명 불필요 GUI 웹 앱

## 개요

이 저장소는 WasmEdge 런타임을 내장한 일반 OCI 컨테이너 이미지 안에서 제공되는 브라우저 기반 GUI 레퍼런스 데모입니다. 애플리케이션은 `wasmedge`를 통해 `wasmedge_quickjs.wasm` 위에서 `server.js`를 실행하고, 사용자 인터페이스는 인라인 HTML, CSS, JavaScript로 브라우저에 렌더링됩니다.

이 프로젝트가 보여주려는 "코드서명 불필요" 배포 모델은 다음과 같습니다.

- 네이티브 데스크톱 실행 파일이 없음
- OS별 GUI 툴킷에 의존하지 않음
- 플랫폼별 코드서명 또는 노터라이제이션 절차가 필요 없음
- 표준 OCI 컨테이너 실행 방식으로 배포 가능함

실제로는 사용자가 컨테이너를 실행한 뒤 `http://localhost:8080`을 여는 방식으로 사용합니다. 즉, 브라우저가 GUI 표면이 되고 WasmEdge와 WASI가 컨테이너 내부 런타임 및 샌드박스 경계를 담당합니다.

## 데모 범위

- WasmEdge QuickJS에서 동작하는 단일 JavaScript HTTP 서버
- Runtime, HTTP, Files, Server 네 개 탭으로 구성된 기본 브라우저 GUI
- 번들된 Confluence 툴킷을 실행하는 `MODE=cli` 경로
- 내장된 WasmEdge 런타임 내부에서 수행되는 외부 HTTP 요청
- 호스트에 매핑된 `/data` 디렉토리 접근과 내부 파일시스템 데모
- 웹 UI에서 확인할 수 있는 런타임 점검, 요청 로그, echo/debug API

## 비교: WasmEdge vs `npm` / `npx` vs 네이티브 앱

이 데모가 WasmEdge를 사용하는 이유는 배포 모델을 바꾸기 위해서이지, Node.js 방식이나 네이티브 앱보다 무조건 우월하다고 주장하기 위해서가 아닙니다.

현재 이 저장소의 패키징은 WasmEdge 런타임, 생성된 QuickJS 런타임, JavaScript 앱을 함께 담은 일반 OCI 이미지입니다. 크기는 다소 커졌지만, 주류 컨테이너 툴과의 호환성을 얻는 대신 사용자는 내부 런타임 파일을 직접 다룰 필요가 없습니다.

| 항목 | WasmEdge / OCI 앱 | Node.js + `npm` / `npx` 앱 | 네이티브 OS 앱 |
| --- | --- | --- | --- |
| 배포 단위 | GHCR 같은 레지스트리에서 가져오는 일반 OCI 이미지 + 내장 WasmEdge 런타임 | npm 레지스트리에서 가져오는 패키지 | OS별 바이너리, 압축 파일, 또는 설치 프로그램 |
| 실측 사례 (본 저장소 기준) | **~145 MiB** 로컬 arm64 Podman 이미지<br>WasmEdge, QuickJS 런타임, `modules`, `netbase` 포함 | 측정하지 않음 (Node.js 런타임 선행 설치 필요) | 측정하지 않음 (보통 OS/아키텍처별 별도 자산 필요) |
| 실행 환경 요구사항 | Podman 또는 Docker 같은 일반 OCI 컨테이너 런타임, 또는 WasmEdge CLI 설치 | 동작하는 Node.js + npm 환경 | 플랫폼별 설치 또는 다운로드 절차 |
| 버전 관리 | OCI 태그와 digest로 pinning, promotion, rollback을 명시적으로 다루기 쉬움 | semver는 익숙하지만, `npx` 역시 버전을 명확히 pin하지 않으면 npm 해석 결과에 의존함 | 대체로 release asset, installer, 앱별 업데이트 채널에 의존 |
| 언어 확장성 | WasmEdge 문서는 Rust, JavaScript, Go, Python 기반 앱 개발 경로를 강조하며, C/C++, Swift, AssemblyScript, Kotlin 등에서 컴파일한 표준 Wasm도 실행 가능하다고 설명함 | JavaScript/TypeScript에는 매우 강하지만, 다른 언어는 보통 바인딩이나 외부 프로세스로 연결됨 | 선택한 네이티브 스택에 따라 다르지만, 시간이 갈수록 플랫폼 종속성이 커지는 경우가 많음 |
| 격리 모델 | WASI preopen을 통한 명시적 호스트 접근과 샌드박스 실행 | 별도 샌드박싱을 하지 않으면 일반 Node.js 프로세스 권한으로 실행 | 보통 가장 깊은 OS 접근 권한과 통합 면을 가짐 |
| GUI 모델 | 브라우저에 UI를 제공하며 네이티브 윈도우 툴킷이 필요 없음 | 대체로 CLI 중심이거나 브라우저/Electron 계열 | 실제 네이티브 창, 메뉴, 시스템 통합, 장치 접근에 가장 적합 |

### 이 저장소에서 WasmEdge 경로가 매력적인 이유

- 사용자는 여전히 단일 OCI 아티팩트와 짧은 `podman run` / `docker run` 명령만 보면 됩니다. `wasmedge_quickjs.wasm`, `server.js`, `modules` 레이아웃을 알 필요가 없습니다.
- OCI 레지스트리를 사용하면 태그나 digest 단위로 pull, pin, promote, rollback을 다루기 쉬워져서 설치 문서에만 의존하는 배포보다 재현성이 좋아집니다.
- 이 배포 모델은 JavaScript 전용으로 닫혀 있지 않습니다. WasmEdge 문서는 여러 언어 기반의 Wasm 앱 경로를 강조하므로, 향후 앱 경계가 커질 때 설계 선택지가 넓습니다.
- 일반 OCI 이미지로 감싸더라도 샌드박스와 WASI preopen 모델 덕분에 "그냥 프로세스를 실행하고 머신 전체를 보게 하는 방식"보다 호스트 접근 범위를 더 명시적으로 설명할 수 있습니다.

### 그래도 `npm` / `npx`가 더 나은 경우

- 대상 사용자가 이미 Node.js를 갖고 있다면, `npx some-tool@version`은 Podman이나 WasmEdge를 설치하게 하는 것보다 훨씬 마찰이 적을 수 있습니다.
- JavaScript 생태계, 패키지 탐색성, 디버깅 경험, 개발자 친숙도는 현재도 Node.js 경로가 더 강합니다.
- 제품이 본질적으로 JS CLI라면, WasmEdge는 사용자 이득보다 런타임의 낯섦만 늘릴 수 있습니다.

### 네이티브 앱이 더 나은 경우

- 브라우저 기반 GUI는 네이티브 데스크톱 앱과 동일하지 않습니다. 실제 창 관리, 파일 선택기, 메뉴, 알림, 트레이 동작, 장치 접근, 깊은 OS 통합이 필요하면 네이티브 앱이 여전히 우위입니다.
- 완성도 높은 설치 프로그램을 제공할 수 있다면, 네이티브 배포가 최종 사용자에게 더 직접적으로 느껴질 수 있습니다. 다만 그만큼 릴리스 파이프라인은 보통 더 무거워집니다.
- 제품의 핵심 가치가 데스크톱 UX나 플랫폼 통합에 있다면, 이를 브라우저 + 컨테이너 모델로 억지로 맞추는 것은 좋은 선택이 아닙니다.

### 핵심 정리

- WasmEdge가 버전 관리 문제를 마법처럼 없애 주는 것은 아니지만, OCI 레지스트리는 즉흥적인 바이너리 배포나 느슨한 설치 절차보다 더 명시적이고 재현 가능한 배포 단위를 제공합니다.
- 이 저장소에서 WasmEdge가 설득력 있는 이유는 브라우저 기반 앱을 OCI 아티팩트 하나로 감추고 배포하면서도 내부적으로는 Wasm 기반 런타임 계약을 유지할 수 있기 때문입니다.
- 그렇다고 해서 일상적인 JS 툴링에서 `npm` / `npx`를 대체하거나, 진짜 데스크톱 통합이 필요한 앱에서 네이티브를 대체하는 것은 아닙니다.

## 공개된 GHCR 이미지

- `ghcr.io/atjsh/wasmedge-demo:latest`
- `ghcr.io/atjsh/wasmedge-demo:sha-<git-sha>`

## 빠른 시작

처음 실행해볼 때는 이 경로가 가장 쉽습니다.

### 준비물

- Podman 또는 Docker 같은 일반 OCI 컨테이너 런타임
- 파일 I/O 탭용으로 쓸 수 있는 쓰기 가능한 `demo-data/` 디렉토리
- `http://localhost:8080`에 접속할 브라우저

macOS와 Windows에서 Podman을 사용할 때는 보통 동작 중인 `podman machine`이 필요합니다. [Podman 설치 가이드](https://podman.io/docs/installation)를 참고하세요. 아래의 `podman run` 예시는 `docker run`으로도 같은 방식으로 실행할 수 있습니다.

### 1. 로컬 데이터 디렉토리 준비

```bash
mkdir -p demo-data
```

### 2. GHCR 이미지를 Podman으로 직접 실행

```bash
podman run --rm -p 8080:8080 \
  -v "$(pwd)/demo-data:/data" \
  ghcr.io/atjsh/wasmedge-demo:latest
```

### 3. GUI 열기

```text
http://localhost:8080
```

### 4. 데모 종료

```text
`podman run`을 실행한 터미널에서 Ctrl+C를 누르세요.
```

## Web UI 참고

기본 `MODE=gui` 경험은 같은 `server.js` 프로세스가 제공하는 네 개 탭 브라우저 UI입니다.

### 런타임 정보

- `os.type()`, `os.platform()`, `os.arch()`, `os.homedir()`, `os.tmpdir()` 같은 런타임 정보를 표시합니다.
- 업타임과 argv 등 프로세스 데이터를 보여줍니다.
- 코드서명 불필요 패키징 모델과 WASI 샌드박스 경계의 목적을 설명합니다.
- 해보기:
  첫 번째 탭을 열고 런타임 정보가 정상적으로 로드되는지 확인하세요.

### HTTP 데모

- 내장된 WasmEdge 런타임 내부에서 외부 요청을 전송합니다.
- 임의의 GET, POST, PUT 요청을 지원합니다.
- `httpbin.org` 빠른 예제 버튼을 제공합니다.
- 응답 본문과 단순 요청 시간을 표시합니다.
- 해보기:
  HTTP 탭에서 내장 예제 버튼 중 하나를 눌러 응답 payload를 확인하세요.
- 참고:
  컨테이너 이미지에는 Debian `netbase`가 포함되어 있어 `/etc/services`가 제공되며, hostname 기반 `http` / `https` fetch가 동작합니다.

### 파일 I/O 데모

- 호스트에 매핑된 `/data` 디렉토리의 파일을 나열합니다.
- 브라우저에서 파일 생성, 읽기, 수정, 삭제를 수행합니다.
- 파일 메타데이터를 표시하고 WASI preopen 모델을 보여줍니다.
- 호스트 마운트 `/data`와 WASM 런타임 내부 파일을 비교하는 내부 파일시스템 데모를 포함합니다.
- 해보기:
  Files 탭에서 파일을 하나 만들고, 목록 새로고침 후 호스트의 `./demo-data`에도 파일이 생겼는지 확인하세요.

### 서버 정보

- 서버가 수집한 최근 요청 기록을 표시합니다.
- 업타임과 요청 카운터를 보고합니다.
- 요청/응답 테스트용 echo 엔드포인트를 포함합니다.
- UI에서 서버 상태를 즉시 새로고침할 수 있습니다.
- 해보기:
  Server 탭에서 echo 요청을 보내고 서버 상태를 새로고침해 보세요.

## CLI 모드 — Confluence 툴킷

이 애플리케이션은 `MODE=cli`로 실행하면 HTTP 서버 대신 Atlassian Confluence REST API CLI 툴킷처럼 동작합니다.

### 컨테이너 CLI 준비

- Podman 또는 Docker 같은 일반 OCI 컨테이너 런타임
- `/data`에 마운트할 `./demo-data`
- 유효한 Confluence 인증 정보

한 번만 준비하세요:

```bash
mkdir -p demo-data
```

### 복붙 가능한 CLI 명령

#### auth login

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence auth login \
  --site mysite.atlassian.net \
  --email me@example.com \
  --token ATATT3x...
```

#### auth status

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence auth status --pretty
```

#### space list

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence space list --pretty
```

#### page list

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence page list --space-id 12345 --pretty
```

#### page get

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence page get 12345 --pretty
```

#### page create

```bash
podman run --rm \
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

#### page update

```bash
podman run --rm \
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

#### search

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence search --cql 'type=page order by lastmodified desc' --limit 10 --pretty
```

#### comment list

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence comment list --page-id 12345 --pretty
```

#### comment create

```bash
podman run --rm \
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

#### label list

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence label list --page-id 12345 --pretty
```

#### label add

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence label add --page-id 12345 --label demo --pretty
```

#### attachment list

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence attachment list --page-id 12345 --pretty
```

#### attachment upload

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence attachment upload --page-id 12345 --file /data/example.txt --pretty
```

#### attachment download

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence attachment download ATTACHMENT_ID --output /data/downloaded.bin --pretty
```

#### bulk export

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence bulk export --space-id 12345 --output-dir /data/backup --pretty
```

#### bulk import

```bash
podman run --rm \
  -v "$(pwd)/demo-data:/data" \
  -e MODE=cli \
  -e CONFLUENCE_SITE=mysite.atlassian.net \
  -e CONFLUENCE_EMAIL=me@example.com \
  -e CONFLUENCE_TOKEN=ATATT3x... \
  ghcr.io/atjsh/wasmedge-demo:latest \
  confluence bulk import --space-id 12345 --input-dir /data/backup --pretty
```

### CLI 기능 요약

- `auth`: 인증 정보 저장, 현재 로그인 소스 확인, 저장된 인증 제거
- `page`: 페이지 목록, 단건 조회, 생성, 수정, 삭제, 자식 트리 조회
- `space`: 스페이스 목록 조회와 단건 조회
- `search`: CQL 기반 검색과 페이지네이션 제어
- `comment`: 페이지 footer comment 목록, 생성, 삭제
- `label`: 페이지 레이블 목록, 추가, 제거
- `version`: 페이지 버전 목록과 특정 버전 조회
- `attachment`: `/data` 경로를 통한 첨부파일 목록, 업로드, 다운로드
- `property`: content property 목록, 조회, 설정
- `bulk`: `/data` 기준 JSON 파일 내보내기/가져오기
- 전역 플래그: `--pretty`, `--verbose`, `--limit`, `--all`, `--help`

### 명령어 참조

| 리소스 | 액션 | 설명 | 주요 플래그 |
|--------|------|------|-------------|
| auth | login, logout, status | 저장/환경 기반 인증 관리 | `--site`, `--email`, `--token` |
| page | list, get, create, update, delete, tree | 페이지와 페이지 트리 관리 | `--space-id`, `--title`, `--body`, `--parent-id`, `--version`, `--purge`, `--depth`, `--body-format` |
| space | list, get | 스페이스 목록과 단건 조회 | `--limit`, `--all` |
| search | (default) | CQL로 콘텐츠 검색 | `--cql`, `--limit`, `--all` |
| comment | list, create, delete | footer comment 관리 | `--page-id`, `--body`, `--limit` |
| label | list, add, remove | 페이지 레이블 관리 | `--page-id`, `--label` |
| version | list, get | 페이지 버전 이력 조회 | 페이지 ID, `--version`, `--limit` |
| attachment | list, upload, download | `/data` 경로를 통한 첨부파일 관리 | `--page-id`, `--file`, `--output`, `--limit` |
| property | list, get, set | content property 조회/설정 | `--page-id`, `--key`, `--value` |
| bulk | export, import | JSON 파일 대량 내보내기/가져오기 | `--space-id`, `--output-dir`, `--input-dir` |

## 고급 워크플로

### 로컬 Podman 빌드 / 실행 스크립트

공개 GHCR 이미지를 바로 실행하는 대신 로컬에서 이미지를 빌드하고 싶다면 이 경로를 사용하세요.

```bash
./scripts/podman-build.sh
./scripts/podman-run.sh
```

선택적 오버라이드:

```bash
IMAGE_NAME=localhost/wasmedge-demo:dev ./scripts/podman-build.sh
HOST_PORT=18080 DATA_DIR="$HOME/wasmedge-demo-data" ./scripts/podman-run.sh
ENABLE_AOT=1 IMAGE_NAME=localhost/wasmedge-demo:aot ./scripts/podman-build.sh
```

`ENABLE_AOT=1`은 같은 머신에서 성능을 확인하기 위한 로컬 opt-in 용도입니다. AOT 결과물은 호스트 의존적이므로 공개 portable 이미지에는 기본적으로 사용하지 않습니다.

이 보조 스크립트는 macOS/Linux 셸을 대상으로 합니다. Windows에서는 아래와 같은 raw Podman 명령을 직접 사용하세요.

```bash
podman build -t localhost/wasmedge-demo:latest .
podman run --rm -p 8080:8080 \
  -v "<host-demo-data-path>:/data" \
  localhost/wasmedge-demo:latest
```

### WasmEdge CLI 직접 실행

컨테이너가 아닌 경로가 필요하거나, Podman 동작과 direct WasmEdge CLI 동작을 비교하고 싶다면 이 경로를 사용하세요.

```bash
curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash
source "$HOME/.wasmedge/env"
./scripts/sync-wasmedge-quickjs.sh
mkdir -p demo-data
wasmedge --dir .:. --dir /data:./demo-data wasmedge_quickjs.wasm server.js
```

### HTTPS / TLS

이 저장소가 고정(pin)한 생성 런타임은 `second-state/wasmedge-quickjs` `v0.6.1-alpha`이며, 새 TLS 지원 네트워크 스택을 포함합니다. Atlassian Cloud 같은 공개 HTTPS 엔드포인트는 런타임이 지원하는 경우 direct WasmEdge CLI와 컨테이너 이미지에서 동작해야 합니다.

자체 서명 인증서나 사설 CA 체인을 써야 한다면, PEM 번들을 런타임에 마운트하고 `SSL_CERT_FILE`로 지정하세요.

```bash
wasmedge --dir .:. --dir /data:./demo-data --dir /etc/ssl:/etc/ssl:readonly \
  --env MODE=cli \
  --env SSL_CERT_FILE=/etc/ssl/certs/custom-ca.pem \
  wasmedge_quickjs.wasm -- server.js confluence space list --pretty
```

### 파일시스템 모델

파일 I/O 탭은 의도적으로 `/data`에만 접근합니다. 컨테이너 이미지를 사용할 때 `/data`는 `./demo-data`에 연결됩니다. WasmEdge CLI를 직접 사용할 때도 동일한 디렉토리를 `--dir /data:./demo-data`로 노출해야 합니다.

애플리케이션은 임의의 호스트 경로를 탐색하지 않습니다. 접근 가능한 범위는 WASI를 통해 명시적으로 preopen한 디렉토리로 제한됩니다.

### 아키텍처

```text
브라우저 (http://localhost:8080)
    |
    v
OCI 컨테이너
    |
    +-- /app/container-entrypoint.sh
    |
    v
wasmedge
    |
    v
wasmedge_quickjs.wasm
    |
    +-- server.js
    +-- /modules     (QuickJS 모듈 preopen)
    +-- /data        (호스트에 매핑된 demo-data 디렉토리)
```

### 이미지 빌드

```bash
./scripts/podman-build.sh
```

동등한 raw 명령은 다음과 같습니다.

```bash
podman build -t localhost/wasmedge-demo:latest .
```

Dockerfile은 다음과 같은 간결한 multi-stage 흐름을 따릅니다.

1. build stage에서 WasmEdge를 설치합니다.
2. `./wasmedge-quickjs.lock` 에 고정된 URL과 SHA256 값을 사용해 `./scripts/sync-wasmedge-quickjs.sh` 를 실행합니다.
3. `ENABLE_AOT=1`일 때만 `wasmedgec`로 선택적 AOT 컴파일을 적용합니다.
4. 최종 Debian slim 이미지에는 WasmEdge 런타임, `server.js`, `modules/`, CA 번들을 복사합니다.
5. `netbase`를 설치해 `/etc/services`를 제공함으로써 hostname 기반 `http` / `https` fetch를 동작시킵니다.

이 저장소는 생성된 런타임 자산을 커밋하지 않습니다. 로컬 WasmEdge CLI 준비와 Podman 빌드 모두 같은 bootstrap 스크립트를 사용합니다.

공개 GHCR 이미지는 `ENABLE_AOT=0`으로 빌드되어 `latest`가 portable 하게 유지됩니다. `ENABLE_AOT=1`은 이미지를 실행할 동일한 머신에서의 로컬 빌드에만 사용하세요.

## 기타 문서

### CI/CD 데모

이 저장소에는 `.github/workflows/publish-ghcr.yml` GitHub Actions 워크플로가 포함됩니다.

- `workflow_dispatch`로 수동 실행 가능
- `main` 브랜치로의 모든 push에서 자동 실행
- 먼저 불변 `sha-<git-sha>` 태그를 발행
- GHCR 패키지 가시성을 `public`으로 설정
- GHCR에서 SHA 태그 매니페스트에 대한 익명 접근 가능 여부를 검증
- 검증이 성공한 뒤에만 `latest` 태그를 승격

워크플로는 `linux/amd64`와 `linux/arm64`용 일반 멀티 아키텍처 OCI 이미지를 발행하고, 이후 태그를 매니페스트 검사로 검증합니다.

### 수동 대체 배포 (Manual fallback publish)

GitHub Actions 대신 로컬 셸에서 직접 배포(publish)하려면, 먼저 GitHub CLI 인증 상태를 확인하세요. `write:packages` 스코프가 없다면 갱신해야 합니다.

```bash
gh auth refresh -s write:packages
```

그 후 로그인하고 배포합니다.

```bash
echo "$(gh auth token)" | docker login ghcr.io -u atjsh --password-stdin

SHA_TAG="sha-$(git rev-parse --short=12 HEAD)"

docker buildx build --platform linux/amd64,linux/arm64 \
  -t "ghcr.io/atjsh/wasmedge-demo:${SHA_TAG}" \
  --push .

gh api --method PATCH user/packages/container/wasmedge-demo -f visibility=public

docker buildx imagetools create \
  --tag ghcr.io/atjsh/wasmedge-demo:latest \
  "ghcr.io/atjsh/wasmedge-demo:${SHA_TAG}"
```

### 참고 사항 및 제한

- GUI는 브라우저를 통해 제공되며, 이 프로젝트는 네이티브 OS 창을 생성하지 않습니다.
- 이 저장소의 기본 레지스트리 대상은 GHCR입니다: `ghcr.io/atjsh/wasmedge-demo`
- GHCR에서는 패키지 접근 권한과 공개 가시성이 별도로 관리되므로, 첫 publish 이후 공개 상태를 다시 확인해야 합니다.
- 공개 HTTPS 동작은 WasmEdge 런타임 환경에 따라 달라질 수 있으며, 추가 TLS 지원이 필요할 수 있습니다.
- `demo-data/`는 수정 가능한 호스트 마운트 저장소이므로 버전 관리에 포함하지 않습니다.

### 기술 참고 자료

- [WasmEdge 문서](https://wasmedge.org/docs/)
- [WasmEdge QuickJS](https://github.com/second-state/wasmedge-quickjs)
- [Podman 설치](https://podman.io/docs/installation)
- [Podman Desktop Wasm 가이드](https://podman-desktop.io/blog/wasm-workloads-on-macos-and-windows-with-podman)

## 라이선스

MIT
