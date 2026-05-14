# rss-extensions

RSS 피드에서 안 읽은 기사를 수집하고, Gemini로 음악 트랙을 추출한 뒤 YouTube 영상과 매칭하여 HTML로 보여줍니다. 전체 파이프라인이 단일 Node 프로세스에서 실행됩니다.

- **RSS 직접 구독** → 등록된 피드를 직접 fetch
- **Gemini (gemini-3.1-flash-lite)** → 기사 제목에서 YouTube 검색어 생성
- **YouTube Data API v3** → 영상 검색
- **SQLite** → 피드 / 기사 / read 상태 / YouTube 검색 결과 저장

---

## 세팅 순서

### 1. 의존성 설치

```bash
pnpm install
```

### 2. API Key 발급

- **YouTube**: [Google Cloud Console](https://console.cloud.google.com/) → `YouTube Data API v3` 활성화 → API 키 생성
- **Gemini**: [Google AI Studio](https://aistudio.google.com/apikey) → API 키 생성 (Flash-Lite는 무료 티어로 충분)

### 3. 환경변수 설정

`.env` 파일에 설정:

```
YOUTUBE_API_KEY=your_youtube_api_key
GEMINI_API_KEY=your_gemini_api_key
```

### 4. 피드 등록

Feedly OPML export 활용 (Settings → Import/Export → Export OPML):

```bash
pnpm start --import-opml ./feedly.opml --category musicexplo
```

또는 개별 추가:

```bash
pnpm start --add-feed https://example.com/feed.xml
```

---

## 사용법

### 전체 사이클 실행

```bash
pnpm start
```

또는

```bash
pnpm scrape
```

이 한 명령으로 RSS fetch → 새 기사 저장 → Gemini 검색어 생성 → YouTube 검색 → HTML 생성 → localhost:3333 서빙 → read 마킹까지 모두 수행됩니다.

### CLI 명령어

| 명령어 | 설명 |
|---|---|
| `pnpm start` | 전체 파이프라인 실행 |
| `pnpm start --no-api` | YouTube API 호출 생략 (검색 링크만 표시) |
| `pnpm start --mark-read` | 모든 unread 기사를 read로 마킹 (긴급 클리어용) |
| `pnpm start --import-opml <path> [--category <name>]` | OPML에서 피드 import |
| `pnpm start --add-feed <url>` | 피드 추가 |
| `pnpm start --remove-feed <url>` | 피드 제거 |
| `pnpm start --list-feeds` | 등록된 피드 목록 표시 |

---

## 동작 과정

1. 기존 unread 기사를 모두 read=1로 정리 (backlog 클리어)
2. 등록된 RSS 피드를 모두 병렬 fetch
3. SQLite에 없는 새 기사만 read=0으로 저장 — **이번 사이클의 처리 대상**
4. 이 새 기사들을 Gemini로 일괄 전송 (50건씩 배치) → 검색어 배열 생성
5. 각 검색어로 YouTube 검색 (캐시 우선)
6. HTML 생성 후 localhost:3333에서 확인
7. HTML 생성 성공 시점에 이번 사이클에 처리된 articleId들만 read=1로 마킹

→ 4-6단계 어디서든 실패 시 해당 기사는 unread로 남아 다음 실행에서 자동 재처리됨. (1단계에서 정리된 backlog는 영향 없음)

---

## 프로젝트 구조

```
rss-extensions/
├── scripts/
│   ├── cli.ts                # 진입점 (라우팅)
│   ├── commands.ts           # 전체 파이프라인 + 피드 관리
│   ├── rss.ts                # RSS 파싱
│   ├── opml.ts               # OPML 파싱
│   ├── gemini.ts             # Gemini 검색어 생성
│   ├── youtube.ts            # YouTube 검색
│   ├── html.ts               # HTML 생성
│   ├── db.ts                 # SQLite
│   └── types.ts              # 타입 정의
├── data/                     # SQLite DB (gitignore)
├── .env                      # 환경변수 (gitignore)
└── package.json
```
