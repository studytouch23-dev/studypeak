// smoke55: 다시 그린 그림의 글자를 원본과 같은 크기로 — 원본 그림에서 글자 크기를 재서(fontPx) 같은 배율로,
//          한글(HWPX)에는 원본 크롭 크기로 넣어 그림·글자가 실제 크기와 같게
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  const r = await page.evaluate(async () => {
    // 원본처럼: 회색 가는 선·호·점선 + 글자(크기 fs)
    const make = fs => {
      const cv = document.createElement('canvas'); cv.width = 700; cv.height = 300; const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 700, 300); g.strokeStyle = '#555'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(10, 220); g.lineTo(690, 280); g.stroke(); g.beginPath(); g.moveTo(40, 290); g.lineTo(260, 10); g.stroke();
      g.beginPath(); g.arc(350, 200, 70, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(470, 190, 60, Math.PI, 0); g.stroke();
      g.setLineDash([6, 5]); g.beginPath(); g.moveTo(300, 120); g.lineTo(310, 200); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#000'; g.font = 'italic '+fs+'px serif'; g.fillText('x=1', 150, 270); g.fillText('x=e', 430, 295); g.fillText('x', 670, 270); g.fillText('y', 265, 25);
      g.font = fs+'px serif'; g.fillText('O', 30, 245); g.fillText('y=√1+(ln x)²', 520, 240);
      return cv.toDataURL('image/png');
    };
    const meas = {}; for(const fs of [16, 22, 30]) meas[fs] = await figMeasureTextPx(make(fs));
    // 다시 그리기: 잰 글자 크기가 설계도에 들어가고, 그림 배율대로 커짐
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const spec = { kind:'space', proj:{ x:[1,-0.13], y:[0.55,0.62], z:[0,0.95] }, axes:{ x:[-0.3,4], y:[-0.5,2.6] },
      solids:[{ type:'crossSection', f:'sqrt(1+(ln(x))^2)', g:0, from:1, to:'e', shape:'semicircle', guides:true, fromLabel:'x=1', toLabel:'x=e' }] };
    let n = 0;
    window.fetch = async (u, o) => { n++; const body = JSON.parse(o.body); window.__last = body;
      return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(n === 1 ? spec : { ok:true }) }] }), { status:200 }); };
    const img = make(22);
    const out = await aiRedrawFigureSpec(img, 700, 300, {});
    const W = figSpecToSvg(out.spec).w;
    const fsOut = Math.max(...[...figSpecToSvg(out.spec).svg.matchAll(/font-size="(\d+)"/g)].map(m => +m[1]));
    const refineNoFontPx = !window.__last.messages[0].content.find(c => c.type === 'text').text.includes('fontPx');
    // 한글 넣기 크기: 다시 그린 그림은 원본 크롭 크기(700px → 700*50 hwpunit, 최대 폭 제한 전)
    const p = { id:'fs1', question:'q\n[그림]', choices:[], images:[out.img], figSpecs:[out.spec] };
    const sc = await figImgScale(p, 0, out.img), sc0 = await figImgScale({ figSpecs:[] }, 0, out.img);
    const scNew = await figImgScale({ figSpecs:[{ kind:'graph', x:[0,1], y:[0,1], curves:[{ f:'x' }] }] }, 0, out.img);
    return { meas, fontPx: out.spec.fontPx, fsOut, W, refineNoFontPx, sc, sc0, scNew, imgW: (await imgDims(out.img)).w };
  });
  check('원본 글자 크기 재기: 16·22·30px → ±15%', [16,22,30].every(f => Math.abs(r.meas[f] - f) <= f*0.15), JSON.stringify(r.meas));
  check('다시 그리기: 잰 글자 크기를 설계도에 보관(fontPx)', Math.abs(r.fontPx - 22) <= 3, r.fontPx);
  check('다시 그린 그림의 글자 = 원본 글자 × 그림 배율 (원본과 같은 비율)', Math.abs(r.fsOut - r.fontPx * r.W/700) <= 2, `${r.fsOut} vs ${r.fontPx}×${r.W}/700`);
  check('AI 에게는 fontPx 를 보이지 않음(잰 값 유지)', r.refineNoFontPx);
  check('한글 넣기: 다시 그린 그림은 원본 크롭 크기로(배율 = 원본폭/그림폭)', Math.abs(r.sc - 700/r.imgW) < 0.01 && r.sc0 === 1, `${r.sc} (그림 ${r.imgW}px)`);
  check('한글 넣기: 원본 없이 새로 그린 그림은 절반 크기', r.scNew === 0.5);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
