// smoke78: 국어 랩 — 시험지 PDF 읽기 엔진(korlab/js/kpdf.js). 지어낸 2단 시험지 PDF(tests/kor-fixture.js)로:
//          [N~M] 세트·단을 넘는 지문·밑줄({u})·<보기>·배점·시(행 유지)·단독 문항·머리말 제거, 줄 이음 추정 표시, 정답·해설지 읽기
const path = require('path');
const { getChromium } = require('../tools/_common.js');
const fx = require('./kor-fixture.js');
const K = require('../korlab/js/kpdf.js');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };
async function pagesOf(buf){
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), cMapUrl: path.join(__dirname, 'node_modules/pdfjs-dist/cmaps/'), cMapPacked: true, verbosity: 0 }).promise;
  const pages = []; for(let i = 1; i <= doc.numPages; i++) pages.push(await K.extractPage(await doc.getPage(i), pdfjs.OPS));
  return pages;
}
(async () => {
  const browser = await getChromium().launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const exam = await fx.makePdf(browser, fx.EXAM), sol = await fx.makePdf(browser, fx.SOLUTION);
  await browser.close();

  const r = K.segment(await pagesOf(exam));
  const P = K.plain, s1 = r.sets[0], s2 = r.sets[1], it = n => r.items.find(i => i.num === n);
  check('세트 2개 · 문항 6개 · 경고 없음', r.sets.length === 2 && r.items.length === 6 && r.warnings.length === 0, JSON.stringify(r.stats) + ' ' + r.warnings.join('|'));
  check('[1~3] 세트: 문항 1·2·3, 머리말 문장 분리', s1.from === 1 && s1.to === 3 && s1.items.map(i => i.num).join() === '1,2,3' && /물음에 답하시오/.test(s1.head), s1.head);
  check('지문이 오른쪽 단으로 이어져도 한 지문 (조각 2개)', /열섬 현상이라고 한다/.test(P(s1.body)) && /까닭이 여기에 있다\.$/.test(P(s1.body)) && s1.rects.length === 2, s1.rects.length + '조각');
  check('문단 3개로 나뉨', P(s1.body).split('\n').length === 3, P(s1.body).split('\n').length);
  check('밑줄: 줄을 넘어도 하나로 {u}…{/u}', /㉠ \{u\}한낮보다 해가 진 뒤에.?더 뚜렷하다\.\{\/u\}/.test(P(s1.body)) && (s1.body.match(/\{u\}/g) || []).length === 1, (s1.body.match(/\{u\}[^{]*\{\/u\}/) || [''])[0]);
  check('머리말(여러 쪽에 되풀이)·"국어 영역"은 지문·문항에 안 섞임', !/지어낸 모의 시험|국어 영역/.test(JSON.stringify(r)), '');
  check('발문의 밑줄(않는), 선택지 5개', it(1).stem === '윗글의 내용과 일치하지 {u}않는{/u} 것은?' && it(1).choices.length === 5 && it(1).choices[2] === '③ 녹지가 줄면 열섬이 약해진다.', it(1).stem);
  check('<보기> 상자와 배점 [3점]', it(2).viewLabel === '보기' && /새벽에 가장 크다\.$/.test(P(it(2).view)) && it(2).points === 3 && /\[3점\]$/.test(it(2).stem), JSON.stringify([it(2).viewLabel, it(2).points]));
  check('세트의 문항이 다음 쪽으로 넘어가도 같은 세트(3번)', it(3).setIdx === 0 && it(3).rects[0].page === 1);
  check('시: 행마다 줄바꿈 유지, 밑줄 ⓐ', P(s2.body).split('\n').length === 5 && /^ⓐ \{u\}아직 덜 마른 빨래\{\/u\} 사이로$/m.test(P(s2.body)), JSON.stringify(P(s2.body)));
  check('세트 범위 밖 번호는 단독 문항(6번), 선택지 속 밑줄', it(6).setIdx === -1 && it(4).setIdx === 1 && it(6).choices[0] === '① 부장님께 서류 {u}결재{/u}를 받았다.', it(6).choices[0]);
  check('줄 이음 추정 표시가 남고 plain 으로 걷힘', r.stats.unsureJoins > 0 && K.joinCount(s1.body) > 0 && !/[\uE000\uE001]/.test(P(s1.body)), r.stats.unsureJoins);
  check('원본 조각 사각형이 쪽 안에 있음', r.items.every(i => i.rects.length && i.rects.every(q => q.w > 20 && q.h > 8 && q.x >= 0 && q.y >= 0)));
  check('띄어쓰기 추정: 조사·어미 조각은 붙이고 그 밖은 띄움', K.needSpace('현상', '을', new Map())[0] === false && K.needSpace('내용을', '떠올리는', new Map())[0] === true && K.needSpace('화민성속', '(化民成俗)의', new Map())[0] === false);

  const so = K.parseSolutionText(K.pagesToText(await pagesOf(sol))), sec = so.sections[0];
  check('해설지: 정답표 6개', sec && Object.keys(sec.answers).length === 6 && sec.answers[1] === '③' && sec.answers[6] === '③', JSON.stringify(sec && sec.answers));
  check('해설지: 지문 영역·갈래·제목·주제', sec.sets[0].area === '독서' && sec.sets[0].genre === '과학' && sec.sets[0].title === '도시 열섬 현상' && /열섬 현상의 원인/.test(sec.sets[0].theme) && sec.sets[1].genre === '현대시', JSON.stringify(sec.sets[0]));
  check('해설지: 문항 유형·정답 해설·오답 피하기', sec.items[1].type === '세부 내용 파악' && /커진다고 하였다/.test(sec.items[1].explain) && /^① 1문단/.test(sec.items[1].wrong) && sec.items[5].type === '시어의 의미 파악', JSON.stringify(sec.items[1]));

  const q2 = K.parseSolutionText('■ [공통: 독서·문학]\n01. ③\n[1~3] 독서\n[1-3] 과학, ʻ도시 열섬 현상ʼ\n1. 세부 내용 파악\n정답해설 : 가.\n정답 ③').sections[0].sets[0];
  check('글꼴 때문에 닮은 글자로 뽑힌 작은따옴표도 제목에서 걷어 냄', q2 && q2.title === '도시 열섬 현상' && q2.genre === '과학', JSON.stringify(q2));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
