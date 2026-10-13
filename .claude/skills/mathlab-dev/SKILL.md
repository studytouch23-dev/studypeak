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
| PDF 영역 에디터 | `PDFED` 상태, `openPdfEditor`, `detectRegionsByAnchors`, `detectRegionsByPixels`, `pdfedFinish` |
| 검색·작업 | `problemsFiltered`, `renderDB`(30/페이지), `renderTree`, `semanticSearch`(bigram), `imgHash`(aHash 이미지검색), 프리셋 |
| 일괄 작업 | `openBatchTag`, `batchAutoTag`, `batchReviewed`, `batchDelete` |
| AI 변환 | `aiTranscribeImage`(Claude 비전, 사용자 키 `sp-lab-apikey`, `anthropic-dangerous-direct-browser-access` 헤더), `aiTranscribeDrafts`, `batchAiTranscribe` — 테스트는 page에서 window.fetch 스텁 |
| 학습지 | `renderSheet`, `autoCompose`, `printSheet`(doctype 4종), `setPoint` |
| HWPX 생성 | `latexToHwpEq`, `eqMeasure`(수식 크기), `hwpxEquation`, `hwpxPic`/`registerHwpxBin`, `saveHwpxFile`, `downloadHWPX` |

## 상태·저장소

- **대용량 원칙(수만 문항)**: 메모리의 `state.problems`는 `lightenProblem()`을 거친
  라이트 레코드(images:[] + imgN). 이미지가 필요하면 반드시 `imagesOf(p)`(IndexedDB 조회,
  LRU 캐시), 문제 저장은 반드시 `saveProblem(p)`(라이트 레코드 저장 시 DB의 이미지 보존).
  `DB.put('problems', …)` 직접 호출 금지(이미지 유실됨). 로딩/백업은 `DB.each` 커서.
  이미지 의도적 삭제는 `p.images=[]; p.imgN=0` 둘 다 설정.
- `state`: problems(라이트), worksheets, cart(=선택), points, page, searchMode, filterTag, viewList, numOf.
- localStorage 키: `sp-lab-cart`, `sp-lab-points`, `sp-lab-curriculum`, `sp-lab-filehashes`,
  `sp-lab-presets`, `sp-lab-joblog`.
- 문제 스키마: `{id, question, choices[], answer, solution, images[](dataURL),
  subject, chapter, section, grade, srcType, srcName, srcYear, difficulty(1-5),
  tags[], origNo, reviewed, createdAt, updatedAt}`.
- 일괄 등록분은 `reviewed:false`(미검수)로 시작, 수동 입력은 true.

## 테스트 하네스 (반드시 이 방식으로 검증)

샌드박스에서 CDN(cdnjs)이 차단되므로 라이브러리를 로컬 주입한다.
scratchpad에 `playwright-core`, `jszip`, `pdfjs-dist@3.11.174` npm 설치 후:

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

## 미구현(서버 필요) — 약속하지 말 것

스캔 PDF OCR, HWP 바이너리 파싱, LLM 자동 분류/해설 생성, 그림 AI 복원,
DOCX/OMML 출력, 임베딩 검색, 멀티유저. `lab/README.md` 로드맵 참조.
