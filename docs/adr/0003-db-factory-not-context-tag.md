# db는 Context.Tag가 아니라 팩토리로 둔다

외부 의존을 다루는 다른 모듈(`Fetcher`, `RssParser`, `GeminiClient`, `YoutubeClient`)은 Effect `Context.Tag`로 주입받지만, db는 `makeDb(filename)` 팩토리와 그것으로 만든 기본 인스턴스를 export한다. Tag로 옮기면 라우트의 server function 5곳이 각자 Layer를 제공해야 하는데, 그 비용으로 사줄 것이 없다 — db를 실제로 갈아끼우고 싶어 하는 소비자가 없기 때문이다. Scrape는 `ScrapePorts`(ADR-0002)로 이미 자기 seam을 갖고 있어 테스트에서 db를 아예 로드하지 않고, 라우트에는 테스트가 없으며, `db.test.ts`는 쿼리 자체를 검증하는 곳이라 진짜 SQLite를 원한다. 팩토리는 그 셋 중 실제로 필요한 것 하나만 준다: 테스트별로 격리된 `:memory:` 인스턴스.

아키텍처 리뷰가 "db만 seam 밖에 있다"를 후보로 올린 적이 있다. 맞는 관찰이지만, 그 후보의 원래 명분(파이프라인 테스트가 진짜 DB를 필요로 함)은 ADR-0002의 작업으로 이미 사라졌다.
