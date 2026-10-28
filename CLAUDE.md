# StudyPeak (studypeak.co.kr)

GitHub Pages 정적 사이트. `main` 브랜치가 www.studypeak.co.kr 로 배포된다 (CNAME).

- `index.html` (루트): 스터디피크 메인 랜딩. 번들된 대용량 파일 — **건드리지 말 것**.
- `lab/index.html`: **스터디피크 수학 랩** — 개인 수학 문제 DB + 학습지 제작기.
  100% 클라이언트 사이드 단일 파일 앱. my1ta.com/lab 벤치마킹.
- `lab/units-db.js`: 기본 단원 DB(소단원·유형·상세유형) — `lab/index.html`이 불러 씀.
- `lab/README.md`: 기능 현황표(스펙 대비 ✅/🔶/❌)와 로드맵. 기능 추가 시 갱신할 것.

## 작업 규칙

- 배포는 작업 브랜치 → PR → 사용자가 main에 merge → Pages 자동 빌드(1~2분).
  main에 직접 push 금지.
- `lab/` 수정 전에 `.claude/skills/mathlab-dev/SKILL.md` 를 읽을 것 (구조·테스트 방법).
- HWPX 생성/파싱·한글 수식 작업은 `.claude/skills/hwpx-format/SKILL.md` 참조 —
  포맷을 다시 리버스엔지니어링하지 말 것.
- 모든 기능 변경은 Playwright 헤드리스 스모크 테스트로 검증 후 커밋
  (방법은 mathlab-dev 스킬에 있음).
- 사용자(수학 강사)는 비개발자. 보고는 한국어로, 클릭 단위로 안내.
