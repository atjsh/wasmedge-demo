[English](README.md) | **한국어**

# WasmEdge 데모 — 코드서명 불필요 GUI 웹 앱

**WasmEdge WASM 컨테이너** 내부에서 완전히 실행되는 웹 GUI입니다. 네이티브 바이너리 없음, 코드서명 불필요, OS별 GUI 프레임워크 불필요 — `docker run` 한 줄이면 브라우저에서 바로 사용할 수 있습니다.

## 이것은 무엇인가요?

다음을 증명하는 **데모/쇼케이스 애플리케이션**입니다:

1. **JavaScript로 작성** — WasmEdge의 QuickJS 런타임 사용 (Node.js 호환)
2. **~2MB OCI 이미지로 패키징** — `FROM scratch`, WASM 런타임 + JS 앱만 포함
3. **Docker Hub를 통해 배포** — 표준 `docker pull` / `docker run`
4. **코드서명 없이 실행** — 네이티브 바이너리가 없으므로 코드서명이 필요 없음
5. **완전한 샌드박스** — WASM이 메모리 안전성과 기능 기반 보안을 제공

## 빠른 시작

### 방법 1: Docker Desktop

> **사전 요구사항**: [Wasm 지원이 활성화된](https://docs.docker.com/desktop/features/wasm/) Docker Desktop

```bash
# 파일 I/O 데모를 위한 디렉토리 생성
mkdir -p demo-data

# 컨테이너 실행
docker run -dp 8080:8080 \
  --rm \
  --runtime=io.containerd.wasmedge.v1 \
  --platform=wasi/wasm \
  -v $(pwd)/demo-data:/data \
  wasmedge-demo:latest
```

브라우저에서 **http://localhost:8080** 을 엽니다.

### 방법 2: Docker Compose

```bash
mkdir -p demo-data
docker compose up
```

### 방법 3: WasmEdge CLI (개발용)

```bash
# WasmEdge 설치
curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash
source $HOME/.wasmedge/env

# QuickJS 런타임 다운로드
curl -OL https://github.com/second-state/wasmedge-quickjs/releases/download/v0.5.0-alpha/wasmedge_quickjs.wasm
curl -OL https://github.com/second-state/wasmedge-quickjs/releases/download/v0.5.0-alpha/modules.zip
unzip modules.zip

# 데모 데이터 디렉토리 생성
mkdir -p demo-data

# 실행
wasmedge --dir .:. --dir ./demo-data:/data wasmedge_quickjs.wasm server.js
```

브라우저에서 **http://localhost:8080** 을 엽니다.

## 데모 기능

웹 UI에는 **4개의 인터랙티브 탭**이 있습니다:

### 🏠 런타임 정보
- WasmEdge 환경 상세 정보 (`os.type()` → "wasmedge", `os.platform()` → "wasi", `os.arch()` → "wasm")
- 프로세스 정보 (argv, env, uptime)
- 코드서명 불필요 개념 설명

### 🌐 HTTP 데모
- WASM 컨테이너 내부에서 외부 HTTP 요청 전송
- GET, POST, PUT 메서드 지원
- 커스텀 URL 입력 및 JSON 응답 뷰어
- 각 요청의 지연 시간 측정

### 📁 파일 I/O 데모
- 호스트 매핑된 디렉토리(`/data`)의 파일 탐색
- 웹 UI에서 파일 생성, 읽기, 편집, 삭제
- 파일 메타데이터 확인 (크기, 타임스탬프)
- WASI 디렉토리 프리오픈(`--dir` 플래그) 시연

### 🔌 서버 정보
- 실시간 요청 로그 (서버가 처리한 모든 HTTP 요청)
- 서버 가동 시간 및 총 요청 수
- 테스트용 에코 엔드포인트

## 아키텍처

```
브라우저 (http://localhost:8080)
    │
    ▼
┌─────────────────────────────────┐
│ WasmEdge 런타임                  │
│  └─ wasmedge_quickjs.wasm       │
│     └─ server.js (HTTP 서버)     │
│        ├── 인라인 HTML/CSS/JS    │
│        ├── /api/* 엔드포인트      │
│        └── modules/ (Node.js)   │
├─────────────────────────────────┤
│ WASI 프리오픈                    │
│  --dir .:. (내부 FS)             │
│  --dir ./demo-data:/data (호스트)│
└─────────────────────────────────┘
```

- **총 이미지 크기 ~2MB** (Node.js의 300MB+ 대비)
- **밀리초 단위 시작** (Linux 컨테이너의 수 초 대비)
- **크로스 플랫폼** — Docker가 지원하는 모든 OS/CPU에서 실행

## 빌드

```bash
docker buildx build --platform wasi/wasm -t wasmedge-demo .
```

## 기술 스택

- [WasmEdge](https://wasmedge.org/) — CNCF 샌드박스 프로젝트, 경량 WASM 런타임
- [WasmEdge QuickJS](https://github.com/second-state/wasmedge-quickjs) — WasmEdge용 JavaScript 엔진
- [Docker + WASM](https://docs.docker.com/desktop/features/wasm/) — OCI 호환 WASM 컨테이너

## 라이선스

MIT
