// smoke30: 소단원(3단계) 자동 태깅 — AI 프롬프트 분류표·일괄 저장·생성 브리지·자동 구성 필터
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
  await new Promise(r => server.listen(9121, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9121/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // ── 1) AI 변환 프롬프트가 소단원 분류표를 포함 ──
  const pr = await page.evaluate(() => aiPrompt());
  check('프롬프트에 section 필드', pr.includes('"section"'));
  check('분류표에 소단원 포함', pr.includes('등차수열') && pr.includes(' > ') && pr.includes('·'), pr.length+'자');

  // ── 2) 일괄 저장: AI 추천 소단원이 그대로 태깅 (잘못된 소단원은 거부) ──
  const sv = await page.evaluate(async () => {
    document.querySelector('#b-srcname').value = 't';
    state.bulkDrafts = [
      { text:'등차수열 문제 $a_n$?', num:'1', sol:'풀이', ans:'①', choices:['① 1','② 2','③ 3','④ 4','⑤ 5'],
        aiSub:'수학Ⅰ', aiChap:'수열', aiSect:'등차수열' },
      { text:'이상한 소단원 문제?', num:'2', sol:'풀이', ans:'②', choices:['① 1','② 2','③ 3','④ 4','⑤ 5'],
        aiSub:'수학Ⅰ', aiChap:'수열', aiSect:'존재하지않는소단원' }
    ];
    await saveBulk();
    const a = state.problems.find(p=>p.question.includes('등차수열 문제'));
    const b = state.problems.find(p=>p.question.includes('이상한 소단원'));
    return { aSect: a && a.section, aChap: a && a.chapter, bSect: b && b.section };
  });
  check('AI 추천 소단원 자동 태깅', sv.aChap==='수열' && sv.aSect==='등차수열', JSON.stringify(sv));
  check('목록에 없는 소단원은 거부(빈값)', sv.bSect==='');

  // ── 3) 생성 브리지: 생성 조건의 단원이 드래프트에 자동 스탬프 ──
  const gen = await page.evaluate(() => {
    go('gen');
    const gs = document.querySelector('#g-subject');
    gs.value = '수학Ⅰ'; gs.dispatchEvent(new Event('change'));
    const gc = document.querySelector('#g-chapter');
    gc.value = '수열'; gc.dispatchEvent(new Event('change'));
    document.querySelector('#g-section').value = '등비수열';
    document.querySelector('#g-result').value =
      '1. 등비수열 $b_n$의 값은?\n① 1 ② 2 ③ 3 ④ 4 ⑤ 5\n[답] ③\n[해설] 공비로 계산.';
    genResultToBulk();
    const d = state.bulkDrafts[0];
    return { sub: d && d.aiSub, chap: d && d.aiChap, sect: d && d.aiSect };
  });
  check('생성 조건 → 자동 태깅(소단원까지)', gen.sub==='수학Ⅰ' && gen.chap==='수열' && gen.sect==='등비수열', JSON.stringify(gen));

  // ── 4) 자동 구성: 소단원 필터 ──
  const ac = await page.evaluate(async () => {
    const mk=(id,sect)=>({ id, question:`${sect} 자동구성 ${id} $x$?`, choices:[], answer:'1', solution:'s', images:[], imgN:0,
      subject:'수학Ⅰ', chapter:'수열', section:sect, grade:'고2', srcType:'기출', srcName:'t', srcYear:'',
      difficulty:3, tags:[], origNo:'', reviewed:true, createdAt:Date.now(), updatedAt:Date.now() });
    for(const p of [mk('ac1','등차수열'), mk('ac2','등비수열')]){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    state.cart = []; persistCart(); go('sheet');
    const s=document.querySelector('#ac-subject'); s.value='수학Ⅰ'; s.dispatchEvent(new Event('change'));
    const c=document.querySelector('#ac-chapter'); c.value='수열'; c.dispatchEvent(new Event('change'));
    document.querySelector('#ac-section').value='등비수열';
    document.querySelector('#ac-grade').value='';
    document.querySelector('#ac-reviewed').checked=false;
    document.querySelector('#ac-d3').value='2';
    autoCompose();
    return { cart: state.cart.slice(), result: document.querySelector('#ac-result').textContent };
  });
  check('소단원 필터로만 담김', ac.cart.includes('ac2') && !ac.cart.includes('ac1'), JSON.stringify(ac.cart));
  check('부족 수량 정직 보고', ac.result.includes('1/2') && ac.result.includes('부족'), ac.result.slice(0,60));

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
