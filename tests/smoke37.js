// smoke37: 한글 수식 변환 강화 — 중괄호 없는 인수(\frac12), n제곱근(root of), \left \right 크기 조절 괄호,
//          행렬·여러 줄 정렬식, \mathbb 등 / 크기 측정(eqMeasure) / 한글→LaTeX 역변환 / 실제 HWPX 출력
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const ROOT = path.join(__dirname, '..');
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

const CASES = [
  ['\\frac12+\\frac{x}{2}',                    '{1} over {2}+{x} over {2}'],
  ['\\frac 1 2',                              '{1} over {2}'],
  ['\\frac\\pi2',                             '{ pi } over {2}'],
  ['\\frac{\\sqrt3}{2}',                      '{sqrt {3}} over {2}'],
  ['\\sqrt[3]{x}',                            'root {3} of {x}'],
  ['\\sqrt[n]{a^{m}}',                        'root {n} of {a^{m}}'],
  ['\\left(\\frac{1}{2}\\right)^2',            'left ( {1} over {2} right ) ^{2}'],
  ['\\left| x-1 \\right|',                    'left | x-1 right |'],
  ['\\left[ 0, 1 \\right]',                   'left [ 0, 1 right ]'],
  ['\\left\\{ x \\right.',                    'lbrace x'],
  ['\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', 'pmatrix{ 1 & 2 # 3 & 4 }'],
  ['\\begin{aligned} a&=1\\\\ b&=2\\end{aligned}', 'matrix{ a =1 # b =2 }'],
  ['\\mathbb{R}',                             'rm {R}'],
  ['50\\%',                                   '50%'],
  ['x\\in A, \\int_0^1 f(x)dx',               'x in A, int _{0}^{1} f(x)dx'],
  ['\\overrightarrow{AB}\\perp\\overrightarrow{CD}', 'vec {AB} bot vec {CD}'],
];

