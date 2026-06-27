# rss-extensions

RSS 피드에서 새 기사를 수집하고, Gemini로 YouTube 검색어를 만든 뒤 영상과 매칭해서 웹 UI로 보여줍니다. 백그라운드 스크랩과 웹 서버는 **launchd 데몬**으로 상시 실행되고, 뷰는 브라우저에서 `localhost:3333`으로 봅니다.

- **RSS 직접 구독** → 등록된 피드를 직접 fetch (FeedBurner 같은 프록시는 멈추기 쉬워 직접 피드 권장)
- **Gemini (gemini-3.1-flash-lite)** → 기사 제목에서 YouTube 검색어 생성
- **YouTube Data API v3** → 영상 검색
- **SQLite (better-sqlite3)** → 피드 / 기사 / read·processed 상태 / YouTube 결과 저장
- **yt-dlp** → 아이템별 영상 다운로드 (`~/Downloads`)

스택: TanStack Start + React 19, Effect, Drizzle/SQLite, vite-plus(`vp`).

---

## 세팅

### 1. 의존성

```bash
pnpm install
```

### 2. API Key

- **YouTube**: [Google Cloud Console](https://console.cloud.google.com/) → `YouTube Data API v3` 활성화 → API 키
- **Gemini**: [Google AI Studio](https://aistudio.google.com/apikey) → API 키 (Flash-Lite 무료 티어로 충분)

### 3. `.env`

```
YOUTUBE_API_KEY=your_youtube_api_key
GEMINI_API_KEY=your_gemini_api_key
```

> 피드 목록은 SQLite `feeds` 테이블에 저장되고 `/feeds`에서 볼 수 있습니다. 추가/제거 UI는 아직 없어서 현재는 DB에서 직접 관리합니다.

---

## 개발 / 빌드

| 명령어              | 설명                                          |
| ------------------- | --------------------------------------------- |
| `pnpm dev`          | 개발 서버 (`localhost:3333`)                  |
| `pnpm build`        | 웹앱 빌드 (`dist/`)                           |
| `pnpm build:scrape` | 스크랩 번들 빌드 (`dist/scrape.mjs`, esbuild) |
| `pnpm start`        | 빌드된 웹앱 서빙 (`vp preview --port 3333`)   |
| `pnpm scrape`       | 스크랩 1회 수동 실행 (`dist/scrape.mjs`)      |

> 런타임은 vite-plus의 node(`/Users/ieunsu/.vite-plus/bin/{node,vp}`)를 씁니다. better-sqlite3가 이 ABI로 빌드돼 있어, 일반 Homebrew node로 스크랩/서버를 직접 돌리면 ABI 에러가 납니다.

---

## 실행 & 운영 (launchd)

평소엔 백그라운드 데몬이 알아서 돌고, **브라우저에서 `localhost:3333`** 만 열면 됩니다. LaunchAgent 2개로 구성됩니다.

| Agent                         | 역할                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `com.eunsoo.rss-music.server` | `vp preview --port 3333` keepalive — 웹 UI + 서버 함수(스크랩 버튼, yt-dlp 다운로드) |
| `com.eunsoo.rss-music.scrape` | 로그인 시 + **2시간마다**(StartInterval) 스크랩, 새 글 있으면 알림(osascript)        |

plist 원본은 `launchd/`에 버전관리되어 있습니다.

### 설치

```bash
cp launchd/*.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.eunsoo.rss-music.server.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.eunsoo.rss-music.scrape.plist
```

> ⚠️ plist에 `/Users/ieunsu/...` 절대경로가 박혀 있습니다. 다른 머신/경로면 plist의 `ProgramArguments`·`WorkingDirectory`를 수정하세요. 사전에 `pnpm build && pnpm build:scrape`로 `dist/`가 준비돼 있어야 합니다.

### 관리

```bash
launchctl list | grep rss-music                                   # 상태
launchctl kickstart -k gui/$(id -u)/com.eunsoo.rss-music.scrape   # 지금 즉시 스크랩
launchctl kickstart -k gui/$(id -u)/com.eunsoo.rss-music.server   # 서버 재시작 (빌드 갱신 후)
launchctl bootout  gui/$(id -u) ~/Library/LaunchAgents/com.eunsoo.rss-music.server.plist   # 중지
```

- 로그: `~/Library/Logs/rss-music/{server,scrape}.log`
- 코드/빌드를 바꾼 뒤엔 `pnpm build`(웹) 또는 `pnpm build:scrape`(스크랩) 후 해당 agent를 `kickstart -k` 하세요.

---

## 메뉴바 (SwiftBar)

[SwiftBar](https://github.com/swiftbar/SwiftBar) 플러그인으로 메뉴바에 상태 + 빠른 액션을 띄웁니다 (`swiftbar/rss-music.1m.sh`, 1분 갱신). 서버 up/down, 마지막 스크랩(+새 글), 안 읽음 수를 보여주고 **열기 / 지금 스크랩 / 서버 재시작 / 로그**를 메뉴에서 바로 실행합니다.

```bash
brew install --cask swiftbar
defaults write com.ameba.SwiftBar PluginDirectory -string "$PWD/swiftbar"
open -a SwiftBar
```

> SwiftBar가 플러그인 폴더 접근을 물으면 repo의 `swiftbar/`를 선택하세요. plugin은 `launchctl`/`sqlite3`/`curl`을 호출하므로 절대경로가 박혀 있습니다(다른 머신이면 `swiftbar/rss-music.1m.sh` 상단 변수 수정).

---

## 다운로드 (yt-dlp)

기사 제목 옆 **⋯ → Download** 에서 `yt-dlp -S height:720`으로 `~/Downloads`에 저장합니다. 서버 함수가 로컬에서 yt-dlp를 실행하며(`/opt/homebrew/bin` 절대경로 + PATH 보강), 다운로드 이력은 `data/download.log`에 남습니다. `yt-dlp`·`ffmpeg`가 설치돼 있어야 합니다.

---

## 파이프라인 동작

1. 등록된 피드를 병렬 fetch
2. SQLite에 없는 새 기사만 `read=0, processed=0`으로 저장 (id=guid로 중복 제거)
3. `processed=0` 기사를 Gemini로 일괄 전송 (배치) → 검색어 생성
4. 각 검색어로 YouTube 검색 (캐시 우선)
5. 처리된 기사들을 `processed=1`로 마킹

- **`read`는 사용자 액션 전용** (UI에서 읽음 처리). 파이프라인은 건드리지 않습니다.
- 재처리 방지는 **`processed` 컬럼**으로만 관리 → YouTube 단계 전에 실패하면 `processed=0`으로 남아 다음 실행에서 자동 재시도됩니다.
- 실행마다 피드별 구조화 로그가 `data/scrape.jsonl`에 쌓입니다 (`itemCount/newCount/newestPublished/error`). 어떤 피드가 멈췄는지(=stale) 추적용:

```bash
jq 'select(.type=="feed" and .ok and .newCount==0) | {feedTitle, newestPublished}' data/scrape.jsonl
```

---

## 프로젝트 구조

```
rss-extensions/
├── src/
│   ├── routes/               # TanStack Start 라우트 + 컴포넌트 (웹 UI)
│   ├── server/               # 서버 로직
│   │   ├── pipeline.ts       #   스크랩 파이프라인 (RSS→Gemini→YouTube→DB)
│   │   ├── scrape-cli.ts     #   헤드리스 진입점 → dist/scrape.mjs
│   │   ├── scrape-log.ts     #   구조화 로그(JSONL)
│   │   ├── download.ts       #   yt-dlp 다운로드
│   │   ├── rss.ts / opml.ts  #   RSS·OPML 파싱
│   │   ├── gemini.ts / youtube.ts
│   │   ├── db.ts / schema.ts #   SQLite (Drizzle)
│   │   └── ...
│   └── ui/                   # 공용 UI 컴포넌트 (base-ui 래퍼)
├── launchd/                  # LaunchAgent plist (server / scrape)
├── data/                     # SQLite DB + 로그 (gitignore)
├── .env                      # 환경변수 (gitignore)
└── package.json
```
