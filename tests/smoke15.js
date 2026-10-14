// smoke15: mathrm/대문자 그리스/선행 첨자(조합 기호) 수식 변환 검증
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
  await new Promise(r => server.listen(8961, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8961/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  const r = await page.evaluate(() => {
    resetEqDiag();
    const cases = {
      // 사용자 파일(수학학습지16)의 실제 AI 변환 LaTeX들
      mathrmP: latexToHwpEq('\\mathrm{P}(A^{C} \\cap B)=\\dfrac{1}{6}'),
      prescript: latexToHwpEq('_{3}H_{n} = {}_{6}\\Pi_{2}'),
      // 추가 보강 확인
      operatorname: latexToHwpEq('\\operatorname{E}(X)=10'),
      texttok: latexToHwpEq('\\text{AB}=2'),
      sigma: latexToHwpEq('\\Sigma_{k=1}^{n} k'),
      combi: latexToHwpEq('x = _{6}P_{3}'),
      normalSup: latexToHwpEq('x^{2}+y^{2}=1'),
      // 중괄호 없는 첨자: 한글은 공백 전까지 전부 첨자로 삼으므로 반드시 {}로 묶여야 함
      bareSup: latexToHwpEq('\\overline{BC}^2=4^2+5^2-2\\cdot4\\cdot5\\cdot\\frac{1}{8}'),
      bareCmd: latexToHwpEq('45^\\circ + x_1'),
      style: latexToHwpEq('\\displaystyle\\int_{0}^{1} x\\,dx'),
      // 수식 속 한글: 조사는 수식 밖으로, 남은 한글은 rm{}으로
      mkor: fixAiNewlines('최솟값을 $M+m의$ 값은?'),
      kEq: latexToHwpEq('x = 3 끝'),
      wMm: eqMeasure('M+m').w,
      // 분수가 식 중간에 있을 때 폭은 좌우 "합" — max로 잡으면 뒤 글자와 겹침
      wMid: eqMeasure('{12345} over {8} = 414141').w,
      wL: eqMeasure('{12345}').w, wR: eqMeasure('= 414141').w,
      unknown: [...EQ_DIAG.unknown],
      // import 왕복: PI는 \\Pi로 보존, rm은 제거
      imp1: hwpEqToLatex('{}_{6} PI _{2}'),
      imp2: hwpEqToLatex('rm {P}(A cap B)'),
      imp3: hwpEqToLatex('2 pi r'),
      // eqMeasure: rm 폭 0 취급
      wRm: eqMeasure('rm {P}(A)').w, wNoRm: eqMeasure('{P}(A)').w
    };
    return cases;
  });

  check('mathrm → rm', r.mathrmP.includes('rm {P}') && !r.mathrmP.includes('mathrm'), r.mathrmP);
  check('선행 _ → {} 붙임', r.prescript.startsWith('{}_{3}'), r.prescript);
  check('\\Pi → PI', /\bPI\b/.test(r.prescript) && !/\bPi\b/.test(r.prescript), r.prescript);
  check('operatorname → rm', r.operatorname.includes('rm {E}'), r.operatorname);
  check('text → rm', r.texttok.includes('rm {AB}'), r.texttok);
  check('\\Sigma → SIGMA', /\bSIGMA\b/.test(r.sigma), r.sigma);
  check('= 뒤 선행 _ 보정', r.combi.includes('= {}_{6}'), r.combi);
  check('일반 첨자 영향 없음', r.normalSup.replace(/\s/g,'')==='x^{2}+y^{2}=1', r.normalSup);
  const bs = r.bareSup.replace(/\s/g,'');
  check('붙여 쓴 지수 {} 강제(=가 지수로 안 빨림)', bs.includes('^{2}=4^{2}') && !/[_^][^{]/.test(bs), r.bareSup);
  check('명령 첨자 {} 강제(45°, x_1)', r.bareCmd.replace(/\s+/g,' ').includes('45^{ circ }') && r.bareCmd.replace(/\s/g,'').includes('x_{1}'), r.bareCmd);
  check('\\displaystyle 등 스타일 명령 제거', !r.style.includes('displaystyle') && r.style.includes('int'), r.style);
  check('수식 끝 조사($M+m의$) 밖으로', r.mkor.includes('$M+m$의'), r.mkor);
  check('수식 속 한글 rm{} 조판', r.kEq.includes('rm {끝}'), r.kEq);
  check('M+m 폭 상향(겹침 방지)', r.wMm >= 1700, r.wMm);
  check('식 중간 분수 폭 = 좌우 합 이상', r.wMid >= r.wL + r.wR, r.wMid+' vs '+r.wL+'+'+r.wR);
  check('미지원 명령 보고 없음', r.unknown.length===0, r.unknown.join(','));
  check('import: PI → \\Pi', r.imp1.includes('\\Pi'), r.imp1);
  check('import: rm 제거', !r.imp2.includes('rm') && r.imp2.includes('P'), r.imp2);
  check('import: 소문자 pi 유지', r.imp3.includes('\\pi'), r.imp3);
  check('eqMeasure rm 폭 ≈0(공백만)', Math.abs(r.wRm-r.wNoRm)<=300, r.wRm+' vs '+r.wNoRm);
  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | '));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
