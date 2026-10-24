// smoke56: 방금 등록한 모의고사 한 세트를 바로 학습지·교재·모의고사로 + "1번이 안 보임" 점검
//  - 등록 묶음(batch): 저장하면 그 묶음을 원래 번호 순(1번부터)으로 보여 주고 [🧺 학습지·교재·모의고사 만들기]
//  - 최신순 정렬도 묶음 안에서는 1번부터 (예전엔 1번이 묶음 맨 끝/다음 페이지로 밀림)
//  - 맨 위 띠의 쪽번호 '1'이 1번 문항 번호를 가로채지 않음, 빠진 번호 경고
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

function makePdf(pages){
  const n = pages.length, objs = [];
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i*2} 0 R`).join(' ')}] /Count ${n} >>`;
  const fontId = 3 + n*2;
  pages.forEach((ops, i) => {
    const content = ops.join('\n');
    objs[3 + i*2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i*2} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    objs[4 + i*2] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  objs[fontId] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  let out = '%PDF-1.4\n'; const offs = [0];
  for(let i=1;i<=fontId;i++){ offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${fontId+1}\n0000000000 65535 f \n` + offs.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  out += `trailer\n<< /Size ${fontId+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
const T = (x, y, size, s) => `BT /F1 ${size} Tf ${x} ${y} Td (${s}) Tj ET`;
const prob = (num, y, tag) => [T(40, y, 11, String(num)), T(62, y, 10, `${tag} first line of the problem`), T(62, y-14, 10, `${tag} second line`)];

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-batch-'));
  // ① 마침표 없는 문항 번호 + 맨 위 띠(위쪽 5%)에 쪽번호 '1' 만 홀로
  const pA = path.join(tmp, 'exam-a.pdf');
  fs.writeFileSync(pA, makePdf([[ T(40, 752, 12, '1'), T(250, 752, 14, 'Math'), ...prob(1, 700, 'P1'), ...prob(2, 600, 'P2'), ...prob(3, 500, 'P3'), ...prob(4, 400, 'P4') ]]));
  // ② 1번 영역이 빠진 세트(2~6번)
  const pB = path.join(tmp, 'exam-b.pdf');
  fs.writeFileSync(pB, makePdf([[ ...[2,3,4,5,6].map((n, k) => prob(n+'.', 720 - k*110, 'Q'+n)).flat() ]]));

  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  await page.evaluate(() => go('add'));
  await page.setInputFiles('#bulk-files', pA);
  await page.waitForSelector('#pdfed-bg.show', { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => pdfedToRegions());
  const A = await page.evaluate(() => PDFED.regions.map(r => ({ num:r.num, y:+r.y.toFixed(1) })));
  const a1 = A.find(r => r.num === '1') || {};
  check('쪽번호 "1"이 1번을 가로채지 않음: 1번 영역은 실제 1번 줄에서 시작', A.map(r => r.num).join(',') === '1,2,3,4' && a1.y >= 792-700-16, JSON.stringify(A));
  await page.evaluate(() => closePdfEditor && closePdfEditor());

  await page.setInputFiles('#bulk-files', pB);
  await page.waitForSelector('#pdfed-bg.show', { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => pdfedToRegions());
  const info = await page.evaluate(() => $('#pdfed-solinfo').style.display !== 'none' ? $('#pdfed-solinfo').textContent : '');
  check('1번 영역이 없으면 편집 화면에 경고', /1번/.test(info) && /찾지 못했어요/.test(info), info.slice(0, 80));
  await page.click('#pdfed-finish');
  await page.waitForFunction(() => state.bulkDrafts.length === 5, null, { timeout: 60000 });
  const st = await page.evaluate(() => $('#bulk-status').textContent);
  check('분할 확인 화면에도 빠진 번호 표시', /빠진 번호: 1번/.test(st), st);

  // ── 등록 묶음 → 바로 학습지·교재·모의고사 ──
  const r = await page.evaluate(async () => {
    // 예전에 저장된(묶음 표시 없는) 문항 2개 — 출처+날짜로 묶임
    const old = Date.now() - 86400000*3;
    for(const [i, no] of [[0,'2'],[1,'1']]){
      const p = { id:'old'+i, question:'예전 문항 '+no, choices:[], answer:'', solution:'', images:[], subject:'수학Ⅰ', chapter:'', section:'', tags:[], srcType:'기출', srcName:'9월 모의', origNo:no, createdAt: old+i, updatedAt: old+i };
      await saveProblem(p); state.problems.push(lightenProblem(p));
    }
    // 방금 분할한 5문항(2~6번)을 텍스트로 채워 저장
    state.bulkDrafts.forEach((d, k) => { d.text = '세트 문항 '+d.num+' 본문 '+k; d.img = null; });
    $('#b-srcname').value = '10월 모의고사';
    await saveBulk();
    const batchSel = $('#filter-batch').value, banner = $('#batch-banner').textContent;
    const order = state.viewList.map(id => state.problems.find(p => p.id === id).origNo);
    // 최신순(묶음 해제)도 묶음 안은 번호 순
    $('#filter-batch').value = ''; $('#sort').value = 'new'; renderDB();
    const newOrder = state.viewList.map(id => { const p = state.problems.find(x => x.id === id); return (p.srcName||'')+'#'+p.origNo; });
    const batches = batchList().map(b => b.name + '(' + b.n + ')');
    // 학습지로
    state.cart = ['old0']; persistCart();
    batchToSheet(batchKeyOf(state.problems.find(p => p.srcName === '10월 모의고사')));
    const cart = cartList().map(p => p.origNo);
    return { batchSel: !!batchSel, banner, order, newOrder, batches, cart, sheet: document.querySelector('#view-sheet').classList.contains('active'), title: $('#s-title').value };
  });
  check('저장하면 방금 등록한 묶음을 보여 줌', r.batchSel && r.banner.includes('10월 모의고사') && r.banner.includes('5문항'), r.banner.slice(0, 80));
  check('묶음은 원래 번호 순(작은 번호부터)', JSON.stringify(r.order) === '["2","3","4","5","6"]', JSON.stringify(r.order));
  check('묶음 안내에 빠진 번호(1번) 표시', /빠진 번호: 1번/.test(r.banner), r.banner);
  check('최신순: 최근 묶음 먼저, 묶음 안은 1번부터', r.newOrder.join(',') === '10월 모의고사#2,10월 모의고사#3,10월 모의고사#4,10월 모의고사#5,10월 모의고사#6,9월 모의#1,9월 모의#2', r.newOrder.join(','));
  check('예전 문항은 출처+날짜로 묶음 목록에', r.batches.some(b => b.startsWith('9월 모의') && b.endsWith('(2)')), JSON.stringify(r.batches));
  check('[🧺 학습지·교재·모의고사 만들기]: 원래 번호 순으로 담고 학습지 화면으로, 제목 = 출처', JSON.stringify(r.cart) === '["2","3","4","5","6"]' && r.sheet && r.title === '10월 모의고사', JSON.stringify([r.cart, r.title]));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  fs.rmSync(tmp, { recursive:true, force:true });
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
