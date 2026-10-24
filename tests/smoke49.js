// smoke49: 해설이 단·페이지를 넘을 때 (실사용 회귀: 8번이 1단 끝 → 2단 맨 위, 12번이 페이지를 넘음)
//  - 해설지 자동 인식: [출제의도]·'정 답'/'해 설' 표제 → 해설 페이지(초록)로, 이어짐 조각이 생김
//  - 단 맨 윗줄이 페이지 위쪽 3% 안에서 시작해도 잘리지 않음
//  - 머리말(밑줄 있는 것·없는 것)은 이어짐 조각에 넣지 않음
//  - 완료하면 이어짐은 같은 번호 해설 아래에 붙여 한 장으로
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
const lines = (x, yTop, n, tag) => Array.from({length:n}, (_, k) => T(x, yTop - k*13, 9, `${tag} line ${k+1} of the solution`));
const L = 40, R = 320;                                         // 2단: 왼쪽 끝 40pt, 320pt (단 너비 ≈ 250pt)

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-cont-'));
  const pdfPath = path.join(tmp, 'mock-exam.pdf');             // 파일명에 '해설'이 없음 → 내용으로 해설 인식해야 함
  fs.writeFileSync(pdfPath, makePdf([
    [ // 1쪽: 1단 = 정답표 + 7·8번(8번이 단 끝까지), 2단 = 맨 위(3.4%)부터 8번 이어짐 → 9번
      T(L, 760, 12, 'Answers'), T(L, 740, 10, '1 A 2 B 3 C 4 D'),
      T(L, 700, 10, '7.'), ...lines(L+16, 700, 8, 'S7'),
      T(L, 580, 10, '8.'), ...lines(L+16, 580, 38, 'S8'),
      ...lines(R, 765, 6, 'S8cont'),
      T(R, 670, 10, '9.'), ...lines(R+16, 670, 40, 'S9'),
    ],
    [ // 2쪽: 맨 위 머리말 + 페이지 너비 밑줄, 그 아래 1단 = 9번 이어짐 → 10번
      T(L, 772, 8, 'Math Solutions 2025 header'), '0.5 w 40 762 m 572 762 l S',
      ...lines(L, 742, 5, 'S9cont'),
      T(L, 660, 10, '10.'), ...lines(L+16, 660, 12, 'S10'),
      T(R, 742, 10, '11.'), ...lines(R+16, 742, 10, 'S11'),
    ],
    [ // 3쪽: 밑줄 없는 머리말만 + 1단 = 11번이 아니라 2쪽 2단 끝(11번)의 이어짐
      T(L, 774, 8, 'Math Solutions 2025 header'),
      ...lines(L, 742, 4, 'S11cont'),
      T(L, 680, 10, '12.'), ...lines(L+16, 680, 6, 'S12'),
    ],
  ]));

  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── 해설지 단서 점수 ──
  const cues = await page.evaluate(() => ({
    exam: pdfSolCues([{ str:'[출제의도] 지수를 계산하여 값을 구한다.' }, { str:'따라서' }, { str:'[출제의도] 도함수' }]),
    heads: pdfSolCues([{ str:'정 답' }, { str:'해 설' }, { str:'1' }]),
    prob: pdfSolCues([{ str:'1.' }, { str:'함수 f(x)에 대하여' }, { str:'정답' }]),
  }));
  check('해설 단서: [출제의도] 2개 → 해설', cues.exam >= 2, cues.exam);
  check("해설 단서: 띄어 쓴 '정 답'·'해 설' 표제 → 해설", cues.heads >= 2, cues.heads);
  check('문제지는 해설로 보지 않음', cues.prob < 2, cues.prob);

  // 이 테스트 PDF는 영문 글꼴이라 한글 단서를 못 넣으므로, 단서 점수만 '해설지'로 바꿔 자동 분류 경로를 탄다
  await page.evaluate(() => { const orig = pdfSolCues; window.pdfSolCues = (items, text) => /S\d+ line/.test(text||'') ? 3 : orig(items, text); });
  await page.evaluate(() => go('add'));
  await page.setInputFiles('#bulk-files', pdfPath);
  await page.waitForSelector('#pdfed-bg.show', { timeout: 60000 });
  await page.waitForTimeout(600);
  const modes = await page.evaluate(() => PDFED.pages.map(p => p.mode));
  check('자동 분류: 세 페이지 모두 해설(초록)', modes.every(m => m === 'sol'), modes.join(','));
  await page.evaluate(() => pdfedToRegions());

  const Rg = await page.evaluate(() => PDFED.regions.map(r => ({ p:r.page, num:r.num, cont:!!r.cont,
    x:+r.x.toFixed(1), y:+r.y.toFixed(1), b:+(r.y+r.h).toFixed(1) })));
  console.log('  regions', JSON.stringify(Rg.map(r => `${r.p}:${r.num}${r.cont?'+':''} x${r.x} y${r.y}-${r.b}`)));
  const find = (p, num, cont) => Rg.find(r => r.p === p && r.num === num && r.cont === !!cont);
  const c8 = find(0, '8', true), c9 = find(1, '9', true), c11 = find(2, '11', true);
  check('2단 맨 위 = 8번 이어짐, 첫 줄(위쪽 3.4%)까지 포함', c8 && c8.x > 300 && c8.y <= 792-765-8 && c8.b <= 792-670, JSON.stringify(c8));
  check('밑줄 있는 머리말은 빼고 9번 이어짐', c9 && c9.y > 792-762 && c9.y <= 792-742-6, JSON.stringify(c9));
  check('밑줄 없는 머리말도 빼고 11번 이어짐', c11 && c11.y > 792-774+2 && c11.y <= 792-742-6, JSON.stringify(c11));
  const label = await page.evaluate(() => [...document.querySelectorAll('#pdfed-overlays .rno')].map(e => e.textContent).join('|'));
  check("편집 화면에 '해설 8 이어짐' 표시", /해설 8 이어짐/.test(label) || !label, label.slice(0, 80));

  await page.click('#pdfed-finish');
  await page.waitForFunction(() => (state.solPool||[]).length > 0, null, { timeout: 60000 });
  const pool = await page.evaluate(() => state.solPool.map(p => ({ num:p.num, hint:p.hint||'' })));
  const P = n => pool.filter(p => p.num === n);
  check('완료: 번호마다 해설 한 장', ['7','8','9','10','11','12'].every(n => P(n).length === 1) && pool.length === 6, pool.map(p=>p.num).join(','));
  check('8번 = 1단 끝 + 2단 맨 위(첫 줄 포함)', P('8')[0].hint.includes('S8 line 38') && P('8')[0].hint.includes('S8cont line 1') && P('8')[0].hint.includes('S8cont line 6'));
  check('9번 = 페이지를 넘어 이어짐, 머리말 없음', P('9')[0].hint.includes('S9cont line 5') && !P('9')[0].hint.includes('header'));
  check('11번 = 페이지를 넘어 이어짐, 머리말 없음', P('11')[0].hint.includes('S11cont line 4') && !P('11')[0].hint.includes('header'));
  check('정답표는 해설에 들어가지 않음', !pool.some(p => p.hint.includes('1 A 2 B')));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  fs.rmSync(tmp, { recursive:true, force:true });
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
