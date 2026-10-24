---
name: math-graph
description: 수학 문제의 함수 그래프·평면 도형·입체도형 그림을 "설계도(JSON: 식·좌표)"로 정확히 그려 스터디피크 수학 랩 문항에 넣을 때 사용. "이 문제 그래프 다시 그려줘", "문항 그림 깨끗하게", "삼각형 그림 만들어줘", "유사 문제 그림도 같이" 같은 요청이면 이 스킬대로 tools/graph.js 를 쓴다. 그림을 이미지로 베끼거나 SVG를 손으로 찍지 말 것.
---

# 수학 그림 = 설계도로 그리기 (tools/graph.js)

원칙: **그림을 따라 그리지 않는다.** 그래프는 식으로, 도형은 점의 좌표로 적은 설계도(JSON)를
랩의 그림 엔진(`lab/index.html`의 `figSpecToSvg`)이 계산해서 그린다. 곡선은 수백 개 점으로
매끄럽게, 도형은 가로·세로 같은 배율로 그려서 원은 원, 직각은 직각으로 나온다.
웹·HTML 교재(SVG)·한글 HWPX(PNG)·이 도구가 모두 같은 엔진이라 결과가 같다.
설계도는 문항에 `figSpecs[k]`(그림 `images[k]`와 같은 순서)로 저장·동기화되고, 웹의
문제 상세 → **[📐 설계도 고치기]** 에서 사람이 숫자만 바꿔 다시 그릴 수 있다.

## 명령

```bash
cd tools && npm install && npx playwright install chromium     # 최초 1회
node graph.js render 그림.json            # 그림.svg + 그림.png 생성 (PNG는 Read로 열어 눈으로 확인)
node graph.js render 그림.json -o a.png --scale 2
node graph.js check 그림.json             # 형식 점검(없는 점·틀린 식)
node graph.js pull --id <문항ID> --out ./work       # 문항의 원본 그림·본문·기존 설계도를 파일로
node graph.js attach --id <문항ID> 그림.json [--index 0|new]   # 문항 그림 교체(기본 0번)/추가 + 클라우드 동기화 (.svg 도 가능)
node graph.js pull --src "3월" --no 26 --out ./work            # ID 대신 출처·번호로
```
`pull`·`attach` 는 `SP_EMAIL`, `SP_PASSWORD`(랩의 [🔑 자동화용 비밀번호 설정]) 환경변수가 필요하다.
없으면 **사용자에게 물어볼 것** — 추측하지 않는다. 문항ID는 웹 문제 상세나 HTML 내보내기의 `data-id`.

## 사용자가 부르는 말

"3월 모의고사 26번 그림 다시 그려줘", "문항 ID mvxxxx 그림 다시 그려줘" — 문항 ID는 웹 문제 상세 맨 위 `ID … 📋`(누르면 복사).
ID 대신 `--src "출처 일부" --no 26` 으로 찾을 수 있다(여러 개면 목록을 보여 주고 고르게 한다).

## 품질 원칙 (웹의 🎨 버튼보다 잘 그리는 이유 — 그대로 지킬 것)

- **눈대중 금지, 식으로 계산**: 문제 본문의 식·조건으로 좌표를 계산한다. 필요하면 node/python 으로 점을 계산하는 짧은 코드를 써도 된다.
- **그리고 → 보고 → 고치기를 최소 2번**: render 한 PNG 와 원본 PNG 를 Read 로 나란히 보고, 곡선 모양·교점·단면 방향·
  점선(가려진 선)·글자(빠진 것/새로 생긴 것)·시점 각도를 비교해 고친다. 원본과 거의 같을 때까지 반복.
- 설계도(JSON)로 표현이 안 되거나 더 정확하게 하고 싶으면 **SVG 를 직접 작성**해도 된다(계산한 좌표로 path·text).
  `render 그림.svg -o 확인.png` 로 확인하고 `attach --id … 그림.svg` 로 넣는다(스크립트·외부 링크는 자동 제거, 원본 비율 유지).
  단 설계도(JSON)로 넣으면 선생님이 웹에서 숫자만 바꿔 고칠 수 있으므로 가능하면 설계도를 우선한다.

## 작업 순서 (기존 문항 그림 다시 그리기)

1. `node graph.js pull --id <ID> --out ./work` → `work/<ID>-0.png`(원본)와 `<ID>.json`(본문·조건)을 Read 로 본다.
2. 본문의 **조건(식·길이·각)을 우선**해 설계도를 쓴다. 그림에서 읽은 위치는 비율 확인용.
   원본 비율을 맞추려면 `"size":[원본폭,원본높이]` 를 넣는다(pull 한 PNG 크기).
3. `render` → 만든 PNG 를 Read 로 열어 원본과 나란히 비교: 곡선 모양·교점·색칠 구간·라벨 위치·빠진 글자.
   다르면 설계도를 고쳐 다시 render. 맞을 때까지 반복.
4. `check` 가 깨끗하면 `attach`. 끝나면 사용자에게 "웹에서 Ctrl+Shift+R → 문제 상세에서 확인" 안내.

