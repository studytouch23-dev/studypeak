---
name: mathlab-dev
description: 스터디피크 수학 랩(lab/index.html) 개발 가이드. lab/ 폴더의 코드를 수정·확장·디버깅하거나 기능을 추가할 때 먼저 읽는다. 앱 구조, 상태·저장소 키, 테스트 하네스 실행법, 배포 절차, 함정 목록.
---

# 수학 랩 개발 가이드

`lab/index.html` 하나에 CSS+HTML+JS가 모두 들어 있는 단일 파일 앱(~2,400줄).
외부 의존성은 CDN(cdnjs)의 KaTeX 0.16.11, JSZip 3.10.1, pdf.js 3.11.174뿐.

## 코드 지도 (파일 내 섹션 주석으로 검색)

JS는 `/* ═══ 섹션명 ═══ */` 주석으로 구획되어 있다. Grep으로 찾을 것:

| 섹션 | 핵심 함수 |
|---|---|
| 교육과정 프리셋 | `PRESET_CURRICULUM`, `CURRICULUM`(localStorage 오버레이), `KEYWORD_MAP`(자동 태그 사전) |
| IndexedDB | `DB.open/getAll/put/del/clear` — db명 `sp-math-lab`, store `problems`/`worksheets` |
| 단원태그 관리 | `renderTags`, `add/rename/deleteSubject·Chapter·Section`, `remapProblems` |
| 등록(단건/일괄) | `saveSingle`, `splitBulk`, `parseAnswerBlock`(해설지 [답] 형식), `saveBulk` |
| 파일 파서 | `parseHWPX`, `parsePDF`, `hwpEqToLatex`, `extractTextFromFile`, `handleUploadFiles` |
| PDF 영역 에디터 | `PDFED` 상태, `openPdfEditor(res,{solDefault})`(PDF 여러 개 통합: pg.srcName/fileSol, 파일명·'정답 및 해설' 표제로 페이지 자동 해설 분류), 페이지 `mode: prob/sol/skip`(클릭 순환), `detectRegionsByAnchors`(마침표 앵커 우선 + `bestAnchorSeq` 번호 수열 정합으로 쪽번호·꼬리말 숫자 제거), `detectRegionsByPixels`, `fitRegionsToInk`(앵커 영역을 인식 즉시 scale 2 렌더(`pdfedInkCanvas`)의 잉크에 맞춤: 위는 번호보다 '오른쪽에만' 있는 잉크(첫 줄 분수 분자·지수)를 4pt 미만 틈으로 최대 26pt까지, 아래는 다음 문제 윗줄 직전의 마지막 잉크(단 마지막은 40pt 빈 띠 뒤 꼬리말 제외), 페이지 40% 이상 세로줄(단 구분선)·단 85% 이상 가로줄 무시 → `r.fitted`), `pdfedFinish`(해설 영역→`d.solImg` 번호 매칭, `r.fitted`/`r.exact`(손으로 옮김·크기조절) 영역은 화면 그대로 자르고, 손으로 그린 영역만 `refineRectOnCanvas` 보정 — 세로 구분선은 따라가지 않음), `collectAnchors`(줄 앞 숫자만 앵커), 그림 크롭 `validFigBox`/`cropDataURL`/`openImgCrop`, 그림 편집기 `IMGED`/`openImgEditor`(지우개·선명하게·기울기·스탬프, 저장은 saveProblem 경유), AI 벡터 복원 `imgedAiRedraw`/`sanitizeSvg`(Claude 비전→SVG, viewBox로 크기 결정·width/height 주입 필수) |
| 검색·작업 | `problemsFiltered`, `renderDB`(30/페이지), `renderTree`, `semanticSearch`(bigram), `imgHash`(aHash 이미지검색), 프리셋 |
| 일괄 작업 | `openBatchTag`, `batchAutoTag`, `batchReviewed`, `batchDelete` |
| AI 변환 | `aiJsonCall`(공용 호출: `aiHeaders()`에 키·워크스페이스 ID, 재시도·오류 한국어 안내), `aiTranscribeImage(img, hint, issues)`(전사 전용 프롬프트 `aiPrompt`), `aiTranscribeChecked`(렌더 검증 `mathIssues`=KaTeX+한글 변환 → 문제 있으면 `retryIssuesBlock`으로 1회 재판독, 남은 경고 `d.aiIssues`→저장 시 #검수주의), PDF 글자층 힌트 `pdfTextInRect`/`pdfHintBlock`(`d.pdfText`/`d.solText`, pdfedFinish에서 잉크 보정 영역 기준), `aiTranscribeDrafts`, `batchAiTranscribe`(단원 분류는 전사와 분리: `aiClassifyPrompt`/`aiClassifyItems` 텍스트 8문항 묶음, `curriculumBriefFull` 분류표 + `validClassify` 대조), 독립 검산 `aiVerifyPrompt`/`verifyOutcome`/`batchAiVerify`(#검산불일치, `p.verify`), `aiSolveProblem`/`batchAiSolve`/`aiSolveDetail`(해설 생성, #AI해설 태그), `batchQa`/`ruleCheckProblem`/`aiQaProblem`/`aiFixProblem`(검수→자동수정→재검수: 통과→reviewed+#AI수정, 실패→#검수주의) — 테스트는 page에서 window.fetch 스텁(교정자/검수자 프롬프트로 분기). 모든 AI 루프는 매 문항 전 `AI_BATCH.cancel` 확인(⏹ 중지 바: aiBatchStart/Done/Cancel). 전사 결과 반영은 `applyAiDraftResult`/`applyAiSolResult` 공용 함수 — `tools/ingest.js --max`(Claude Code 변환)가 page.evaluate로 같은 함수를 호출하므로 시그니처 변경 시 tools/ 동반 수정 |
| 학습지 | `renderSheet`, `autoCompose`, `printSheet`(doctype 4종), `setPoint` |
| HTML 내보내기 | `downloadHtmlExport('sheet'|'book')`, `buildHtmlExport`, `mathToHtml`(katex.renderToString 사전 렌더), `htmlProblemBody`(박스·[그림] 슬롯·선택지 공용 렌더) — 내보내는 파일 안의 `</script>`는 반드시 `<\/script>`로 쓸 것(단일 파일 앱이라 스크립트가 끊김) |
| 오류 기록 | `errLog`/`errLogEqDiag`(EQ_DIAG.samples 수식 원문)/`buildErrReport`/`copyErrReport` — localStorage sp-lab-errlog(최대 300). 다운로드·검수·aiJsonCall·window error에서 자동 수집. 사용자가 보고서를 붙여넣으면: 각 항목 원인 수정 + tests/ 회귀 추가 |
| 클라우드 동기화 | `SB`/`sbInit`/`sbLoad`(jsdelivr 동적 로드)/`sbQueue`·`sbQueueDel`(saveProblem·삭제 훅)/`sbFlush`(1.2s 묶음 upsert)/`sbPull`(updated_at 증분, 최신 우선)/`sbPushAll`·`sbPullAll` — 테이블 스키마 `supabase/schema.sql`(RLS), 테스트는 window.supabase 스텁 |
| HWPX 생성 | `latexToHwpEq`, `eqMeasure`(수식 크기), `hwpxEquation`, `hwpxPic`/`registerHwpxBin`, `saveHwpxFile`, `downloadHWPX` |

## 상태·저장소

- **대용량 원칙(수만 문항)**: 메모리의 `state.problems`는 `lightenProblem()`을 거친
  라이트 레코드(images:[] + imgN). 이미지가 필요하면 반드시 `imagesOf(p)`(IndexedDB 조회,
  LRU 캐시), 문제 저장은 반드시 `saveProblem(p)`(라이트 레코드 저장 시 DB의 이미지 보존).
  `DB.put('problems', …)` 직접 호출 금지(이미지 유실됨). 로딩/백업은 `DB.each` 커서.
  이미지 의도적 삭제는 `p.images=[]; p.imgN=0` 둘 다 설정.
  해설 크롭 이미지는 `p.solImg`(+`solImgN` 플래그, 라이트 레코드는 본문 제거) — 조회는 `solImgOf(p)`.
- localStorage JSON 읽기는 반드시 `lsJson(key, 기본값)` (한 키가 깨져도 앱이 죽지 않게).
- `fixAiNewlines(s, keepDisplay)`: AI 응답 정리 경로만 `$$`→`$` 접기. 저장본 점검·시작 복구 경로는
  반드시 `keepDisplay=true`로 호출(사용자 블록 수식 보존).
- `state`: problems(라이트), worksheets, cart(=선택), points, page, searchMode, filterTag, viewList, numOf.
- localStorage 키: `sp-lab-cart`, `sp-lab-points`, `sp-lab-curriculum`, `sp-lab-filehashes`,
  `sp-lab-presets`, `sp-lab-joblog`.
- 문제 스키마: `{id, question, choices[], answer, solution, images[](dataURL),
  subject, chapter, section, grade, srcType, srcName, srcYear, difficulty(1-5),
  tags[], origNo, reviewed, createdAt, updatedAt}`.
- 일괄 등록분은 `reviewed:false`(미검수)로 시작, 수동 입력은 true.

## 테스트 하네스 (반드시 이 방식으로 검증)

**저장소 `tests/` 폴더에 상설 회귀 테스트가 있다** — 코드 수정 후 커밋 전에 반드시:
`cd tests && npm install && node run-all.js` (전체 통과 확인). 새 기능엔 새 smokeN.js를 추가하고
tests/README.md 표를 갱신할 것. 사용자 업로드 파일이 필요한 테스트만 scratchpad에 둔다.

샌드박스에서 CDN(cdnjs)이 차단되므로 라이브러리를 로컬 주입한다(tests/node_modules 활용):

```js
// http 서버로 repo 루트 서빙(+ /pwlib/ → pdfjs-dist/build 매핑), 404 처리 필수
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium', args:['--no-sandbox']});
await page.addScriptTag({path: '.../node_modules/jszip/dist/jszip.min.js'});
await page.addScriptTag({url: 'http://127.0.0.1:PORT/pwlib/pdf.min.js'});
await page.evaluate(()=>{ pdfjsLib.GlobalWorkerOptions.workerSrc='http://127.0.0.1:PORT/pwlib/pdf.worker.min.js'; });
```

- 앱은 workerSrc가 비어 있을 때만 CDN을 설정하므로 테스트 선주입이 유효하다.
- HWPX 다운로드 검증: `browser.newContext({acceptDownloads:true})` → `waitForEvent('download')`
  → node에서 JSZip으로 열어 XML을 페이지의 DOMParser로 well-formed 검사.
- **셀렉터 함정**: `text=...`는 부분 일치라 안내 문구를 클릭하는 사고가 반복됐다.
  버튼은 `#id` 또는 `button:has-text()`로 지정할 것.
- 과거 스모크: scratchpad `smoke*.js` 패턴 참조 (세션마다 새로 작성해도 됨).

## 함정·규칙

- 한국어/따옴표가 들어가는 동적 HTML 속성은 inline onclick에 넣지 말고
  `data-*` + 위임 리스너 사용 (`renderTree` 방식). 텍스트는 반드시 `esc()`.
- `renderDB`는 numOf 계산 → `problemsFiltered()` 순서 유지 (#번호 검색이 의존).
- 수식: 웹 표시는 `$...$` + KaTeX(`renderMath`), HWPX 출력은 `latexToHwpEq`,
  가져오기는 `hwpEqToLatex`. 토큰 추가 시 세 곳 모두 고려. 상세는 hwpx-format 스킬.
- 이미지 dataURL이 IndexedDB에 저장되므로 크롭은 JPEG 품질 0.87, 스케일 2 유지.
- 기능 추가 시 `lab/README.md` 현황표 갱신.
- 커밋 메시지에 모델명 금지. 브랜치에 push 후 사용자가 PR merge(배포는 사용자 몫).
- `tools/`(맥 자동화: ingest·generate)는 공용 모듈 `tools/_common.js`(서빙·브라우저·로그인·
  Claude Code 호출·supabase 스텁)를 쓴다. 수정 시 smoke34(ingest)·smoke36(generate)으로 검증.
  페이지의 전역 함수(aiPrompt, buildGenPrompt, genResultToBulk, applyAi*Result)에 의존하므로
  이름을 바꾸면 tools/ 도 함께 고칠 것.

## 미구현(서버 필요) — 약속하지 말 것

HWP 바이너리 파싱, DOCX/OMML 출력, 임베딩 검색, 멀티유저.
(그림 AI 복원은 `imgedAiRedraw`가 Claude 비전→SVG로 서버 없이 구현함)
(OCR·분류·해설은 사용자 API 키 기반 AI 변환/해설 생성으로 대체됨) `lab/README.md` 로드맵 참조.
