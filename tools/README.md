# PDF 자동 등록 스크립트 (ingest)

내 컴퓨터에 쌓아 둔 수학 문제 PDF를, 사람 손 없이 랩의 파이프라인
(영역 인식 → AI 변환·소단원 태깅 → 저장 → Supabase 클라우드 동기화)으로
일괄 등록한다. 등록된 문항은 어느 기기에서 로그인해도 보인다.

## 준비 (최초 1회)

1. 웹 랩(백업·데이터 관리 → 클라우드 동기화)에서 로그인한 뒤
   **[🔑 자동화용 비밀번호 설정]** 으로 비밀번호를 만든다.
2. 이 저장소를 받고 의존성 설치:
   ```bash
   git clone https://github.com/studytouch23-dev/studypeak.git
   cd studypeak/tools && npm install && npx playwright install chromium
   ```

## 실행

```bash
export SP_EMAIL="로그인 이메일"
export SP_PASSWORD="자동화용 비밀번호"
export ANTHROPIC_KEY="sk-ant-..."

# 문제지+해설지를 한 세션으로 (번호로 자동 매칭)
node ingest.js 수학1-문제.pdf 수학1-해설.pdf

# 폴더 안 PDF를 한 개씩 차례로
node ingest.js --each ~/문제PDF모음/
```

옵션: `--timeout <분>` 세션당 AI 변환 제한 시간(기본 30분).

## 알아둘 것

- **비용**: 문항마다 AI 변환이 호출된다(본인 Anthropic 키, 문항당 소액).
  대량 실행 전에 작은 PDF 하나로 먼저 시험해 볼 것.
- **검수**: 자동 등록분은 전부 미검수 상태로 들어간다. 웹 랩에서 선택 →
  [🔎 AI 검수]를 돌리면 이상 문항만 #검수주의로 남는다.
- **중복**: 같은 PDF를 두 번 넣으면 중복 등록될 수 있다(웹의 중복 검사 도구로 정리 가능).
- 실패한 파일은 끝에 목록으로 보여주며, 그 파일만 다시 돌리면 된다.
