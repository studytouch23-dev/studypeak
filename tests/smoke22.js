// smoke22: AI 문제 생성 브리지(프롬프트 → claude.ai → 붙여넣기 왕복) + 메인 바로가기 버튼
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
  await new Promise(r => server.listen(9031, r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9031/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // ── 1) 생성 카드 + 프롬프트 ──
  await page.evaluate(() => go('add'));
  check('생성 카드 존재', await page.$('#gen-card') !== null);
  const pr = await page.evaluate(() => {
    $('#g-subject').value = Object.keys(CURRICULUM)[0];
    $('#g-subject').dispatchEvent(new Event('change'));
    $('#g-count').value = 3; $('#g-extra').value = '조건 상자 포함';
    $('#g-inst').value = '프로젝트 지침 샘플';
    return buildGenPrompt();
  });
  check('프롬프트: 지침 포함', pr.startsWith('프로젝트 지침 샘플'), pr.slice(0,20));
  check('프롬프트: 조건·형식 포함', pr.includes('3개') && pr.includes('[답]') && pr.includes('[해설]') && pr.includes('[박스]') && pr.includes('조건 상자 포함'));
  check('지침 localStorage 저장', await page.evaluate(()=>localStorage.getItem('sp-lab-geninst'))==='프로젝트 지침 샘플');

  // ── 2) 생성 결과 붙여넣기 → 분할 왕복 ──
  await page.click('#mode-bulk');
  const sample = [
    '1. 두 수 $a$, $b$가 $a+b=5$, $ab=3$을 만족할 때, $a^{2}+b^{2}$의 값은?',
    '① $17$ ② $19$ ③ $21$ ④ $23$ ⑤ $25$',
    '[답] ②',
    '[해설] $a^{2}+b^{2}=(a+b)^{2}-2ab=25-6=19$. 따라서 정답은 ②이다.',
    '',
    '2. $\\dfrac{1}{2}+\\dfrac{1}{3}$의 값을 구하시오.',
    '[답] $\\dfrac{5}{6}$',
    '[해설] 통분하면 $\\dfrac{3+2}{6}=\\dfrac{5}{6}$.'
  ].join('\n');
  await page.evaluate(s => { $('#bulk-text').value = s; splitBulk(); }, sample);
  await page.waitForTimeout(400);
  const d = await page.evaluate(() => state.bulkDrafts.map(x=>({
    t:(x.text||'').slice(0,12), ans:x.ans, sol:(x.sol||'').slice(0,8), ch:(x.choices||[]).length })));
  check('2문항 분할', d.length===2, JSON.stringify(d).slice(0,120));
  check('정답·해설 매칭', d[0] && d[0].ans.includes('②') && d[0].sol.length>0 && d[1] && d[1].sol.length>0);
  check('선택지 분리', d[0] && d[0].ch===5);

  // ── 3) 메인 페이지 바로가기 버튼 ──
  await page.goto('http://127.0.0.1:9031/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const links = await page.evaluate(() => {
    const el = document.querySelector('#sp-quicklinks');
    if(!el) return null;
    return { visible: getComputedStyle(el).position==='fixed',
      hrefs: [...el.querySelectorAll('a')].map(a=>a.href) };
  });
  check('메인 바로가기 위젯', !!links && links.visible);
  check('3개 링크', !!links && ['student','teacher','admin'].every(s=>links.hrefs.some(h=>h.includes(s+'.studypeak.io'))), links && links.hrefs.join(' '));

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