입체도형은 `space` 설계도로 그린다. 사진·실물 그림처럼 식·좌표로 나타낼 수 없는 것만 원본을 둔다고 알린다.

## 설계도 형식

### 함수 그래프 `"kind":"graph"`
```json
{"kind":"graph","x":[-3.2,3.6],"y":[-4.2,6],"size":[300,220],
 "curves":[{"f":"x^2/2+2","from":-3,"to":3,"label":"y=½x²+2","lx":-3,"ly":5.3,"dash":false}],
 "vlines":[{"x":2,"label":"x=2","dash":false}],"hlines":[{"y":1,"label":"y=1","dash":true}],
 "fills":[{"upper":"x^2/2+2","lower":"-x^2/4-1","from":0,"to":2}],
 "segments":[{"p":[[0,0],[2,4]],"dash":true}],
 "points":[{"x":0,"y":0,"label":"O","pos":"bl"},{"x":2,"y":4,"label":"P","proj":true}],
 "xticks":[{"v":2,"label":"2"}],"yticks":[4],"xlabel":"x","ylabel":"y"}
```
- `x`,`y`: 보이는 범위(축 x=0·y=0 이 그림의 어디를 지나는지까지 원본과 맞출 것).
- 식(`f`·`upper`·`lower`)은 x의 식: 숫자, `x`, `+ - * / ^ ( )`, `| |`, `sqrt abs sin cos tan ln log exp`, `pi`, `e`.
  곱셈 생략(`2x`, `x(x-1)`)도 되지만 `*` 권장. eval 없는 안전한 계산기라 그 밖의 이름은 오류.
- `from`/`to`: 곡선을 그릴 x 구간(생략하면 전체). 범위를 크게 벗어나거나 정의되지 않는 곳은 자동으로 끊는다.
- 라벨은 유니코드(`½ ² ³ √ π`)로 쓰면 교과서처럼 조판(분수는 위아래, 변수는 기울임, ln·sin 은 바로).
- `pos`: 라벨 방향 `tl tr bl br`. `proj:true`: 점에서 두 축으로 점선. `dot:false`: 점(●) 없이 글자만.
- `fills`: 위 곡선 식·아래 곡선 식·x 구간으로 색칠(회색).

### 평면 도형 `"kind":"geometry"`
```json
{"kind":"geometry","points":{"A":[0,4],"B":[-3,0],"C":[3,0],"H":[0,0]},
 "polygons":[{"p":["A","B","C"],"fill":false}],
 "segments":[{"p":["A","H"],"dash":true},{"p":["B","H"],"label":"3","ticks":1},{"p":["H","C"],"ticks":1}],
 "circles":[{"c":"H","through":"A"}],
 "arcs":[{"c":"B","r":1.5,"from":0,"to":53,"sector":false}],
 "angles":[{"p":["A","H","C"],"right":true},{"p":["H","B","A"],"label":"θ","n":1}],
 "texts":[{"x":1,"y":2,"text":"S"},{"at":"A","text":"(가)","pos":"t"}],
 "axes":false}
```
- `points`: 이름 → `[x,y]`(y는 위로 +). **길이·각이 맞도록 좌표를 계산해서** 쓴다(예: 정삼각형 꼭짓점 `[1, 1.732]`).
  라벨 방향은 `[x,y,"tl"]`(t b l r tl tr bl br), 생략하면 도형 바깥쪽으로 자동. `{"x":..,"y":..,"label":"P₁","dot":true,"hide":false}` 형식도 됨.
  원본 그림의 픽셀 좌표를 그대로 쓰려면 `"ydown":true`(왼쪽 위 0,0 / 아래로 +).
- `polygons`/`segments` 의 `p`: 점 이름 목록(좌표 `[x,y]` 도 가능). `label`: 변 옆 글자(바깥쪽 자동), `ticks:1|2|3`: 같은 길이 표시, `dash:true`: 점선, `fill:true`: 색칠.
- `circles`: `c` 중심, `r` 반지름 또는 `through` 지나는 점. `fill:true` 색칠.
- `arcs`: `from`·`to` 는 각도(도, 0=오른쪽 90=위, **반시계**) 또는 점 이름. `sector:true` 부채꼴(+`fill`).
- `angles`: `p:[A,B,C]` = 꼭짓점 B 의 각 ∠ABC(작은 쪽). `right:true` 직각 표시, `label` 각 이름·크기, `n:2` 두 겹 호.
- 선분·도형에 안 쓰인 점은 자동으로 ●. 쓰인 꼭짓점은 글자만.
- `axes:true`: 좌표평면 위 도형(원점 O 자동).

### 입체도형 `"kind":"space"`

