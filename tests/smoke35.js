// smoke35: 오류 기록함 — 변환 결과 검증(검수 강화)·자동 수집·보고서 생성·전역 오류 후킹
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
  await new Promise(r => server.listen(9161, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9161/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.evaluate(() => localStorage.removeItem('sp-lab-errlog'));

  // ── 1) 검수 강화: 변환 "결과"가 한글에서 깨지는 수식을 잡는다 ──
  const rc = await page.evaluate(() => {
    const base = { choices:[], answer:'1', solution:'풀이', images:[], imgN:0, tags:[] };
    return {
      backslash: ruleCheckProblem({...base, question:'값 $a \\& b$ 는?'}).some(i=>i.includes('역슬래시')),
      env: ruleCheckProblem({...base, question:'$\\begin{matrix} a \\\\ b \\end{matrix}$ 의 값은?'}).some(i=>i.includes('미지원')),
      clean: ruleCheckProblem({...base, question:'$x^{2}+1=5$ 일 때 $x$는? [3점]'}).length === 0
    };
  });
  check('변환 결과 역슬래시 잔존 감지', rc.backslash);
  check('미지원 환경(\\begin) 감지', rc.env);
  check('정상 수식은 통과', rc.clean);

  // ── 2) 변환 진단 → 자동 기록 (수식 원문 샘플 포함) ──
  const eq = await page.evaluate(() => {
    resetEqDiag();
    latexToHwpEq('\\begin{matrix} p & q \\end{matrix}');
    errLogEqDiag('테스트 다운로드');
    const log = lsJson('sp-lab-errlog', []);
    return { n: log.length, kind: log[0] && log[0].kind, hasSample: /matrix/.test(log[0] && log[0].detail||'') };
  });
  check('미지원 수식 → 기록 + 원문 샘플', eq.n===1 && eq.kind==='한글 수식 변환' && eq.hasSample, JSON.stringify(eq));

  // ── 3) 보고서 생성 + 문항 연결 + 카운트 UI ──
  const rep = await page.evaluate(async () => {
    const p = { id:'er1', question:'보고서 연결 테스트 $x$?', choices:[], answer:'1', solution:'', images:[], imgN:0,
      subject:'수학Ⅰ', chapter:'수열', section:'', grade:'고2', srcType:'기출', srcName:'t', srcYear:'',
      difficulty:3, tags:[], origNo:'', reviewed:false, createdAt:Date.now(), updatedAt:Date.now() };
    await saveProblem(p); state.problems.push(lightenProblem(p));
    errLog('검수 후 미해결(자동수정 실패)', '해설 없음 · 그림 누락', 'er1');
    renderErrCount();
    const txt = buildErrReport();
    return { txt: txt.slice(0,400), count: document.querySelector('#errlog-count').textContent,
      hasTitle: txt.includes('오류 보고서'), hasKind: txt.includes('검수 후 미해결'),
      hasProblem: txt.includes('보고서 연결 테스트'), hasGuide: txt.includes('재발 방지') };
  });
  check('보고서: 제목·종류·문항 본문·수정 지침 포함', rep.hasTitle && rep.hasKind && rep.hasProblem && rep.hasGuide, rep.txt.slice(0,80).replace(/\n/g,' '));
  check('카운트 UI 표시', /기록 2건/.test(rep.count), rep.count);

  // ── 4) 기록 지우기(확인창 수락) ──
  const cleared = await page.evaluate(() => { clearErrLog(); return lsJson('sp-lab-errlog', []).length; });
  check('기록 지우기', cleared===0);

  check('페이지 JS 에러 없음(여기까지)', errors.length===0, errors.join(' | ').slice(0,200));

  // ── 5) 전역 오류 자동 후킹 (의도적으로 1건 발생시키므로 마지막에) ──
  await page.evaluate(() => { setTimeout(()=>{ throw new Error('테스트용 폭발'); }, 0); });
  await page.waitForTimeout(400);
  const hooked = await page.evaluate(() => {
    const log = lsJson('sp-lab-errlog', []);
    return log.some(e => e.kind==='JS 오류' && e.detail.includes('테스트용 폭발'));
  });
  check('JS 오류 자동 기록', hooked);

  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
