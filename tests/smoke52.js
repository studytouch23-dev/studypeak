// smoke52: (1) 해설은 올린 문제 번호만 1:1로 크롭 — 해설지 전체가 들어와도 문제 번호(+이어짐)만 남기고, 못 찾은 번호 안내
//          (2) 그림 다시 그리기 개선 — 입체 매크로(단면 입체·원기둥·원뿔·구·회전체), 문제 본문 전달, 스스로 비교·수정 1회,
//              설계도 오류 자동 수리, 그림 전용 모델(기본 Sonnet)
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
const sol = (x, num, y, n, tag) => [T(x, y, 10, num+'.'), ...Array.from({length:n}, (_, k) => T(x+16, y - k*13, 9, `${tag} line ${k+1}`))];
const L = 40, R = 320;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-11-'));
  const F = name => path.join(tmp, name);
  // 문제: 5·6·7·11번만 (선생님이 고른 문항)
  fs.writeFileSync(F('mock10.pdf'), makePdf([[ ...sol(L, 5, 720, 3, 'Q5'), ...sol(L, 6, 600, 3, 'Q6'), ...sol(R, 7, 720, 3, 'Q7'), ...sol(R, 11, 600, 3, 'Q11') ]]));
  // 해설지 전체: 1~10번 (7번은 2단 끝 → 다음 페이지 1단 위로 이어짐), 11번 해설은 없음
  fs.writeFileSync(F('mock10-sol.pdf'), makePdf([
    [ ...sol(L, 1, 740, 4, 'S1'), ...sol(L, 2, 670, 4, 'S2'), ...sol(L, 3, 600, 4, 'S3'), ...sol(L, 4, 530, 4, 'S4'), ...sol(L, 5, 460, 4, 'S5'),
      ...sol(R, 6, 740, 6, 'S6'), ...sol(R, 7, 640, 40, 'S7') ],
    [ ...Array.from({length:5}, (_, k) => T(L, 742 - k*13, 9, `S7cont line ${k+1}`)), ...sol(L, 8, 660, 4, 'S8'), ...sol(L, 9, 590, 4, 'S9'), ...sol(R, 10, 740, 4, 'S10') ],
  ]));

  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── 1) 해설 1:1 크롭 ──
  await page.evaluate(() => go('add'));
  await page.setInputFiles('#bulk-files', [F('mock10.pdf'), F('mock10-sol.pdf')]);
  await page.waitForSelector('#pdfed-bg.show', { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => pdfedToRegions());
  const reg = await page.evaluate(() => ({
    sol: PDFED.regions.filter(r => r.kind === 'sol').map(r => r.num + (r.cont ? '+' : '')),
    prob: PDFED.regions.filter(r => r.kind !== 'sol').map(r => r.num),
    hidden: (PDFED.solHidden||[]).length, missing: PDFED.solMissing, info: $('#pdfed-solinfo').textContent,
  }));
  check('문제 4개(5·6·7·11) 인식', JSON.stringify(reg.prob) === '["5","6","7","11"]', JSON.stringify(reg.prob));
  check('해설은 올린 번호만: 5·6·7(+이어짐)', JSON.stringify(reg.sol) === '["5","6","7","7+"]', JSON.stringify(reg.sol));
  check('다른 번호 해설 7개는 뺌', reg.hidden === 7, reg.hidden);
  check('해설을 못 찾은 번호(11번) 안내', JSON.stringify(reg.missing) === '["11"]' && reg.info.includes('11번') && reg.info.includes('1:1'), reg.info.slice(0, 120));
  const all = await page.evaluate(async () => { await pdfedToggleSolAll(true); const n = PDFED.regions.filter(r => r.kind === 'sol').length; await pdfedToggleSolAll(false); return { n, back: PDFED.regions.filter(r => r.kind === 'sol').length }; });
  check('[모든 해설 보기] ↔ [올린 문제 번호만 보기]', all.n === 11 && all.back === 4, JSON.stringify(all));
  await page.click('#pdfed-finish');
  await page.waitForFunction(() => (state.solPool||[]).length > 0, null, { timeout: 60000 });
  const fin = await page.evaluate(() => ({
    pool: state.solPool.map(p => p.num), drafts: state.bulkDrafts.map(d => d.num + ':' + ((d.solText||'').match(/S\d+/)||['-'])[0]),
    s7: (state.bulkDrafts.find(d => d.num === '7')||{}).solText || '' }));
  check('완료: 해설 조각 = 문제 수만큼 (5·6·7)', JSON.stringify(fin.pool) === '["5","6","7"]', JSON.stringify(fin.pool));
  check('완료: 문제마다 자기 번호 해설 1:1, 11번은 비어 있음', JSON.stringify(fin.drafts) === '["5:S5","6:S6","7:S7","11:-"]', JSON.stringify(fin.drafts));
  check('7번 해설은 페이지를 넘는 이어짐까지 한 장', fin.s7.includes('S7 line 40') && fin.s7.includes('S7cont line 5'));

  // ── 2) 입체 매크로 ──
  const mac = await page.evaluate(async () => {
    const px = async svg => {
      const im = new Image(); await new Promise(r => { im.onload = r; im.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); });
      const k = document.createElement('canvas'); k.width = im.naturalWidth; k.height = im.naturalHeight;
      const g = k.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, k.width, k.height); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, k.width, k.height).data, W = k.width;
      const lum = (x, y) => { const i = (Math.round(y)*W + Math.round(x))*4; return 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; };
      return (x, y) => { for(let dy=-3; dy<=3; dy++) for(let dx=-3; dx<=3; dx++) if(lum(x+dx, y+dy) < 110) return true; return false; };
    };
    const dotsOf = svg => [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="[\d.]+"\/>/g)].map(m => [+m[1], +m[2]]);
    // 단면이 반원인 입체: x=1 에서 f=1 → 반원 꼭대기 (1, 0.5, 0.5)
    const cs = figSpecToSvg({ kind:'space', proj:{ x:[1,0], y:[0.5,0.5], z:[0,1] }, points:{ A:[0,0,0], B:[4,0,0] },
      solids:[{ type:'crossSection', f:'x', g:0, from:1, to:3, shape:'semicircle', sections:[2] }] });
    const [A, B] = dotsOf(cs.svg), s = (B[0]-A[0])/4, scr = (x,y,z) => [A[0] + (x + 0.5*y)*s, A[1] - (0.5*y + z)*s];
    const d1 = await px(cs.svg);
    const semi = [0.3, 1.5708, 2.8].every(t => d1(...scr(1, 0.5 - 0.5*Math.cos(t), 0.5*Math.sin(t)))) && d1(...scr(3, 1.5, 1.5));
    const csOk = { semi, dark: cs.svg.includes('fill="#bdbdbd"'), dash: /stroke-dasharray/.test(cs.svg) };
    // 원기둥: 옆선이 밑면 타원 끝에 정확히 닿음 (축 z 가 화면 위쪽)
    const cy = figSpecToSvg({ kind:'space', proj:{ x:[-0.45,-0.35], y:[1,0], z:[0,1] }, points:{ O:[0,0,0], Z:[0,0,2] }, solids:[{ type:'cylinder', c:[0,0,0], r:1, h:2 }] });
    const [O, Z] = dotsOf(cy.svg), sc = (O[1]-Z[1])/2, d2 = await px(cy.svg);
    const cyl = d2(O[0] - sc, O[1] - sc) && d2(O[0] + sc, O[1] - sc) && !d2(O[0] + 1.6*sc, O[1] - sc) && /stroke-dasharray/.test(cy.svg);
    const other = ['cone','sphere','revolution'].map(t => { try{ const o = figSpecToSvg({ kind:'space', solids:[{ type:t, c:[0,0,0], r:1, h:2, f:'sqrt(x)+0.3', from:0.5, to:3 }] }); return /stroke-dasharray/.test(o.svg); }catch(e){ return e.message; } });
    const iss = figSpecIssues({ kind:'space', solids:[{ type:'pyramid' }, { type:'crossSection', f:'q(x)' }] });
    return { csOk, cyl, other, iss };
  });
  check('단면 입체: 반원 단면이 계산한 자리에, 가운데 단면 진하게, 밑변 숨은선', mac.csOk.semi && mac.csOk.dark && mac.csOk.dash, JSON.stringify(mac.csOk));
  check('원기둥: 옆선이 밑면 타원 끝에 정확히, 밑면 뒤쪽은 점선', mac.cyl);
  check('원뿔·구·회전체도 그려지고 뒤쪽은 점선', mac.other.every(x => x === true), JSON.stringify(mac.other));
  check('입체 점검: 모르는 type·틀린 식 안내', mac.iss.some(x => x.includes('type')) && mac.iss.some(x => x.includes('q(x)')), JSON.stringify(mac.iss));

  // ── 3) 다시 그리기: 문제 본문 전달 → 비교·수정 1회 → 설계도 오류 수리, 그림 모델 ──
  const rd = await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const calls = [];
    let script = [];
    window.fetch = async (u, o) => {
      const b = JSON.parse(o.body), c = b.messages[0].content;
      calls.push({ model: b.model, imgs: c.filter(x => x.type === 'image').length, t: c.find(x => x.type === 'text').text });
      const reply = script.shift() || { ok:true };
      return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(reply) }] }), { status:200 });
    };
    const cv = document.createElement('canvas'); cv.width = 300; cv.height = 200;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 200);
    const IMG = cv.toDataURL('image/png');
    const wrong = { kind:'graph', x:[-3,3], y:[-2,6], curves:[{ f:'x^2' }] }, right = { kind:'graph', x:[-3,3], y:[-2,6], curves:[{ f:'x^2/2+2' }] };
    // a) 처음 설계도 → 비교 후 고친 설계도로
    script = [wrong, right];
    const a = await aiRedrawFigureSpec(IMG, 300, 200, { ctx:'곡선 $y=\\dfrac{1}{2}x^{2}+2$ 와 ...\n[그림]' });
    const ca = calls.splice(0);
    // b) "충분히 같다" → 처음 것 유지
    script = [right, { ok:true }];
    const b = await aiRedrawFigureSpec(IMG, 300, 200, {});
    calls.splice(0);
    // c) 그릴 수 없는 설계도 → 오류를 알려 주고 고침
    script = [{ kind:'graph', x:[3,-3], y:[0,1], curves:[{ f:'x' }] }, right];
    const c = await aiRedrawFigureSpec(IMG, 300, 200, {});
    const cc = calls.splice(0);
    // d) 그림 모델 설정
    localStorage.setItem('sp-lab-figmodel', 'claude-opus-5-5');
    script = [right, { ok:true }];
    await aiRedrawFigureSpec(IMG, 300, 200, {});
    const cd = calls.splice(0);
    localStorage.removeItem('sp-lab-figmodel');
    // e) 분할 화면 다시 그리기는 문제 본문을 넘김
    state.bulkDrafts = [{ num:'7', text:'두 곡선 KWCTX 로 둘러싸인 부분\n[그림]', choices:[], sol:'', ans:'', img: IMG, aiDone:true }];
    script = [right, { ok:true }];
    await redrawDraftFig(0);
    const ce = calls.splice(0);
    return {
      a: a.spec.curves[0].f, aCalls: ca.map(x => x.imgs), aCtx: ca[0].t.includes('[문제 본문]') && ca[0].t.includes('dfrac{1}{2}'), aRefine: ca[1].t.includes('두 번째 이미지는') && ca[1].t.includes('"x^2"'),
      model: ca[0].model, b: b.spec.curves[0].f, bCalls: 2,
      c: c.spec.curves[0].f, cErr: cc[1] && cc[1].t.includes('오류가 있습니다') && cc[1].imgs === 1,
      dModel: cd[0].model, eCtx: ce[0].t.includes('KWCTX'), eSpec: state.bulkDrafts[0].figSpec && state.bulkDrafts[0].figSpec.curves[0].f,
      noFakeLabels: ca[0].t.includes('새로 만들지 말고'),
    };
  });
  check('다시 그리기: 문제 본문을 함께 보냄', rd.aCtx && rd.eCtx);
  check('스스로 검토: 원본+그린 그림 2장과 설계도를 보내 고친 설계도로 바꿈', JSON.stringify(rd.aCalls) === '[1,2]' && rd.aRefine && rd.a === 'x^2/2+2', JSON.stringify(rd));
  check('스스로 검토: "충분히 같다"면 처음 설계도 유지', rd.b === 'x^2/2+2');
  check('설계도 오류는 오류 내용을 알려 주고 고침', rd.c === 'x^2/2+2' && rd.cErr);
  check('그림 모델: 기본 Sonnet, 설정하면 Opus', rd.model === 'claude-sonnet-5-5' && rd.dModel === 'claude-opus-5-5', `${rd.model} / ${rd.dModel}`);
  check('원본에 없는 글자를 만들지 말라고 안내', rd.noFakeLabels);
  check('분할 화면 결과에도 고친 설계도 보관', rd.eSpec === 'x^2/2+2', rd.eSpec);
  const ui = await page.evaluate(() => ({ sel: !!document.querySelector('#ai-figmodel'), opts: [...document.querySelectorAll('#ai-figmodel option')].map(o => o.value).join(',') }));
  check('AI 설정에 [그림 다시 그리기 모델] 선택', ui.sel && ui.opts.includes('claude-sonnet-5-5') && ui.opts.includes('claude-opus-5-5'), ui.opts);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  fs.rmSync(tmp, { recursive:true, force:true });
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
