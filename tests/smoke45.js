// smoke45: 3단 해설지 영역 인식 — 단별로 정확히 자르고(가로 띠 금지), 단·페이지를 넘어 이어지는 해설은
//          같은 번호의 이어지는 조각으로, 첫 페이지 정답표는 해설로 자르지 않음
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

function makePdf(pages){ // pages: [[op, ...], ...]
  const n = pages.length, objs = [];
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  const kids = pages.map((_, i) => `${3 + i*2} 0 R`).join(' ');
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
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
const lines = (x, yTop, nLines, tag) => Array.from({length:nLines}, (_, k) => T(x, yTop - k*13, 9, `${tag} line ${k+1} of the solution text`));
const C1 = 40, C2 = 222, C3 = 404;                              // 세 단의 왼쪽 끝 (단 너비 ≈ 165pt, 단 사이 ≈ 17pt)

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-3col-'));
  const pdfPath = path.join(tmp, 'haeseol.pdf');
  fs.writeFileSync(pdfPath, makePdf([
    [ // 1쪽
      T(60, 750, 14, 'Math Solutions'),
      // 1단 위: 정답표 (마침표 없는 숫자들) — 해설로 자르면 안 됨
      ...[0,1,2].map(r => T(C1, 700 - r*16, 10, `${r*4+1}  A   ${r*4+2}  B   ${r*4+3}  C   ${r*4+4}  D`)),
      T(C1+40, 630, 11, 'SOLUTIONS'),
      // 1단: 1, 2, 3번 → 3번이 단 끝까지 이어짐
      T(C1, 600, 10, '1.'), ...lines(C1+14, 600, 4, 'S1'),
      T(C1, 520, 10, '2.'), ...lines(C1+14, 520, 5, 'S2'),
      T(C1, 420, 10, '3.'), ...lines(C1+14, 420, 22, 'S3'),          // 420 → 147 근처까지
      // 2단: 맨 위는 3번의 이어짐(번호 없음), 그다음 4번·5번
      ...lines(C2, 740, 6, 'S3cont'),
      T(C2, 640, 10, '4.'), ...lines(C2+14, 640, 8, 'S4'),
      T(C2, 520, 10, '5.'), ...lines(C2+14, 520, 30, 'S5'),          // 2단 끝까지 → 3단으로 이어짐
      // 3단: 5번의 이어짐 → 6번, 7번(페이지 끝까지)
      ...lines(C3, 740, 4, 'S5cont'),
      T(C3, 670, 10, '6.'), ...lines(C3+14, 670, 7, 'S6'),
      T(C3, 560, 10, '7.'), ...lines(C3+14, 560, 32, 'S7'),
    ],
    [ // 2쪽: 1단 맨 위는 앞 페이지 7번의 이어짐 → 8번
      ...lines(C1, 740, 5, 'S7cont'),
      T(C1, 650, 10, '8.'), ...lines(C1+14, 650, 6, 'S8'),
      T(C2, 740, 10, '9.'), ...lines(C2+14, 740, 6, 'S9'),
      T(C3, 740, 10, '10.'), ...lines(C3+18, 740, 6, 'S10'),
    ],
  ]));

  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  await page.evaluate(() => go('add'));
  await page.setInputFiles('#bulk-files', pdfPath);
  await page.waitForSelector('#pdfed-bg.show', { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => { PDFED.pages.forEach(p => { p.mode = 'sol'; p.selected = true; }); });   // 해설지
  await page.evaluate(() => pdfedToRegions());                 // 모든 페이지 인식이 끝날 때까지 기다림

  const R = await page.evaluate(() => PDFED.regions.map(r => ({ p:r.page, num:r.num, cont:!!r.cont,
    x:+r.x.toFixed(1), r:+(r.x+r.w).toFixed(1), y:+r.y.toFixed(1), b:+(r.y+r.h).toFixed(1), kind:r.kind })));
  console.log('  regions', JSON.stringify(R.map(r => `${r.p}:${r.num}${r.cont?'+':''} x${r.x}-${r.r} y${r.y}-${r.b}`)));
  const T2 = y => 792 - y;
  const colOf = r => r.x < 210 ? 1 : r.x < 395 ? 2 : 3;
  const find = (p, num, cont) => R.find(r => r.p === p && r.num === num && r.cont === !!cont);

  // ── 단별로: 어떤 영역도 두 단에 걸치지 않음 ──
  check('모든 영역이 한 단 안 (가로 띠 없음)', R.every(r => r.r - r.x < 200), JSON.stringify(R.filter(r => r.r - r.x >= 200)));
  check('번호 영역 10개 (1~10번)', ['1','2','3','4','5','6','7','8','9','10'].every(n => find(n==='8'||n==='9'||n==='10' ? 1 : 0, n, false)), R.filter(r=>!r.cont).map(r=>r.num).join(','));
  check('1·2·3번은 1단, 4·5번은 2단, 6·7번은 3단', ['1','2','3'].every(n => colOf(find(0,n))===1) && ['4','5'].every(n => colOf(find(0,n))===2) && ['6','7'].every(n => colOf(find(0,n))===3));
  // ── 정답표는 자르지 않음 ──
  check('정답표(1단 맨 위)는 해설 조각이 아님', !R.some(r => r.p===0 && colOf(r)===1 && r.y < T2(640)), JSON.stringify(R.filter(r => r.p===0 && colOf(r)===1).map(r=>[r.num,r.y])));
  // ── 이어지는 해설 ──
  const c3 = find(0, '3', true), c5 = find(0, '5', true), c7 = find(1, '7', true);
  check('2단 맨 위 = 3번 이어짐', c3 && colOf(c3) === 2 && c3.b <= T2(640) + 2, JSON.stringify(c3));
  check('3단 맨 위 = 5번 이어짐', c5 && colOf(c5) === 3 && c5.b <= T2(670) + 2, JSON.stringify(c5));
  check('다음 페이지 1단 맨 위 = 앞 페이지 7번 이어짐', c7 && colOf(c7) === 1 && c7.b <= T2(650) + 2, JSON.stringify(c7));
  check('이어짐이 없는 단 위쪽엔 빈 조각을 만들지 않음', !R.some(r => r.cont && r.p===1 && colOf(r) !== 1), JSON.stringify(R.filter(r=>r.cont)));
  // ── 각 번호 영역의 위·아래 ──
  const s3 = find(0, '3'), s4 = find(0, '4');
  check('3번: 1단 끝(마지막 줄)까지', s3.b >= T2(420 - 21*13) && s3.b <= T2(420 - 21*13) + 10, `${s3.b}`);
  check('4번: 위는 번호 줄, 아래는 5번 전', s4.y >= T2(640) - 14 && s4.b <= T2(520) - 6, `${s4.y}-${s4.b}`);
  check('조각은 모두 해설 종류', R.every(r => r.kind === 'sol'));

  // ── 완료 → 해설 조각 전부 풀에 (이어짐 포함), 번호 그대로 ──
  await page.click('#pdfed-finish');
  await page.waitForFunction(() => (state.solPool||[]).length > 0, null, { timeout: 60000 });
  const pool = await page.evaluate(() => state.solPool.map(p => p.num));
  check('완료: 이어짐 포함 모든 조각이 해설 풀에', pool.length === R.length, `${pool.length} / ${R.length}`);
  check('이어짐 조각도 원래 번호로', pool.filter(n => n === '3').length === 2 && pool.filter(n => n === '7').length === 2, pool.join(','));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  fs.rmSync(tmp, { recursive:true, force:true });
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
