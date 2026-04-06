---
name: feedly-music
description: Scrape unread articles from a Feedly category, extract music tracks, search YouTube, and render results as an HTML page with embedded video players.
allowed-tools: Bash Read Write
---

Feedly 카테고리에서 안 읽은 기사를 가져오고, 음악 트랙을 추출한 뒤, YouTube 검색 결과를 HTML로 렌더링합니다.

`.env` 파일에 `FEEDLY_TOKEN`과 `YOUTUBE_API_KEY`가 설정되어 있어야 합니다.

아래 단계를 순서대로 실행하세요.

## Step 1: Feedly Fetch

Bash 도구로 실행:

```
cd /Users/ieunsu/Documents/GitHub/rss-extensions && pnpm start
```

인자 없이 실행하면 Feedly에서 안 읽은 기사를 가져오고 읽음 처리합니다.
결과는 JSON으로 stdout에 출력됩니다.

## Step 2: Build Search Queries

Step 1의 JSON 결과에서 각 기사 제목을 분석하여 YouTube 검색어를 생성하세요.

규칙:

- 곡/앨범 리뷰 → 아티스트명 + 곡명으로 최적의 YouTube 검색어 생성
- "Songs of the Week" 등 리스트 글 → 제목에 언급된 모든 트랙에 대해 각각 검색어 생성
- 뉴스, 인터뷰, 페스티벌 라인업 등 비음악 콘텐츠 → `searchQuery`를 빈 문자열(`""`)로 설정하되 목록에서 제외하지 마세요
- 검색어는 YouTube에서 해당 곡의 공식 뮤직비디오나 오디오를 찾을 수 있도록 맥락에 맞게 작성
  - 예: 신곡 리뷰 → "Artist Name Song Title official music video"
  - 예: 라이브 공연 → "Artist Name Song Title live performance"
  - 예: 커버곡 → "Artist Name Song Title cover"

결과를 아래 JSON 배열 형식으로 정리하세요:

```json
[
  {"articleId": "Feedly entry ID", "searchQuery": "YouTube 검색어", "articleTitle": "원본 기사 제목", "source": "출처", "url": "기사 URL"},
  ...
]
```

## Step 3: YouTube Search + HTML Output

생성한 JSON 배열을 인자로 넘겨서 실행하세요:

```
cd /Users/ieunsu/Documents/GitHub/rss-extensions && pnpm start '<JSON 배열>'
```

이 명령이 각 검색어로 YouTube 영상을 검색하고, localhost:3000에서 결과 페이지를 자동으로 엽니다.
타임아웃을 120초 이상으로 설정하세요. 서버는 프로세스가 종료될 때까지 유지됩니다.

완료 후 결과를 간단히 요약하세요 (기사 수, 트랙 수, YouTube 매칭 수).
