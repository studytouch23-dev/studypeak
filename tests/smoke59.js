// smoke59: 쌍둥이·변형 자체 검수 — 실수하는 AI를 흉내 내어 검증 단계가 걸러 내는지
//  A. 한 문제 → 쌍둥이 10개: 3개씩 나눠 만들고, 앞에서 만든 문제를 알려 줘 겹치지 않게, 그래프도 문제마다 다름
//  B. 10문제 → 각 1개: 원본마다 생성, 교재 순서 원본→쌍둥이
//  C. 원본 그래프를 그대로 쓴 쌍둥이 → 거부 → 그림을 바꾸게 수리 → 통과
//  D. 끝까지 정답이 틀린 문제 → 저장하지 않고 새로 만들어 개수 채움
//  E. 그림이 문제와 다름(검산 AI가 그림을 보고 판단) → 수리 → 통과
//  F. 원본과 같은 문제 → 거부 후 새로 / G. 입체(space) 그림도 새 수치로
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  const r = await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 160;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,240,160); g.strokeRect(20,20,200,120);
    const IMG = cv.toDataURL('image/png');
    const SRC_SPEC = { kind:'graph', x:[-1,5], y:[-5,5], curves:[{ f:'x^2-4*x' }], size:[240,160] };
    const SP3 = { kind:'space', solids:[{ type:'crossSection', f:'sqrt(x)', g:0, from:1, to:4, shape:'square' }], size:[240,160] };
    const mk = (id, kw, extra) => ({ id, question: kw + ' 원본 문제 본문 ANS=7', choices:[], answer:'7', solution:'풀이', images:[], subject:'수학Ⅱ', chapter:'적분', section:'', grade:'고3',
      srcType:'기출', srcName:'검수 세트', origNo: id.replace(/\D/g,'') || '1', difficulty:3, tags:[], reviewed:true, createdAt: Date.now(), updatedAt: Date.now(), ...(extra||{}) });
    const srcs = [
      mk('A1', 'K10', { images:[IMG], figSpecs:[SRC_SPEC] }),
      ...Array.from({length:10}, (_, k) => mk('B'+(k+1), 'KB'+(k+1))),
      mk('C1', 'KC', { images:[IMG], figSpecs:[SRC_SPEC] }),
      mk('D1', 'KBAD'), mk('E1', 'KF', { images:[IMG], figSpecs:[SRC_SPEC] }), mk('F1', 'KDUP'), mk('G1', 'K3D', { images:[IMG], figSpecs:[SP3] }),
    ];
    for(const p of srcs){ await saveProblem(p); state.problems.push(lightenProblem(p)); }

    let n = 0; const log = [];
    const SRCQ = kw => kw + ' 원본 문제 본문 ANS=7';
    const reply = o => new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(o) }] }), { status:200 });
    const state2 = { badTries:0, dupTries:0, copyTries:0, figTries:0 };
    window.fetch = async (u, o) => {
      const c = JSON.parse(o.body).messages[0].content, t = c.find(x => x.type === 'text').text, imgs = c.filter(x => x.type === 'image').length;
      if(t.includes('바로잡은 문제 하나')){                                         // 수리
        const q = (t.split('\n[문제]\n')[1] || '').split('\n')[0];
        log.push('repair:' + q.split(' ')[0]);
        if(q.includes('KC')) return reply({ kind:'쌍둥이', question:'KC 바뀐 그래프 쌍둥이 ANS=9 [그림]', choices:[], answer:'9', solution:'풀이', figure:{ kind:'graph', x:[-1,6], y:[-6,6], curves:[{ f:'x^2-5*x' }] } });
        if(q.includes('BADQ')) return reply({ kind:'쌍둥이', question: q, choices:[], answer:'7', solution:'그대로', figure:null });   // 못 고침
        if(q.includes('FIGBAD')) return reply({ kind:'쌍둥이', question:'KF FIXED 쌍둥이 ANS=8 [그림]', choices:[], answer:'8', solution:'풀이', figure:{ kind:'graph', x:[-1,6], y:[-6,6], curves:[{ f:'x^2-6*x' }] } });
        return reply({});
      }
      if(t.includes('정답은 일부러 알려주지 않습니다')){                            // 검산: 본문의 ANS= 로 '푼다'
        const q = (t.split('[문제]\n')[1] || '');
        log.push('verify:' + q.split(' ')[0] + (imgs ? '+img' : ''));
        const ans = (q.match(/ANS=(\d+)/)||[])[1] || '';
        if(q.includes('BADQ')) return reply({ answer: String(+ans + 1), wellPosed:true });
        if(q.includes('FIGBAD') && imgs) return reply({ answer: ans, wellPosed:true, figureOk:false, figureIssue:'곡선의 교점이 본문과 다름' });
        return reply({ answer: ans, wellPosed:true, figureOk:true });
      }
      if(t.includes('[원본 문제]')){                                               // 생성
        const sec = t.split('[원본 문제]').pop(), kw = sec.trim().split(' ')[0];
        const nT = +((t.match(/쌍둥이 (\d+)개/)||[])[1] || 0), nV = +((t.match(/유사 변형 (\d+)개/)||[])[1] || 0);
        log.push('gen:' + kw + ':' + nT + '+' + nV + (t.includes('[이미 만든 문제]') ? ':avoid' + (t.split('[이미 만든 문제]').pop().match(/^\d+\)/gm)||[]).length : ''));
        const item = (kind, extra) => { const k = ++n; return { kind, question: `${kw} 새 ${kind} ${k} ANS=${10+k} [그림]`, choices:[], answer: String(10+k), solution:'풀이 '+k,
          figure:{ kind:'graph', x:[-1,6], y:[-6,6], curves:[{ f:`x^2-${(k%5)+1}*x+${k}` }] }, ...(extra||{}) }; };
        const items = [];
        for(let i=0;i<nT;i++){
          if(kw === 'KC' && state2.copyTries++ === 0) items.push(item('쌍둥이', { figure:{ ...SRC_SPEC, size: undefined } }));        // 원본 그래프 그대로
          else if(kw === 'KBAD' && state2.badTries++ === 0) items.push(item('쌍둥이', { question:'KBAD BADQ 쌍둥이 ANS=7', figure:null }));
          else if(kw === 'KF' && state2.figTries++ === 0) items.push(item('쌍둥이', { question:'KF FIGBAD 쌍둥이 ANS=5 [그림]', answer:'5' }));
          else if(kw === 'KDUP' && state2.dupTries++ === 0) items.push(item('쌍둥이', { question: SRCQ('KDUP'), figure:null }));
          else if(kw === 'K3D') items.push(item('쌍둥이', { figure:{ kind:'space', solids:[{ type:'crossSection', f:'sqrt(x)+1', g:0, from:1, to:5, shape:'square' }] } }));
          else items.push(item('쌍둥이', /^KB\d|KBAD|KDUP/.test(kw) ? { figure:null, question:`${kw} 새 쌍둥이 ${n+1} ANS=${11+n}` } : {}));
        }
        for(let i=0;i<nV;i++) items.push(item('변형'));
        return reply({ items });
      }
      return reply({});
    };
    const ask = (text, max, imgs) => { const content = (imgs||[]).map(d => ({ type:'image', source:{ type:'base64', media_type:'image/png', data: String(d).split(',')[1] } })); content.push({ type:'text', text }); return aiJsonCall(content, max); };
    const get = id => state.problems.find(p => p.id === id);
    const recsOf = async ids => { const out = []; for(const id of ids) out.push(await DB.get('problems', id)); return out; };

    // A. 한 문제 → 쌍둥이 10
    let i0 = log.length;
    const A = await makeTwins([get('A1')], { twin:10, variant:0 }, ask);
    const aLog = log.slice(i0), aRecs = await recsOf(A.saved);
    // B. 10문제 → 각 1
    i0 = log.length;
    const B = await makeTwins(Array.from({length:10}, (_, k) => get('B'+(k+1))), { twin:1, variant:0 }, ask);
    const bLog = log.slice(i0);
    const bBook = twinBookIds(B.batch).map(id => get(id).twinKind ? 'T'+get(id).origNo : 'S'+get(id).origNo);
    // C~G 각 1개
    const one = async id => { const s = log.length; const res = await makeTwins([get(id)], { twin:1, variant:0 }, ask); return { res, log: log.slice(s), recs: await recsOf(res.saved) }; };
    const C = await one('C1'), D = await one('D1'), E = await one('E1'), F = await one('F1'), G = await one('G1');
    return {
      A: { saved: A.saved.length, gens: aLog.filter(x => x.startsWith('gen')), nos: aRecs.map(p => p.twinNo), specs: new Set(aRecs.map(p => p.figSpecs[0].curves[0].f)).size,
           sameAsSrc: aRecs.some(p => twinSpecCore(p.figSpecs[0]) === twinSpecCore(SRC_SPEC)), imgs: aRecs.every(p => p.images.length === 1), vImg: aLog.filter(x => x.startsWith('verify') && x.endsWith('+img')).length },
      B: { saved: B.saved.length, gens: bLog.filter(x => x.startsWith('gen')).length, book: bBook.join(',') },
      C: { saved: C.res.saved.length, repaired: C.res.repaired, log: C.log, f: C.recs[0] && C.recs[0].figSpecs[0].curves[0].f },
      D: { saved: D.res.saved.length, rejected: D.res.reasons, log: D.log, q: D.recs[0] && D.recs[0].question },
      E: { saved: E.res.saved.length, repaired: E.res.repaired, q: E.recs[0] && E.recs[0].question, log: E.log },
      F: { saved: F.res.saved.length, reasons: F.res.reasons, q: F.recs[0] && F.recs[0].question },
      G: { saved: G.res.saved.length, kind: G.recs[0] && G.recs[0].figSpecs[0].kind, img: G.recs[0] && G.recs[0].images.length, f: G.recs[0] && G.recs[0].figSpecs[0].solids[0].f },
    };
  });
  check('A. 한 문제 → 쌍둥이 10개 저장 (번호 1~10)', r.A.saved === 10 && JSON.stringify(r.A.nos) === '[1,2,3,4,5,6,7,8,9,10]', JSON.stringify(r.A.nos));
  check('A. 3개씩 나눠 생성(3+3+3+1), 뒤 호출엔 앞에서 만든 문제 목록 전달', JSON.stringify(r.A.gens) === JSON.stringify(['gen:K10:3+0','gen:K10:3+0:avoid3','gen:K10:3+0:avoid6','gen:K10:1+0:avoid9']), JSON.stringify(r.A.gens));
  check('A. 그래프가 문제마다 다르고 원본과도 다름, 모두 그림 있음', r.A.specs >= 5 && !r.A.sameAsSrc && r.A.imgs, `${r.A.specs}종`);
  check('A. 검산은 그려진 그림을 보며 (10번)', r.A.vImg === 10, r.A.vImg);
  check('B. 10문제 → 각 1개 (생성 호출 10번)', r.B.saved === 10 && r.B.gens === 10, JSON.stringify(r.B));
  check('B. 교재 순서: 원본1, 쌍둥이1, 원본2, 쌍둥이2 …', r.B.book.startsWith('S1,T1,S2,T2,S3,T3') && r.B.book.endsWith('S10,T10'), r.B.book);
  check('C. 원본 그래프를 그대로 쓴 쌍둥이 → 그림 바꾸게 수리 → 저장', r.C.saved === 1 && r.C.repaired === 1 && r.C.f === 'x^2-5*x' && r.C.log.includes('repair:KC'), JSON.stringify(r.C));
  check('D. 끝까지 정답이 틀린 문제는 저장 안 하고 새로 만들어 채움', r.D.saved === 1 && r.D.rejected['정답 불일치'] === 1 && !/BADQ/.test(r.D.q), JSON.stringify(r.D));
  check('E. 검산 AI가 그림을 보고 "문제와 다름" → 수리 → 저장', r.E.saved === 1 && r.E.repaired === 1 && /FIXED/.test(r.E.q), JSON.stringify(r.E));
  check('F. 원본과 같은 문제는 거부 후 새로', r.F.saved === 1 && r.F.reasons['원본·앞 문제와 같음'] === 1 && !r.F.q.includes('원본 문제 본문'), JSON.stringify(r.F));
  check('G. 입체 그림도 새 수치의 설계도로 그림', r.G.saved === 1 && r.G.kind === 'space' && r.G.img === 1 && r.G.f === 'sqrt(x)+1', JSON.stringify(r.G));

  const eqv = await page.evaluate(() => ({
    a: verifyOutcome('2\\sqrt{3}', [], { answer:'\\sqrt{12}' }), b: verifyOutcome('\\frac{\\pi}{2}', [], { answer:'\\pi/2' }),
    c: verifyOutcome('x+1', [], { answer:'2x+1' }), d: verifyOutcome('\\frac{3}{4}', [], { answer:'0.75' }), e: verifyOutcome('④', ['① 1','② 2','③ 3','④ 4','⑤ 5'], { answer:'4번' }),
    f: verifyOutcome('2\\sqrt{3}', [], { answer:'3\\sqrt{2}' }) }));
  check('정답 비교는 수학적으로: 2√3=√12, π/2, 3/4=0.75, 4번=④ 는 일치 / x+1≠2x+1, 2√3≠3√2', eqv.a === 'match' && eqv.b === 'match' && eqv.d === 'match' && eqv.e === 'match' && eqv.c === 'mismatch' && eqv.f === 'mismatch', JSON.stringify(eqv));
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
