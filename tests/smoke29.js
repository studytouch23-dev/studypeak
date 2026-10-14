// smoke29: max 자체점검 회귀 — 백업 복원 이미지 보존·id 소독, $$ 보존, 분할 복원, 모의고사 배점, 저장소 깨짐 내성
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
  await new Promise(r => server.listen(9111, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:9111/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // ── 1) 이미지 제외 백업을 복원해도 DB 이미지·해설 이미지 보존 ──
  const imp = await page.evaluate(async () => {
    const IMG = (()=>{ const c=document.createElement('canvas'); c.width=20; c.height=20;
      const x=c.getContext('2d'); x.fillStyle='#000'; x.fillRect(0,0,20,20); return c.toDataURL('image/png'); })();
    await saveProblem({ id:'bk1', question:'원본 $x$', choices:[], answer:'1', solution:'', images:[IMG], imgN:1,
      solImg: IMG, solImgN:1, subject:'수학Ⅰ', chapter:'수열', section:'', grade:'고2', srcType:'기출', srcName:'t',
      srcYear:'', difficulty:3, tags:[], origNo:'', reviewed:true, createdAt:1, updatedAt:1 });
    // 이미지 제외 백업과 같은 형태(images:[], imgN 유지)로 재가져오기
    await importBackupData({ problems:[{ id:'bk1', question:'수정된 질문 $y$', images:[], imgN:1,
      choices:[], answer:'2', solution:'', subject:'수학Ⅰ', chapter:'수열' }] });
    const full = await DB.get('problems','bk1');
    return { q: full.question, nImg: (full.images||[]).length, hasSol: !!full.solImg };
  });
  check('이미지 제외 복원: 본문 갱신 + 이미지 보존', imp.q.includes('수정된') && imp.nImg===1, JSON.stringify({q:imp.q.slice(0,12),n:imp.nImg}));
  check('해설 이미지도 보존', imp.hasSol);

  // ── 2) 조작된 id 소독 (저장형 XSS 차단) ──
  const bad = await page.evaluate(async () => {
    await importBackupData({ problems:[{ id:'"><img src=x onerror=alert(1)>', question:'악성', choices:[] }] });
    const all = await DB.getAll('problems');
    return all.map(p=>p.id).filter(id=>/[<>"']/.test(id));
  });
  check('백업 id에 HTML 특수문자 불가', bad.length===0, bad.join(','));

  // ── 3) $$ 블록 수식: 점검·복구 경로에서 보존, AI 정리 경로에서만 접힘 ──
  const dd = await page.evaluate(() => ({
    keep: fixAiNewlines('넓이는 $$\\int_0^1 f$$ 이다', true),
    fold: fixAiNewlines('넓이는 $$\\int_0^1 f$$ 이다')
  }));
  check('점검 경로: $$ 보존', dd.keep.includes('$$'), dd.keep);
  check('AI 경로: $$→$ 정규화', !dd.fold.includes('$$') && dd.fold.includes('$'), dd.fold);

  // ── 4) 분할: 해설 속 "1. 2." 풀이 단계가 가짜 문항이 되지 않고 해설로 복원 ──
  const sp = await page.evaluate(() => {
    document.querySelector('#bulk-text').value =
      '1. 첫 문제 $x$의 값은?\n① 1 ② 2 ③ 3 ④ 4 ⑤ 5\n[답] ①\n[해설] 다음 순서로 푼다.\n1. 전개한다\n2. 정리한다\n2. 둘째 문제 $y$의 값은?\n① 1 ② 2 ③ 3 ④ 4 ⑤ 5\n[답] ②\n[해설] 바로 나온다.';
    splitBulk();
    return { n: state.bulkDrafts.length, sol1: state.bulkDrafts[0] && state.bulkDrafts[0].sol };
  });
  check('가짜 문항 없이 2문항', sp.n===2, sp.n);
  check('풀이 단계가 1번 해설로 복원', /전개한다[\s\S]*정리한다/.test(sp.sol1||''), (sp.sol1||'').slice(0,60));

  // ── 5) 모의고사 배점: [그림] 마커가 아닌 마지막 문장에 붙음 ──
  const mk = await page.evaluate(async () => {
    const paras = await mockItemParas({ question:'그림과 같다.\n[그림1]', choices:[], images:[] }, 7, 4, null);
    const xml = paras.join('');
    return { hasPts: xml.includes('[4점]'), brokenMarker: xml.includes('[그림') };
  });
  check('배점이 문장 끝에, [그림] 마커 오염 없음', mk.hasPts && !mk.brokenMarker, JSON.stringify(mk));

  // ── 6) 전각 콜론 그림 마커 인식 ──
  const re = await page.evaluate(() => IMG_SLOT_RE.test('(그림： 원과 접선)'));
  check('(그림：…) 전각 콜론 인식', re);

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));

  // ── 7) localStorage 한 키가 깨져도 앱이 살아 있음 ──
  await page.evaluate(() => localStorage.setItem('sp-lab-cart', '{깨진 json'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(500);
  const alive = await page.evaluate(() => ({ cart: Array.isArray(state.cart), probs: Array.isArray(state.problems) }));
  check('깨진 sp-lab-cart에도 앱 기동', alive.cart && alive.probs, JSON.stringify(alive));

  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
