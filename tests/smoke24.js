// smoke24: [그림] 위치 마커(박스 안 그림 재현) + 정밀 크롭 + $$·\( 정리
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const SCRATCH = __dirname;
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
  await new Promise(r => server.listen(9061, r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9061/lab/', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: path.join(SCRATCH, 'node_modules/jszip/dist/jszip.min.js') });
  await page.waitForTimeout(400);

  // ── 1) 정밀 크롭: AI 좌표가 그림을 일부 자르거나 여백을 포함해도 경계 보정 ──
  const u1 = await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width=500; cv.height=400;
    const cx = cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,500,400);
    cx.fillStyle='#000'; cx.fillRect(150,100,200,150);            // 실제 그림: 150~350 × 100~250
    window.__IMG = cv.toDataURL('image/png');
    // (a) AI 좌표가 그림 왼쪽 30px을 잘라먹음 → 확장으로 복구돼야 함
    const a = await cropDataURL(window.__IMG, {x:0.36, y:0.25, w:0.34, h:0.375});
    // (b) AI 좌표가 여백을 크게 포함 → 밀착으로 줄어야 함
    const b = await cropDataURL(window.__IMG, {x:0.1, y:0.05, w:0.85, h:0.85});
    const da = await imgDims(a), db = await imgDims(b);
    return { aw: da.w, ah: da.h, bw: db.w, bh: db.h };
  });
  check('잘린 경계 자동 확장(그림 전체 포함)', u1.aw>=200 && u1.aw<=240 && u1.ah>=150 && u1.ah<=190, u1.aw+'×'+u1.ah);
  check('과한 여백 밀착(200px 근처)', u1.bw>=200 && u1.bw<=240 && u1.bh>=150 && u1.bh<=190, u1.bw+'×'+u1.bh);

  // ── 2) $$ 여러 줄 → 한 줄 $, \( \) 정리 ──
  const u2 = await page.evaluate(() => ({
    dd: fixAiNewlines('넓이는\n$$\n\\dfrac{1}{2} \\times x\n$$\n이고'),
    paren: latexToHwpEq('-k\\cos x\\(k>1\\)')
  }));
  check('여러 줄 $$ → 한 줄 $', u2.dd.includes('$\\dfrac{1}{2} \\times x$') && !u2.dd.includes('$$'), u2.dd.replace(/\n/g,'⏎'));
  check('\\( \\) 괄호 정리', u2.paren.includes('(k>1)') && !u2.paren.includes('\\('), u2.paren);

  // ── 3) [그림] 마커: 박스 안 원래 자리에 그림 삽입 (일반 + 모의고사 HWPX) ──
  await page.evaluate(async () => {
    const q = '다음은 상수 $k$의 값을 구하는 과정의 일부이다.\n[박스]\n두 곡선 $y=f(x)$와 $y=g(x)$는 그림과 같다.\n[그림]\n점 $A$의 $x$좌표를 $a$라 하면\n(가) 조건이 성립한다.\n[/박스]\n$3\\times p(\\alpha)$의 값을 구하시오.';
    const p = { id:'slot1', question:q, choices:[], answer:'', solution:'', images:[window.__IMG], imgN:1,
      subject:'수학Ⅰ', chapter:'삼각함수', section:'', grade:'고2', srcType:'기출', srcName:'t', srcYear:'',
      difficulty:4, tags:[], origNo:'', reviewed:true, createdAt:Date.now(), updatedAt:Date.now() };
    await saveProblem(p); state.problems.push(lightenProblem(p));
    const q2 = '그림을 보고 답하시오.\n(그림: 원과 삼각형)\n값은?';
    const p2 = { ...p, id:'slot2', question:q2, images:[window.__IMG], imgN:1, createdAt:Date.now()+1 };
    await saveProblem(p2); state.problems.push(lightenProblem(p2));
    state.cart=['slot1','slot2']; state.points['slot1']=4; persistCart(); go('sheet'); renderSheet();
    document.querySelector('#s-title').value='그림 위치 테스트';
  });
  let [dl] = await Promise.all([ page.waitForEvent('download',{timeout:15000}), page.click('#btn-hwpx') ]);
  const f1 = path.join(SCRATCH,'imgslot.hwpx'); await dl.saveAs(f1);
  const z1 = await JSZip.loadAsync(fs.readFileSync(f1));
  const s1 = await z1.file('Contents/section0.xml').async('string');
  const boxM = s1.match(/<hp:tbl[^>]*borderFillIDRef="3"[\s\S]*?<\/hp:tbl>/);
  check('일반: 박스 안에 그림 포함', !!boxM && /hp:pic/.test(boxM[0]), boxM? (boxM[0].includes('hp:pic')?'pic in box':'no pic') : 'no box');
  check('일반: 마커 텍스트 없음', !s1.includes('[그림]') && !s1.includes('(그림:'));
  const picCount = (s1.match(/<hp:pic /g)||[]).length;
  check('일반: 그림 2장(슬롯 소비, 중복 없음)', picCount===2, picCount);
  const err1 = await page.evaluate(x=>new DOMParser().parseFromString(x,'text/xml').querySelector('parsererror')?.textContent||'', s1);
  check('일반 well-formed', !err1, err1.slice(0,80));

  [dl] = await Promise.all([ page.waitForEvent('download',{timeout:20000}), page.click('#btn-mock') ]);
  const f2 = path.join(SCRATCH,'imgslot-mock.hwpx'); await dl.saveAs(f2);
  const z2 = await JSZip.loadAsync(fs.readFileSync(f2));
  const s2 = await z2.file('Contents/section0.xml').async('string');
  const boxM2 = (s2.match(/<hp:tbl[^>]*borderFillIDRef="4"[\s\S]*?<\/hp:tbl>/g)||[]).find(t=>t.includes('hp:pic'));
  check('모의고사: 박스 안에 그림 포함', !!boxM2);
  check('모의고사: 마커 텍스트 없음', !s2.includes('[그림]') && !s2.includes('(그림:'));
  const err2 = await page.evaluate(x=>new DOMParser().parseFromString(x,'text/xml').querySelector('parsererror')?.textContent||'', s2);
  check('모의고사 well-formed', !err2, err2.slice(0,80));

  // ── 4) 인쇄 미리보기: 박스 div 안에 img ──
  await page.evaluate(() => printSheet());
  await page.waitForTimeout(600);
  const pr = await page.evaluate(() => {
    const box = document.querySelector('#print-area .condbox');
    return { inBox: !!box && !!box.querySelector('img'), marker: (document.querySelector('#print-area').textContent||'').includes('[그림]') };
  });
  check('인쇄: 박스 안 img + 마커 없음', pr.inBox && !pr.marker, JSON.stringify(pr));

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
