# 프로젝트 스킬

[mattpocock/skills](https://github.com/mattpocock/skills)에서 이 프로젝트에 맞는 것만 골라 가져왔습니다.
원본 라이선스는 MIT (Copyright (c) 2026 Matt Pocock), 가져온 시점의 커밋은 `84fdeff`입니다.

내용은 수정 없이 그대로 두었습니다. 원본이 갱신되면 해당 디렉터리를 다시 복사하면 됩니다.

## 가져온 스킬

| 스킬                        | 쓰는 상황                               | 이 프로젝트와의 접점                                                                  |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| `tdd`                       | 기능 추가·버그 수정을 테스트 먼저 할 때 | vitest 스위트가 이미 있음. 서버 모듈이 대부분 순수 함수라 seam이 뚜렷함               |
| `codebase-design`           | 모듈 인터페이스를 설계·정리할 때        | Effect `Context.Tag`로 `Fetcher`/`RssParser`/`GeminiClient`를 이미 seam으로 분리해 둠 |
| `diagnosing-bugs`           | 원인이 안 보이는 버그, 성능 저하        | RSS·Gemini·YouTube 외부 연동이 많아 재현 루프부터 세우는 방식이 잘 맞음               |
| `resolving-merge-conflicts` | 머지/리베이스 충돌 해결                 | main이 선형 히스토리라 squash 머지 후 충돌이 종종 생김                                |
| `domain-modeling`           | 도메인 용어를 확정하거나 ADR을 남길 때  | `read`(사용자 액션) vs `processed`(파이프라인)처럼 헷갈리기 쉬운 용어가 실재함        |

`agents/openai.yaml`은 OpenAI 에이전트용 설정이라 제외했습니다.

## 일부러 뺀 것

- **`code-review`** — Claude Code 기본 제공 `code-review` 스킬과 이름이 겹칩니다. 게다가 원본은 "저장소에 문서화된 코딩 표준"과 "작업의 근거가 된 이슈/스펙"을 전제로 하는데, 이 저장소엔 둘 다 없습니다.
- **이슈 트래커 계열** (`triage`, `to-spec`, `to-tickets`, `implement`, `wayfinder`, `setup-matt-pocock-skills`, `grill-with-docs`, `improve-codebase-architecture`, `ask-matt`) — 트래커에 라벨 체계와 문서 레이아웃을 세팅해 두어야 굴러갑니다. 이 저장소는 GitHub Issues를 쓰지 않습니다.
- **`git-guardrails-claude-code`** — `git push` 등을 훅으로 차단합니다. 지금 작업 방식(브랜치 푸시 → PR)과 정면으로 부딪힙니다.
- **`setup-ts-deep-modules`** — dependency-cruiser 의존성과 설정을 추가합니다. `in-progress` 상태이기도 해서 뺐습니다.
- **`research`** — 백그라운드 에이전트를 띄우는 걸 전제로 합니다.
- **`migrate-to-shoehorn`, `scaffold-exercises`, `wizard`, `prototype`** — 이 프로젝트에서 쓰지 않는 라이브러리·워크플로 대상입니다.
- **생산성 계열** (`grill-me`, `handoff`, `teach`, `to-questionnaire`, `wait-what`, `grilling`, `writing-*`) — 프로젝트에 매이지 않는 범용 스킬이라 개인 설정(`~/.claude/skills`)에 두는 편이 맞습니다.

## 알아둘 것

가져온 스킬이 여기 없는 스킬을 가리키는 곳이 있습니다. 해당 단계에서만 무시하면 됩니다.

- `tdd` → refactoring은 `code-review` 스킬 몫이라고 안내 (기본 제공 `code-review`로 대신하면 됩니다)
- `diagnosing-bugs` Phase 6 → `/improve-codebase-architecture`로 넘기라고 안내
- `tdd`, `diagnosing-bugs`, `domain-modeling` → 루트의 `CONTEXT.md`를 읽으라고 안내. 아직 없습니다. `domain-modeling`이 필요할 때 만들어 줍니다.
- `codebase-design`의 `DESIGN-IT-TWICE.md` → 서브에이전트를 병렬로 띄우는 패턴입니다.
