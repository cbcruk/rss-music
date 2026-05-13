# rss-extensions

RSS 피드에서 안 읽은 기사를 수집하고, 음악 트랙을 추출한 뒤 YouTube 영상과 매칭하여 HTML로 보여줍니다.

- **RSS 직접 구독** → 등록된 피드를 직접 fetch (3rd-party API 불필요)
- **Claude Code** → 기사 제목에서 YouTube 검색어 생성
- **YouTube Data API v3** → 영상 검색
- **SQLite** → 피드 / 기사 / read 상태 / YouTube 검색 결과 저장
- **Claude Code Skill** → `/rss-music` 명령으로 실행

---

## 세팅 순서

### 1. 의존성 설치

```bash
pnpm install
```

### 2. YouTube API Key 발급

[Google Cloud Console](https://console.cloud.google.com/) → 새 프로젝트 → `YouTube Data API v3` 활성화 → API 키 만들기

### 3. 환경변수 설정

`.env` 파일에 설정:

```
YOUTUBE_API_KEY=your_api_key
```

### 4. 피드 등록

Feedly에서 OPML export 받기: Settings → Import / Export → Export OPML.

```bash
pnpm start --import-opml ./feedly.opml --category musicexplo
```

또는 개별 추가:

```bash
pnpm start --add-feed https://example.com/feed.xml
```

---

## 사용법

### Claude Code Skill

```
/rss-music
```

### CLI 명령어

| 명령어 | 설명 |
|---|---|
| `pnpm start` | 등록된 RSS 피드를 모두 fetch하고 unread 기사를 JSON으로 출력 |
| `pnpm start '<JSON>'` | YouTube 검색 + HTML 생성 + localhost:3000 서빙 |
| `pnpm start '<JSON>' --no-api` | YouTube API 없이 검색 링크만 제공 |
| `pnpm start --mark-read` | 모든 unread 기사를 read로 마킹 |
| `pnpm start --import-opml <path> [--category <name>]` | OPML 파일에서 피드 import |
| `pnpm start --add-feed <url>` | 피드 추가 |
| `pnpm start --remove-feed <url>` | 피드 제거 |
| `pnpm start --list-feeds` | 등록된 피드 목록 표시 |

---

## 동작 과정

1. 등록된 RSS 피드를 모두 병렬 fetch
2. SQLite에 없는 새 기사만 저장 (read=0)
3. unread 기사 전체를 JSON으로 stdout 출력
4. Claude가 기사 제목을 분석하여 YouTube 검색어 생성
5. YouTube Data API로 영상 검색 (캐시 우선)
6. 결과를 HTML로 생성하여 localhost:3000에서 확인
7. 확인 후 `pnpm start --mark-read`로 read 처리

---

## 프로젝트 구조

```
rss-extensions/
├── .claude/skills/rss-music/
│   └── SKILL.md              # /rss-music 스킬 프롬프트
├── scripts/
│   ├── cli.ts                # 진입점 (라우팅)
│   ├── commands.ts           # scrape / search / mark-read / feed 관리
│   ├── rss.ts                # RSS 파싱 (rss-parser)
│   ├── opml.ts               # OPML 파싱
│   ├── youtube.ts            # YouTube 검색
│   ├── html.ts               # HTML 생성
│   ├── db.ts                 # SQLite (feeds / articles / youtube_cache)
│   └── types.ts              # 타입 정의
├── data/                     # SQLite DB (gitignore)
├── .env                      # 환경변수 (gitignore)
└── package.json
```
