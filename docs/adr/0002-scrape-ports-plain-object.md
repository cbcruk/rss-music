# Scrape의 seam은 Effect Layer가 아니라 평범한 객체로 둔다

외부 의존을 다루는 다른 모듈(`Fetcher`, `RssParser`, `GeminiClient`, `YoutubeClient`)은 모두 Effect `Context.Tag`로 주입받지만, Scrape만 평범한 객체(`ScrapePorts`)를 인자로 받는다. `runPipeline`은 진행 이벤트를 흘려보내는 async generator이고, 이것을 Effect로 옮기면 `Stream`으로 바꿔야 하며 그 파장이 두 호출자 모두에 — CLI와 브라우저로 나가는 `ReadableStream` 스트리밍까지 — 닿는다. 얻으려던 것은 Scrape interface에서의 테스트 가능성이었고 그것은 평범한 객체로 충분히 얻어지므로, 일관성을 위해 그 비용을 치르지 않기로 했다.

`ScrapePorts` 뒤의 모듈들은 내부적으로 Effect를 그대로 쓴다. 여기만 Effect가 빠진 것처럼 보이지만, 통일하려면 위 비용이 그대로 돌아온다.
