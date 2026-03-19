[English](README.md) | **한국어**

# WasmEdge 데모 — 코드서명 불필요 GUI 웹 앱

## 개요

이 저장소는 WasmEdge WebAssembly 컨테이너 내부에서 제공되는 브라우저 기반 GUI 레퍼런스 데모입니다. 애플리케이션은 `wasmedge_quickjs.wasm` 위에서 `server.js`를 실행해 HTTP 서버를 구동하고, 사용자 인터페이스는 인라인 HTML, CSS, JavaScript로 브라우저에 렌더링됩니다.

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

# QuickJS 런타임과 호환 모듈 다운로드
curl -OL https://github.com/second-state/wasmedge-quickjs/releases/download/v0.5.0-alpha/wasmedge_quickjs.wasm
curl -OL https://github.com/second-state/wasmedge-quickjs/releases/download/v0.5.0-alpha/modules.zip
unzip modules.zip

# 파일 I/O 데모에 사용할 호스트 디렉토리 생성
mkdir -p demo-data

# 앱 실행
wasmedge --dir .:. --dir ./demo-data:/data wasmedge_quickjs.wasm server.js
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
2. `wasmedge_quickjs.wasm`과 `modules.zip`을 다운로드합니다.
3. `wasmedgec`로 AOT 컴파일을 적용합니다.
4. 최종 `scratch` 이미지에는 런타임, `server.js`, `modules/`만 복사합니다.

## CI/CD 데모

이 저장소에는 `.github/workflows/publish-ghcr.yml` GitHub Actions 워크플로가 포함됩니다.

- `workflow_dispatch`로 수동 실행 가능
- `main` 브랜치로의 모든 push에서 자동 실행
- 먼저 불변 `sha-<git-sha>` 태그를 발행
- GHCR 패키지 가시성을 `public`으로 설정
- SHA 태그 이미지에 대해 인증 없는 pull 검증 수행
- 검증이 성공한 뒤에만 `latest` 태그를 승격

### 수동 대체 publish 방법

GitHub Actions 대신 로컬 셸에서 직접 publish하려면 먼저 GitHub CLI 인증에 `write:packages` 스코프를 추가해야 합니다.

```bash
gh auth refresh -s write:packages
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
- 외부 HTTPS 동작은 WasmEdge 런타임 환경에 따라 달라질 수 있으며 추가 TLS 지원이 필요할 수 있습니다.
- `demo-data/`는 수정 가능한 호스트 마운트 저장소이므로 버전 관리에 포함하지 않습니다.

## 기술 참고 자료

- [WasmEdge 문서](https://wasmedge.org/docs/)
- [WasmEdge QuickJS](https://github.com/second-state/wasmedge-quickjs)
- [Docker Desktop Wasm 지원](https://docs.docker.com/desktop/features/wasm/)

## 라이선스

MIT
