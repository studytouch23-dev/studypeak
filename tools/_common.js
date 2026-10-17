/* tools 공용: 저장소 lab 서빙, 헤드리스 브라우저, 클라우드 로그인, Claude Code(Max) 호출, 스텁 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function req(mod){
  try{ return require(mod); }
  catch(e){ return require(path.join(ROOT, 'tests', 'node_modules', mod)); }
}
function getChromium(){
  try{ return require('playwright').chromium; }catch(e){ return req('playwright-core').chromium; }
}

async function serveRepo(){
  const MIME = { '.js':'application/javascript', '.mjs':'application/javascript', '.css':'text/css',
    '.pdf':'application/pdf', '.json':'application/json', '.wasm':'application/wasm' };
  const server = http.createServer((rq, rs) => {
    let p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
    if (!path.resolve(p).startsWith(path.resolve(ROOT))) { rs.writeHead(403); rs.end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { rs.writeHead(404); rs.end('nf'); return; }
    rs.writeHead(200, {'Content-Type': (MIME[path.extname(p)]||'text/html')+'; charset=utf-8'});
    rs.end(fs.readFileSync(p));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

function supabaseStubInit(){ // --stub: 페이지 로드 전에 주입하는 가짜 Supabase
  return () => {
    window.__rows = { problems: new Map(), worksheets: new Map() };
    window.supabase = { createClient: () => ({
      auth: {
        getSession: async () => ({ data: { session: window.__sess || null } }),
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
        select: () => {
          const res = async () => ({ data: [], error: null });
          const chain = { gt: () => chain, order: () => chain, range: res, eq: () => chain, then: (f)=>res().then(f) };
          return chain;
        }
      })
    }) };
  };
}

async function openLab(opts){ // {stub, headless} → {browser, page, server, port, close}
  const { server, port } = await serveRepo();
  const browser = await getChromium().launch({
    executablePath: process.env.PW_CHROMIUM || undefined,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('  [페이지 오류]', e.message));
  if(opts && opts.stub) await page.addInitScript(supabaseStubInit());
  await page.goto(`http://127.0.0.1:${port}/lab/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  if(opts && opts.stub){ // 샌드박스는 CDN 차단 → 로컬 라이브러리 주입
    await page.addScriptTag({ path: path.join(ROOT,'tests','node_modules','jszip','dist','jszip.min.js') }).catch(()=>{});
    await page.addScriptTag({ path: path.join(ROOT,'tests','node_modules','pdfjs-dist','build','pdf.min.js') }).catch(()=>{});
    await page.evaluate(() => { if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = '/tests/node_modules/pdfjs-dist/build/pdf.worker.min.js'; });
  }
  const close = async () => { await browser.close(); server.close(); };
  return { browser, page, server, port, close };
}

async function loginCloud(page, email, pw){
  await page.evaluate(() => localStorage.setItem('sp-lab-cloud','1'));
  await page.evaluate(async ({email, pw}) => {
    await sbInit();
    const c = await sbLoad();
    const { error } = await c.auth.signInWithPassword({ email, password: pw });
    if(error) throw new Error('클라우드 로그인 실패: '+error.message+' — 랩의 [🔑 자동화용 비밀번호 설정]을 먼저 해주세요.');
  }, { email, pw });
  await page.waitForFunction(() => SB.user, null, { timeout: 20000 });
}

async function waitSynced(page){
  await page.evaluate(() => sbFlush());
  await page.waitForFunction(() => SB.queue.size === 0, null, { timeout: 300000 });
}

function runClaude(bin, prompt, opts){ // 맥의 Claude Code(Max 구독)로 1회 질의
  opts = opts || {};
  let full = prompt;
  if(opts.img) full += '\n\n분석할 이미지 파일: ' + opts.img + ' (Read 도구로 읽어서 보세요).';
  full += opts.expectJson === false
    ? '\n\n다른 말 없이 요구된 형식의 본문만 출력하세요.'
    : '\n\n다른 말 없이 JSON 하나만 출력하세요.';
  const out = execFileSync(bin, ['-p', full, '--output-format', 'json'],
    { encoding:'utf8', timeout: opts.timeoutMs || 300000,
      cwd: opts.img ? path.dirname(opts.img) : ROOT, maxBuffer: 16*1024*1024 });
  let txt = out;
  try{ const j = JSON.parse(out); if(typeof j.result === 'string') txt = j.result; }catch(e){}
  if(opts.expectJson === false) return txt.trim();
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if(a < 0 || b <= a) throw new Error('Claude 응답에서 JSON을 찾지 못함: '+txt.slice(0,120));
  return JSON.parse(txt.slice(a, b+1));
}

module.exports = { ROOT, req, getChromium, serveRepo, openLab, loginCloud, waitSynced, runClaude, supabaseStubInit };
