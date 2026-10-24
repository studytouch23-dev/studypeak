// smoke53: 단 구분선이 있는 시험지에서 가짜 단 금지 (실사용 회귀: 13번 첫 줄 "실수 … 대하여" 사이 띄어쓰기와
//          선택지 "④ 7 … ⑤ 9" 간격이 같은 자리라 왼쪽 단이 둘로 쪼개지고, 14번 영역이 13번 글자까지 먹음)
//  - 가운데 세로 구분선 = 확실한 단 경계(빈 띠 판단보다 우선) · 번호와 멀리 떨어진 빈 띠는 가짜 단
//  - 구분선 없는 3단 해설지(smoke45)와 2단 문제지는 그대로
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
// 원(그림) — 베지어 4개
const circle = (cx, cy, r) => { const k = 0.5523*r; return `1 w ${cx+r} ${cy} m ${cx+r} ${cy+k} ${cx+k} ${cy+r} ${cx} ${cy+r} c ${cx-k} ${cy+r} ${cx-r} ${cy+k} ${cx-r} ${cy} c ${cx-r} ${cy-k} ${cx-k} ${cy-r} ${cx} ${cy-r} c ${cx+k} ${cy-r} ${cx+r} ${cy-k} ${cx+r} ${cy} c S`; };

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-rule-'));
  const pdf = path.join(tmp, 'p5.pdf');
  fs.writeFileSync(pdf, makePdf([[
    T(250, 760, 16, 'Math'), '1 w 30 745 m 582 745 l S',          // 머리말 + 가로줄
    '1 w 306 740 m 306 40 l S',                                     // 가운데 단 구분선
    // 13번(왼쪽 단): 첫 줄과 선택지 줄이 같은 자리(x≈205~222)에서 띄어 있음, 나머지 줄은 그보다 짧음, 아래는 풀이 여백
    T(36, 720, 10, '13.'), T(60, 720, 10, 'polynomial f with f(0)=1 and all real'), T(228, 720, 10, 'x such'),
    T(80, 700, 10, 'f(x) = (g(x)+2)(g(x)-2)'), T(54, 680, 10, 'then f(4) is?'),
    T(60, 660, 10, '(1) 1    (2) 3    (3) 5    (4) 7'), T(232, 660, 10, '(5) 9'),
    // 14번(오른쪽 단): 글 + 원 그림
    T(312, 720, 10, '14.'), T(336, 720, 10, 'quadrilateral ABCD inscribed in a circle'), T(330, 704, 10, 'of radius 3 with AB = 3AD'),
    T(360, 684, 10, 'cos(DCB) = 1/3'), circle(450, 560, 80),
    T(312, 400, 10, '15.'), T(336, 400, 10, 'sequence a(n) with a(1)=2 and a(n+1) = 3a(n)'),
  ]]));

  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.evaluate(() => go('add'));
  await page.setInputFiles('#bulk-files', pdf);
  await page.waitForSelector('#pdfed-bg.show', { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => pdfedToRegions());
  const R = await page.evaluate(() => PDFED.regions.map(r => ({ num:r.num, x:+r.x.toFixed(1), r:+(r.x+r.w).toFixed(1), y:+r.y.toFixed(1), b:+(r.y+r.h).toFixed(1) })));
  console.log('  regions', JSON.stringify(R));
  const g = n => R.find(r => r.num === n) || {};
  check('번호 13·14·15 모두 인식', ['13','14','15'].every(n => g(n).num), R.map(r => r.num).join(','));
  check('13번: 왼쪽 단 전체(첫 줄 끝 "x such"·"(5) 9" 포함), 구분선을 넘지 않음', g('13').r >= 255 && g('13').r <= 307 && g('13').x < 40, JSON.stringify(g('13')));
  check('14번: 구분선 오른쪽에서 시작(왼쪽 단 글자 침범 없음)', g('14').x >= 300, JSON.stringify(g('14')));
  check('14번: 원 그림까지 포함', g('14').b >= 792 - 480, JSON.stringify(g('14')));
  const cols = await page.evaluate(async () => { const pg = PDFED.pages[0]; const c = await pdfedInkCanvas(pg); return detectColumns(c, pg).map(c => [Math.round(c.x0), Math.round(c.x1)]); });
  check('단은 둘, 경계는 구분선(306pt)', cols.length === 2 && Math.abs(cols[0][1] - 306) <= 2, JSON.stringify(cols));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  fs.rmSync(tmp, { recursive:true, force:true });
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
