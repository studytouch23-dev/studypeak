// smoke86: ⏸ 작업 자동 저장 — 문제지를 문항으로 나눈 뒤 [전체 저장] 전에 창이 닫혀도 [▶ 이어서 하기]로 그대로 돌아온다
//   PDF → 영역 인식 → 문항 추출(그림 문항) → 자동 저장 → 새로 고침 → 대시보드·문제 등록 화면의 알림 띠 → 이어서 하기(그림·공통 출처 복원)
//   → 남은 문항만 AI 변환 → 다시 새로 고쳐도 변환 결과가 남음 → [전체 저장]하면 자동 저장분이 지워짐
//   붙여넣기 분할도 저장됨 · [버리기] · 미리보기를 다 지우면 함께 지워짐 · 시작 직후에는 저장분을 건드리지 않음 · 작업 중 창 닫기 경고
const fs = require('fs'), os = require('os'), path = require('path');
const { openLab, ROOT } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

// 최소 PDF 생성기 (Helvetica 텍스트, xref 오프셋 계산)
function makePdf(lines){
  const content = lines.map(l=>`BT /F1 ${l.size} Tf ${l.x} ${l.y} Td (${l.text}) Tj ET`).join('\n');
  const objs = [];
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`;
  objs[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objs[5] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  let out = '%PDF-1.4\n'; const offs = [0];
  for(let i=1;i<=5;i++){ offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 6\n0000000000 65535 f \n` + offs.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-work-'));
  const pdfPath = path.join(tmp, 'unit-check.pdf');
  fs.writeFileSync(pdfPath, makePdf([
    { x:50, y:700, size:14, text:'1.' }, { x:70, y:700, size:12, text:'What is 2 plus 2?' }, { x:50, y:680, size:12, text:'Choose the right answer below.' },
    { x:50, y:380, size:14, text:'2.' }, { x:70, y:380, size:12, text:'What is 3 plus 3?' }, { x:50, y:360, size:12, text:'Write your answer.' }
  ]));

  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const NM = path.join(ROOT, 'tests', 'node_modules');
  const prep = async () => {           // 새로 고친 뒤: 라이브러리 다시 넣고(샌드박스는 CDN 차단), 자동 저장 간격을 짧게
    await page.waitForTimeout(700);
    await page.addScriptTag({ path: path.join(NM, 'jszip', 'dist', 'jszip.min.js') }).catch(()=>{});
    await page.addScriptTag({ path: path.join(NM, 'pdfjs-dist', 'build', 'pdf.min.js') }).catch(()=>{});
    await page.evaluate(() => { if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = '/tests/node_modules/pdfjs-dist/build/pdf.worker.min.js'; WORK.gap = 60; });
  };
  const reload = async () => { await page.reload({ waitUntil: 'domcontentloaded' }); await prep(); };
  const saved = () => page.evaluate(async () => { await new Promise(r => setTimeout(r, 450)); const w = await workTx('readonly', st => st.get('bulk')); return w ? { n: w.drafts.length, imgs: w.drafts.filter(d => /^data:image/.test(d.img || '')).length, text: w.drafts.filter(d => (d.text || '').trim()).length, src: (w.form || {}).srcname, tmp: w.drafts.some(d => Object.keys(d).some(k => k[0] === '_')) } : null; });
  const banner = () => page.evaluate(() => { const els = [...document.querySelectorAll('.work-banner')]; return { n: els.length, shown: els.filter(e => e.style.display !== 'none').length, text: (els[0] || {}).textContent || '' }; });
  await page.evaluate(() => { WORK.gap = 60; });

  // 0) 시작: 저장분 없음 → 띠 없음, 창 닫기 경고 없음
  const b0 = await banner();
  const bu0 = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  check('처음에는 알림 띠가 없고, 작업이 없으면 창 닫기 경고도 없음', b0.n === 2 && b0.shown === 0 && bu0 === false, JSON.stringify(b0));

  // 1) PDF → 영역 인식 → 문항 추출 (API 키 없음 = 그림 문항 그대로)
  await page.evaluate(() => { go('add'); setAddMode('bulk'); });
  await page.setInputFiles('#bulk-files', pdfPath);
  await page.waitForSelector('#pdfed-bg.show', { timeout: 60000 });
  await page.waitForTimeout(600);
  const buEdit = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  await page.click('button[onclick="pdfedToRegions()"]');
  await page.waitForFunction(() => PDFED.regions.length > 0, null, { timeout: 60000 });
  await page.click('#pdfed-finish');
  await page.waitForFunction(() => state.bulkDrafts.length === 2, null, { timeout: 60000 });
  await page.fill('#b-srcname', '단원 점검 3회'); await page.dispatchEvent('#b-srcname', 'change');
  await page.evaluate(() => { state.bulkDrafts[0]._redrawing = true; rerenderBulk(); });
  const s1 = await saved();
  const bu1 = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  check('문항으로 나누면 자동 저장됨(그림·공통 출처 포함, 임시 표시는 뺌)', s1 && s1.n === 2 && s1.imgs === 2 && s1.src === '단원 점검 3회' && s1.tmp === false, JSON.stringify(s1));
  check('작업 중(영역 편집·분할 결과)에는 창을 닫으려 할 때 경고', buEdit === true && bu1 === true);

  // 2) 창이 닫혔다 다시 열림(새로 고침) → 띠가 뜨고, 시작 직후의 다시 그리기는 저장분을 지우지 않는다
  await reload();
  const r2 = await page.evaluate(() => ({ drafts: state.bulkDrafts.length, pending: WORK.pending && WORK.pending.n }));
  await page.evaluate(() => rerenderBulk());
  const s2 = await saved(), b2 = await banner();
  check('다시 열면 대시보드·문제 등록 화면에 "끝내지 못한 작업" 띠', r2.drafts === 0 && r2.pending === 2 && b2.shown === 2 && /단원 점검 3회/.test(b2.text) && /2문항/.test(b2.text) && /AI 변환 0\/2/.test(b2.text), b2.text.slice(0, 90));
  check('시작 직후(작업 없음)의 화면 갱신은 저장분을 지우지 않음', s2 && s2.n === 2);

  // 3) [▶ 이어서 하기] → 분할 결과가 그대로
  await page.click('.work-banner button[onclick="workResume()"]');
  await page.waitForFunction(() => state.bulkDrafts.length === 2);
  const r3 = await page.evaluate(() => ({ view: document.querySelector('.view.active').id, bulk: $('#add-bulk').style.display, card: $('#bulk-preview-card').style.display, imgs: document.querySelectorAll('#bulk-preview img').length,
    src: $('#b-srcname').value, status: $('#bulk-status').textContent, nums: state.bulkDrafts.map(d => d.num).join(), log: (JSON.parse(localStorage.getItem('sp-lab-joblog') || '[]')[0] || {}).kind }));
  const b3 = await banner();
  check('이어서 하기: 문제 등록 화면에 분할 결과·그림·공통 출처가 돌아옴', r3.view === 'view-add' && r3.bulk === 'block' && r3.card === 'block' && r3.imgs >= 2 && r3.src === '단원 점검 3회' && r3.nums === '1,2' && b3.shown === 0 && r3.log === '작업 이어서', JSON.stringify(r3).slice(0, 220) + ' nums=' + r3.nums + ' log=' + r3.log + ' banner=' + b3.shown);

  // 4) 남은 문항 AI 변환(가짜 응답) → 변환 결과도 저장되고, 다시 닫혔다 열려도 남는다
  await page.evaluate(() => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test'); localStorage.setItem('sp-lab-autotype', '0'); let n = 0;
    window.fetch = async (url, opts) => { n++; return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ question: `변환 ${n} $x+${n}$ 의 값은?`, choices: [], answer: String(n), hasFigure: false, figureBox: null, subject: '수학Ⅰ', chapter: '수열', section: '등차수열', difficulty: 2 }) }] }), { status: 200 }); };
  });
  await page.click('#btn-ai-drafts');
  await page.waitForFunction(() => state.bulkDrafts.every(d => d.aiDone) && !state._aiBusy, null, { timeout: 60000 });
  const s4 = await saved();
  await reload();
  const b4 = await banner();
  await page.click('.work-banner button[onclick="workResume()"]');
  await page.waitForFunction(() => state.bulkDrafts.length === 2);
  const r4 = await page.evaluate(() => ({ done: state.bulkDrafts.filter(d => d.aiDone && /변환/.test(d.text)).length, tags: document.querySelectorAll('#bulk-preview .pmeta').length, status: $('#bulk-status').textContent }));
  check('AI 변환 결과까지 저장되어, 다시 열어도 변환된 상태로 돌아옴', s4 && s4.text === 2 && /AI 변환 2\/2/.test(b4.text) && r4.done === 2 && r4.tags >= 2 && !/변환되지 않은/.test(r4.status), JSON.stringify(r4).slice(0, 160) + ' ' + b4.text.slice(0, 70));

  // 5) [전체 저장] → DB 로 들어가고 자동 저장분은 지워진다
  await page.evaluate(() => saveBulk());
  await page.waitForFunction(() => state.problems.length === 2 && !state.bulkDrafts.length, null, { timeout: 30000 });
  const s5 = await saved();
  await reload();
  const b5 = await banner(), n5 = await page.evaluate(() => state.problems.length);
  check('[전체 저장] 뒤에는 자동 저장분이 지워지고 띠도 뜨지 않음', s5 === null && b5.shown === 0 && n5 === 2, JSON.stringify(b5));

  // 6) 붙여넣기 분할도 저장 → [버리기]
  await page.evaluate(() => { go('add'); setAddMode('bulk'); $('#bulk-text').value = '1. 첫째 문제 $x+1$ 의 값은?\n\n2. 둘째 문제 $x+2$ 의 값은?\n\n3. 셋째 문제 $x+3$ 의 값은?'; splitBulk(); });
  await page.waitForFunction(() => state.bulkDrafts.length === 3);
  const s6 = await saved();
  await reload();
  const b6 = await banner();
  await page.evaluate(() => go('add'));
  await page.click('#view-add .work-banner button[onclick="workDiscard(true)"]');
  const s6b = await saved(), b6b = await banner();
  check('붙여넣기 분할도 자동 저장되고, [버리기]를 누르면 지워짐', s6 && s6.n === 3 && b6.shown === 2 && /3문항/.test(b6.text) && s6b === null && b6b.shown === 0, b6.text.slice(0, 70));

  // 7) 미리보기에서 문항을 모두 지우면 자동 저장분도 지워진다
  await page.evaluate(() => { $('#bulk-text').value = '1. 가 문제 $a$ 는?\n\n2. 나 문제 $b$ 는?'; splitBulk(); });
  await page.waitForFunction(() => state.bulkDrafts.length === 2);
  const s7 = await saved();
  await page.evaluate(() => { state.bulkDrafts.splice(0, 2); rerenderBulk(); });
  const s7b = await saved();
  check('미리보기의 문항을 모두 지우면 자동 저장분도 지워짐', s7 && s7.n === 2 && s7b === null);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
