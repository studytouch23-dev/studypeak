// smoke46: 그림 다시 그리기 정밀화 — 함수 그래프는 AI가 "읽은 수치"로 앱이 정확히 그림(매끄러운 곡선·원본 비율),
//          입체·복잡한 그림은 원본 유지, SVG 그림은 비율을 늘리지 않음. 안전한 수식 계산기(eval 없음)
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

const SPEC7 = { kind:'graph', x:[-3.2, 3.6], y:[-4.2, 6],
  curves:[ { f:'x^2/2+2', from:-3, to:3, label:'y=½x²+2', lx:-3, ly:5.3 },
           { f:'-x^2/4-1', from:-3.2, to:3.6, label:'y=-¼x²-1', lx:-3.1, ly:-2.6 } ],
  vlines:[ { x:2, label:'x=2' } ],
  fills:[ { upper:'x^2/2+2', lower:'-x^2/4-1', from:0, to:2 } ],
  points:[ { x:0, y:0, label:'O', pos:'bl' } ], xlabel:'x', ylabel:'y' };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── 1) 안전한 수식 계산기 ──
  const ex = await page.evaluate(() => {
    const v = (s, x) => { try{ return +compileMathExpr(s)(x).toFixed(6); }catch(e){ return 'ERR'; } };
    return {
      a: v('x^2/2+2', 2), b: v('-x^2/4-1', 2), c: v('2x+1', 3), d: v('x(x-1)', 3), e: v('|x-1|', -1),
      f: v('sqrt(1+(ln(x))^2)', Math.E), g: v('2sin(x)', Math.PI/2), h: v('e^x', 1), i: v('2^-1', 0),
      j: v('½', 0), k: v('π/2', 0), l: v('−x²', 3),
      bad1: v('alert(1)', 0), bad2: v('x;1', 0), bad3: v('constructor', 0),
    };
  });
  check('x^2/2+2 (x=2) = 4', ex.a === 4); check('-x^2/4-1 (x=2) = -2', ex.b === -2);
  check('곱셈 생략 2x+1, x(x-1)', ex.c === 7 && ex.d === 6, `${ex.c}, ${ex.d}`);
  check('|x-1|, sqrt(1+(ln x)^2), 2sin x, e^x, 2^-1', ex.e === 2 && ex.f === 1.414214 && ex.g === 2 && ex.h === 2.718282 && ex.i === 0.5, JSON.stringify(ex));
  check('유니코드 π·−·²·½ 처리', ex.k === 1.570796 && ex.l === -9 && ex.j === 0.5, `${ex.k}, ${ex.l}, ${ex.j}`);
  check('코드·모르는 이름은 거부 (eval 없음)', ex.bad1 === 'ERR' && ex.bad2 === 'ERR' && ex.bad3 === 'ERR', JSON.stringify([ex.bad1, ex.bad2, ex.bad3]));

  // ── 2) 7번 그림: 수치로 읽은 그래프를 정확히 그림 ──
  await page.evaluate(spec => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    window.__reply = spec;
    window.fetch = async () => new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(window.__reply) }] }), { status:200 });
  }, SPEC7);
  const g = await page.evaluate(async spec => {
    const cv = document.createElement('canvas'); cv.width = 300; cv.height = 220;
    const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0,0,300,220);
    const out = await aiRedrawFigure(cv.toDataURL('image/png'), 300, 220);
    const im = new Image(); await new Promise(r => { im.onload = r; im.src = out; });
    const W = im.naturalWidth, H = im.naturalHeight;
    const k = document.createElement('canvas'); k.width = W; k.height = H; const kc = k.getContext('2d'); kc.drawImage(im, 0, 0);
    const d = kc.getImageData(0, 0, W, H).data;
    const m = Math.round(W*0.035);
    const px = x => m + (x-spec.x[0])/(spec.x[1]-spec.x[0])*(W-2*m), py = y => H-m - (y-spec.y[0])/(spec.y[1]-spec.y[0])*(H-2*m);
    const lum = (x, y) => { x = Math.round(x); y = Math.round(y); const i = (y*W+x)*4; return 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; };
    const darkNear = (x, y, r=3) => { for(let dy=-r; dy<=r; dy++) for(let dx=-r; dx<=r; dx++) if(lum(x+dx, y+dy) < 110) return true; return false; };
    const onUpper = [-2.5,-1,0.5,1.5,2.8].every(x => darkNear(px(x), py(x*x/2+2)));
    const onLower = [-3,-1.2,0.7,2.6,3.4].every(x => darkNear(px(x), py(-x*x/4-1)));
    const vline = [-3, 0.5, 4].every(y => darkNear(px(2), py(y)));
    const shaded = lum(px(1), py(0.6)), outside = lum(px(-1.5), py(0.6)), above = lum(px(1), py(4.6));
    return { png: out.startsWith('data:image/png'), W, H, onUpper, onLower, vline, shaded, outside, above };
  }, SPEC7);
  check('PNG로 생성', g.png);
  check('원본 비율 유지 (300×220)', Math.abs(g.W/g.H - 300/220) < 0.01, `${g.W}×${g.H}`);
  check('위 곡선 y=½x²+2 가 정확한 위치에', g.onUpper);
  check('아래 곡선 y=-¼x²-1 가 정확한 위치에', g.onLower);
  check('직선 x=2', g.vline);
  check('두 곡선 사이(0≤x≤2) 색칠', g.shaded > 180 && g.shaded < 245, g.shaded.toFixed(0));
  check('색칠 구간 밖은 흰색', g.outside > 245 && g.above > 245, `${g.outside.toFixed(0)}, ${g.above.toFixed(0)}`);

  // ── 3) 입체·복잡한 그림 → 원본 유지 (실패 아님) ──
  const keep = await page.evaluate(async () => {
    window.__reply = { kind:'keep', reason:'회전체 입체도형' };
    const cv = document.createElement('canvas'); cv.width = 60; cv.height = 40;
    const IMG = cv.toDataURL('image/png');
    state.bulkDrafts = [ { num:'26', text:'입체 문제', choices:[], sol:'', ans:'', img: IMG, aiDone:true },
                         { num:'27', text:'입체 문제2', choices:[], sol:'', ans:'', img: IMG, aiDone:true } ];
    go('add'); setAddMode('bulk'); document.querySelector('#bulk-preview-card').style.display = 'block'; rerenderBulk();
    const one = await redrawDraftFig(0);
    await redrawAllDraftFigs();
    return { one, imgKept: state.bulkDrafts.every(d => d.img === IMG && !d.imgOrig), status: document.querySelector('#bulk-status').textContent };
  });
  check('입체 그림: 다시 그리지 않고 원본 그대로', keep.one === false && keep.imgKept, JSON.stringify(keep));
  check('전체 다시 그리기: "원본 유지"로 안내(실패로 세지 않음)', keep.status.includes('원본 유지') && !keep.status.includes('실패'), keep.status);

  // ── 4) SVG 그림: AI가 다른 비율로 그려도 늘리지 않음 ──
  const sv = await page.evaluate(async () => {
    window.__reply = { kind:'svg', svg:"<svg viewBox='0 0 300 100' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='300' height='100' fill='#000'/></svg>" };
    const cv = document.createElement('canvas'); cv.width = 300; cv.height = 220;
    const out = await aiRedrawFigure(cv.toDataURL('image/png'), 300, 220);
    const im = new Image(); await new Promise(r => { im.onload = r; im.src = out; });
    const k = document.createElement('canvas'); k.width = im.naturalWidth; k.height = im.naturalHeight;
    const kc = k.getContext('2d'); kc.drawImage(im, 0, 0);
    const at = (x, y) => kc.getImageData(Math.round(x), Math.round(y), 1, 1).data[0];
    const W = k.width, H = k.height;
    return { W, H, topWhite: at(W/2, 5) > 240, midBlack: at(W/2, H/2) < 15, prompt: aiRedrawPrompt(300, 220) };
  });
  check('SVG: 결과는 원본 비율', Math.abs(sv.W/sv.H - 300/220) < 0.01, `${sv.W}×${sv.H}`);
  check('SVG: 다른 비율 그림은 늘리지 않고 가운데 맞춤', sv.topWhite && sv.midBlack, JSON.stringify(sv).slice(0,80));
  check('프롬프트: 원본 크기·그래프 수치 방식·입체는 원본 유지', sv.prompt.includes('300×220') && sv.prompt.includes('"kind":"graph"') && sv.prompt.includes("viewBox='0 0 300 220'") && sv.prompt.includes('"kind":"keep"'));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