**먼저 `solids` 매크로를 쓴다** — 수치만 넣으면 곡선·단면·숨은선·색칠을 앱이 계산한다:
```json
{"kind":"space","size":[490,210],"proj":{"x":[1,-0.13],"y":[0.5,0.6],"z":[0,1]},"axes":{"x":[-0.4,3.9],"y":[-0.4,2.6]},
 "solids":[{"type":"crossSection","f":"sqrt(1+(ln(x))^2)","g":0,"from":1,"to":"e","shape":"semicircle",
            "sections":[1.8],"baseRange":[0.35,3.7],"label":"y=√(1+(ln x)²)","lx":3.3}],
 "texts":[{"at":[1,0,0],"text":"x=1","pos":"bl"},{"at":[2.718,0,0],"text":"x=e","pos":"b"}]}
```
- `crossSection`: 밑면이 y=g(x)~y=f(x)(x는 from~to), x축에 수직인 단면이 `shape` 인 입체.
  shape: `semicircle`·`square`·`eqtriangle`·`rtriangle`(빗변이 밑면)·`rect`/`triangle`(높이 식 `h`). `sections`: 진하게 그릴 단면 x.
- `revolution`: `{"type":"revolution","f":"x의 식","from":a,"to":b}` — x축 둘레 회전체 (교과서식 납작한 끝 타원, 뒤쪽 반은 점선).
- `cylinder`·`cone`: `{"c":[x,y,z],"r":1,"h":2,"axis":true}` (z 방향으로 섬) · `sphere`: `{"c":[x,y,z],"r":1}` — 옆선이 타원 끝에 정확히, 밑면 뒤쪽 점선.
- `guides:true` + `fromLabel`/`toLabel`: x=from, x=to 직선(밑면 위, y축과 평행)과 글자("x=1", "x=e").
- 매크로로 안 되는 것만 아래 `curves`/`segments`/`fills` 로 직접. 이름을 쓰지 않을 보조점은 `_p1` 처럼 `_` 로 시작.
- 원본에 없는 점 이름(A, B…)을 만들지 말 것.

직접 쓰는 형식:
```json
{"kind":"space","size":[395,170],"proj":{"x":[1,-0.15],"y":[0.55,0.75],"z":[0,1]},
 "axes":{"x":[-0.3,3.7],"y":[-0.3,2.3]},
 "points":{"A":[1,0,0]},
 "curves":[{"x":"t","y":"sqrt(1+(ln(t))^2)","z":0,"t":[1,2.718],"label":"y=√(1+(ln x)²)","lt":2.5,"pos":"br"},
           {"x":2,"y":"0.6083-0.6083*cos(t)","z":"0.6083*sin(t)","t":[0,3.1416]}],
 "segments":[{"p":[[1,0,0],[1,1,0]],"dash":true}],
 "fills":[{"p":[{"x":2,"y":"0.6083-0.6083*cos(t)","z":"0.6083*sin(t)","t":[0,3.1416]}],"fill":"dark"}],
 "texts":[{"at":[1,0,0],"text":"x=1","pos":"b"}]}
```
- 좌표 (x,y,z). `proj`: 각 축 1단위가 그림에서 향하는 방향 `[오른쪽, 위]` — 원본의 축 방향·길이 비율을 맞춘다.
- `curves`: 매개변수 `t` 의 식 x(t)·y(t)·z(t)(숫자도 됨)와 `"t":[시작,끝]`. 단면(반원 `c/2-c/2*cos(t)`, `c/2*sin(t)`)·밑면 곡선·윤곽선은
  **문제의 식으로 계산**해서 쓴다(단면 위치의 함숫값을 미리 계산해 숫자로).
- 가려진 선은 `dash:true`. `fills`: 점·곡선(t 범위를 거꾸로 써서 방향 뒤집기 가능)을 차례로 이어 만든 면 — `"light"`/`"dark"`.
- `axes`: 원본에 있는 축만(범위). 원점 O 자동. 사진·실물처럼 식으로 못 나타내는 그림만 원본 유지.
- 라벨의 `√(…)` 는 괄호 대신 근호 윗선으로 조판된다.

## 문제 생성과 함께

`tools/generate.js`(랩의 생성 프롬프트)는 그래프·도형 문항에 그림 자리
`[그림설계]{한 줄 JSON}[/그림설계]` 를 쓰게 한다 → 랩이 자동으로 그림을 그리고 설계도까지 저장한다.
`--like-id` 유사 생성은 원본 문항의 설계도를 프롬프트에 넣어 **숫자를 바꾸면 설계도도 같이 바꾸게** 한다.
생성 문항의 그림이 틀렸으면 `pull` → 설계도 고치기 → `attach`.

## 점검 목록 (render 결과 PNG 를 볼 때)

- 곡선의 꼭짓점·교점·점근선이 식과 맞는가, 색칠 구간 경계가 맞는가
- 문제에 나오는 점 이름·길이·각 라벨이 모두 있는가, 글자가 선과 겹치지 않는가(겹치면 `pos`·`lx/ly`·`texts`로 옮김)
- 답이 드러나는 값(구하라는 길이·넓이)을 그림에 적지 않았는가

- 모든 종류 공통: `"fontScale"`·`"lineScale"` 로 글자 크기·선 굵기를 원본에 맞춘다(기본 1).
