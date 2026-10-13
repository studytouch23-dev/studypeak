---
name: hwpx-format
description: HWPX(한글 OWPML) 파일 생성·파싱과 한글 수식 스크립트↔LaTeX 변환 레퍼런스. HWPX 내보내기/가져오기, 수식 깨짐, 이미지 임베드, 한글 파일 관련 작업 시 읽는다. 검증된 최소 구조라 다시 리버스엔지니어링하지 말 것.
---

# HWPX / 한글 수식 레퍼런스

lab/index.html의 구현은 실제 한컴오피스에서 열리는 것이 사용자 확인됨. 구조 변경 금지,
확장만 할 것.

## HWPX = ZIP (mimetype은 비압축 STORE, 첫 엔트리)

```
mimetype                  "application/hwp+zip" (STORE)
version.xml               hv:HCFVersion, tagetApplication(오타 아님, 스펙임)
settings.xml              ha:HWPApplicationSetting + CaretPosition
META-INF/container.xml    rootfile → Contents/content.hpf (application/hwpml-package+xml)
META-INF/manifest.xml     odf:manifest — BinData 포함 전 파일 나열
Contents/content.hpf      opf:package — manifest(item: header/section0/settings/BinData,
                          이미지엔 isEmbeded="1") + spine
Contents/header.xml       hh:head — fontfaces(7개 lang, 함초롬바탕), borderFills(2),
                          charProperties(0:본문/1:굵게/2:제목1600), tabPr, paraPr(0:JUSTIFY/1:CENTER), styles
Contents/section0.xml     hs:sec — 첫 문단의 run에 secPr(+colPr) 필수
BinData/imageN.jpg        이미지 (registerHwpxBin)
```

네임스페이스: `http://www.hancom.co.kr/hwpml/2011/{section|paragraph|core|head}` (hs/hp/hc/hh).

## 핵심 요소

- 문단: `<hp:p paraPrIDRef styleIDRef pageBreak columnBreak merged>` > `<hp:run charPrIDRef>` >
  `<hp:t>텍스트</hp:t>`. 생성은 `hwpxP()`/`hwpxRuns()` — `$...$` 구간을 수식 run으로 분리.
- 수식: `<hp:equation ... version="Equation Version 60" baseLine="65" baseUnit="1000"
  lineMode="CHAR" font="HYhwpEQ">` + `<hp:sz width h>` + `<hp:pos treatAsChar="1" .../>`
  + `<hp:script>한글수식스크립트</hp:script>`.
  **sz를 작게 잡으면 뒤 글자와 겹친다** → `eqMeasure()`가 분수/첨자/극한 구조를 재귀 측정
  (10pt 기준: 라틴 520, 한글 1050 hwpunit/자, 분수=max(분자,분모)+500, 첨자 62%).
- 그림: `<hp:pic>` (orgSz/curSz/renderingInfo/`<hc:img binaryItemIDRef>`/imgRect/imgClip/
  imgDim/sz/pos/outMargin) — `hwpxPic()`. px→hwpunit: 스케일2 크롭 기준 ×50, 본문 최대폭 42000.
- 단위: 1 hwpunit = 1/7200 inch. A4 = 59528×84188, 본문폭(여백 8504×2 제외) ≈ 42520.

## 한글 수식 스크립트 ↔ LaTeX

한글 수식은 **대소문자 무관 토큰**과 간격문자 **백틱(`)**, 공백 토큰 `~`을 쓴다.

| 한글 스크립트 | LaTeX | 주의 |
|---|---|---|
| `{A} over {B}` | `\dfrac{A}{B}` | 중괄호 중첩 → 균형 파서 필수 (`convHwpOver`) |
| `sqrt {A}` | `\sqrt{A}` | |
| `LEFT ( RIGHT )` | 괄호만 남김 | LEFT/RIGHT는 장식 토큰 |
| `TIMES, DIVIDE, BULLET` | `\times \div \cdot` | |
| `LEQ/le, GEQ/ge, !=` | `\le \ge \ne` | 소문자 `le`도 실파일에 등장 |
| `cases{a # b}` | `\begin{cases}a\\b\end{cases}` | `#`=행 구분 |
| `vec X` / `vec{X}` / `bar{X}` | `\vec{X}` / `\overline{X}` | 중괄호 없는 형태도 옴 |
| `rm, it` | 제거 | 서체 전환 |
| `prime` | `'` | |
| `THEREFORE, sim, inf, rarrow` | `\therefore \sim \infty \to` | |
| `lim _{...}, int, sum` | `\lim_{...} \int \sum` | |

- 가져오기: `hwpEqToLatex()` (hp:script → `$latex$`로 본문 삽입).
- 내보내기: `latexToHwpEq()` (소문자 토큰으로 생성; `\{`→`lbrace`).
- 토큰 추가 시 양방향 + `eqMeasure` + diagnostics(`EQ_DIAG`, 미지원 명령 보고) 함께.

## 가져오기(parseHWPX) 규칙

- `Contents/section\d+.xml` 전부, 문단 텍스트는 **가장 가까운 hp:p 조상 기준으로 수집**
  (표 중첩 문단 중복 방지). `hp:t`는 그대로, `hp:script`는 `$변환$`으로.
- 해설지 형식(`[답]` 블록 ≥2)은 `parseAnswerBlock`이 문제/정답/해설/①~⑤ 분리.
  문제 경계는 질문 큐 문장(구하시오/은? 등) + 해설 신호(짧은 결론·순수수식·[풀이] 등) 휴리스틱 —
  조건 박스 많은 문항은 경계가 어긋날 수 있음(미검수로 들어가므로 허용).
- 구형 `.hwp`(CFB 바이너리)는 파싱 불가 — "한글에서 .hwpx로 저장" 안내가 정책.
