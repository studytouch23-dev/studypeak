#!/usr/bin/env node
/* 스터디피크 수학 랩 — PDF 자동 등록 스크립트 (맥/PC에서 실행)
 *
 * 랩의 실제 파이프라인(영역 인식 → AI 변환·소단원 태깅 → 저장 → Supabase 동기화)을
 * 화면 없는 브라우저로 그대로 돌린다. 결과는 웹에서 보던 것과 동일하며,
 * 등록된 문항은 미검수 상태로 들어가므로 웹의 [🔎 AI 검수]로 마무리하면 된다.
 *
 * 사용법:
 *   node ingest.js 문제.pdf [해설.pdf ...]   # 지정한 PDF들을 한 세션으로 (문제+해설 번호 자동 매칭)
 *   node ingest.js --each 폴더경로           # 폴더 안 PDF를 한 개씩 차례로 등록
 *
 * 필요한 환경변수:
 *   SP_EMAIL       랩 클라우드 로그인 이메일
 *   SP_PASSWORD    랩의 [🔑 자동화용 비밀번호 설정]에서 만든 비밀번호
 *   ANTHROPIC_KEY  Anthropic API 키 (sk-ant-...)
 *
 * 옵션: --timeout <분>  파일(세션)당 AI 변환 제한 시간 (기본 30분)
 *       --stub          테스트용 (네트워크 대신 스텁 사용 — 개발 전용)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

function req(mod){
  try{ return require(mod); }
  catch(e){ return require(path.join(__dirname, '..', 'tests', 'node_modules', mod)); }
}
const { chromium } = (()=>{ try{ return require('playwright'); }catch(e){ return req('playwright-core'); } })();

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const STUB = argv.includes('--stub');
const EACH = argv.includes('--each');
const tIdx = argv.indexOf('--timeout');
const TIMEOUT_MIN = tIdx >= 0 ? +argv[tIdx+1] || 30 : 30;
const files = argv.filter((a,i)=>!a.startsWith('--') && (tIdx<0 || i!==tIdx+1));

const EMAIL = process.env.SP_EMAIL, PASSWORD = process.env.SP_PASSWORD;
const AIKEY = process.env.ANTHROPIC_KEY || process.env.SP_ANTHROPIC_KEY;
if(!STUB && (!EMAIL || !PASSWORD || !AIKEY)){
  console.error('환경변수 SP_EMAIL / SP_PASSWORD / ANTHROPIC_KEY 를 설정하세요.');
  console.error('예) SP_EMAIL=me@x.com SP_PASSWORD=비밀번호 ANTHROPIC_KEY=sk-ant-... node ingest.js 문제.pdf');
  process.exit(2);
}
if(!files.length){ console.error('등록할 PDF 파일(또는 --each 폴더)을 지정하세요.'); process.exit(2); }

// 입력 정리: --each 폴더 → PDF 목록(각각 한 세션), 아니면 전체를 한 세션으로
let groups = [];
if(EACH){
  const dir = files[0];
  const pdfs = fs.readdirSync(dir).filter(f=>f.toLowerCase().endsWith('.pdf')).sort()
    .map(f=>path.join(dir, f));
  if(!pdfs.length){ console.error('폴더에 PDF가 없습니다: '+dir); process.exit(2); }
  groups = pdfs.map(p=>[p]);
}else{
  for(const f of files) if(!fs.existsSync(f)){ console.error('파일 없음: '+f); process.exit(2); }
  groups = [files];
}

(async () => {
  // 저장소의 lab을 로컬로 서빙 (버전 고정·오프라인 부분 동작)
  const server = http.createServer((rq, rs) => {
    let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
    if (!path.resolve(p).startsWith(path.resolve(ROOT))) { rs.writeHead(403); rs.end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('nf'); return; }
    const MIME = { '.js':'application/javascript', '.mjs':'application/javascript', '.css':'text/css',
      '.pdf':'application/pdf', '.json':'application/json', '.wasm':'application/wasm' };
    rs.writeHead(200, {'Content-Type': (MIME[path.extname(p)]||'text/html')+'; charset=utf-8'});
    rs.end(fs.readFileSync(p));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const PORT = server.address().port;

  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => console.error('  [페이지 오류]', e.message));

  if(STUB){ // 테스트: supabase·AI를 페이지 안 스텁으로 대체
    await page.addInitScript(() => {
      window.__rows = { problems: new Map(), worksheets: new Map() };
      window.supabase = { createClient: () => ({
        auth: {
          getSession: async () => ({ data: { session: window.__sess||null } }),
          onAuthStateChange: (cb) => { window.__authCb = cb; },
          signInWithPassword: async ({email}) => {
            window.__sess = { user: { id:'u1', email } };
            if(window.__authCb) window.__authCb('SIGNED_IN', window.__sess);
            return { data: { session: window.__sess }, error: null };
          },
          signInWithOtp: async () => ({ error:null }), signOut: async () => ({})
        },
        from: (table) => ({
          upsert: async (rows) => { rows.forEach(r=>window.__rows[table].set(r.id, {...r})); return { error:null }; },
          select: () => ({ gt: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) })
        })
      }) };
    });
  }

  await page.goto(`http://127.0.0.1:${PORT}/lab/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  if(STUB){ // 샌드박스에선 CDN이 막혀 로컬 라이브러리 주입
    await page.addScriptTag({ path: path.join(ROOT,'tests','node_modules','jszip','dist','jszip.min.js') }).catch(()=>{});
    await page.addScriptTag({ path: path.join(ROOT,'tests','node_modules','pdfjs-dist','build','pdf.min.js') }).catch(()=>{});
    await page.evaluate(() => { if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = '/tests/node_modules/pdfjs-dist/build/pdf.worker.min.js'; });
    await page.evaluate(() => {
      window.fetch = async () => new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify({
        question:'스텁 변환 문제 $x+1$?', choices:['① 1','② 2','③ 3','④ 4','⑤ 5'], answer:'①',
        solution:'', hasFigure:false, figureBox:null, subject:'수학Ⅰ', chapter:'수열', section:'등차수열', difficulty:3
      }) }] }), { status:200 });
    });
  }

  // 로그인 (비밀번호 방식 — 랩의 "자동화용 비밀번호"로 설정한 것)
  await page.evaluate(() => { localStorage.setItem('sp-lab-cloud','1'); });
  if(AIKEY) await page.evaluate(k => localStorage.setItem('sp-lab-apikey', k), AIKEY);
  await page.evaluate(async ({email, pw}) => {
    await sbInit();
    const c = await sbLoad();
    const { error } = await c.auth.signInWithPassword({ email, password: pw });
    if(error) throw new Error('클라우드 로그인 실패: '+error.message+' — 랩의 [자동화용 비밀번호 설정]을 먼저 해주세요.');
  }, { email: EMAIL||'stub@test', pw: PASSWORD||'stub' });
  await page.waitForFunction(() => SB.user, null, { timeout: 20000 });
  console.log('✅ 클라우드 로그인됨');

  let totalAdded = 0, failed = [];
  for(let gi = 0; gi < groups.length; gi++){
    const group = groups[gi].map(f => path.resolve(f));
    const label = group.map(f => path.basename(f)).join(' + ');
    console.log(`\n[${gi+1}/${groups.length}] ${label}`);
    try{
      const before = await page.evaluate(() => state.problems.length);
      await page.evaluate(() => go('add'));
      await page.setInputFiles('#bulk-files', group);
      // 영역 에디터 열림 대기 (글자 PDF 확인창은 자동 수락됨)
      await page.waitForSelector('#pdfed-bg.show', { timeout: 120000 });
      await page.waitForTimeout(800);
      await page.click('button[onclick="pdfedToRegions()"]');
      await page.waitForFunction(() => PDFED.regions.length > 0, null, { timeout: 300000 });
      const nReg = await page.evaluate(() => PDFED.regions.length);
      console.log(`  영역 ${nReg}개 인식`);
      await page.click('#pdfed-finish');
      // AI 변환(확인창 자동 수락) 완료 대기
      await page.waitForFunction(() => state.bulkDrafts.length > 0, null, { timeout: 120000 });
      await page.waitForFunction(() => !state._aiBusy, null, { timeout: TIMEOUT_MIN*60000 });
      const status = await page.evaluate(() => document.querySelector('#bulk-status').textContent);
      console.log('  '+status.split('.')[0].trim());
      // 저장 → 클라우드 반영 대기 (저장 버튼은 "일괄 등록" 탭에 있음)
      await page.evaluate(() => { go('add'); setAddMode('bulk'); });
      await page.click('button[onclick="saveBulk()"]');
      await page.waitForFunction(() => state.bulkDrafts.length === 0, null, { timeout: 120000 });
      await page.evaluate(() => sbFlush());
      await page.waitForFunction(() => SB.queue.size === 0, null, { timeout: 300000 });
      const after = await page.evaluate(() => state.problems.length);
      totalAdded += after - before;
      console.log(`  ✅ ${after-before}문항 등록·클라우드 동기화 완료`);
    }catch(e){
      failed.push(label);
      console.error('  ⚠ 실패: '+(e.message||e).split('\n')[0]);
      await page.evaluate(() => { try{ closePdfEditor(); }catch(e){} state.bulkDrafts=[]; }).catch(()=>{});
    }
  }

  console.log(`\n════ 완료 ════`);
  console.log(`총 ${totalAdded}문항 등록 (${groups.length}세션 중 실패 ${failed.length})`);
  if(failed.length) console.log('실패 목록:\n  - '+failed.join('\n  - '));
  console.log('웹 랩에서 문항을 선택해 [🔎 AI 검수]로 마무리하는 것을 권장합니다.');
  if(STUB){
    const n = await page.evaluate(() => window.__rows.problems.size);
    console.log(`[stub] 클라우드 업로드 행: ${n}`);
  }
  await browser.close(); server.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('실행 실패:', e.message||e); process.exit(2); });
