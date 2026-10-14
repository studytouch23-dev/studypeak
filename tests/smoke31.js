// smoke31: PDF 자동 인식 정밀화(번호 수열 정합·마침표 우선·쪽번호 제거) + 문제/해설 페이지 자동 분류
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
  await new Promise(r => server.listen(9131, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9131/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // ── 1) 수능형 1쪽 재현: 진짜 문항 1.~4. + 쪽번호 1 + '5지선다형'의 5 + 꼬리말 20·1 ──
  const det = await page.evaluate(() => {
    const pg = { w:600, h:800, anchors:[
      {num:'1', x:40,  y:620, dot:true},   // 문항 1.
      {num:'2', x:40,  y:350, dot:true},   // 문항 2.
      {num:'5', x:50,  y:680, dot:false},  // "5지선다형"의 5
      {num:'1', x:560, y:700, dot:false},  // 오른쪽 위 쪽번호 1
      {num:'3', x:320, y:640, dot:true},   // 문항 3.
      {num:'4', x:320, y:330, dot:true},   // 문항 4.
      {num:'20', x:300, y:60, dot:false},  // 꼬리말 숫자
      {num:'1', x:310, y:58, dot:false}    // 꼬리말 숫자 2
    ] };
    const rs = detectRegionsByAnchors(pg, 0);
    return { n: rs.length, nums: rs.map(r=>r.num).sort((a,b)=>+a-+b) };
  });
  check('수능 1쪽: 8앵커 → 4문항만 인식', det.n===4, det.n);
  check('번호 1~4 정확', JSON.stringify(det.nums)===JSON.stringify(['1','2','3','4']), det.nums.join(','));

  // ── 2) 마침표 없는 문제집: 수열 정합으로 이상치·중복 제거 ──
  const det2 = await page.evaluate(() => {
    const pg = { w:600, h:800, anchors:[
      {num:'1', x:40, y:700, dot:false}, {num:'2', x:40, y:500, dot:false},
      {num:'17', x:45, y:420, dot:false},                 // 배점·연도 등 이상치
      {num:'2', x:320, y:690, dot:false},                 // 중복 번호
      {num:'3', x:320, y:600, dot:false}, {num:'4', x:320, y:300, dot:false}
    ] };
    const rs = detectRegionsByAnchors(pg, 0);
    return rs.map(r=>r.num).sort((a,b)=>+a-+b);
  });
  check('이상치(17)·중복(2) 제거', JSON.stringify(det2)===JSON.stringify(['1','2','3','4']), det2.join(','));

  // ── 3) 1문항 페이지(수열 불가)는 그대로 유지 ──
  const det3 = await page.evaluate(() =>
    detectRegionsByAnchors({ w:600, h:800, anchors:[{num:'7', x:40, y:600, dot:false}] }, 0).length);
  check('앵커 1개 페이지 유지', det3===1, det3);

  // ── 4) 문제+해설 통합: 파일명·'정답 및 해설' 표제로 페이지 자동 분류 ──
  const modes = await page.evaluate(async () => {
    const fake = (txt, src, fileSol) => ({
      page: { getViewport: ()=>({width:150, height:200}), render: ()=>({promise: Promise.resolve()}) },
      w:600, h:800, items:[], anchors:[], bodyLen:0, text:txt, isQuickAns:false, ansLabels:0,
      srcName:src, fileSol
    });
    await openPdfEditor({ kind:'pdfEditor', pdf:null, fileName:'문제.pdf + 해설.pdf', text:'', imageMode:true,
      pages: [
        fake('1. 문제입니다', '문제.pdf', false),
        fake('2. 또 문제', '문제.pdf', false),
        fake('정답 및 해설', '문제.pdf', false),       // 같은 파일 안 해설 섹션 시작
        fake('1번 풀이', '문제.pdf', false),           // 표제 이후 → 해설
        fake('해설 내용', '해설.pdf', true),           // 파일명이 해설 → 해설
      ] });
    await new Promise(r=>setTimeout(r, 300));
    const m = PDFED.pages.map(p=>p.mode);
    closePdfEditor();
    return m;
  });
  check('페이지 자동 분류(문제/해설 섹션/해설 파일)',
    JSON.stringify(modes)===JSON.stringify(['prob','prob','sol','sol','sol']), modes.join(','));

  // ── 5) 줄 맨 앞 숫자만 앵커: 수식 속 '=1,' '7'은 배제, 2단 오른단 번호는 유지 ──
  const ca = await page.evaluate(() => {
    const items = [
      { str:'9',  x:90,  y:700, w:10 },                     // 진짜 번호 (줄 시작)
      { str:'=',  x:300, y:600, w:8 }, { str:'1,', x:310, y:600, w:10 },  // 수식 속 숫자 (왼쪽에 바짝)
      { str:'dx=',x:300, y:560, w:20 },{ str:'7',  x:322, y:560, w:8 },
      { str:'본문 끝', x:200, y:500, w:60 },
      { str:'3.', x:330, y:500, w:12 }                      // 2단 오른단 번호 (여백 70pt)
    ];
    return collectAnchors(items, 600, 800).map(a=>a.num);
  });
  check('수식 속 숫자 배제·줄 앞 번호만', JSON.stringify(ca)===JSON.stringify(['9','3']), ca.join(','));

  // ── 6) 추출 잉크 보정: 영역 밖으로 삐져나온 박스를 따라 확장, 빈 여백 축소 ──
  const rf = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width=800; c.height=400;
    const cx = c.getContext('2d');
    cx.fillStyle='#fff'; cx.fillRect(0,0,800,400);
    cx.strokeStyle='#000'; cx.lineWidth=3;
    cx.strokeRect(100, 100, 500, 120);                      // 조건 박스: x 100~600
    const img = cx.getImageData(0,0,800,400).data;
    // 영역이 박스 오른쪽을 60px 잘라먹은 상태 + 아래로 빈 공간 과다 포함
    const r = refineRectOnCanvas(img, 80, 80, 460, 300, 800, 400);
    return { right: r.x+r.w, bottom: r.y+r.h };
  });
  check('잘린 박스 오른쪽 확장(600 이상)', rf.right >= 600, rf.right);
  check('아래 빈 여백 축소(260 이하)', rf.bottom <= 260, rf.bottom);

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
