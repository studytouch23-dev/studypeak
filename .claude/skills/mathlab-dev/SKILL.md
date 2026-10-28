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
| PDF 영역 에디터 | `PDFED` 상태, `openPdfEditor(res,{solDefault})`(PDF 여러 개 통합: pg.srcName/fileSol, 파일명·'정답 및 해설' 표제·`pdfSolCues`([출제의도]·[풀이] 개수 + '정 답'/'해 설' 표제 쌍, 2점 이상)로 페이지 자동 해설 분류), 페이지 `mode: prob/sol/skip`(클릭 순환), `detectColumns`(렌더한 페이지의 세로 빈 골로 1·2·3단 경계, 골 가운데를 경계로, 좁은 골쌍은 넓은 쪽만, 번호가 단 왼쪽 끝이거나 글이 빽빽한 단만 인정), `detectRegionsByAnchors(pg, idx, {cols, cont, carry})`(배열+`lastNum`; 해설 페이지는 단 맨 위(1.5%)~첫 번호 = 앞 해설 이어짐 조각 `r.cont`(같은 번호; fitRegionsToInk가 위 10% 안 단 너비 밑줄 아래부터, 맨 위 6% 안 짧은 덩어리 뒤 10pt 빈 띠면 머리말로 건너뜀), 앞 페이지 마지막 번호를 `PDFED.lastNumByPage`로 이어받음; 마침표 앵커 우선 + `bestAnchorSeq` 번호 수열 정합으로 쪽번호·꼬리말 숫자 제거), `detectRegionsByPixels`, `fitRegionsToInk`(앵커 영역을 인식 즉시 scale 2 렌더(`pdfedInkCanvas`)의 잉크에 맞춤: 위는 번호보다 '오른쪽에만' 있는 잉크(첫 줄 분수 분자·지수)를 4pt 미만 틈으로 최대 26pt까지, 아래는 다음 문제 윗줄 직전의 마지막 잉크(단 마지막은 40pt 빈 띠 뒤 꼬리말 제외), 페이지 40% 이상 세로줄(단 구분선)·단 85% 이상 가로줄 무시 → `r.fitted`), `pdfedFinish`(페이지 순서대로 자른 조각 중 `r.cont`는 같은 번호(같은 종류)의 앞 조각 아래에 이어 붙여 한 장(+hint 합침), 해설 영역→`d.solImg` 번호 매칭, `r.fitted`/`r.exact`(손으로 옮김·크기조절) 영역은 화면 그대로 자르고, 손으로 그린 영역만 `refineRectOnCanvas` 보정 — 세로 구분선은 따라가지 않음), `collectAnchors`(줄 앞 숫자만 앵커), 그림 크롭 `validFigBox`/`cropDataURL`/`openImgCrop`, 그림 편집기 `IMGED`/`openImgEditor`(지우개·선명하게·기울기·스탬프, 저장은 saveProblem 경유), AI 벡터 복원 공용 `aiRedrawFigureSpec(dataURL, W, H)`→`{img: PNG, spec}`(`aiRedrawFigure`는 img만) — 응답 종류 4가지: `graph`/`geometry`(AI는 수치·좌표를 '읽기'만 → 그림 설계도, `size:[W,H]` 붙여 보관), `svg`(viewBox=원본 픽셀, 결과는 원본 비율로 가운데 맞춤), `keep`(입체·복잡 → e.keep, 원본 유지·실패 아님)(`sanitizeSvg`, Claude 비전→SVG, viewBox로 크기 결정·width/height 주입 필수) — 편집기 `imgedAiRedraw`, 분할 확인 화면 `redrawDraftFig`/`revertDraftFig`/`redrawAllDraftFigs`(원본은 `d.imgOrig` 보관, AI 변환된(`d.aiDone`) 그림만 대상) |
| 그림 설계도(figSpec) | 형식 안내 `FIG_GRAPH_GUIDE`/`FIG_GEO_GUIDE`(다시 그리기·생성·편집기 AI 공용). 엔진 `figSpecToSvg(spec, W?, H?)`→`{svg,w,h}`: `figGraphSvg`(`compileMathExpr` eval 없는 계산기, 곡선 800점·clipPath, fills·vlines/hlines·segments·points(proj)·xticks/yticks, 축 화살표; 좌표 변환 `m=round(W*0.035)` — smoke46이 이 매핑으로 픽셀 검사), `figGeometrySvg`(점 좌표 → 같은 배율 맞춤, 색칠은 아래층 `under`→축→선, polygons/segments(label·ticks)/circles/arcs(from·to 도·점이름, 반시계, sector)/angles(right·n)/texts, 안 쓰인 점은 ●, 이름은 중심 반대쪽 자동, `ydown`=픽셀 좌표). 라벨 조판 `figLabelSvg`(글자 폭은 `figTextW`=캔버스 실측, 분수·위첨자, ln·sin 바로). `figOutSize`(원본 `size`→폭 700~1400). `figSpecIssues`(사람이 읽는 점검), `svgToPng`/`figSpecToPng`(HWPX·저장용 PNG), `figSvgDataUri`(HTML 내보내기 벡터). 저장: `p.figSpecs[k]`↔`p.images[k]`(`figSpecOf`/`setFigSpec`, 라이트 레코드·동기화·백업에 그대로), `saveBulk`가 `d.figSpec`→`figSpecs:[...]`. 편집기 `openFigSpecEditor({spec,isNew,onSave})`(`FIGED`, JSON+실시간 SVG 미리보기, `FIG_TEMPLATES`, `figedAskAi` 말로 고치기), 상세 `openFigSpecForProblem(id,k)`(k<0 새 그림), 분할 화면 `editDraftFigSpec(i)`. 그림 편집기는 열 때 설계도·스냅샷 보관 → 손으로 고치면 설계도 해제, 크롭도 해제. 생성: `buildGenPrompt`가 `[그림설계]{JSON}[/그림설계]` 안내, `applyFigSpecBlocks`(genResultToBulk 끝, async)가 그림·`[그림]` 자리·경고. `attachFigSpec(rec, spec, index)`는 tools/graph.js attach용. 입체 `figSpaceSvg`(`figSpaceParts`: `proj` 사선 투영, 매개변수 곡선 `compileMathExpr(e,'t')` 360점, fills=점·곡선 이어 붙인 면(light/dark), segments·points·texts·axes{x,y,z}), 안내 `FIG_SPACE_GUIDE`. 라벨 `√(…)`→근호 윗선. 다시 그리기 결과(원본 유지·실패)는 `d.redrawNote`로 문항 아래에 남기고 버튼은 [다시 시도]. 🪄는 윈도10에 없어 🎨 사용. 입체 매크로 `figExpandSolids`(spec.solids → curves(pts)/fills/segments/texts; crossSection은 3차원 단면·능선·띠 색칠, revolution·cylinder·cone·sphere는 화면 좌표(2개짜리 점 = P2 통과)로 교과서식 타원(0.28~0.3배)·정확한 옆선·뒤쪽 점선, 구 외곽 `_spheres`). 다시 그리기 = `aiRedrawFigureSpec(img, W, H, {ctx, refine, rounds})`: 문제 본문(ctx)→`aiRedrawPrompt(W,H,ctx)`, 그린 PNG+원본으로 `aiRefinePrompt`/`aiRefineFigSpec` 1회(\{ok:true\}면 유지), 그려지지 않는 설계도는 오류 내용으로 수리. 모델: `aiJsonCall(content, max, modelOverride)`, 그림은 `aiSettings().figModel`(#ai-figmodel, 기본 Sonnet) |
| 단 구분선 | `detectColumns`: 가운데(15~85%) 끊김 없는(틈 ≤3px, 높이 45%+) 가는(≤4pt) 세로줄 = `hard` 경계 — 빈 띠 판단·좁은 띠 합치기·검증에서 절대 빠지지 않음. 구분선 근처(한 단 너비 안) 빈 띠는 버림. 가까운 두 빈 띠 중 오른쪽 45pt 안에 번호가 붙은 쪽을 남김. 검증의 '번호가 단 왼쪽 끝' 기준은 min(단 너비 25%, 45pt). 그림 종류 `kind:'svg'`(`figRawSvg`: sanitize·viewBox·원본 비율, 맥 Claude Code가 직접 그린 SVG용). 크기: `figFS(W,H,spec,k,origW)` — `spec.fontPx`(원본에서 잰 글꼴 px, `figMeasureTextPx`: 연결 성분 높이 85백분위/0.72, 큰 선·속 빈 호·가는 세로 조각·중앙값 2.2배 초과 제외)가 있으면 fontPx×(출력폭/원본폭), 없으면 폭 비례·높이 상한. 한글 삽입은 `figImgScale`(원본 크롭폭/그림폭, 원본 없는 새 그림 0.5)로 실제 크기·`figLW`, `spec.fontScale/lineScale`, 도형·입체는 `figOutSize(...,flex)`로 그림 비율(원본 ±25~33%), 앞 단면 가려진 반쪽 점선, O 라벨은 축 반대쪽. 입체 비교·수정 2회, 단면 입체 `guides`, `_` 보조점 이름 숨김, 상세 화면 문항 ID |
| 등록 묶음 | `saveBulk`가 `p.batch`/`p.batchName`(출처 · 월/일 시:분), 저장 후 `#filter-batch`로 그 묶음 표시. `batchKeyOf`(없으면 출처+등록일), `batchList`, `batchProblems`(원래 번호 `origNoKey` 순), `#batch-banner`(`renderBatchBanner`, 빠진 번호 `batchMissingNos`/`missingSeqNos` — 1~끝의 70% 이상 있을 때만), `batchToSheet(key)` 장바구니를 번호 순으로 바꾸고 제목=출처, 학습지 화면. 최신순/오래된순은 묶음 단위 → 묶음 안 번호 순. PDF 편집 화면·분할 화면도 빠진 문제 번호 경고(`pdfedSolInfo`). `collectAnchors`: 위쪽 3.5~6% 띠의 숫자는 마침표가 있거나 25pt 안에 본문이 이어질 때만(쪽번호가 1번을 가로채던 회귀 방지) |
| 쌍둥이·변형 | `makeTwins(sources, {twin, variant, diff, verify, concurrency}, ask, onEvent)`(웹·tools/twins.js 공용, ask(텍스트, 최대토큰, [이미지])): 원본 CONC(기본 3)개를 작업자 풀로 동시에, 원본 안에서는 3개씩(CH) 나누되 **파이프라인**(앞 묶음 검산 중 다음 생성, 검산 중 문제도 avoid 에 넣고 inflight 로 수량 관리, 저장은 묶음 순서대로). onEvent: `{type:'src'|'gen'|'item'(state check/repair/saved/rejected)|'srcDone', i, …}` → 웹 실황 패널 `TWIN_LIVE`/`twinLiveStart`/`twinLiveEvent`/`twinLiveRender`(#twin-live), 맥 콘솔 TWIN-PROGRESS. 원본별 묶어 보기: `#db-twinview` → `renderTwinGroups(list)`(twinChildrenMap, .tgroup/.tg-row, viewListPaged=false), `twinGroupToCart`, 상세 `twinRelHTML`, `twinShowGroups(batch)`. 대시보드 `renderDashContinue`/`dashGo`(state.dashFilter noSol|check), 상세 `detailPreview`(#e-prev), 모달 단축키(← → Esc). 원본 채우기(`opts.fillSrc!==false`): 정답 또는 해설(해설 이미지 solImgN 없을 때)이 비면 `srcFillPrompt(src, other)`(정답 있으면 그 정답에 맞는 풀이, complete:false=본문 잘림 → #본문확인) → 새 정답이면 `aiVerifyPrompt` 독립 검산, 불일치면 other 힌트로 1회 재풀이, 그래도 불일치면 #검산불일치 → src 에 반영·saveProblem(#AI해설, out.filled/fillCheck/incomplete), 이벤트 `{type:'fill', state:run|done|check|incomplete|fail}` → `twinFillChip`. 생성 흐름: 원본마다 `twinPrompt(src,t,v,diff,spec,avoid)`(앞서 만든 문제 avoid 로 겹침 방지, 설계도 없고 그림만 있으면 이미지 첨부) → `twinItemsOf` → `check`: 그림 `figSpecToPng`(원본 size·fontPx) · 원본 설계도와 같으면(`twinSpecCore`) 거부 · `twinVerifyPrompt`(그려진 그림 이미지와 함께 풀고 figureOk) · `verifyOutcome`(수치·`answerEquiv` 식 비교) → 실패면 `twinRepairPrompt` 수리 1회 → 재검사 → 그래도 실패면 저장 안 함(`reasons`)·다음 호출에서 다시(최대 ceil(n/3)*2+2회, 못 채우면 `short`) → `mathIssues`(#검수주의), unknown 은 #검산확인 → 저장(`twinOf`·`twinKind`·`twinNo`, origNo=원본 번호, srcType 'AI변형', 새 batch). 웹 `openTwinMaker(ids)`/`startTwinMaker`(모델 figModel), 묶음 안내 버튼, 교재 `twinBookIds`/`twinBookToSheet`(원본→쌍둥이→변형). 표시: 카드 👯 태그, HTML `.twinmark`, HWPX 머리 '[쌍둥이 · 7번]' |
| 해설 1:1 크롭 | `pdfedToRegions` 끝에 `pdfedApplySolFilter`: `solKeepPlan`(문제 영역 번호 → 없으면 분할 화면 문항 → db 대상 문항, 파일 짝 `solSetMap`)에 없는 번호의 해설 영역은 `PDFED.solHidden`, 못 찾은 번호 `PDFED.solMissing`, 안내 `#pdfed-solinfo`(`pdfedSolInfo`), `pdfedToggleSolAll(on)`. 이어짐(cont)은 번호가 같으면 유지 |
| 검색·작업 | `problemsFiltered`, `renderDB`(30/페이지), `renderTree`, `semanticSearch`(bigram), `imgHash`(aHash 이미지검색), 프리셋 |
| 일괄 작업 | `openBatchTag`, `batchAutoTag`, `batchReviewed`, `batchDelete` |
| AI 변환 | `aiJsonCall`(공용 호출: `aiHeaders()`에 키·워크스페이스 ID, 재시도·오류 한국어 안내), `aiTranscribeImage(img, hint, issues)`(전사 전용 프롬프트 `aiPrompt`), `aiTranscribeChecked`(렌더 검증 `mathIssues`=KaTeX+한글 변환 → 문제 있으면 `retryIssuesBlock`으로 1회 재판독, 남은 경고 `d.aiIssues`→저장 시 #검수주의), PDF 글자층 힌트 `pdfTextInRect`/`pdfHintBlock`(`d.pdfText`/`d.solText`, pdfedFinish에서 잉크 보정 영역 기준), 해설 짝짓기는 번호가 아니라 내용으로: `pdfedFinish`가 해설 조각을 전부 `state.solPool`에 보관(`solPoolDone`), `aiMatchSolutionPool`=조각마다 `aiSolPiecePrompt`(문항별 나눠 읽기·`solItemsOf`)→`aiSolMatchPrompt`(문제·해설 목록, 텍스트만)→`solPairsOf` → **`solMatchFlow(probs, sols, ask)`(번호 우선 + 내용 확인)**: `solPairsByNumber`(같은 시험지 `set` 안에서 번호가 정확히 하나, `solNumKey`) + AI 내용 짝(시험지별 호출, 번호를 강한 단서로) → `solReconcile`(일치→확정, 한쪽만→그쪽(번호 있는 해설이 다른 번호로 가면 확인), 엇갈림→`checks`) → `aiSolVerifyPrompt`(해설+후보 문제 전문)·`solVerifyPick`, 실패 시 번호 → `solDedupeNumbered`. 웹은 `solPairsAI`(aiJsonCall, `.lastStats`), Max는 ingest가 `page.exposeFunction('__maxAsk')`로 같은 흐름. `solPoolItems`는 조각 안 문항이 하나뿐이면 영역 번호를 물려받고 `set`도 물려받음 →`applySolPairsToDrafts`(`d.solNums` — 확인 화면에 '해설 N번', 다르면 빨간 '(내용으로 짝지음)'). 시험지(파일) 구분: `pdfedFinish`가 조각·초안에 `src`, `solSetMap(문제 파일들, 해설 파일들)`(같은 파일 > 정답·해설·문제·sol 뺀 이름 bigram ≥0.75 > 올린 순서)로 해설 조각 `set`, 초안은 파일→번호 순, `saveBulk`는 파일이 여럿이면 출처에 파일 이름. 저장된 문제는 [🔗 해설 자동 매칭] `openSolMatch`/`matchSolutionsForProblems`(현재 해설+새 해설 PDF 조각, 적용 전 요약 확인, #해설없음·#검수주의, PDF는 에디터 `target:'db'` 모드). `tools/ingest.js --max`도 같은 풀 흐름. 풀이 없을 때만 예전 방식: 해설 변환은 `solCtxOf(d)`(찾을 문제 번호·본문)를 `aiSolImgPrompt(hint, issues, ctx)`에 넘겨 `matches`를 받음 — 같은 번호 해설 조각은 `d.solAlts` 후보로 보관해 맞는 것만 반영, 없으면 `SOL_NOT_FOUND` 경고, 경고 표시는 `issueHtml`(그려지는 수식만 KaTeX, 나머지 `code.iss-code`), `aiTranscribeDrafts`, `batchAiTranscribe`(단원 분류는 전사와 분리: `aiClassifyPrompt`/`aiClassifyItems` 텍스트 8문항 묶음, `curriculumBriefFull` 분류표 + `validClassify` 대조), 독립 검산 `aiVerifyPrompt`/`verifyOutcome`/`batchAiVerify`(#검산불일치, `p.verify`), `aiSolveProblem`/`batchAiSolve`/`aiSolveDetail`(해설 생성, #AI해설 태그), `batchQa`/`ruleCheckProblem`/`aiQaProblem`/`aiFixProblem`(검수→자동수정→재검수: 통과→reviewed+#AI수정, 실패→#검수주의) — 테스트는 page에서 window.fetch 스텁(교정자/검수자 프롬프트로 분기). 모든 AI 루프는 매 문항 전 `AI_BATCH.cancel` 확인(⏹ 중지 바: aiBatchStart/Done/Cancel). 전사 결과 반영은 `applyAiDraftResult`/`applyAiSolResult` 공용 함수 — `tools/ingest.js --max`(Claude Code 변환)가 page.evaluate로 같은 함수를 호출하므로 시그니처 변경 시 tools/ 동반 수정 |
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

- 원기둥·원뿔(`figExpandSolids`): 밑면·윗면 원을 proj 로 **정확히 투영**(3차원 점 곡선) — 문제 조건으로 계산한 원 위 점이 타원 위에 놓임. 옆선은 화면에서 z 와 나란한 접선(원기둥)/꼭짓점 접선(원뿔), 뒤쪽 호 점선, 색칠은 `fill:true` 때만. 예전 방식으로 저장된 PNG 는 `figRerenderSolids`(FIG_VER=2, p.figV)가 시작·동기화 후 한 번 다시 그림. 중지: `AI_BATCH.ctrl`(AbortController) → `aiJsonCall` signal, makeTwins 의 ask 감싸기로 중지 뒤 새 호출 없음, `twinStop`.
- 단원 분류: `aiClassifyPrompt(items, hint)` 는 [문항 A]… 꼬리표(`CLS_KEYS`)·head, `classifyMapResult(chunk, items)` 로 짝(웹·ingest.js 공용, 예전 i 형식도 받음). `UNIT_CLUES`/`unitKeywordOk`/`unitClueHint` 로 본문 단서 점검 → 그 문항만 재분류, 실패 시 `c._warn` → 드래프트 `aiUnitWarn` → 저장 태그 #단원확인. `fixSigmaIndex`(fixAiNewlines 안) Σ·∏ 첨자 k-1→k=1.
- 쌍둥이 기준: `TWIN_RULE`, `twinPrompt(..., {ideas, style})` → srcIdeas/items[].ideas/changed, `twinVerifyPrompt(it, hasFig, ideas)` sameIdeas/ideaDiff, check()에서 쌍둥이·변형 기준 불일치 → `twinRepairPrompt(..., {ideaIssue, ideas, style})`. 레코드: 원본 `ideas`, 쌍둥이 `ideas`·`ideaChange`·`twinStyle`. 강사 요청: `styleLast/styleRemember/stylePresets/renderStylePresets`(localStorage sp-lab-style-{twin,fig}, sp-lab-stylepresets-*), `#tw-style`, `#fig-style` → `aiRedrawPrompt` 끝에 [강사 요청].
- 묶음 선택 `twinSelect(head|'*', all|kids|twin|var|orig, on)`(state._twinHeads = 보이는 묶음 전체), 시각 표시 `fmtDT(t, full)`(카드 .pc-date·상세 제목).
- 올린 날짜 필터: `#filter-date`(today|yesterday|7d|30d|month|range|d:YYYY-MM-DD) + `#filter-from/#filter-to`, `dateFilterRange()`(createdAt [시작,끝)), `renderDateFilterOptions()`(renderDB 에서), 트리 탭 `treeTab==='date'`, 프리셋 f.date/from/to.
- 캡처 붙여넣기: document paste(추가 화면·일괄 모드) / 이미지 파일 → `PASTE.imgs` 모음(`renderPasteTray`) → `pasteTrayOpen` → `imagesToPdfFile`(JPEG DCTDecode, 1px=0.75pt) → `handleUploadFiles` → 에디터. 캡처 PDF 이름은 `PASTE.pdfNames` → `pdfedDetectPage` 가 `detectRegionsByPixels(..., {capture:true})`(여백 안 건너뜀, 글줄 → 내어쓰기 번호 줄로 분할, 없으면 한 장=한 문제; smoke74, 실제 캡처 tests/capture-36.png). 생성 재시도: makeTwins gen 루프 3회(실패 시 1개만), `twinErrWhy`, aiJsonCall 'JSON 없음' 은 e.noJson·AI 문장 앞부분.
- 화면 구조(새 디자인): 사이드바 `#sbnav` 안 `.ng`(그룹, `.ng-head` 클릭=접기) > `button[data-view]`, 제목은 VIEW_TITLES '그룹 · 화면' → 상단 crumb. 색은 :root 변수(--green 포인트 #16a34a, --ink, --line …)만 쓰고 하드코딩 색 금지. 새 화면: `srctags`(renderSrcTags, state.srcSel, srcTypeList/addSrcType, sp-lab-srctypes), `mytags`(tagGroups/saveTagGroups sp-lab-taggroups, editTagGroup/saveTagGroup, detailTagGroupsHTML/detailTagToggle, missingRequiredGroups, tagRename/tagRemoveAll), `twinhist`(twinRuns = twinOf 문항을 batch 로 묶음, twinRunMeta sp-lab-twinruns = startTwinMaker 가 저장한 설정, renderTwinHist, thToSheet(keys, withOrig)).
- 설정 동기화: `SETTINGS_KEYS`(localStorage 키 목록) 변경을 Storage.prototype.setItem 패치로 감지 → `settingsChanged`(init 끝 `window.__settingsReady` 뒤에만, `sp-lab-settings-at` 갱신) → `sbPushSettings`(worksheets id `__settings`, data {at, kv}, SB.cloudKv 와 합침). 받기: sbPull 의 worksheets 행 `__settings` → `applyCloudSettings`(더 최근일 때만) → `fillSettingsUI`. 로그인·세션 복원 때 `sbSyncSettingsNow`. 끄기 `sp-lab-syncsettings`='0'. 새 설정 키를 만들면 SETTINGS_KEYS 에 넣을지 판단할 것.
- AI JSON 응답: `aiJsonCall` 은 system `AI_JSON_SYSTEM`(JSON만), max_tokens 최소 6000·최대 32000, 텍스트 블록만 모아 `extractJson`(뒤에서부터 '{"' 엄격 → 앞에서부터 tolerantJsonParse) → 실패 시 한 번 재요청(한도 2배 + [다시 요청] 문구). 크레딧 부족은 'API 오류 400 — API 크레딧…' (일괄 작업의 치명 오류 정규식 'API 오류 4' 에 걸리게 유지).
- 단원 5단계: 1~2단계는 CURRICULUM(과목→대단원→[중단원]), 3~5단계는 `unitsDB()` = { '과목|대단원|중단원': { 소단원: { 유형: [상세유형] } } } — 기본값 `unitsPreset()` = 랩 세분류 `lab/units-db.js` 위에 스터디피크 마스터 유형표 `lab/units-sp.js`(window.SP_MASTER_UNITS·SP_MASTER_CURR, **자동 생성 — 직접 고치지 말고 `tools/data/studypeak-master.md` + `node tools/build-sp-units.js`의 ROUTES 규칙을 고칠 것**, smoke73)를 덮어쓴 것. 버튼 `unitsApplySp`(표로 맞추기)·`unitsLoadPreset`(랩 세분류 합치기 = `unitsOwnPreset`). 랩 세분류 형식은 (window.SP_UNITS_DSL, `parseUnitsDSL`: '# 과목 > 대단원 > 중단원' 머리, '소단원 :: 유형[상세, 상세] ; 유형' 줄, '# 경로 = 경로' 복사), 고치면 localStorage 'sp-lab-units'(SETTINGS_KEYS 포함). 문제 필드 subsection·utype·udetail. 이름 변경 시 `unitsRenamePath`/`unitsDropPath`, 화면 `renderUnitDeepCols`·`unitDeepAdd/Rename/Delete`, CSV `unitsCsvTemplate/Export/Import`(parseCsv), `unitsLoadPreset`, 입력 `linkDeepSelects`, 검색 state.fSect/fSub/fType. 기본 DB 를 고치려면 units-db.js 를 고치고 smoke72 의 범위 검사를 확인.
- LMS 엑셀(학습지 화면 `lmsOpen`): `LMS.rows`/`LMS.opt`, 대분류 `lmsLookup`(window.SP_MASTER_LOOKUP '학교급|소분류|유형' → [Category, 태그], build-sp-units.js 가 생성), 후보 `lmsCandidates`(SP_MASTER_UNITS), 정답 `lmsAnswerOf`, 시간 `lmsAllocate`(LMS_GRADES·LMS_DIFF_W), 검사 `lmsCheck`, 행 `lmsSheetRows`(지침 2026-09-30: 그룹 9열/문항 14열 — 양식이 바뀌면 LMS_GROUP_HEAD·LMS_ITEM_HEAD·lmsSheetRows 만 고침), 최소 xlsx 쓰기 `xlsxBlob(sheets)`(값 있는 셀만, 숨김 시트·채움색·열 너비), `lmsWorkbook`(ExamTemplate + _Lookup). 규격·검증기는 `tools/lms/`(validate_lms_upload.py 로 PASS 확인할 것). 복합 유형은 문제 필드 utypeExtra. smoke75.
- 보안 규칙: HTML 에 넣는 값은 `esc()`(작은따옴표 포함), `onclick="f('${…}')"` 안의 문자열은 반드시 `escJs()`(JS 이스케이프 후 HTML 이스케이프 — esc 만 쓰면 &#39; 가 다시 ' 로 풀려 빠져나감). 가져온 백업 문제는 `sanitizeImportedProblem`(그림 = data:image base64 만), 교육과정 키 `BAD_KEY`(__proto__ 등) 무시. SVG 는 `sanitizeSvg`(정규식 + DOM 검사). pdf.js 는 `isEvalSupported:false`. smoke76.
- 공용 도우미: `downloadBlob`/`downloadText`, `mergeCurriculum(dst, src)`(교육과정 트리 합치기 → 더한 개수), `a11yLabels(root)`(go() 끝에서 화면을 그린 뒤 이름표). 캡처 PDF 는 `File.isCapture` → parsePDF 가 `pg.capture`.
