// smoke18: 조건 상자((가)(나)·[박스]) — 분리 로직 + 일반/모의고사 HWPX 테두리 표 + 미리보기
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
  await new Promise(r => server.listen(8991, r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:8991/lab/', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: path.join(SCRATCH, 'node_modules/jszip/dist/jszip.min.js') });
  await page.waitForTimeout(400);

  // ── 분리 로직 단위 검증 ──
  const u = await page.evaluate(() => {
    const q1 = '확률은 $\\dfrac{q}{p}$ 이다. 구하시오. [5점]\n[박스]\n(가) 조건 하나\n(나) 조건 둘\n[/박스]\n마지막 줄';
    const q2 = '질문 문장이다.\n(가) 자동 감지 조건\n(나) 두 번째\n그 다음 문장';
    const q3 = '그냥 (괄호) 있는 평범한 문장\n둘째 줄';
    return {
      b1: splitBoxBlocks(q1).map(b=>(b.box?'B':'T')+b.lines.length).join(','),
      b2: splitBoxBlocks(q2).map(b=>(b.box?'B':'T')+b.lines.length).join(','),
      b3: splitBoxBlocks(q3).map(b=>(b.box?'B':'T')+b.lines.length).join(','),
      strip: stripBoxMarks('앞\n[박스]\n(가) x\n[/박스]\n뒤').includes('[박스]')
    };
  });
  check('[박스] 마커 분리', u.b1==='T1,B2,T1', u.b1);
  check('(가)(나) 자동 감지', u.b2==='T1,B2,T1', u.b2);
  check('일반 문장 오탐 없음', u.b3==='T2', u.b3);
  check('미리보기 마커 제거', u.strip===false);

  // ── 시드: 상자 포함 문제 ──
  await page.evaluate(async () => {
    const mk=(id,q)=>({id, question:q, choices:['① $1$','② $2$','③ $3$','④ $4$','⑤ $5$'], answer:'', solution:'',
      images:[], imgN:0, subject:'확률과 통계', chapter:'경우의 수', section:'', grade:'고2',
      srcType:'기출', srcName:'세화여고', srcYear:'2026', difficulty:4, tags:[], origNo:'',
      reviewed:true, createdAt:Date.now(), updatedAt:Date.now()});
    const q = '흰 공 4개와 검은 공 8개를 나열할 때 확률은 $\\dfrac{q}{p}$ 이다. $p+q$의 값을 구하시오.\n[박스]\n(가) 각각의 검은 공은 적어도 한 개의 다른 검은 공과 이웃한다.\n(나) 흰 공 사이의 검은 공의 개수를 $m$, $n$이라 할 때, $m+n$은 홀수이다.\n[/박스]';
    const ps=[mk('bx1', q), mk('bx2', '두 번째 문제 $x+1$?'), mk('bx3','세 번째 $y$?'), mk('bx4','네 번째?')];
    for(const p of ps){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    state.cart = ps.map(p=>p.id); state.points['bx1']=4; persistCart(); go('sheet'); renderSheet();
    document.querySelector('#s-title').value='상자 테스트';
  });

  // 카드·학습지 미리보기에 마커 없음
  const prev = await page.evaluate(() => document.querySelector('.sheet-item .sq').textContent);
  check('학습지 미리보기 마커 없음', !prev.includes('[박스]'), prev.slice(0,40));

  // ── 일반 HWPX: 테두리 표 포함 ──
  let [dl] = await Promise.all([ page.waitForEvent('download',{timeout:15000}), page.click('#btn-hwpx') ]);
  const f1 = path.join(SCRATCH,'box-normal.hwpx'); await dl.saveAs(f1);
  const z1 = await JSZip.loadAsync(fs.readFileSync(f1));
  const h1 = await z1.file('Contents/header.xml').async('string');
  const s1 = await z1.file('Contents/section0.xml').async('string');
  check('일반 header 테두리 borderFill 3', /id="3"[\s\S]*?leftBorder type="SOLID" width="0.12 mm"/.test(h1));
  const tbl1 = s1.match(/<hp:tbl[^>]*borderFillIDRef="3"[\s\S]*?<\/hp:tbl>/);
  check('일반 HWPX 상자 표 존재', !!tbl1);
  check('상자 안에 (가)(나) + 수식', !!tbl1 && tbl1[0].includes('(가)') && tbl1[0].includes('(나)') && /hp:equation/.test(tbl1[0]));
  check('상자 셀 안여백 1130', !!tbl1 && /cellMargin left="1130"/.test(tbl1[0]));
  check('마커가 본문에 없음', !s1.includes('[박스]'));
  const err1 = await page.evaluate(x=>new DOMParser().parseFromString(x,'text/xml').querySelector('parsererror')?.textContent||'', s1);
  check('일반 section well-formed', !err1, err1.slice(0,80));

  // ── 모의고사 HWPX: 상자 + 배점 위치 ──
  [dl] = await Promise.all([ page.waitForEvent('download',{timeout:20000}), page.click('#btn-mock') ]);
  const f2 = path.join(SCRATCH,'box-mock.hwpx'); await dl.saveAs(f2);
  const z2 = await JSZip.loadAsync(fs.readFileSync(f2));
  const s2 = await z2.file('Contents/section0.xml').async('string');
  const tbl2 = s2.match(/<hp:tbl[^>]*borderFillIDRef="4"[\s\S]*?<\/hp:tbl>/g)||[];
  const boxTbl = tbl2.find(t=>t.includes('(가)'));
  check('모의고사 상자 표(폭 30400)', !!boxTbl && boxTbl.includes('width="30400"'), tbl2.length+'개 bf4 표');
  check('배점이 상자 밖 질문 끝에', /구하시오\. \[4점\]/.test(s2) && !(boxTbl||'').includes('[4점]'));
  const err2 = await page.evaluate(x=>new DOMParser().parseFromString(x,'text/xml').querySelector('parsererror')?.textContent||'', s2);
  check('모의고사 section well-formed', !err2, err2.slice(0,80));

  // ── 인쇄 미리보기 상자 ──
  await page.evaluate(() => printSheet());
  await page.waitForTimeout(600);
  const pb = await page.evaluate(() => {
    const el = document.querySelector('#print-area .condbox');
    return el ? el.textContent.slice(0,20) : null;
  });
  check('인쇄 출력 상자 div', pb && pb.includes('(가)'), pb);

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
