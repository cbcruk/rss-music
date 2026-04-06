# feedly-music

Feedly 카테고리의 안 읽은 기사에서 음악 트랙을 추출하고, YouTube 영상을 매칭하여 HTML로 보여줍니다.

- **Feedly API** → 안 읽은 기사 가져오기 + 읽음 처리
- **Claude Code** → 기사 제목에서 YouTube 검색어 생성
- **YouTube Data API v3** → 영상 검색
- **SQLite** → 기사 및 YouTube 검색 결과 캐싱
- **Claude Code Skill** → `/feedly-music` 명령으로 실행

---

## 세팅 순서

### 1. 의존성 설치

```bash
pnpm install
```

### 2. YouTube API Key 발급

[Google Cloud Console](https://console.cloud.google.com/) → 새 프로젝트 → `YouTube Data API v3` 활성화 → API 키 만들기

### 3. Feedly Token 발급

Feedly 웹 접속 → DevTools → Network → 아무 요청의 `Authorization: Bearer ...` 값 복사

### 4. 환경변수 설정

`.env` 파일에 설정:

```
FEEDLY_TOKEN=your_feedly_token
YOUTUBE_API_KEY=your_api_key
```

---

## 사용법

### Claude Code Skill

```
/feedly-music
```

또는 CLI에서:

```bash
pnpm scrape
```

### CLI 명령어

| 명령어 | 설명 |
|---|---|
| `pnpm start` | Feedly에서 새 기사 가져오기 (캐시 필터링 + 읽음 처리) |
| `pnpm start '<JSON>'` | YouTube 검색 + HTML 생성 + localhost:3000 서빙 |
| `pnpm start '<JSON>' --no-api` | YouTube API 없이 검색 링크만 제공 |
| `pnpm start --mark-read` | 미처리 기사 모두 처리 완료로 마킹 |

---

## 동작 과정

1. Feedly API로 musicexplo 카테고리의 안 읽은 기사를 가져옴
2. SQLite에 이미 있는 기사는 필터링, 새 기사만 출력
3. Claude가 기사 제목을 분석하여 YouTube 검색어 생성
4. YouTube Data API로 영상 검색 (캐시 우선, 없으면 API 호출)
5. 결과를 HTML로 생성하여 localhost:3000에서 확인
6. 확인 후 `pnpm start --mark-read`로 처리 완료

---

## 프로젝트 구조

```
rss-extensions/
├── .claude/skills/feedly-music/
│   └── SKILL.md              # /feedly-music 스킬 프롬프트
├── scripts/
│   ├── cli.ts                # 진입점 (라우팅)
│   ├── commands.ts           # scrape, searchAndOutput, markAllRead
│   ├── feedly.ts             # Feedly API
│   ├── youtube.ts            # YouTube 검색
│   ├── html.ts               # HTML 생성
│   ├── db.ts                 # SQLite 캐시
│   ├── types.ts              # 타입 정의
│   └── constants.ts          # 상수
├── data/                     # SQLite DB (gitignore)
├── .env                      # 환경변수 (gitignore)
└── package.json
```
