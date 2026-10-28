// smoke74: 📋 캡처 붙여넣기 영역 인식 — 실제 캡처(tests/capture-36.png: 36번 + 그림 + 보기)가 한 문제로,
//          번호·첫 줄 윗부분이 잘리지 않고 보기까지 한 영역. 두 문제를 이어 붙인 캡처는 번호(내어쓰기) 줄에서 둘로.
//          번호 모양이 없는 캡처는 한 장 = 한 문제. 스캔 페이지(캡처 아님)는 여백 분할 유지. [✂ 문제로 나누기] 경로에서 캡처로 인식
const fs = require('fs');
const path = require('path');
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const png = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'capture-36.png')).toString('base64');

  const r = await page.evaluate(async png => {
    const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = src; });
    const im = await load(png);
    // 두 문제를 위아래로 이어 붙인 캡처 (사이 40px)
    const two = (() => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height*2 + 40; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0); g.drawImage(im, 0, im.height + 40); return c.toDataURL('image/png'); })();
    // 번호 없는 글(모든 줄이 같은 왼쪽 끝)
    const flat = (() => { const c = document.createElement('canvas'); c.width = 700; c.height = 260; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 700, 260); g.fillStyle = '#000'; g.font = '26px serif';
      ['다음 조건을 만족시키는 함수 f(x)에 대하여', 'f(1)+f(2)의 값을 구하시오.', '(가) 모든 실수 x에 대하여 f(x)>0', '(나) f(0)=1'].forEach((t, k) => g.fillText(t, 6, 30 + k*60));
      return c.toDataURL('image/png'); })();
    const run = async (src, opts) => {
      const f = await imagesToPdfFile([src], 'x.pdf');
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      const p1 = await pdf.getPage(1), vp = p1.getViewport({ scale:1 });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      await p1.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      return { W: vp.width, H: vp.height, regs: detectRegionsByPixels(c, vp.width, vp.height, 0, 1, opts) };
    };
    return { one: await run(png, { capture:true }), two: await run(two, { capture:true }), flat: await run(flat, { capture:true }), scan: await run(two, {}) };
  }, png);
  const R = v => Math.round(v);
  const box = g => g.regs.map(x => [R(x.x), R(x.y), R(x.x + x.w), R(x.y + x.h)].join(',')).join(' | ');
  // 캡처 원본 864×874px → PDF 648×655.5pt. "36." 은 x≈20pt, 첫 줄 y≈2pt, 마지막 보기 줄 아래 끝 y≈632pt
  const o = r.one.regs;
  check('실제 캡처 1문제 → 영역 1개', o.length === 1, box(r.one));
  check('번호(36.)·첫 줄 윗부분이 잘리지 않음', o[0] && o[0].x <= 18 && o[0].y <= 2, box(r.one));
  check('그림·보기(④⑤ 줄)까지 한 영역', o[0] && o[0].y + o[0].h >= 630 && o[0].x + o[0].w >= 590, box(r.one));
  const t = r.two.regs, half = r.two.H / 2;
  check('두 문제 이어 붙인 캡처 → 번호 줄에서 2개로', t.length === 2 && t[0].y + t[0].h <= half + 5 && t[1].y >= half - 5 && t[1].y <= half + 30 && t[1].y + t[1].h >= r.two.H - 30, box(r.two));
  check('번호 모양 없는 캡처 → 한 장 = 한 문제(글 전체)', r.flat.regs.length === 1 && r.flat.regs[0].y <= 6 && r.flat.regs[0].x <= 6 && r.flat.regs[0].y + r.flat.regs[0].h >= 160, box(r.flat));
  check('스캔 페이지 모드(캡처 아님)도 동작', r.scan.regs.length >= 1, box(r.scan));

  // [✂ 문제로 나누기] 경로: 캡처 PDF는 캡처로 인식해서 1문제
  const ed = await page.evaluate(async png => {
    go('add'); setAddMode('bulk');
    addPastedImage(png);
    await pasteTrayOpen();
    for(let k=0; k<40 && !$('#pdfed-bg').classList.contains('show'); k++) await new Promise(r => setTimeout(r, 150));
    await new Promise(r => setTimeout(r, 300));
    await pdfedToRegions();
    return { n: PDFED.regions.length, r: PDFED.regions.map(x => [Math.round(x.x), Math.round(x.y), Math.round(x.x + x.w), Math.round(x.y + x.h)].join(',')), names: PDFED.pages.filter(p => p.capture).length };
  }, png);
  check('붙여넣기 → 영역 인식 에디터에서 1문제, 위·왼쪽 안 잘림', ed.n === 1 && ed.names === 1 && /^([0-9]|1[0-8]),[0-2],/.test(ed.r[0]), JSON.stringify(ed));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
