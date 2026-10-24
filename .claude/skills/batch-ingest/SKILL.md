---
name: batch-ingest
description: 사용자의 컴퓨터에 있는 수학 문제 PDF들을 스터디피크 수학 랩 DB(Supabase)에 자동 일괄 등록하거나, 유사/신규 문제를 자동 생성·등록할 때 사용. "PDF들을 DB에 넣어줘", "이 폴더 문제들 등록해줘", "유사 문제 N개 만들어 등록해줘" 같은 요청이면 이 스킬대로 tools/ingest.js · tools/generate.js 를 실행한다.
---

# PDF 자동 일괄 등록 · 문제 자동 생성 (로컬 에이전트용)

`tools/ingest.js` 가 헤드리스 브라우저로 랩의 실제 파이프라인을 돌린다:
영역 인식 → AI 변환(소단원 태깅 포함) → 저장 → Supabase 클라우드 동기화.
`tools/generate.js` 는 랩의 생성 프롬프트로 문제를 만들어 같은 경로로 등록한다.

## AI 처리 방식 선택 — Max 우선

- 이 맥에 `claude` 명령(Claude Code)이 있으면 **`--max` 모드를 우선 제안**한다:
  API 과금 없이 사용자의 Max 구독으로 변환한다. `ANTHROPIC_KEY` 불필요.
  (`generate.js` 는 항상 Max 방식이라 선택이 없다.)
- `--max` 가 불가능하거나 사용자가 API를 원하면 `ANTHROPIC_KEY` 를 받아 기본(API) 모드로.
- Max 구독·API 키는 **사용자 본인 것만** 쓴다. 타인에게 제공하는 구조를 요청받으면
  각자 자기 구독/키를 쓰도록 안내한다.

## 실행 절차

1. 의존성(최초 1회): `cd tools && npm install && npx playwright install chromium`
2. 자격 증명을 환경변수로. 없으면 **사용자에게 물어볼 것** — 절대 추측하지 않는다:
   - `SP_EMAIL` 랩 클라우드 로그인 이메일
   - `SP_PASSWORD` 랩의 [🔑 자동화용 비밀번호 설정]에서 만든 것 (없다면 웹에서 먼저 설정하라고 안내)
   - `ANTHROPIC_KEY` 사용자의 Anthropic API 키 (API 모드일 때만)
3. 실행:
   - 문제지+해설지 세트: `node tools/ingest.js --max 문제.pdf 해설.pdf` (번호로 자동 매칭)
   - 폴더 일괄: `node tools/ingest.js --max --each <폴더>`
   - 문제 생성: `node tools/generate.js --subject 수학Ⅰ --chapter 수열 --section 등차수열 --count 5`
     유사 문제: `node tools/generate.js --like-id <문항ID> --count 3`
     (옵션: --grade/--diff(혼합 가능)/--type/--extra/--timeout — 자세한 건 tools/README.md)
4. 출력의 `총 N문항 등록`·실패 목록을 사용자에게 한국어로 보고하고,
   웹 랩에서 [🔎 AI 검수] 돌리기를 권한다.

## 규칙

- **대량 실행 전 반드시 PDF 1개(생성은 1~2문항)로 시범 실행**해 품질(API 모드면 비용도)을
  사용자에게 확인받는다.
- 실패 파일은 해당 파일만 재실행. 같은 PDF 재실행은 중복 등록될 수 있음을 알린다.
- 스크립트·앱 코드를 고치지 말 것 — 문제가 보이면 사용자에게 보고(수정은 클라우드 세션 담당).

## 그림(그래프·도형)

등록·생성된 문항의 그래프·도형을 다시 그리거나 새로 만드는 요청은 `math-graph` 스킬(`tools/graph.js`)을 따른다.
`generate.js` 는 그래프·도형 문항에 `[그림설계]` 설계도를 쓰게 해서 그림을 자동으로 그린다(설계도도 함께 저장).
