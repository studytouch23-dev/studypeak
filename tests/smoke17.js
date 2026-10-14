// smoke17: 선택 버튼 / 수식 폭 보정 / 표·그래프 이미지 보존 / 구글 드라이브 백업·복원
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
  await new Promise(r => server.listen(8981, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:8981/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // ── 1) 선택 버튼 ──
  await page.evaluate(async () => {
    for(let i=1;i<=35;i++){
      const p={id:'q'+i, question:'문제 '+i, choices:[], answer:'', solution:'', images:[], imgN:0,
        subject:'수학Ⅰ', chapter:'수열', section:'', grade:'고2', srcType:'자작', srcName:'t', srcYear:'',
        difficulty:3, tags:[], origNo:'', reviewed:true, createdAt:Date.now()+i, updatedAt:Date.now()+i};
      await saveProblem(p); state.problems.push(lightenProblem(p));
    }
    go('db'); renderDB();
  });
  await page.click('button[onclick="selectPageAll()"]');
  const sel1 = await page.evaluate(() => state.cart.length);
  check('이 페이지 전체 선택(30개)', sel1===30, sel1);
  await page.click('#view-db button[onclick="clearCart()"]');
  check('선택 초기화', await page.evaluate(() => state.cart.length)===0);

  // ── 2) 수식 폭 보정 ──
  const eq = await page.evaluate(() => {
    resetHwpxBuild();
    const xml = hwpxEquation('(x+y+z)^{9}');
    return +(xml.match(/<hp:sz width="(\d+)"/)||[])[1];
  });
  check('수식 폭 여유 확대(겹침 방지)', eq>=4600, eq+'HU (이전 약 4322)');

  // ── 3) 표·그래프 이미지 보존 ──
  const fig = await page.evaluate(() => ({
    graph: AI_FIG_RE.test('다음 그래프를 보고 $f(2)$의 값을 구하시오.'),
    table: AI_FIG_RE.test('아래 표와 같이 확률분포가 주어질 때'),
    plain: AI_FIG_RE.test('방정식 $x^2=4$의 해를 구하시오.'),
    goal : AI_FIG_RE.test('목표를 달성할 확률은?')          // '목표'가 오탐되면 안 됨
  }));
  check('그림·표 언급 감지', fig.graph && fig.table, JSON.stringify(fig));
  check('일반 문장 오탐 없음', !fig.plain && !fig.goal);
  // batch 경로: AI가 hasFigure:false라고 해도 본문이 그래프를 언급하면 이미지 유지
  await page.evaluate(async () => {
    const cv=document.createElement('canvas'); cv.width=120; cv.height=90;
    const cx=cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,120,90); cx.fillStyle='#000'; cx.fillRect(20,20,60,40);
    const IMG=cv.toDataURL('image/png');
    for(const [id,qq] of [['g1','그래프를 보고 $f(2)$의 값을 구하시오.'],['g2','방정식 $x^2=4$의 해는?']]){
      const p={id, question:'', choices:[], answer:'', solution:'', images:[IMG], imgN:1,
        subject:'수학Ⅱ', chapter:'미분', section:'', grade:'고2', srcType:'자작', srcName:'t', srcYear:'',
        difficulty:3, tags:[], origNo:'', reviewed:false, createdAt:Date.now(), updatedAt:Date.now()};
      await saveProblem(p); state.problems.push(lightenProblem(p));
      window['__q_'+id]=qq;
    }
    state.cart=['g1','g2']; persistCart();
    localStorage.setItem('sp-lab-apikey','sk-ant-api03-test');
    let call=0;
    window.fetch = async (url, opts) => {
      call++;
      const q = call===1 ? window.__q_g1 : window.__q_g2;
      return new Response(JSON.stringify({content:[{type:'text',
        text: JSON.stringify({question:q, choices:[], answer:'', hasFigure:false, subject:'', chapter:'', difficulty:3})}]}), {status:200});
    };
    await batchAiTranscribe();
  });
  await page.waitForTimeout(300);
  const keep = await page.evaluate(() => ({
    g1: state.problems.find(p=>p.id==='g1').imgN,
    g2: state.problems.find(p=>p.id==='g2').imgN }));
  check('그래프 언급 문항 이미지 유지', keep.g1===1, JSON.stringify(keep));
  check('텍스트 문항 이미지 제거', keep.g2===0);

  // ── 4) 구글 드라이브 백업·복원 (GIS·API 스텁) ──
  await page.evaluate(() => {
    go('data');
    window.google = { accounts:{ oauth2:{ initTokenClient: cfg => ({
      requestAccessToken: ()=>cfg.callback({access_token:'tok123', expires_in:3600}) }) } } };
    window.__drive = { stored:null, meta:null };
    window.fetch = async (url, opts) => {
      url = String(url); opts = opts||{};
      if(url.includes('/drive/v3/files?spaces=appDataFolder'))
        return new Response(JSON.stringify({files: window.__drive.stored
          ? [{id:'f1', name:'sp-math-lab-backup.json', modifiedTime:new Date().toISOString(), size:'1'}] : []}), {status:200});
      if(url.includes('uploadType=resumable'))
        return new Response('', {status:200, headers:{Location:'https://upload.googleapis.com/put-here'}});
      if(url.includes('put-here')){
        window.__drive.stored = await new Response(opts.body).text();
        return new Response('{}', {status:200});
      }
      if(url.includes('/drive/v3/files/f1?alt=media'))
        return new Response(window.__drive.stored, {status:200});
      throw new Error('unexpected fetch '+url);
    };
  });
  await page.fill('#gd-cid', '12345.apps.googleusercontent.com');
  await page.evaluate(() => gdSaveClientId());
  await page.click('button[onclick="gdBackup()"]');
  await page.waitForTimeout(600);
  let st = await page.textContent('#gd-status');
  check('드라이브 백업 완료', st.includes('백업 완료'), st.slice(0,60));
  const uploaded = await page.evaluate(() => { const d=JSON.parse(window.__drive.stored); return {app:d.app, n:d.problems.length}; });
  check('업로드 데이터 형식', uploaded.app==='sp-math-lab' && uploaded.n>=37, uploaded.n+'문항');
  check('마지막 백업 시각 기록', await page.evaluate(()=>!!localStorage.getItem('sp-lab-gdlast')));

  // 복원: 문제 하나 지운 뒤 드라이브에서 되살리기
  await page.evaluate(async () => { await DB.del('problems','q1'); state.problems = state.problems.filter(p=>p.id!=='q1'); });
  await page.click('button[onclick="gdRestore()"]');
  await page.waitForTimeout(600);
  st = await page.textContent('#gd-status');
  check('드라이브 복원 완료', st.includes('복원 완료'), st.slice(0,60));
  check('지웠던 문제 복구됨', await page.evaluate(()=>!!state.problems.find(p=>p.id==='q1')));

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
