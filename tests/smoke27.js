// smoke27: AI 벡터 복원(🪄 AI로 새로 그리기) — fetch 스텁, SVG 렌더·캔버스 교체·undo·sanitize·오류 경로
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').join(__dirname, '..');
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!path.resolve(p).startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end('forbidden'); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(fs.readFileSync(p));
});

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  await new Promise(r => server.listen(9091, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9091/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // ── 0) sanitizeSvg 단위 검사 ──
  const san = await page.evaluate(() => {
    const dirty = `<svg viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg' onload='alert(1)'>`
      + `<script>bad()<\/script><a href="https://evil.com"><rect x='1' y='1' width='5' height='5'/></a>`
      + `<image href="https://evil.com/x.png"/><foreignObject><div>x</div></foreignObject>`
      + `<use href='#ok'/><text x='2' y='8' onclick="hack()">A</text></svg>`;
    const out = sanitizeSvg(dirty);
    return { out,
      noScript: !/<script/i.test(out), noOn: !/on\w+\s*=/i.test(out),
      noExt: !out.includes('evil.com'), noImg: !/<image|<foreignObject/i.test(out),
      keepLocal: out.includes("href='#ok'"), keepRect: out.includes('<rect') && out.includes('<text') };
  });
  check('sanitizeSvg: script/on*/외부링크/image 제거', san.noScript && san.noOn && san.noExt && san.noImg, san.out.slice(0,120));
  check('sanitizeSvg: 로컬참조·도형·텍스트 유지', san.keepLocal && san.keepRect);
  // 따옴표 없는 속성·닫히지 않은 image 태그도 안전하게
  const san2 = await page.evaluate(() => {
    const out = sanitizeSvg("<svg onload=alert(1) viewBox='0 0 9 9'><image href=https://x.io/a.png><rect x='1' y='1' width='3' height='3'/></svg>");
    return { out, noOn: !/on\w+\s*=/.test(out), noExt: !out.includes('x.io'), keepRect: out.includes('<rect') };
  });
  check('sanitizeSvg: 따옴표 없는 on*/href 제거 + rect 보존', san2.noOn && san2.noExt && san2.keepRect, san2.out.slice(0,110));

  // ── 시드 문제 + 편집기 열기 ──
  await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width=400; cv.height=300;
    const cx = cv.getContext('2d');
    cx.fillStyle='#fff'; cx.fillRect(0,0,400,300);
    cx.fillStyle='#888'; cx.fillRect(80,80,150,100);          // 흐린 원본 그림
    const IMG = cv.toDataURL('image/png');
    const p = { id:'rd1', question:'그림 복원 $x$?', choices:[], answer:'', solution:'', images:[IMG], imgN:1,
      subject:'수학Ⅰ', chapter:'수열', section:'', grade:'고2', srcType:'자작', srcName:'t', srcYear:'',
      difficulty:3, tags:[], origNo:'', reviewed:true, createdAt:Date.now(), updatedAt:Date.now() };
    await saveProblem(p); state.problems.push(lightenProblem(p));
    localStorage.setItem('sp-lab-apikey','sk-ant-test');
    openDetail('rd1');
  });
  await page.waitForTimeout(400);
  await page.click('button:has-text("🖌 그림 편집")');
  await page.waitForTimeout(500);
  const btn = await page.$('#imged-bar button[onclick="imgedAiRedraw()"]');
  check('🪄 버튼이 편집기 툴바에 존재', !!btn);

  // ── 1) fetch 스텁: 작은따옴표 속성 SVG + script 포함(제거 검증) ──
  await page.evaluate(() => {
    const svg = "<svg viewBox='0 0 400 300' xmlns='http://www.w3.org/2000/svg'>"
      + "<rect x='50' y='50' width='200' height='150' fill='none' stroke='#000' stroke-width='3'/>"
      + "<text x='60' y='40' font-size='24' font-family='serif'>A</text>"
      + "<scr"+"ipt>bad()</scr"+"ipt></svg>";
    window.fetch = async () => ({ ok:true, status:200,
      json: async () => ({ content:[{ type:'text', text: JSON.stringify({svg}) }] }) });
  });
  await page.evaluate(() => imgedAiRedraw());
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const {cv, ctx} = IMGED;
    const px = (x,y)=>ctx.getImageData(Math.round(x),Math.round(y),1,1).data[0];
    // viewBox 400×300 → W=800,H=600. rect 테두리는 (50,50)~(250,200) 스케일 ×2 = (100,100)~(500,400)
    return { w: cv.width, h: cv.height,
      edge: px(100, 300),                                     // 좌변 (x=100,y=300)
      edgeTop: px(300, 100),                                  // 윗변 (x=300,y=100)
      inside: px(300, 250),                                   // rect 내부(fill none→흰색)
      undoN: IMGED.undoStack.length };
  });
  check('캔버스가 viewBox 비율로 교체(800×600)', after.w===800 && after.h===600, after.w+'×'+after.h);
  check('SVG 사각형이 그려짐(테두리 검정·내부 흰색)', after.edge<120 && after.edgeTop<120 && after.inside>230, 'edgeL='+after.edge+' edgeT='+after.edgeTop+' inside='+after.inside);
  check('undo 스택에 원본 저장', after.undoN>=1, after.undoN);

  // ── 2) undo → 원본 400×300 복귀 ──
  await page.evaluate(() => imgedUndo());
  await page.waitForTimeout(500);
  const und = await page.evaluate(() => ({ w: IMGED.cv.width, h: IMGED.cv.height,
    gray: IMGED.ctx.getImageData(150,120,1,1).data[0] }));
  check('↶ 취소로 원본 복귀', und.w===400 && und.h===300 && und.gray>100 && und.gray<180, und.w+'×'+und.h+' px='+und.gray);

  // ── 3) 오류 경로: SVG 아닌 응답 → toast, 캔버스 불변 ──
  await page.evaluate(() => {
    window.fetch = async () => ({ ok:true, status:200,
      json: async () => ({ content:[{ type:'text', text: JSON.stringify({svg:'그림을 그릴 수 없습니다'}) }] }) });
  });
  await page.evaluate(() => imgedAiRedraw());
  await page.waitForTimeout(800);
  const err1 = await page.evaluate(() => ({ w: IMGED.cv.width,
    toast: document.querySelector('#toast') ? document.querySelector('#toast').textContent : '' }));
  check('비SVG 응답 → 실패 안내 + 캔버스 유지', err1.w===400 && err1.toast.includes('실패'), err1.toast.slice(0,60));

  // ── 4) 키 없음 경로 ──
  const noKey = await page.evaluate(async () => {
    localStorage.removeItem('sp-lab-apikey');
    await imgedAiRedraw();
    return document.querySelector('#toast') ? document.querySelector('#toast').textContent : '';
  });
  check('API 키 없음 안내', noKey.includes('API 키'), noKey.slice(0,50));

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
