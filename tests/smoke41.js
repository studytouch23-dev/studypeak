// smoke41: 문항 영역을 실제 잉크에 맞춤 — 첫 줄의 분수 분자·지수가 잘리지 않고(위),
//          풀이 여백까지 내려가지 않으며(아래), 단 구분선을 넘지 않음(옆). 앞 문제의 글은 침범하지 않음.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

function makePdf(ops){
  const content = ops.join('\n');
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
const T = (x, y, size, s) => `BT /F1 ${size} Tf ${x} ${y} Td (${s}) Tj ET`;
const L = (x1, y1, x2, y2) => `1 w ${x1} ${y1} m ${x2} ${y2} l S`;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-fit-'));
  const pdfPath = path.join(tmp, 'exam.pdf');
  fs.writeFileSync(pdfPath, makePdf([
    L(30, 762, 582, 762),                         // 머리말 가로줄(양 단 전체)
    L(306, 40, 306, 755),                         // 가운데 단 구분선
    // 1번 (왼단): 첫 줄 오른쪽에 분수 — 분자가 번호보다 높이 솟음
    T(45, 700, 11, '1.'), T(62, 700, 11, 'Find the limit'),
    T(170, 712, 9, 'f\\(1+h\\)-f\\(1\\)'), L(168, 704, 236, 704), T(198, 694, 9, 'h'),
    T(62, 672, 10, '\\(1\\) 6    \\(2\\) 7    \\(3\\) 8'),
    // 2번 (왼단): 지수가 번호 줄 위로
    T(45, 480, 11, '2.'), T(62, 480, 11, 'Compute 4'), T(118, 488, 7, '-2/3'),
    T(62, 455, 10, '\\(1\\) 1/4    \\(2\\) 1/2'),
    T(60, 60, 8, 'copyright footer'),            // 꼬리말 (풀이 여백 뒤)
    // 3번 (오른단) + 바로 아래 4번: 3번의 마지막 줄이 4번 번호 3pt 위 (해설지처럼 빽빽)
    T(320, 700, 11, '3.'), T(337, 700, 11, 'Value of the series'),
    T(337, 675, 10, '\\(1\\) 40    \\(2\\) 50'),
    T(320, 494, 10, 'previous problem last line'),
    T(320, 480, 11, '4.'), T(337, 480, 11, 'Next problem text'),
    T(337, 462, 10, '\\(1\\) 1    \\(2\\) 2'),
  ]));

  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());                // API 키가 없으니 변환 제안은 뜨지 않음

  await page.evaluate(() => go('add'));
  await page.setInputFiles('#bulk-files', pdfPath);
  await page.waitForSelector('#pdfed-bg.show', { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.click('button[onclick="pdfedToRegions()"]');
  await page.waitForFunction(() => PDFED.regions.length >= 4, null, { timeout: 60000 });

  const R = await page.evaluate(() => Object.fromEntries(PDFED.regions.map(r => [r.num,
    { x:+r.x.toFixed(1), y:+r.y.toFixed(1), r:+(r.x+r.w).toFixed(1), b:+(r.y+r.h).toFixed(1), fitted:!!r.fitted }])));
  const top = yPdf => 792 - yPdf;                    // PDF 기준선 → 위에서부터 좌표
  console.log('  regions', JSON.stringify(R));
  check('4개 영역 + 잉크 맞춤 표시', ['1','2','3','4'].every(n => R[n] && R[n].fitted), Object.keys(R).join(','));
  // 위: 분자(712 기준선, 글자 위끝 ≈ 718.5)·지수(488 + 5)까지 포함
  check('1번: 분수 분자까지 포함(위가 안 잘림)', R['1'].y <= top(718.5), `${R['1'].y} <= ${top(718.5)}`);
  check('2번: 번호 위로 솟은 지수 포함', R['2'].y <= top(493), `${R['2'].y} <= ${top(493)}`);
  check('1번: 머리말 가로줄은 포함 안 함', R['1'].y > top(762) + 2, R['1'].y);
  // 아래: 선택지 바로 아래에서 끝 (풀이 여백·다음 문제·꼬리말 제외)
  check('1번: 선택지 직후에서 끝(여백 안 내려감)', R['1'].b <= top(672) + 10, `${R['1'].b} <= ${top(672)+10}`);
  check('2번(단의 마지막): 꼬리말 제외', R['2'].b <= top(455) + 10, `${R['2'].b}`);
  // 옆: 단 구분선(306)을 넘지 않음
  check('왼단 영역은 구분선 왼쪽', R['1'].r <= 306 && R['2'].r <= 306, `${R['1'].r}, ${R['2'].r}`);
  check('오른단 영역은 구분선 오른쪽', R['3'].x >= 306 && R['4'].x >= 306, `${R['3'].x}, ${R['4'].x}`);
  check('오른쪽 끝은 글 끝 근처로 밀착', R['1'].r < 260, R['1'].r);
  // 빽빽한 경우: 4번이 3번의 마지막 줄을 침범하지 않고, 서로 겹치지 않음
  check('4번: 앞 문제 마지막 줄 침범 안 함', R['4'].y >= top(494) + 1, `${R['4'].y} >= ${top(494)+1}`);
  check('3번: 자기 마지막 줄까지 포함', R['3'].b >= top(494) + 1, R['3'].b);
  check('3번·4번 겹침 없음', R['3'].b <= R['4'].y + 0.01, `${R['3'].b} <= ${R['4'].y}`);

  // ── 완료: 화면의 영역 그대로 자름 ──
  await page.click('#pdfed-finish');
  await page.waitForFunction(() => state.bulkDrafts.length >= 4, null, { timeout: 60000 });
  const crops = await page.evaluate(async () => {
    const dims = src => new Promise(r => { const im = new Image(); im.onload = () => r({ w: im.naturalWidth, h: im.naturalHeight }); im.src = src; });
    const out = {};
    for(const d of state.bulkDrafts) out[d.num] = await dims(d.img);
    return out;
  });
  const near = (a, b) => Math.abs(a - b) <= 4;
  check('완료 크롭 = 화면 영역(1번)', near(crops['1'].h, (R['1'].b - R['1'].y)*2) && near(crops['1'].w, (R['1'].r - R['1'].x)*2), JSON.stringify(crops['1']));
  check('완료 크롭 = 화면 영역(4번)', near(crops['4'].h, (R['4'].b - R['4'].y)*2), JSON.stringify(crops['4']));

  // ── 손으로 그린 영역 보정도 단 구분선을 따라 옆 단으로 번지지 않음 ──
  const manual = await page.evaluate(async () => {
    const pg = PDFED.pages ? null : null;
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 300;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,400,300);
    g.fillStyle = '#000'; g.fillRect(200, 0, 2, 300);              // 세로 구분선 (전체 높이)
    g.fillRect(60, 100, 120, 10);                                  // 왼쪽 글
    g.fillRect(230, 100, 120, 10);                                 // 오른쪽 단 글
    const img = g.getImageData(0,0,400,300).data;
    return refineRectOnCanvas(img, 50, 90, 152, 40, 400, 300);    // 오른쪽 변이 구분선에 걸친 박스
  });
  check('손으로 그린 영역: 구분선 따라 옆 단으로 확장 안 함', manual.x + manual.w < 215, JSON.stringify(manual));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  fs.rmSync(tmp, { recursive:true, force:true });
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
