// smoke20: AI 검수 에이전트 — 규칙 검사 + AI 정밀 검사 + 자동 승인/태그 + 보고서
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').join(__dirname, '..');
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(fs.readFileSync(p));
});

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  await new Promise(r => server.listen(9011, r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let dialogAction = 'accept';
  page.on('dialog', d => dialogAction==='accept'?d.accept():d.dismiss());
  await page.goto('http://127.0.0.1:9011/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // ── 1) 규칙 검사 단위 ──
  const u = await page.evaluate(() => {
    const base = { choices:[], answer:'', solution:'풀이', images:[], imgN:0, tags:[] };
    return {
      clean: ruleCheckProblem({...base, question:'$x+1=2$ 일 때 $x$의 값을 구하시오. [3점]', solution:'자명. 답 1'}).length,
      dollar: ruleCheckProblem({...base, question:'확률은 $\\dfrac{1}{2} 이다. 구하시오.'}).some(i=>i.includes('$ 짝')),
      cut: ruleCheckProblem({...base, question:'세 수의 합이 $x$가 되는 경우의 수를'}).some(i=>i.includes('중간에 끝남')),
      fig: ruleCheckProblem({...base, question:'그림과 같이 원이 있다. 넓이는?'}).some(i=>i.includes('이미지가 없음')),
      ch4: ruleCheckProblem({...base, question:'값은?', choices:['① 1','② 2','③ 3','④ 4']}).some(i=>i.includes('4개')),
      order: ruleCheckProblem({...base, question:'값은?', choices:['① 1','③ 3','② 2','④ 4','⑤ 5']}).some(i=>i.includes('순서')),
      unk: ruleCheckProblem({...base, question:'$\\unknowncmd{x}$ 의 값은?'}).some(i=>i.includes('미지원')),
      nosol: ruleCheckProblem({...base, question:'값은?', solution:''}).some(i=>i.includes('해설 없음'))
    };
  });
  check('정상 문항 통과', u.clean===0, u.clean);
  check('$ 짝 오류 감지', u.dollar);
  check('잘린 질문 감지', u.cut);
  check('그림 누락 감지', u.fig);
  check('선택지 4개 감지', u.ch4);
  check('원문자 순서 감지', u.order);
  check('미지원 수식 명령 감지', u.unk);
  check('해설 없음 감지', u.nosol);

  // ── 2) 일괄 검수 (AI 스텁) ──
  await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey','sk-ant-api03-test');
    const mk=(id,q,sol,ch)=>({id, question:q, choices:ch||['① $1$','② $2$','③ $3$','④ $4$','⑤ $5$'], answer:'①',
      solution:sol, images:[], imgN:0, subject:'수학Ⅰ', chapter:'수열', section:'', grade:'고2',
      srcType:'기출', srcName:'t', srcYear:'', difficulty:3, tags:[], origNo:'', reviewed:false,
      createdAt:Date.now(), updatedAt:Date.now()});
    const ps=[ mk('qa1','$x+1=2$ 일 때 $x$의 값은?','$x=1$이므로 답 ①'),      // 깨끗 → 자동 승인
      mk('qa2','$y-3=0$ 일 때 $y$의 값은?','원의 넓이는 $\\pi r^2$...'),       // 해설 불일치(AI가 지적)
      mk('qa3','그림과 같이 직사각형이 있다. 넓이는','해설 있음') ];           // 규칙 위반(잘림+그림없음)
    for(const p of ps){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    state.cart=['qa1','qa2','qa3']; persistCart(); go('db'); renderDB();
    let n=0;
    window.fetch = async (url, opts) => {
      n++;
      const txt = JSON.parse(opts.body).messages[0].content.find(c=>c.type==='text').text;
      const bad = txt.includes('$y-3=0$');
      const r = { truncated:false, figureNeeded:false, solutionMatches:bad?false:true,
        answerConsistent:bad?null:true, transcriptionOk:null, issues:[] };
      return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify(r)}]}), {status:200});
    };
  });
  await page.evaluate(() => batchQa());
  await page.waitForTimeout(1500);
  const r2 = await page.evaluate(() => {
    const g=id=>state.problems.find(p=>p.id===id);
    return { qa1r: g('qa1').reviewed, qa1t: g('qa1').tags.includes('검수주의'),
      qa2r: g('qa2').reviewed, qa2t: g('qa2').tags.includes('검수주의'),
      qa3t: g('qa3').tags.includes('검수주의'),
      modal: document.querySelector('#modal-bg').classList.contains('show'),
      report: document.querySelector('#modal-body').textContent };
  });
  check('깨끗한 문항 자동 검수 완료', r2.qa1r===true && !r2.qa1t);
  check('해설 불일치 → 검수주의', !r2.qa2r && r2.qa2t);
  check('규칙 위반 → 검수주의', r2.qa3t);
  check('보고서 모달 표시', r2.modal && r2.report.includes('매칭 오류') && r2.report.includes('이상 없음 1개'), r2.report.slice(0,80).replace(/\s+/g,' '));
  // 열어서 고치기 버튼
  await page.click('#modal-body [data-open="qa2"]');
  await page.waitForTimeout(300);
  check('열어서 고치기 → 상세', await page.evaluate(()=>document.querySelector('#e-question')!==null));

  // ── 3) 취소 = 무료 규칙 검사만 (fetch 호출 없음) ──
  await page.evaluate(() => { closeModal(); window.__fetchN=0; const of_=window.fetch; window.fetch=async(...a)=>{window.__fetchN++; return of_(...a);} });
  dialogAction = 'dismiss';
  await page.evaluate(() => batchQa());
  await page.waitForTimeout(800);
  dialogAction = 'accept';
  const r3 = await page.evaluate(() => ({ n: window.__fetchN, modal: document.querySelector('#modal-bg').classList.contains('show'),
    label: document.querySelector('#modal-body').textContent.includes('규칙 검사만') }));
  check('취소 시 AI 호출 0회 + 규칙만 실행', r3.n===0 && r3.modal && r3.label, 'fetch '+r3.n);

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
