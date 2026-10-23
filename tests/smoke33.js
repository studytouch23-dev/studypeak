// smoke33: 클라우드 동기화(Supabase 스텁) — 세션 복원·자동 푸시·증분 풀·삭제 전파·전체 올리기
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
  await new Promise(r => server.listen(9151, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9151/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // ── Supabase 스텁 서버(페이지 안 메모리) + 로그인 상태로 초기화 ──
  await page.evaluate(() => {
    window.__rows = { problems: new Map(), worksheets: new Map() };
    window.supabase = { createClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: { user: { id:'u1', email:'t@studypeak.co.kr' } } } }),
        onAuthStateChange: () => {},
        signInWithOtp: async () => ({ error: null }),
        signOut: async () => ({})
      },
      from: (table) => ({
        upsert: async (rows) => {
          rows.forEach(r => window.__rows[table].set(r.id, {...r}));
          window.__upserts = (window.__upserts||0) + rows.length;
          return { error: null };
        },
        select: () => ({ gt: (col, v) => ({ order: () => ({ range: async (a, b) => {
          const all = [...window.__rows[table].values()]
            .filter(r => (+r.updated_at||0) > v)
            .sort((x,y) => (+x.updated_at) - (+y.updated_at));
          return { data: all.slice(a, b+1), error: null };
        } }) }) })
      })
    }) };
    localStorage.setItem('sp-lab-cloud','1');
    localStorage.removeItem('sp-lab-cloudsince');
  });
  await page.evaluate(() => sbInit());
  await page.waitForTimeout(400);
  const ui = await page.evaluate(() => ({
    user: SB.user && SB.user.email,
    loginHidden: document.querySelector('#cloud-login').style.display === 'none',
    onShown: document.querySelector('#cloud-on').style.display === 'block'
  }));
  check('세션 복원 + UI 전환', ui.user === 't@studypeak.co.kr' && ui.loginHidden && ui.onShown, JSON.stringify(ui));

  // ── 1) 저장하면 자동으로 클라우드에 올라감 (이미지 포함 전체 레코드) ──
  await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width=20; cv.height=20;
    cv.getContext('2d').fillRect(0,0,20,20);
    const p = { id:'cl1', question:'동기화 문제 $x$?', choices:[], answer:'1', solution:'', images:[cv.toDataURL('image/png')], imgN:1,
      subject:'수학Ⅰ', chapter:'수열', section:'', grade:'고2', srcType:'기출', srcName:'t', srcYear:'',
      difficulty:3, tags:[], origNo:'', reviewed:true, createdAt:Date.now(), updatedAt:Date.now() };
    await saveProblem(p); state.problems.push(lightenProblem(p));
  });
  await page.waitForTimeout(1800);                        // 1.2초 묶음 플러시 대기
  const up = await page.evaluate(() => {
    const row = window.__rows.problems.get('cl1');
    return { has: !!row, img: row && (row.data.images||[]).length, del: row && row.deleted };
  });
  check('저장 → 자동 업로드(이미지 포함)', up.has && up.img===1 && up.del===false, JSON.stringify(up));

  // ── 2) 삭제하면 삭제 표시(tombstone)가 올라감 ──
  await page.evaluate(() => removeProblem('cl1'));
  await page.waitForTimeout(1800);
  const del = await page.evaluate(() => {
    const row = window.__rows.problems.get('cl1');
    return row && row.deleted === true;
  });
  check('삭제 → 삭제 표시 업로드', del === true);

  // ── 3) 다른 기기의 변경분 내려받기: 새 문제 + 삭제 전파 ──
  const pull = await page.evaluate(async () => {
    // 다른 기기에서 올라온 새 문제
    window.__rows.problems.set('rm1', { id:'rm1', updated_at: Date.now()+5, deleted:false,
      data: { id:'rm1', question:'다른 기기에서 만든 문제 $y$?', choices:[], answer:'2', solution:'', images:[], imgN:0,
        subject:'수학Ⅱ', chapter:'미분', section:'', grade:'고2', srcType:'기출', srcName:'r', srcYear:'',
        difficulty:3, tags:[], origNo:'', reviewed:true, createdAt:Date.now(), updatedAt:Date.now()+5 } });
    const n = await sbPull(true);
    return { n, has: state.problems.some(p=>p.id==='rm1'), gone: !state.problems.some(p=>p.id==='cl1') };
  });
  check('내려받기: 새 문제 반영 + 삭제 전파', pull.has && pull.gone, JSON.stringify(pull));

  // ── 4) 전체 올리기: 로컬 전부 업로드 ──
  const all = await page.evaluate(async () => {
    const before = window.__rows.problems.size;
    await sbPushAll();
    return { before, after: window.__rows.problems.size, local: state.problems.length };
  });
  check('전체 올리기: 로컬 문항 수만큼 서버에 존재', all.after >= all.local && all.local > 0, JSON.stringify(all));

  // ── 5) 회귀: 옛날에 만든 문제를 나중에 [전체 올리기]해도 다른 기기의 증분 내려받기가 놓치지 않음 ──
  const late = await page.evaluate(async () => {
    const t0 = Date.now();
    // 이 기기는 방금 동기화를 마친 상태(커서 = 지금)
    localStorage.setItem('sp-lab-cloudsince', String(t0));
    // 다른 기기가 몇 달 전에 만든 문제를 지금 올림 (data.updatedAt은 옛날, 올린 시각은 지금 이후)
    const old = t0 - 90*24*3600*1000;
    window.__rows.problems.set('old1', { id:'old1', updated_at: t0 + 50, deleted:false,
      data: { id:'old1', question:'석 달 전에 만든 문제 $z$?', choices:[], answer:'3', solution:'', images:[], imgN:0,
        subject:'수학Ⅰ', chapter:'수열', section:'', grade:'고2', srcType:'기출', srcName:'o', srcYear:'',
        difficulty:3, tags:[], origNo:'', reviewed:true, createdAt:old, updatedAt:old } });
    const n = await sbPull();                               // 증분(자동) 내려받기
    // 충돌: 이 기기에서 더 최근에 고친 문제는 클라우드의 옛 버전으로 덮이지 않음
    const mine = state.problems.find(p=>p.id==='rm1');
    mine.question = '이 기기에서 방금 고친 문제'; mine.updatedAt = Date.now() + 1000;
    await saveProblem(mine);
    const row = window.__rows.problems.get('rm1');
    window.__rows.problems.set('rm1', { ...row, updated_at: Date.now() + 2000,
      data: { ...row.data, question:'다른 기기의 옛 버전', updatedAt: Date.now() - 5000 } });
    await sbPull();
    // 전체 올리기는 '올린 시각'을 기록
    const before = Date.now();
    await sbPushAll();
    const r = window.__rows.problems.get('old1');
    return { n, got: state.problems.some(p=>p.id==='old1'),
      kept: state.problems.find(p=>p.id==='rm1').question,
      stamp: r.updated_at >= before };
  });
  check('옛 날짜 문제도 증분 내려받기로 들어옴', late.got && late.n >= 1, JSON.stringify(late));
  check('이 기기의 더 최근 수정은 옛 버전으로 덮이지 않음', late.kept === '이 기기에서 방금 고친 문제', late.kept);
  check('전체 올리기 = 올린 시각으로 기록', late.stamp === true);

  // ── 6) 진단: 클라우드가 비었으면 원인을 화면에 안내 ──
  const empty = await page.evaluate(async () => {
    window.__rows.problems.clear(); window.__rows.worksheets.clear();
    await sbPull(true);
    return document.querySelector('#sb-sync-status').textContent;
  });
  check('빈 클라우드 → [전체 올리기] 안내', empty.includes('클라우드에 저장된 문제가 아직 없습니다') && empty.includes('전체 올리기'), empty);

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
