// smoke28: HTML 내보내기 — 학습지(토글 뷰어)·교재(표지/목차/뒤쪽 해설), 수식 사전 렌더·base64 그림·박스
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
  await new Promise(r => server.listen(9101, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:9101/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  // 샌드박스는 CDN 차단 → KaTeX 로컬 주입 (사전 렌더 경로 검증)
  await page.addScriptTag({ path: path.join(__dirname, 'node_modules/katex/dist/katex.min.js') });

  // ── 시드: 과목 2개(단원 그룹 검증), 박스+그림+선택지+수식 ──
  await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width=120; cv.height=90;
    const cx = cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,120,90);
    cx.fillStyle='#000'; cx.fillRect(20,20,80,50);
    const IMG = cv.toDataURL('image/png');
    const mk = (id,subject,chapter,q,extra)=>Object.assign({ id, question:q, choices:[], answer:'3', solution:'',
      images:[], imgN:0, subject, chapter, section:'', grade:'고2', srcType:'기출', srcName:'테스트', srcYear:'2024',
      difficulty:3, tags:[], origNo:'', reviewed:true, createdAt:Date.now(), updatedAt:Date.now() }, extra||{});
    const ps = [
      mk('h1','수학Ⅰ','수열','수열 $a_n = 2^n$ 에 대하여 다음 그림을 보자.\n[그림1]\n[박스]\n(가) $a_1 = 2$\n(나) 공비는 $2$\n[/박스]\n$a_3$의 값은?', {
        choices:['① $2$','② $4$','③ $8$','④ $16$','⑤ $32$'], answer:'③',
        solution:'$a_3 = 2^3 = 8$ 이므로 답은 ③.', images:[IMG], imgN:1 }),
      mk('h2','수학Ⅰ','수열','등차수열 문제 — 해설 없음. $d=3$'),
      mk('h3','미적분','미분법','$f(x)=x^2$ 일 때 $f\'(2)$ 는?', { answer:'4', solution:'$f\'(x)=2x$ 이므로 $f\'(2)=4$.' })
    ];
    for(const p of ps){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    state.cart = ['h1','h2','h3']; persistCart();
    document.querySelector('#s-title').value = 'HTML 내보내기 검증';
    document.querySelector('#s-sub').value = '수학Ⅰ · 미적분';
    document.querySelector('#s-author').value = '스터디피크';
    document.querySelector('#s-meta').checked = true;
  });

  // 헤드리스는 blob 다운로드 이름을 'download'로 보고하므로 a.download 속성을 직접 캡처
  await page.evaluate(() => {
    window.__dlnames = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){ if(this.download) window.__dlnames.push(this.download); return orig.call(this); };
  });
  const grab = async (mode) => {
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(m => downloadHtmlExport(m), mode)
    ]);
    const fp = await dl.path();
    const name = await page.evaluate(() => window.__dlnames.pop());
    return { name, html: fs.readFileSync(fp, 'utf8') };
  };

  // ── 1) 학습지 모드 ──
  const sheet = await grab('sheet');
  check('학습지 파일명 .html', /\.html$/.test(sheet.name), sheet.name);
  check('독립 문서(doctype+utf8)', sheet.html.startsWith('<!doctype html>') && sheet.html.includes('charset="utf-8"'));
  check('수식 사전 렌더(KaTeX HTML)', sheet.html.includes('class="katex"') && !/\$a_n/.test(sheet.html));
  check('그림 base64 내장', sheet.html.includes('<img class="fig" src="data:image/png;base64,'));
  check('조건 박스 테두리', sheet.html.includes('class="condbox"') && sheet.html.includes('(가)'));
  check('선택지 ①~⑤', sheet.html.includes('class="choices"') && sheet.html.includes('①'));
  check('카테고리 data 속성', sheet.html.includes('data-subject="수학Ⅰ"') && sheet.html.includes('data-chapter="미분법"'));
  check('출처 표기', sheet.html.includes('기출') && sheet.html.includes('테스트'));
  check('뷰어 토글 스크립트', sheet.html.includes('function tgSol') && sheet.html.includes('print-sol'));

  // ── 2) 학습지 파일을 실제로 열어 토글 동작 확인 ──
  const tmp = path.join(__dirname, 'node_modules', '.sp-export-sheet.html');
  fs.writeFileSync(tmp, sheet.html);
  const view = await ctx.newPage();
  const verr = [];
  view.on('pageerror', e => verr.push(e.message));
  await view.goto('file://' + tmp, { waitUntil: 'domcontentloaded' });
  const closed = await view.evaluate(() => getComputedStyle(document.querySelector('#sol1')).display);
  await view.click('#q1 .sbtn');
  const opened = await view.evaluate(() => getComputedStyle(document.querySelector('#sol1')).display);
  await view.evaluate(() => allSol(true));
  const allOpen = await view.evaluate(() => [...document.querySelectorAll('.sol')].every(e => e.classList.contains('open')));
  check('해설 기본 숨김 → 버튼으로 열림', closed==='none' && opened==='block', closed+'→'+opened);
  check('해설 전체 열기', allOpen);
  check('뷰어 JS 에러 없음', verr.length===0, verr.join(' | ').slice(0,150));
  await view.close(); fs.unlinkSync(tmp);

  // ── 3) 교재(책) 모드 ──
  const book = await grab('book');
  check('교재 파일명에 (교재)', book.name.includes('(교재)'), book.name);
  check('표지(제목·부제·문항 수)', book.html.includes('class="cover"') && book.html.includes('HTML 내보내기 검증') && book.html.includes('전체 3문항'));
  check('목차: 단원 2그룹 + 해설 링크', book.html.includes('href="#ch1"') && book.html.includes('href="#ch2"')
    && book.html.includes('수학Ⅰ › 수열') && book.html.includes('미적분 › 미분법') && book.html.includes('href="#sols"'));
  check('목차 번호 범위', book.html.includes('1~2번 · 2문항') && book.html.includes('3~3번 · 1문항'));
  check('단원별 본문 섹션', book.html.includes('id="ch1"') && book.html.includes('class="chtitle"'));
  check('뒤쪽 정답·해설 묶음(연속 번호)', book.html.includes('id="sols"') && /sols[\s\S]*3\.<\/span>/.test(book.html));
  check('인쇄 페이지 구분 CSS', book.html.includes('page-break-before:always') && book.html.includes('@page{size:A4'));

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
