// smoke16: 카드/학습지 미리보기 UI + AI 해설 생성 검증
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
  await new Promise(r => server.listen(8971, r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message().slice(0,80)); d.accept(); });
  await page.goto('http://127.0.0.1:8971/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // 시드: 긴 문제(해설 없음, 객관식) / 해설 있음 / 단답형 해설 없음
  await page.evaluate(async () => {
    const long = '각 면에 $0,1,2,3,4,5$가 하나씩 적혀 있는 서로 다른 세 개의 정육면체 주사위를 동시에 던져서 나오는 세 수의 합이 $x$가 되는 경우의 수를 $f(x)$라 하자. '.repeat(6);
    const mk=(id,q,ch,sol)=>({id, question:q, choices:ch, answer:'', solution:sol, images:[], imgN:0,
      subject:'확률과 통계', chapter:'경우의 수', section:'', grade:'고2', srcType:'기출', srcName:'세화여고', srcYear:'2026',
      difficulty:4, tags:[], origNo:'', reviewed:false, createdAt:Date.now(), updatedAt:Date.now()});
    const ps=[ mk('s1', long, ['① $45$','② $48$','③ $51$','④ $54$','⑤ $57$'], ''),
      mk('s2','간단한 문제 $1+1$의 값은?',['① 1','② 2','③ 3','④ 4','⑤ 5'],'자명하다. 답 ②'),
      mk('s3','숫자 $2,3,4,4,5,6$을 나열할 때 소수끼리 이웃하지 않을 확률을 구하시오.',[],'') ];
    for(const p of ps){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    state.cart=['s1','s2','s3']; persistCart(); go('db'); renderDB();
  });
  await page.waitForTimeout(500);

  // ── 카드 UI ──
  const card = await page.evaluate(() => {
    const el = document.querySelector('.pcard .pc-text');
    const cs = getComputedStyle(el);
    const tags = document.querySelector('.pcard .pc-tags');
    return { clamp: cs.webkitLineClamp, display: cs.display, clipped: el.scrollHeight > el.clientHeight+2,
      tagsBottom: !!tags, h: el.clientHeight };
  });
  check('카드 본문 8줄 클램프', card.clamp==='8', card.clamp+' / display '+card.display);
  check('긴 본문 말줄임 동작', card.clipped, '높이 '+card.h);

  // ── 학습지 목록 ──
  await page.evaluate(() => go('sheet'));
  await page.waitForTimeout(400);
  const sh = await page.evaluate(() => {
    const item = document.querySelector('.sheet-item');
    const sq = item.querySelector('.sq');
    const meta = item.querySelector('.pmeta');
    const metaRect = meta.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return { hasSq: !!sq, clamp: getComputedStyle(sq).webkitLineClamp,
      metaVisible: metaRect.height>5 && metaRect.bottom <= itemRect.bottom+1,
      solBadge: !!document.querySelector('.sheet-item .pmeta .tag[style*="e4f2e8"]') };
  });
  check('학습지 본문 2줄 클램프', sh.hasSq && sh.clamp==='2', sh.clamp);
  check('태그 칩 잘리지 않음', sh.metaVisible);
  check('해설 뱃지 표시', sh.solBadge);

  // mathSafeSlice: 수식 중간에서 안 끊김
  const ms = await page.evaluate(() => {
    const q = '문제 본문 '.repeat(20) + '$\\dfrac{1}{2}+\\dfrac{1}{3}$ 이후 내용';
    const cut = mathSafeSlice(q, q.indexOf('dfrac')+3);
    return { cut, ok: ((cut.match(/\$/g)||[]).length)%2===0 };
  });
  check('mathSafeSlice $ 짝 유지', ms.ok, ms.cut.slice(-25));

  // ── AI 해설 생성 (fetch 스텁) ──
  await page.evaluate(() => {
    localStorage.setItem('sp-lab-apikey','sk-ant-api03-test');
    window.__solveReqs = [];
    window.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      window.__solveReqs.push(body);
      const sol = {"answer":"③","solution":"경우를 나누어 센다.\n먼저 $f(x)$의 최댓값은 $M=27$...\n따라서 정답은 ③이다."};
      return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify(sol)}]}), {status:200});
    };
  });
  dialogs = [];
  await page.evaluate(() => batchAiSolve());
  await page.waitForTimeout(1200);
  check('비용 확인 confirm', dialogs.length===1 && dialogs[0].includes('2개'), dialogs[0]);
  const after = await page.evaluate(async () => {
    const s1 = state.problems.find(p=>p.id==='s1'), s2 = state.problems.find(p=>p.id==='s2'), s3 = state.problems.find(p=>p.id==='s3');
    const db1 = await (async()=>{ let out; await DB.each('problems', p=>{ if(p.id==='s1') out=p; }); return out; })().catch(()=>null);
    return { s1sol: s1.solution.slice(0,10), s1ans: s1.answer, s1tag: (s1.tags||[]).includes('AI해설'),
      s2sol: s2.solution, s3sol: s3.solution.slice(0,10), reqs: window.__solveReqs.length,
      db1sol: db1 ? db1.solution.slice(0,10) : '(no cursor)' };
  });
  check('해설 없는 2개만 호출', after.reqs===2, after.reqs);
  check('s1 해설·정답·태그 채움', after.s1sol.length>0 && after.s1ans==='③' && after.s1tag, after.s1sol);
  check('기존 해설(s2) 보존', after.s2sol==='자명하다. 답 ②');
  check('단답형(s3)도 작성', after.s3sol.length>0);

  // 상세 모달 단건 생성
  await page.evaluate(() => {
    const p = state.problems.find(x=>x.id==='s1'); p.solution=''; p.answer='';   // 비워서 재생성 시나리오
    openDetail('s1');
  });
  await page.click('button:has-text("🤖 AI 해설 생성")');
  await page.waitForTimeout(800);
  const det = await page.evaluate(() => ({ sol: $('#e-solution').value.slice(0,10), ans: $('#e-answer').value }));
  check('상세 모달 해설 채움', det.sol.length>0 && det.ans==='③', det.sol);

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
