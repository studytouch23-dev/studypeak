# StudyPeak (studypeak.co.kr)

GitHub Pages 정적 사이트. `main` 브랜치가 www.studypeak.co.kr 로 배포된다 (CNAME).

- `index.html` (루트): 스터디피크 메인 랜딩. 번들된 대용량 파일 — **건드리지 말 것**.
- `lab/index.html`: **스터디피크 수학 랩** — 개인 수학 문제 DB + 학습지 제작기.
  100% 클라이언트 사이드 단일 파일 앱. my1ta.com/lab 벤치마킹.
- `supabase/team-key.sql`: 학원 팀 키(직원 계정의 AI 비용을 학원 API 키로) 표·읽기 규칙. 실제 키는 저장소가 아니라 Supabase 표에만 있다 — 키를 코드·문서에 적지 말 것.
- `lab/units-sp.js`: 스터디피크 마스터 유형표를 단원 체계에 나눈 기본 DB — **자동 생성**.
  원본 `tools/data/studypeak-master.md`(문자열 원본 그대로, 오타도 고치지 말 것) → `node tools/build-sp-units.js`.
- `lab/units-db.js`: 랩 세분류 DB(소단원·유형·상세유형) — 유형표에 없는 곳·[랩 세분류 합치기]용.
- `eumkorean/index.html`: **엄태욱T 자기 교정 표준 검사 신청 안내** (주관 엄태욱T, 협력 학원 대치SNT · 대치명인 · 예섬학원). 단일 정적 페이지.
  신청은 구글 폼으로 연결되고 일정은 파일 안 `#state` JSON 에 있다. 수학 랩과 무관 — lab 테스트 대상 아님.
  `sntkorean/index.html` 은 예전 주소로 들어온 사람을 `/eumkorean/` 으로 보내는 이동 안내 페이지 — 지우지 말 것.
- `lab/README.md`: 기능 현황표(스펙 대비 ✅/🔶/❌)와 로드맵. 기능 추가 시 갱신할 것.
- `korlab/`: **스터디피크 국어 랩** (www.studypeak.co.kr/korlab/) — 지문 + 문항 세트 DB. 여러 파일(`korlab/js/*.js`) + 공용 부품(`shared/*.js`).
  작업 전에 `korlab/PLAN.md`(기획·진행 상황·코드 지도·한계)를 먼저 읽을 것. `lab/`은 건드리지 않는다.
  테스트는 `tests/smoke78~84.js`(78 PDF 엔진 · 79 화면 · 80 유형·엑셀 엔진 · 81 분류·근거·변형 · 82 출력·교재 · 83 시험지 보관함·난도 · 84 스캔본 읽기). 실제 시험지 PDF는 저작권 때문에 저장소에 넣지 않는다.
  국어 유형은 **엄태욱 마스터 22종**(독서 R01~R09 · 문학 L01~L08 · 문법 G01~G05, 화법과 작문·매체는 유형 없음). 유형명·LMS 소분류 문자열은
  `korlab/js/ktype.js` 에만 있고 LMS 등록 값이라 **한 글자도 고치지 말 것**(마스터에 없는 유형을 만들지 말 것). 사용자는 엄태욱T(국어 강사).

## 작업 규칙

- 배포는 작업 브랜치 → PR → 사용자가 main에 merge → Pages 자동 빌드(1~2분).
  main에 직접 push 금지.
- `lab/` 수정 전에 `.claude/skills/mathlab-dev/SKILL.md` 를 읽을 것 (구조·테스트 방법).
- HWPX 생성/파싱·한글 수식 작업은 `.claude/skills/hwpx-format/SKILL.md` 참조 —
  포맷을 다시 리버스엔지니어링하지 말 것.
- 모든 기능 변경은 Playwright 헤드리스 스모크 테스트로 검증 후 커밋
  (방법은 mathlab-dev 스킬에 있음).
- 사용자(수학 강사)는 비개발자. 보고는 한국어로, 클릭 단위로 안내.
