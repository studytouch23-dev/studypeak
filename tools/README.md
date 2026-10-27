# 자동화 스크립트 (맥/PC에서 실행)

내 컴퓨터에서 랩의 파이프라인을 사람 손 없이 돌리는 스크립트들.
등록·생성된 문항은 Supabase에 동기화되어 어느 기기에서 로그인해도 보인다.

| 스크립트 | 하는 일 |
|---|---|
| `ingest.js` | PDF 일괄 등록: 영역 인식 → AI 변환(이미지→한글 텍스트·수식, 소단원 태깅) → 저장 → 클라우드 동기화 |
| `generate.js` | 유사/신규 문제 생성: 랩의 생성 프롬프트로 Claude Code(Max)가 문제를 만들어 자동 등록·동기화 |
| `twins.js` | 쌍둥이·유사 변형 문제 일괄 생성: 내 DB 원본(출처·번호·ID로 고름)으로 정답·해설·그림까지 만들고 독립 검산 → 원본과 연결해 새 등록 묶음으로 저장·동기화 (Claude Code = Max) |
| `graph.js` | 그림 설계도(JSON: 식·좌표) → 정확한 그래프·도형 SVG/PNG, 문항 그림 내려받기(pull)·교체(attach). 설계도 형식은 `.claude/skills/math-graph/SKILL.md` |

## 준비 (최초 1회)

1. 웹 랩(백업·데이터 관리 → 클라우드 동기화)에서 로그인한 뒤
   **[🔑 자동화용 비밀번호 설정]** 으로 비밀번호를 만든다.
2. 이 저장소를 받고 의존성 설치:
   ```bash
   git clone https://github.com/studytouch23-dev/studypeak.git
   cd studypeak/tools && npm install && npx playwright install chromium
   ```

## AI 변환 방식 — API vs Max

- **`--max` (권장, 맥에서)**: 이 컴퓨터에 로그인된 **Claude Code(Max 구독)** 가 변환·생성을
  맡는다. **API 과금 없음** (Max 구독 사용량에 포함). `claude` 명령이 깔려 있고 로그인돼
  있어야 한다. 문항당 수 초~수십 초로 API보다 느릴 수 있다.
- **기본(API)**: `ANTHROPIC_KEY` 환경변수의 API 키로 호출(문항당 소액 과금).
- Max 구독은 **본인 전용**이다. 다른 사람이 쓰게 하려면 각자 자기 맥/구독(또는 자기 API 키)을
  써야 한다 — 내 구독·키를 남에게 빌려주지 말 것.

## PDF 등록 (ingest.js)

```bash
export SP_EMAIL="로그인 이메일"
export SP_PASSWORD="자동화용 비밀번호"

# Max 방식 (API 키 불필요)
node ingest.js --max 수학1-문제.pdf 수학1-해설.pdf   # 문제+해설 한 세션(번호 자동 매칭)
node ingest.js --max --each ~/문제PDF모음/            # 폴더 안 PDF를 한 개씩

# API 방식
export ANTHROPIC_KEY="sk-ant-..."
node ingest.js 수학1-문제.pdf 수학1-해설.pdf
```

옵션: `--timeout <분>` 세션당 AI 변환 제한 시간(기본 30분).

## 유사/신규 문제 생성 (generate.js)

항상 Claude Code(Max)로 생성한다(API 키 불필요).

```bash
export SP_EMAIL="로그인 이메일"
export SP_PASSWORD="자동화용 비밀번호"

# 단원을 지정해 새 문제 5개
node generate.js --subject 수학Ⅰ --chapter 수열 --section 등차수열 --count 5

# 내 DB의 특정 문항과 유사한 문제 3개 (문항 ID는 웹 랩 상세 화면에서 확인)
node generate.js --like-id <문항ID> --count 3
```

생성 직후 **독립 검산**이 자동으로 돈다: 새 호출이 정답을 모른 채 다시 풀어 생성된 정답과 비교하고,
다르면 `#검산불일치` 태그로 저장한다(웹에서 그 태그로 모아 확인). 생략하려면 `--no-verify`.

옵션: `--grade 고2` · `--diff 1~5|혼합`(기본 혼합) · `--type "객관식(5지선다)"|단답형|혼합`
· `--extra "추가 요청"` · `--timeout <분>`(기본 10).
생성 조건의 과목/대단원/소단원이 그대로 자동 태깅된다.

## 알아둘 것

- **비용**: API 방식은 문항마다 과금(본인 키). `--max`/generate.js 는 과금 없이 Max 구독
  사용량을 쓴다(한도에 닿으면 잠시 쉬었다 재개). 대량 실행 전에 PDF 1개·소량 생성으로 먼저 시험할 것.
- **검수**: 자동 등록·생성분은 전부 미검수 상태로 들어간다. 웹 랩에서 선택 →
  [🔎 AI 검수]를 돌리면 이상 문항만 #검수주의로 남는다.
- **중복**: 같은 PDF를 두 번 넣으면 중복 등록될 수 있다(웹의 중복 검사 도구로 정리 가능).
  완전히 똑같은 본문은 저장 단계에서 자동 제외된다.
- 실패한 파일/문항은 끝에 목록으로 보여주며, 그것만 다시 돌리면 된다.

## 그래프·도형 그림 (graph.js)

그림을 베끼지 않고 **설계도(식·좌표)** 로 그린다. 랩과 같은 엔진이라 웹·한글·HTML 결과가 같다.

```bash
node graph.js render 그림.json                   # 그림.svg + 그림.png
node graph.js check 그림.json                    # 형식 점검
node graph.js pull --id <문항ID> --out ./work     # 원본 그림·본문을 파일로 (SP_EMAIL/SP_PASSWORD 필요)
node graph.js attach --id <문항ID> 그림.json      # 문항의 0번 그림을 설계도 그림으로 교체 + 동기화 (--index new 면 추가)
```
맥의 Claude Code 에게 "문항 <ID> 그래프 다시 그려줘"라고 하면 `math-graph` 스킬대로
pull → 설계도 작성 → render 로 원본과 비교 → attach 까지 한다.
`generate.js` 로 만든 그래프·도형 문항은 그림이 자동으로 그려지고 설계도도 함께 저장된다.

## 쌍둥이·유사 변형 문제 (twins.js)

```bash
node twins.js --src "10월 모의고사"                          # 그 출처 문항 전부, 원본당 쌍둥이 1·변형 1
node twins.js --src "10월" --nos 1-10,15 --twin 2 --variant 1 --diff harder
node twins.js --ids 문항ID --twin 10                       # 한 문제로 쌍둥이 10개 (원본당 최대 10개씩)
node twins.js --ids 문항ID1,문항ID2 --no-verify
```
다 만든 뒤 웹: 문제 검색 → [등록 묶음]에서 "… 쌍둥이·변형" → **[📚 원본 + 쌍둥이·변형으로 교재 만들기]**
(원본 → 쌍둥이 → 변형 순서로 담겨 교재 HTML·한글·학습지로 바로 출력).
만든 문제는 다른 AI 호출이 정답을 모른 채 그려진 그림을 보고 다시 풀어 확인하고, 틀리면 바로잡거나 버리고 새로 만들어 검산을 통과한 것만 저장한다.
