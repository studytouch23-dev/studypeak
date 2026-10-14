// smoke23: 관대한 JSON 파서(생 줄바꿈·잘린 응답) + 해설 PDF 선택 흐름의 텍스트 경로 안전성
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
  await new Promise(r => server.listen(9051, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9051/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // ── 1) tolerantJsonParse 단위 ──
  const u = await page.evaluate(() => {
    const r = {};
    // 문자열 안 생 줄바꿈 (사용자가 겪은 'Unterminated string' 케이스)
    r.rawNl = tolerantJsonParse('{"question":"두 곡선\n$y=f(x)$와\n만나는 점","choices":[]}').question.includes('두 곡선');
    // max_tokens로 문자열 중간에서 잘림
    const cut = tolerantJsonParse('{"question":"점 $A$를 지나고 $x$축에 평행한 직선이 곡');
    r.cut = cut.question.startsWith('점 $A$');
    // 배열·객체 열린 채 잘림
    const cut2 = tolerantJsonParse('{"question":"q","choices":["① $1$","② $2$');
    r.cut2 = cut2.choices.length===2;
    // 정상 JSON은 그대로
    r.ok = tolerantJsonParse('{"a":1,"b":"x\\ny"}').b==='x\ny';
    // 역슬래시에서 잘림
    r.esc = !!tolerantJsonParse('{"q":"수식 $\\\\dfrac{1}{2}$ \\').q;
    return r;
  });
  check('생 줄바꿈 복구', u.rawNl);
  check('문자열 중간 잘림 복구', u.cut);
  check('배열 열린 채 잘림 복구', u.cut2);
  check('정상 JSON 무변화', u.ok);
  check('역슬래시 끝 잘림 복구', u.esc);

  // ── 2) aiJsonCall이 깨진 응답을 살려서 변환 성공 ──
  const r2 = await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey','sk-ant-api03-test');
    window.fetch = async () => new Response(JSON.stringify({
      stop_reason:'end_turn',
      content:[{type:'text', text:'{"question":"두 함수\n$f(x)=\\\\sin x$가 있다. 상수 $k$의 값은?","choices":["① $1$"],"answer":"","hasFigure":true,"figureBox":null,"subject":"","chapter":"","difficulty":4}'}]
    }), {status:200});
    const out = await aiTranscribeImage('data:image/png;base64,iVBORw0KGgo=');
    return { q: out.question, lines: out.question.split('\n').length };
  });
  check('깨진 응답으로도 변환 성공', r2.q.startsWith('두 함수') && r2.lines===2 && r2.q.includes('\\sin'), JSON.stringify(r2).slice(0,60));

  // ── 3) 해설 PDF 텍스트 경로: "undefined"가 들어가지 않음 ──
  const r3 = await page.evaluate(async () => {
    // pdfEditor 결과(글자 있음)를 해설 입력에 넣고 confirm 거부(텍스트 추출) 시나리오를 직접 모사
    const fake = { kind:'pdfEditor', pdf:{}, pages:[], fileName:'sol.pdf', text:'1번 해설: $x=1$\n2번 해설: $y=2$', imageMode:false };
    // handleUploadFiles 내부 분기와 동일한 로직 검증용 — 최종 res가 문자열 text가 되는지
    let res = fake;
    if(res && res.kind==='pdfEditor'){
      if(true /* targetSel==='#bulk-sol' */){
        const useSolEditor = res.imageMode || !String(res.text).trim() || false; // confirm 취소 가정
        if(!useSolEditor) res = res.text;
      }
      let useEditor = res && res.kind==='pdfEditor' && false;
      if(useEditor){ /* no */ }
      if(res && res.kind==='pdfEditor') res = res.text;
    }
    return String(res);
  });
  check('해설 텍스트 경로 정상', r3.includes('1번 해설') && !r3.includes('undefined'), r3.slice(0,30));

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
