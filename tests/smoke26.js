// smoke26: 그림 편집기 — 펜/지우개/선명하게/크롭/스탬프/undo/저장
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').join(__dirname, '..');
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(fs.readFileSync(p));
});

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  await new Promise(r => server.listen(9081, r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9081/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // 시드: 흐릿한 회색 선이 있는 400×300 그림
  await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width=400; cv.height=300;
    const cx = cv.getContext('2d');
    cx.fillStyle='#fff'; cx.fillRect(0,0,400,300);
    cx.fillStyle='#777';                                   // 흐린 회색 사각형 (선명하게 대상)
    cx.fillRect(60,60,120,80);
    const IMG = cv.toDataURL('image/png');
    const p = { id:'ed1', question:'그림 문제 $x$?', choices:[], answer:'', solution:'', images:[IMG], imgN:1,
      subject:'수학Ⅰ', chapter:'수열', section:'', grade:'고2', srcType:'자작', srcName:'t', srcYear:'',
      difficulty:3, tags:[], origNo:'', reviewed:true, createdAt:Date.now(), updatedAt:Date.now() };
    await saveProblem(p); state.problems.push(lightenProblem(p));
    openDetail('ed1');
  });
  await page.waitForTimeout(400);
  await page.click('button:has-text("🖌 그림 편집")');
  await page.waitForTimeout(600);
  const open1 = await page.evaluate(() => {
    const cv = document.querySelector('#imged-cv');
    return { has: !!cv, w: cv && cv.width, h: cv && cv.height };
  });
  check('편집기 열림 + 캔버스 크기', open1.has && open1.w===400 && open1.h===300, open1.w+'×'+open1.h);

  const px = async (x,y) => page.evaluate(([x,y]) => {
    const d = IMGED.ctx.getImageData(x,y,1,1).data; return d[0];
  }, [x,y]);
  const bbox = async () => (await page.$('#imged-cv')).boundingBox();

  // ── 펜: 캔버스 좌표 (300,200) 부근에 긋기 ──
  await page.evaluate(() => imgedSetTool('pen'));
  let bb = await bbox();
  const toScreen = (bb, x, y, w, h) => [bb.x + x/w*bb.width, bb.y + y/h*bb.height];
  let [sx,sy] = toScreen(bb, 280, 200, 400, 300);
  let [ex,ey] = toScreen(bb, 340, 200, 400, 300);
  await page.mouse.move(sx,sy); await page.mouse.down(); await page.mouse.move(ex,ey,{steps:5}); await page.mouse.up();
  check('펜으로 그리기(검정)', (await px(310,200)) < 100, await px(310,200));

  // ── 지우개: 같은 자리 지우기 ──
  await page.evaluate(() => { imgedSetTool('erase'); IMGED.size = 30; });
  await page.mouse.move(sx,sy); await page.mouse.down(); await page.mouse.move(ex,ey,{steps:5}); await page.mouse.up();
  check('지우개(흰색 복원)', (await px(310,200)) > 230, await px(310,200));

  // ── 선명하게: 회색(119) → 검정(0) ──
  const before = await px(100,100);
  await page.evaluate(() => imgedSharpen());
  check('선명하게(회색→흑백)', before>80 && before<160 && (await px(100,100))===0, before+'→'+(await px(100,100)));

  // ── undo: 선명하게 취소 → 회색 복귀 ──
  await page.evaluate(() => imgedUndo());
  await page.waitForTimeout(300);
  const afterUndo = await px(100,100);
  check('실행 취소', afterUndo>80 && afterUndo<160, afterUndo);

  // ── 스탬프: 회색 사각형 복사 → (300,80)에 붙이기 ──
  await page.evaluate(() => imgedSetTool('stamp'));
  bb = await bbox();
  [sx,sy] = toScreen(bb, 55, 55, 400, 300); [ex,ey] = toScreen(bb, 185, 145, 400, 300);
  await page.mouse.move(sx,sy); await page.mouse.down(); await page.mouse.move(ex,ey,{steps:4}); await page.mouse.up();
  const hasStamp = await page.evaluate(() => !!IMGED.stamp);
  const [tx,ty] = toScreen(bb, 300, 90, 400, 300);
  await page.mouse.click(tx,ty);
  const pasted = await px(300,90);
  check('스탬프 복사·붙이기', hasStamp && pasted>80 && pasted<170, pasted);

  // ── 크롭: (40,40)~(200,160) 영역만 남기기 (confirm 자동 수락) ──
  await page.evaluate(() => imgedSetTool('crop'));
  bb = await bbox();
  [sx,sy] = toScreen(bb, 40, 40, 400, 300); [ex,ey] = toScreen(bb, 200, 160, 400, 300);
  await page.mouse.move(sx,sy); await page.mouse.down(); await page.mouse.move(ex,ey,{steps:4}); await page.mouse.up();
  await page.waitForTimeout(300);
  const cropped = await page.evaluate(() => ({ w: IMGED.cv.width, h: IMGED.cv.height }));
  check('크롭(160×120)', Math.abs(cropped.w-160)<3 && Math.abs(cropped.h-120)<3, cropped.w+'×'+cropped.h);

  // ── 저장 → DB 반영 ──
  await page.evaluate(() => imgedSave());
  await page.waitForTimeout(600);
  const saved = await page.evaluate(async () => {
    const imgs = await imagesOf(state.problems.find(p=>p.id==='ed1'));
    const dim = await imgDims(imgs[0]);
    return { n: imgs.length, w: dim.w, h: dim.h, closed: !document.querySelector('#imged-ov') };
  });
  check('저장(크롭 크기로 DB 갱신) + 닫힘', saved.n===1 && Math.abs(saved.w-160)<3 && saved.closed, JSON.stringify(saved));

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