(async () => {
  await new Promise(r => server.listen(9171, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9171/lab/', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: path.join(__dirname, 'node_modules/jszip/dist/jszip.min.js') });
  await page.waitForTimeout(400);

  // ── 1) LaTeX → 한글 수식 스크립트 ──
  const conv = await page.evaluate(cases => {
    resetEqDiag();
    const out = cases.map(([t]) => latexToHwpEq(t));
    return { out, unknown: [...EQ_DIAG.unknown] };
  }, CASES);
  CASES.forEach(([t, want], i) => check('변환 '+t, conv.out[i] === want, conv.out[i]));
  check('지원 명령은 미지원 진단에 안 잡힘', conv.unknown.length === 0, conv.unknown.join(' '));

  const unk = await page.evaluate(() => { resetEqDiag(); latexToHwpEq('\\begin{array}{cc} a & b \\end{array}'); return [...EQ_DIAG.unknown]; });
  check('진짜 미지원 환경은 이름까지 보고', unk.includes('\\begin{array}'), unk.join(' '));

  // ── 2) 크기 측정: 새 토큰이 폭을 과소/과대 추정하지 않음 ──
  const ms = await page.evaluate(() => {
    const w = s => eqMeasure(latexToHwpEq(s)).w;
    return {
      lr: w('\\left(\\frac{1}{2}\\right)'), plain: w('(\\frac{1}{2})'),
      root: eqMeasure('root {3} of {x}').w, sqrt: eqMeasure('sqrt {x}').w,
      mat: eqMeasure('pmatrix{ 1 & 2 # 3 & 4 }'), cell: eqMeasure('1').w,
    };
  });
  check('left/right 글자는 폭에 안 셈 (여유만 약간)', ms.lr >= ms.plain && ms.lr - ms.plain <= 700, ms.lr+' vs '+ms.plain);
  check('root of: 근호보다 조금 넓고 of 글자는 안 셈', ms.root > ms.sqrt && ms.root < ms.sqrt + 800, ms.root+' vs sqrt '+ms.sqrt);
  check('행렬: 2열 폭 + 2행 높이', ms.mat.w > ms.cell*2 + 600 && ms.mat.h >= 2200, ms.mat.w+'×'+ms.mat.h);

  // ── 3) 한글 → LaTeX 역변환 (HWPX 가져오기) ──
  const back = await page.evaluate(() => ({
    root: hwpEqToLatex('root {3} of {x+1}'),
    mat: hwpEqToLatex('pmatrix{1 & 2 # 3 & 4}'),
    det: hwpEqToLatex('dmatrix{a & b # c & d}'),
  }));
  check('root of → \\sqrt[n]', back.root === '\\sqrt[3]{x+1}', back.root);
  check('pmatrix → \\begin{pmatrix}', /\\begin\{pmatrix\}1 & 2 \\\\ 3 & 4\\end\{pmatrix\}/.test(back.mat), back.mat);
  check('dmatrix → vmatrix(행렬식)', back.det.includes('\\begin{vmatrix}'), back.det);

  // ── 4) 검수 규칙: 고친 형태는 더 이상 '한글 깨짐'으로 걸리지 않음 ──
  const rc = await page.evaluate(() => ruleCheckProblem({ question:'$\\frac12+\\sqrt[3]{8}$ 의 값과 $\\left(\\frac{a}{b}\\right)^2$ 를 구하시오.',
    choices:[], answer:'2', solution:'풀이', images:[], imgN:0, tags:[] }).filter(i => /수식|역슬래시|미지원/.test(i)));
  check('검수: 수식 경고 없음', rc.length === 0, rc.join(' / '));

  // ── 5) 실제 HWPX 출력: 스크립트가 그대로 들어가고 XML이 깨지지 않음 ──
  await page.evaluate(async () => {
    const p = { id:'eq37', question:'$\\frac12$ 과 $\\sqrt[3]{x}$, 그리고 $\\left(\\frac{1}{2}\\right)^2$ 와 $\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$ 의 값은?',
      choices:[], answer:'', solution:'', images:[], imgN:0, subject:'수학Ⅰ', chapter:'지수함수와 로그함수', section:'',
      grade:'고2', srcType:'기출', srcName:'t', srcYear:'', difficulty:3, tags:[], origNo:'', reviewed:true,
      createdAt:Date.now(), updatedAt:Date.now() };
    await saveProblem(p); state.problems.push(lightenProblem(p));
    state.cart=['eq37']; persistCart(); go('sheet'); renderSheet();
    document.querySelector('#s-title').value='수식 변환 테스트';
  });
  const [dl] = await Promise.all([ page.waitForEvent('download',{timeout:15000}), page.click('#btn-hwpx') ]);
  const f = path.join(__dirname, 'eq37.hwpx'); await dl.saveAs(f);
  const z = await JSZip.loadAsync(fs.readFileSync(f));
  const sec = await z.file('Contents/section0.xml').async('string');
  fs.unlinkSync(f);
  const scripts = (sec.match(/<hp:script>([\s\S]*?)<\/hp:script>/g)||[]).map(x=>x.replace(/<\/?hp:script>/g,''));
  check('HWPX: \\frac12 → over', scripts.some(x=>x.includes('{1} over {2}')), scripts.join(' | ').slice(0,200));
  check('HWPX: root of', scripts.some(x=>x.includes('root {3} of {x}')));
  check('HWPX: left ( right )', scripts.some(x=>x.includes('left (') && x.includes('right )')));
  check('HWPX: pmatrix (& 는 &amp; 로 이스케이프)', sec.includes('pmatrix{ 1 &amp; 2 # 3 &amp; 4 }'));
  check('HWPX: 역슬래시 없음', !scripts.some(x=>x.includes('\\')));
  const xerr = await page.evaluate(x=>new DOMParser().parseFromString(x,'text/xml').querySelector('parsererror')?.textContent||'', sec);
  check('HWPX well-formed', !xerr, xerr.slice(0,80));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await browser.close(); server.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
