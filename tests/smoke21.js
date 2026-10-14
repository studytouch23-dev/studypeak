// smoke21: 리터럴 \n(₩n) 복구 — fixAiNewlines + AI 변환 적용 + 기존 데이터 자동 복구
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
  await new Promise(r => server.listen(9021, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9021/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // ── 1) fixAiNewlines 단위 ──
  const u = await page.evaluate(() => {
    const bs = String.fromCharCode(92);                      // 역슬래시
    const junk = '다항함수 $f(x)$가 모든 실수 $x$에 대하여' + bs+'n'+bs+'n' + '$\\int_{-1}^{x} f(t)\\,dt = xf(x)$' + bs+'n' + '을 만족시킬 때';
    const fixed = fixAiNewlines(junk);
    return {
      noLiteral: !fixed.includes(bs+'n') || /\\neq|\\nabla/.test(fixed),
      hasNewline: fixed.split('\n').length===4,
      mathKept: fixAiNewlines('$a \\neq b$ 이고' + bs+'n' + '$\\nabla f$') === '$a \\neq b$ 이고\n$\\nabla f$',
      clean: fixAiNewlines('보통 문장\n그대로') === '보통 문장\n그대로'
    };
  });
  check('본문 ₩n → 줄바꿈', u.noLiteral && u.hasNewline, JSON.stringify(u));
  check('수식 안 \\neq·\\nabla 보존', u.mathKept);
  check('정상 텍스트 무변화', u.clean);

  // ── 2) 프롬프트 지시 교정 확인 ──
  const pr = await page.evaluate(() => aiPrompt());
  check('프롬프트에 이중 역슬래시 지시 없음', !pr.includes('\\\\n 으로') && pr.includes('역슬래시를 두 번 쓰지'), '');

  // ── 3) AI 변환 결과에 적용 ──
  await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey','sk-ant-api03-test');
    state.bulkDrafts = [{ text:'', num:'1', sol:'', ans:'', img:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAbElEQVR42u3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBmAcTvAAE/gOsKAAAAAElFTkSuQmCC' }];
    document.querySelector('#bulk-preview-card').style.display='block'; rerenderBulk();
    window.fetch = async () => new Response(JSON.stringify({content:[{type:'text',
      text: JSON.stringify({question:'대하여\\\\n\\\\n$\\\\int_{-1}^{x} f(t)dt$\\\\n\\\\n을 만족', choices:['① $6$'], answer:'', hasFigure:false, figureBox:null, subject:'', chapter:'', difficulty:3})}]}), {status:200});
    await aiTranscribeDrafts();
  });
  await page.waitForTimeout(500);
  const d3 = await page.evaluate(() => {
    const bs = String.fromCharCode(92);
    const t = state.bulkDrafts[0].text;
    return { hasLiteral: t.includes(bs+'n'), lines: t.split('\n').length };
  });
  check('AI 변환 결과 ₩n 정리', !d3.hasLiteral && d3.lines>=3, JSON.stringify(d3));

  // ── 4) 기존 저장 문항 자동 복구 (리로드) ──
  await page.evaluate(async () => {
    const bs = String.fromCharCode(92);
    const p = { id:'leg1', question:'대하여'+bs+'n'+bs+'n$f(0)$의 값은? [4점]', choices:['① 6'], answer:'', solution:'',
      images:[], imgN:0, subject:'수학Ⅱ', chapter:'적분', section:'', grade:'고2', srcType:'기출', srcName:'t',
      srcYear:'', difficulty:3, tags:[], origNo:'', reviewed:false, createdAt:Date.now(), updatedAt:Date.now() };
    await DB.put('problems', p);
  });
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  const leg = await page.evaluate(async () => {
    const bs = String.fromCharCode(92);
    const mem = state.problems.find(p=>p.id==='leg1');
    const db = await DB.get('problems','leg1');
    return { mem: mem && !mem.question.includes(bs+'n'), db: db && !db.question.includes(bs+'n'),
      nl: mem && mem.question.includes('\n') };
  });
  check('기존 문항 메모리 복구', leg.mem && leg.nl);
  check('기존 문항 DB 복구', leg.db);

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
