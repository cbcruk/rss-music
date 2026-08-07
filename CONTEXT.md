# RSS Music

RSS 피드에서 음악 기사를 모아, 기사가 언급한 곡을 YouTube 영상과 이어 붙여 한자리에서 듣게 해주는 앱.

## Language

### 수집

**Feed**:
구독 중인 발행처. 기사에 찍히는 출처가 곧 이 Feed다.
_Avoid_: source, publication, site

**Article**:
Feed가 발행한 글 한 편. 음악 기사일 수도, 인터뷰나 라인업 공지처럼 곡을 다루지 않는 글일 수도 있다.
_Avoid_: item, entry, post

**Scrape**:
Feed를 훑어 새 Article을 모으고, 거기서 Track을 뽑아 Match까지 붙이는 한 번의 실행.
_Avoid_: pipeline, run

### 음악 매칭

**Search Query**:
Article에서 뽑아낸, Track 하나를 찾기 위한 영문 YouTube 검색어.
_Avoid_: query, prompt, keyword

**Track**:
Article이 언급한 개별 곡. 주간 추천 같은 리스트 기사에서는 여러 개가 나오고, 곡을 다루지 않는 Article에서는 하나도 나오지 않는다.
_Avoid_: song, music, item

**Match**:
Track에 대응시킨 YouTube 영상. 찾아봤지만 마땅한 영상이 없으면 빈 Match로 남으며, 이것도 확정된 결과다. 검색 자체가 실패한 경우는 Match가 없는 상태이고, 다음 Scrape에서 다시 시도된다.
_Avoid_: video, cached video, result

### 상태

Article은 아래 두 상태를 각각 따로 가진다. 서로 독립이라 한쪽이 다른 쪽을 함의하지 않는다.

**Read**:
사용자가 읽음으로 넘긴 Article. 사용자만 바꿀 수 있다.
_Avoid_: seen, archived

**Processed**:
Scrape가 Track 추출까지 끝낸 Article. Scrape만 바꾸며, 아직 읽지 않은 Article도 Processed일 수 있다.
_Avoid_: done, handled, scraped
