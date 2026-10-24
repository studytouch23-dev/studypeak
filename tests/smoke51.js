// smoke51: 문제↔해설 짝짓기 전면 점검 (실사용 회귀: "번호·내용이 안 맞는 해설이 많다")
//  A. AI가 짝을 빠뜨려도 번호가 맞는 해설은 그대로 붙음
//  B. 비슷하게 시작하는 문제끼리 AI가 뒤바꿔도, 번호와 엇갈리면 재확인 → 제자리
//  C. 해설 번호가 실제로 틀린 경우(7로 인쇄됐지만 8번 풀이)는 재확인으로 내용을 따름
//  D. 번호가 다른 해설 둘이 한 문제로 오면 그 문제 번호와 같은 것만
//  E. 시험지 두 개(문제·해설 PDF 4개)를 한 번에 올려도 같은 번호끼리 섞이지 않음 (실제 업로드 경로)
//  F. 확인 화면: 붙은 해설 번호 표시, 번호가 다르면 빨간 표시
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
const block = (num, y, tag) => [T(50, y, 11, num+'.'), ...[0,1,2,3].map(k => T(70, y - k*14, 10, `${tag} line ${k+1}`))];

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // 혼란스러운 AI 흉내: 짝짓기는 시나리오별로 정해 둔 답, 재확인은 키워드(KWn)가 같은 후보
  await page.evaluate(() => {
    window.__ask = (scripted) => {
      const log = [];
      const fn = async (t) => {
        if(t.includes('[문제 목록]')){ log.push('match'); return { pairs: scripted(t) }; }
        if(t.includes('[후보 문제]')){
          log.push('verify');
          const body = t.split('\n[해설]')[1] || '', solPart = body.split('\n[후보 문제]\n')[0], cands = body.split('\n[후보 문제]\n')[1] || '';
          const sk = (solPart.match(/KW\d+/)||[])[0];
          const ln = cands.split('\n').find(l => /^C\d+:/.test(l) && l.includes(sk+' '));
          return { pick: ln ? +ln.match(/^C(\d+)/)[1] : null };
        }
        return {};
      };
      return { fn, log };
    };
  });

  // ── A·B·C·D ──
  const r = await page.evaluate(async () => {
    const P = n => ({ num:String(n), text:`KW${n} 함수 f(x)에 대하여 다음 조건을 만족시킬 때` });   // 앞부분이 다 같은 문제들
    const S = (n, kw, ans) => ({ num:String(n), answer: ans||'', solution:`KW${kw} 풀이: f(x) 를 정리하면 …` });
    const pairsOf = m => [...m].sort((a,b)=>a[0]-b[0]).map(([j,i]) => j+'>'+i).join(',');

    // A: AI가 5개 중 2개만 답함 (나머지 null)
    const probsA = [1,2,3,4,5].map(P), solsA = [1,2,3,4,5].map(n => S(n, n));
    const a = __ask(() => [{ s:0, p:0 }, { s:3, p:3 }, { s:1, p:null }]);
    const A = await solMatchFlow(probsA, solsA, a.fn);

    // B: AI가 2·3번 해설을 뒤바꿈 (번호는 맞음) → 재확인 2회로 제자리
    const b = __ask(() => [{ s:0, p:0 }, { s:1, p:2 }, { s:2, p:1 }, { s:3, p:3 }, { s:4, p:4 }]);
    const B = await solMatchFlow(probsA, solsA, b.fn);

    // C: 7로 인쇄된 해설이 실은 8번 풀이 (7번 해설은 따로 있음, 8번 해설 없음)
    const probsC = [6,7,8].map(P), solsC = [S(6,6), S(7,7), S(7,8)];
    const c = __ask(() => [{ s:0, p:0 }, { s:1, p:1 }, { s:2, p:2 }]);
    const C = await solMatchFlow(probsC, solsC, c.fn);

    // D: 번호 9인 해설이 AI·재확인 모두 8번으로 간다고 해도, 8번 해설(번호 8)이 있으면 9는 떼어냄
    const probsD = [8].map(P), solsD = [S(8,8), { num:'9', answer:'', solution:'KW8 비슷한 풀이' }];
    const d = __ask(() => [{ s:0, p:0 }, { s:1, p:0 }]);
    const D = await solMatchFlow(probsD, solsD, d.fn);

    // 시험지(set) 구분: 같은 번호라도 다른 시험지와는 번호 짝이 안 됨
    const nm = solPairsByNumber([{ num:'1', set:'A' }, { num:'1', set:'B' }], [{ num:'1', set:'B' }, { num:'1', set:'' }]);
    // 해설 파일 ↔ 문제 파일
    const m1 = solSetMap(['2025-3월-문제.pdf', '2025-4월-문제.pdf'], ['2025-4월-해설.pdf', '2025-3월-정답및해설.pdf']);
    const m2 = solSetMap(['수학1.pdf', '수학2.pdf'], ['정답A.pdf', '정답B.pdf']);
    const m3 = solSetMap(['mix.pdf'], ['mix.pdf']);
    return {
      A: pairsOf(A.pairs), Aunp: A.stats.unpaired, Alog: a.log.join(','),
      B: pairsOf(B.pairs), Blog: b.log.join(','),
      C: pairsOf(C.pairs), Cstats: C.stats,
      D: pairsOf(D.pairs), Dd: D.stats.dropped,
      nm: [...nm].map(([j,i]) => j+'>'+i).join(','),
      m1: [...m1.values()], m2: [...m2.values()], m3: [...m3.values()],
    };
  });
  check('A: AI가 빠뜨려도 번호가 맞는 해설은 모두 붙음', r.A === '0>0,1>1,2>2,3>3,4>4' && r.Aunp === 0 && r.Alog === 'match', `${r.A} / ${r.Alog}`);
  check('B: AI가 뒤바꾼 짝은 재확인 2회로 제자리', r.B === '0>0,1>1,2>2,3>3,4>4' && r.Blog === 'match,verify,verify', `${r.B} / ${r.Blog}`);
  check('C: 번호가 잘못 인쇄된 해설은 내용(재확인)을 따라 8번으로, 7번 해설은 그대로', r.C === '0>0,1>1,2>2' && r.Cstats.byContent === 1, `${r.C} ${JSON.stringify(r.Cstats)}`);
  check('D: 번호 다른 해설이 한 문제로 몰리면 그 문제 번호의 해설만', r.D === '0>0' && r.Dd === 1, `${r.D} dropped ${r.Dd}`);
  check('시험지가 다르면 같은 번호라도 번호 짝 안 함 (시험지 모르는 해설은 후보가 둘이라 보류)', r.nm === '0>1', r.nm);
  check('해설 파일 ↔ 문제 파일: 이름(정답·해설·문제 빼고)으로', JSON.stringify(r.m1) === JSON.stringify(['2025-4월-문제.pdf','2025-3월-문제.pdf']), JSON.stringify(r.m1));
  check('해설 파일 ↔ 문제 파일: 이름으로 못 가리면 올린 순서, 한 파일은 자기 자신', JSON.stringify(r.m2) === JSON.stringify(['수학1.pdf','수학2.pdf']) && r.m3[0] === 'mix.pdf', JSON.stringify([r.m2, r.m3]));

  // ── E. 실제 업로드: 시험지 두 개를 한 번에 ──
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-match-'));
  const F = name => path.join(tmp, name);
  fs.writeFileSync(F('examA.pdf'), makePdf([[...block(1, 700, 'A-Q1'), ...block(2, 560, 'A-Q2')]]));
  fs.writeFileSync(F('examA-sol.pdf'), makePdf([[...block(1, 700, 'A-S1'), ...block(2, 560, 'A-S2')]]));
  fs.writeFileSync(F('examB.pdf'), makePdf([[...block(1, 700, 'B-Q1'), ...block(2, 560, 'B-Q2')]]));
  fs.writeFileSync(F('examB-sol.pdf'), makePdf([[...block(1, 700, 'B-S1'), ...block(2, 560, 'B-S2')]]));
  await page.evaluate(() => go('add'));
  await page.setInputFiles('#bulk-files', [F('examA.pdf'), F('examA-sol.pdf'), F('examB.pdf'), F('examB-sol.pdf')]);
  await page.waitForSelector('#pdfed-bg.show', { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => pdfedToRegions());
  await page.click('#pdfed-finish');
  await page.waitForFunction(() => (state.solPool||[]).length >= 4, null, { timeout: 60000 });
  const up = await page.evaluate(() => ({
    drafts: state.bulkDrafts.map(d => `${d.src}#${d.num}:${(d.pdfText||'').match(/[AB]-Q\d/)?.[0]}<${(d.solText||'').match(/[AB]-S\d/)?.[0]}`),
    pool: state.solPool.map(p => `${p.set}#${p.num}:${(p.hint||'').match(/[AB]-S\d/)?.[0]}`),
  }));
  console.log('  ', JSON.stringify(up));
  const okPair = up.drafts.length === 4 && up.drafts.every(s => { const m = s.match(/:([AB])-Q(\d)<([AB])-S(\d)$/); return m && m[1] === m[3] && m[2] === m[4]; });
  check('E: 시험지 A·B 를 함께 올려도 각 문제에 자기 시험지의 같은 번호 해설', okPair, up.drafts.join(' | '));
  check('E: 문항 순서는 시험지별 → 번호순', up.drafts.map(x=>x.split(':')[0]).join(',') === 'examA.pdf#1,examA.pdf#2,examB.pdf#1,examB.pdf#2', up.drafts.map(x=>x.split(':')[0]).join(','));
  const saved = await page.evaluate(async () => {
    state.bulkDrafts.forEach((d, k) => { d.text = 'E 저장 문제 '+k+' '+d.src+' '+d.num; });
    $('#b-srcname').value = '모의고사';
    await saveBulk();
    return state.problems.filter(p => /^E 저장 문제/.test(p.question)).map(p => p.srcName+'#'+p.origNo);
  });
  check('E: 저장하면 출처에 시험지 파일 이름이 붙어 구분', JSON.stringify(saved) === JSON.stringify(['모의고사 · examA#1','모의고사 · examA#2','모의고사 · examB#1','모의고사 · examB#2']), JSON.stringify(saved));
  check('E: 해설 조각마다 짝 시험지 표시(set)', up.pool.every(s => { const m = s.match(/^exam([AB])\.pdf#\d:([AB])-S/); return m && m[1] === m[2]; }), up.pool.join(' | '));

  // ── F. 확인 화면 표시 ──
  const tag = await page.evaluate(() => {
    state.bulkDrafts = [
      { num:'8', text:'KW8 문제', choices:[], sol:'풀이', solNums:['8'], ans:'', aiDone:true },
      { num:'9', text:'KW9 문제', choices:[], sol:'풀이', solNums:['7'], ans:'', aiDone:true } ];
    document.querySelector('#bulk-preview-card').style.display = 'block'; rerenderBulk();
    const cards = [...document.querySelectorAll('#bulk-preview > *')];
    const t = i => [...cards[i].querySelectorAll('.tag')].map(e => e.textContent + (e.getAttribute('style')||'').includes('danger')).join('|');
    return [t(0), t(1)];
  });
  check('F: 붙은 해설 번호 표시 (같으면 ✓)', /해설 매칭 ✓ 8번false/.test(tag[0]), tag[0]);
  check('F: 번호가 다르면 빨간 표시로 확인 요청', /해설 7번 → 9번 \(내용으로 짝지음\)true/.test(tag[1]), tag[1]);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  fs.rmSync(tmp, { recursive:true, force:true });
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
