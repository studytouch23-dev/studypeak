// smoke81: 국어 랩 화면 — 22유형 분류와 엑셀 · 정답 근거 형광펜 · 변형 만들기와 검증 (AI는 스텁)
//   올리기 → [분류표·LMS 엑셀] 문항 표(규칙으로 어림) → 🤖 AI 분류(목록 밖 값은 거부, 직접 고른 칸은 보존) → 검토 요망 표 → 분류표·LMS 엑셀 내려받기(파일 속 확인)
//   → 세트 화면 🤖 정답 근거(지문에 없는 인용문은 버림, 형광펜·X 표시) → ✨ 변형(쌍둥이·OX·서술형·새 지문: 근거 대조 + 블라인드 풀이, 실패는 보류) → 백업 왕복
const { openKor } = require('../tools/_common.js');
const fx = require('./kor-fixture.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openKor();
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const exam = (await fx.makePdf(lab.browser, fx.EXAM)).toString('base64'), sol = (await fx.makePdf(lab.browser, fx.SOLUTION)).toString('base64');

  const r = await page.evaluate(async ({ exam, sol }) => {
    const file = (b64, name) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name, { type: 'application/pdf' });
    const out = {}, NAME = '2099 지어낸 모의';
    go('upload'); UP.examFile = file(exam, NAME + '.pdf'); UP.solFile = file(sol, '해설.pdf'); upAutoName();
    await upRead(); out.pvChips = [...document.querySelectorAll('#up-preview .chip')].map(c => c.textContent).join('|'); await upSave();
    const byNum = n => K.items.find(i => i.num === n && !i.variantOf && i.src.name === NAME), P1 = () => K.passages.find(p => /열섬/.test(p.title)), P2 = () => K.passages.find(p => /봄/.test(p.title));
    out.points = K.items.map(i => i.points).join();

    // ── 분류표·LMS 엑셀: 규칙으로 어림한 상태 ──
    go('export');
    const ex = $('#view-export');
    out.ex0 = { rows: ex.querySelectorAll('#ex-table tr[data-num]').length, rule: ex.querySelectorAll('#ex-table td.rule select[aria-label$="유형"], #ex-table td.rule select[aria-label$="성격"]').length, err: !!$('#ex-errors'), errTxt: ($('#ex-errors') || {}).textContent || '',
      name: $('#ex-name').value, file: $('#ex-file').value, single: [byNum(6).cat, byNum(6).sub, byNum(6).title].join('/') };
    await exSetType(byNum(1).id, 'R02', null);                 // 직접 고른 칸 → AI가 건드리지 않아야 함
    out.user = [byNum(1).typeId, byNum(1).typeBy].join();
    // ── AI 분류 (스텁): 목록 밖 값·다른 대분류 유형·규칙 위반 제목을 섞어서 답한다 ──
    localStorage.setItem('sp-lab-apikey', 'sk-ant-api03-test'); localStorage.setItem('sp-lab-figmodel', 'strong-model'); localStorage.setItem('sp-lab-aimodel', 'light-model');
    const calls = [];
    SPAI.json = async (content, max, opts) => {
      const t = content[0].text; calls.push({ model: (opts || {}).model || 'light-model', kind: /22유형/.test(t) ? 'cls' : /근거를 고른다/.test(t) ? 'ev' : /문항을 푼다/.test(t) ? 'blind' : /검증에서 문제가 나왔다/.test(t) ? 'repair' : /변형 문항을 만든다/.test(t) ? 'gen' : '?', t });
      if(/22유형/.test(t)){
        if(!/\[지문\]/.test(t)) return { items: [{ num: 6, cat: '문법', sub: '단어', title: '단어의 쓰임', type: 'G05', sub2: [] }] };
        if(/열섬/.test(t)) return { cat: '독서', sub: '과학/기술', title: '도시 열섬 현상의 원인', author: '누군가', items: [{ num: 1, type: 'R01' }, { num: 2, type: 'R06', sub2: ['R05', 'L01', 'R06'] }, { num: 3, type: 'L03', review: false }] };
        return { cat: '문학', sub: '없는 소분류', title: '현대시 — 봄', author: '지어낸 시', items: [{ num: 4, type: 'L03', review: true, alt: 'L05', why: '표현과 시어 사이' }, { num: 5, type: 'L05', nature: '발화 내용 이해' }] };
      }
      return window.__stub(t, opts || {});
    };
    await classifyExam(NAME);
    out.cls = { calls: calls.filter(c => c.kind === 'cls').length, models: [...new Set(calls.map(c => c.model))].join(), master: /R06 <보기> 적용 — 줄글 사례 — /.test(calls[0].t) && /화법과 작문: 말하기 방식·전략 파악/.test(calls[0].t),
      i1: [byNum(1).typeId, byNum(1).typeBy].join(), i2: [byNum(2).typeId, byNum(2).subTypes.join('+'), byNum(2).typeBy].join(), i3: [byNum(3).typeId, byNum(3).review && byNum(3).review.why].join(' / '),
      p1: [P1().title, P1().author, P1().sub].join('/'), p2: [P2().title, P2().author, P2().cat, P2().sub].join('/'), i4: JSON.stringify(byNum(4).review), i5: [byNum(5).typeId, byNum(5).nature].join(),
      i6: [byNum(6).cat, byNum(6).sub, byNum(6).title, byNum(6).typeId].join('/'), ok: !!$('#ex-ok'), flags: ex.querySelectorAll('#ex-flags tr').length - 1, rule: ex.querySelectorAll('#ex-table td.rule select[aria-label$="유형"], #ex-table td.rule select[aria-label$="성격"]').length };
    await exUseAlt(byNum(4).id); await exClearFlag(byNum(3).id);
    out.flag = { i4: [byNum(4).typeId, byNum(4).typeBy, byNum(4).review].join(), i3: [byNum(3).review, byNum(3).typeBy].join(), left: !!$('#ex-flags') };
    // 표에서 고치기: 대분류를 바꾸면 소분류·유형이 그 대분류 것으로
    await exSetHead(byNum(4).id, 'title', '지어낸 시 「봄」'); await exSetHead(byNum(6).id, 'cat', '매체');
    out.head = { cat6: [byNum(6).cat, byNum(6).sub, byNum(6).typeId, !!byNum(6).nature].join(), row6: $('#ex-table tr[data-num="6"]').textContent.replace(/\s+/g, ' ').includes('→') };
    await exSetHead(byNum(6).id, 'cat', '문법'); await exSetHead(byNum(6).id, 'sub', '단어'); await exSetHead(byNum(6).id, 'title', '단어의 쓰임'); await exSetType(byNum(6).id, 'G05', null);
    await exSetHead(byNum(6).id, 'sub', '과학/기술');           // 그 대분류에 없는 소분류는 받지 않음
    out.head.sub6 = byNum(6).sub;
    // ── 내려받기: 파일 속을 다시 열어 확인 ──
    const got = [], oc = URL.createObjectURL, clk = HTMLAnchorElement.prototype.click; let last = null;
    URL.createObjectURL = b => { last = b; return oc.call(URL, b); };
    HTMLAnchorElement.prototype.click = function(){ if(this.download){ got.push({ name: this.download, blob: last }); } else clk.call(this); };
    await exDownloadClass(); await exDownloadLms();
    const sheetNames = async b => { const z = await JSZip.loadAsync(await b.arrayBuffer()); return { wb: await z.file('xl/workbook.xml').async('string'), s1: await z.file('xl/worksheets/sheet1.xml').async('string'), sst: await z.file('xl/sharedStrings.xml').async('string') }; };
    const c1 = await sheetNames(got[0].blob), c2 = await sheetNames(got[1].blob);
    out.dl = { names: got.map(g => g.name), clsSheets: /name="전체"/.test(c1.wb) && /name="유형 분포"/.test(c1.wb), clsHas: /R06 \+ R05/.test(c1.sst) && /지어낸 시 「봄」/.test(c1.sst),
      lmsSheets: /name="ExamTemplate"/.test(c2.wb) && /name="_Lookup"[^>]*state="hidden"/.test(c2.wb), lmsHas: /G05 사례 적용/.test(c2.sst) && /R06 &lt;보기&gt; 적용 — 줄글 사례/.test(c2.sst) && /Recommend AnswerTime \(mm:ss\)/.test(c2.sst),
      noSelfClose: !/<c [^>]*\/>/.test(c2.s1), rows: (c2.s1.match(/<row /g) || []).length };
    // LMS 표기 설정을 바꾸면 유형명에 바로 반영
    go('data'); $('#lo-dash').value = '—'; await saveLmsOpt(); out.opt = KT.label('R06'); $('#lo-dash').value = ' — '; await saveLmsOpt();

    // ── 세트 화면: 유형 표시 + 🤖 정답 근거 ──
    go('set', P1().id);
    const set = $('#view-set');
    out.setChips = [...set.querySelectorAll('.qitem .chip.t')].map(c => c.textContent).join(' | ');
    window.__stub = (t) => {
      if(/근거를 고른다/.test(t)) return { items: [
        { num: 1, neg: true, evidence: ['녹지와 수면이 줄어든 곳일수록 열섬의 세기가 커진다.', '이 문장은 지문 어디에도 없는 지어낸 근거이다'], x: [[3, '약해진다'], [1, '없는낱말']] },
        { num: 2, neg: false, evidence: ['교외와의 차이는 새벽에 가장 크다', '밤에 천천히 내보낸다'], x: [[2, '바람이'], [3, '교외의'], [4, '밤에만'], [5, '나무가'], [9, '없는']] },
        { num: 3, neg: false, evidence: ['그래서 열섬은 ㉠ 〔한낮보다 해가 진 뒤에 더 뚜렷하다.〕'], x: [] }] };
      return {};
    };
    await evidenceSet(P1().id);
    const evCall = calls.find(c => c.kind === 'ev');
    out.ev = { i1: JSON.stringify(byNum(1).ev), i2q: byNum(2).ev.quotes.length, i2x: byNum(2).ev.x.length, marks: set.querySelectorAll('.passage mark.ev').length, badges: [...set.querySelectorAll('.passage sup.evn')].map(s => s.textContent).join(),
      viewMark: set.querySelectorAll('.qitem .view mark.ev').length, xw: [...set.querySelectorAll('.qitem .xw')].map(s => s.textContent).join(), ansColor: set.querySelectorAll('.qitem .ch.ans.ev').length, dots: set.querySelectorAll('.evdot').length,
      model: evCall.model, sentExplain: /해설: 2문단에서/.test(evCall.t), under: /〔않는〕/.test(evCall.t), passageText: set.querySelector('.passage').textContent.replace(/[\s·\d]+/g, '').includes('녹지와수면이줄어든곳일수록열섬의세기가커진다') };
    focusEv(1); out.ev.dim = set.querySelectorAll('.passage mark.ev.dim').length; focusEv(1); out.ev.undim = set.querySelectorAll('.passage mark.ev.dim').length;
    K.showEv = false; renderSet(); out.ev.hidden = set.querySelectorAll('mark.ev').length; K.showEv = true;

    // ── 변형 만들기 ──
    $('#btn-variant').click();
    out.va0 = { view: K.view, pid: K.va.pid === P1().id, kinds: [...document.querySelectorAll('#va-kinds .chip')].map(c => c.dataset.kind).join(), picks: document.querySelectorAll('#va-items input').length };
    const good = { stem: '윗글의 내용과 일치하는 것은?', choices: ['열섬은 교외가 도시보다 더운 현상이다.', '② 포장된 땅은 낮에 모은 열을 밤에 내보낸다.', '녹지는 열섬을 키운다.', '바람길은 열을 가둔다.', '냉방기는 열섬과 무관하다.'], answer: 2, type: 'R01', points: 2,
      explain: '1문단에 나온다.', evidence: ['낮 동안 아스팔트와 콘크리트는 태양 에너지를 흡수해 저장했다가 밤에 천천히 내보낸다.'], wrongs: [[1, '교외가', '주체가 바뀜'], [3, '키운다', '반대'], [4, '가둔다', '반대'], [5, '무관하다', '지문과 다름']] };
    const noEv = Object.assign({}, good, { stem: '윗글을 이해한 내용으로 가장 적절한 것은?', evidence: ['지문에 없는 문장을 근거라고 적었다 정말로'] });
    let blindMode = 'ok';
    window.__stub = (t, opts) => {
      if(/문항을 푼다/.test(t)){
        const n = (t.match(/^\[\d+\]/gm) || []).length;
        if(/\(O\/X 문항\)/.test(t)) return { items: Array.from({ length: n }, (_, k) => ({ k: k + 1, judge: '', answer: n === 1 || k === 4 ? 'X' : (k % 2 ? 'X' : 'O') })) };
        if(blindMode === 'light-wrong' && opts.model === 'light-model') return { items: [{ k: 1, judge: 'OXXXX', answer: 1 }] };
        if(blindMode === 'both-wrong') return { items: [{ k: 1, judge: 'OOXXX', answer: 1 }] };
        return { items: Array.from({ length: n }, (_, k) => ({ k: k + 1, judge: 'XOXXX', answer: 2 })) };
      }
      if(/검증에서 문제가 나왔다/.test(t)) return { items: [noEv] };
      if(/쌍둥이 문항/.test(t)) return { items: [/\[1번\]/.test(t.split('[원 문항]')[1]) ? good : noEv] };
      if(/O\/X 문항으로 바꾼다/.test(t)) return { items: [0, 1, 2, 3, 4].map(k => ({ stem: k % 2 ? '녹지가 줄면 열섬이 약해진다.' + k : '포장된 땅은 낮에 모은 열을 밤에 내보낸다.' + k, answer: k % 2 ? 'X' : 'O', explain: '지문 참고', evidence: ['녹지와 수면이 줄어든 곳일수록 열섬의 세기가 커진다.'], wrong: '약해진다' })) };
      if(/서술형 문항/.test(t)) return { items: [{ stem: '㉠의 까닭을 서술하시오.', viewLabel: '조건', view: '‘저장’이라는 낱말을 넣을 것\n한 문장으로 쓸 것', model: '낮에 저장된 열이 밤에 나오기 때문이다.', rubric: ['열의 저장을 썼다 — 3점', '밤에 내보냄을 썼다 — 2점'], points: 5, type: 'R05', evidence: ['밤에 천천히 내보낸다'] }] };
      if(/새 독서 지문/.test(t)) return { passage: { title: '도시 숲의 냉각 효과', body: ('도시 숲은 여름철 한낮의 기온을 낮추는 구실을 한다. 나뭇잎이 햇빛을 가려 땅이 덜 달궈지고, 잎에서 물이 증발하면서 주변의 열을 빼앗기 때문이다. ').repeat(6) + '\n숲의 넓이가 같더라도 한곳에 모여 있을 때보다 여러 곳에 흩어져 있을 때 식혀 주는 범위가 넓다.' },
        items: [Object.assign({}, good, { stem: '윗글의 내용과 일치하는 것은?', choices: ['숲은 밤의 기온만 낮춘다.', '나뭇잎은 햇빛을 가려 땅이 덜 달궈지게 한다.', '숲은 모여 있을수록 범위가 넓다.', '증발은 열을 더한다.', '숲은 기온과 무관하다.'], evidence: ['나뭇잎이 햇빛을 가려 땅이 덜 달궈지고'], wrongs: [[1, '밤의', 'x']] }),
          Object.assign({}, noEv, { choices: good.choices.map(c => c + ' ') })] };
      return {};
    };
    // 쌍둥이: 1번(통과) + 2번(근거가 지문에 없음 → 수리해도 실패 → 보류)
    K.va.kind = 'twin'; K.va.picks = { [byNum(1).id]: true, [byNum(2).id]: true }; renderVariant();
    const before = calls.length; await vaRun();
    const vs = () => K.items.filter(i => i.variantOf);
    out.twin = { saved: vs().length, v: vs()[0] && [vs()[0].vkind, vs()[0].answer, vs()[0].typeId, vs()[0].verify.status, vs()[0].choices[0].slice(0, 2), vs()[0].num, vs()[0].passageId === P1().id, vs()[0].ev.x.length, /① 주체가 바뀜/.test(vs()[0].wrong)].join('|'),
      results: K.va.results.map(x => x.status + (x.saved ? ':saved' : ':held')).join(), heldNote: (K.va.results.find(x => !x.saved) || { rec: { verify: { notes: [] } } }).rec.verify.notes.join(' / '),
      kinds: calls.slice(before).map(c => c.kind + '@' + c.model).join(' '), cards: document.querySelectorAll('#va-results .vres').length, failCard: document.querySelectorAll('#va-results .vres.fail').length };
    SPAI.state.running = true; await vaKeep(K.va.results.find(x => !x.saved).rec.id); out.twin.blocked = vs().length; SPAI.state.running = false;
    await vaKeep(K.va.results.find(x => !x.saved).rec.id); out.twin.kept = vs().length; vaDrop(K.va.results[0].rec.id); out.twin.afterDrop = K.va.results.length;
    // 블라인드: 가벼운 모델만 틀리면 '주의', 둘 다 틀리면 '실패'
    K.va.results = []; K.va.picks = { [byNum(1).id]: true }; blindMode = 'light-wrong'; await vaRun(); out.blindWarn = K.va.results.map(x => x.status + (x.saved ? ':saved' : ':held') + ' ' + x.rec.verify.notes.join('/')).join();
    K.va.results = []; blindMode = 'both-wrong'; await vaRun(); out.blindFail = K.va.results.map(x => x.status + (x.saved ? ':saved' : ':held') + ' ' + x.rec.verify.notes.join('/')).join(); blindMode = 'ok';
    // OX · 서술형
    K.va.results = []; K.va.kind = 'ox'; renderVariant(); await vaRun();
    const ox = vs().filter(i => i.vkind === 'ox');
    out.ox = { n: ox.length, ans: ox.map(i => i.answer).join(''), kind: ox[0] && ox[0].kind, held: K.va.results.filter(x => !x.saved).length, heldWhy: K.va.results.filter(x => !x.saved).map(x => x.rec.verify.notes.join('/')).join() };
    K.va.results = []; K.va.kind = 'essay'; renderVariant(); await vaRun();
    const es = vs().find(i => i.vkind === 'essay');
    out.essay = es && [es.kind, es.model, es.rubric.length, es.points, es.typeId, es.verify.status].join('|');
    go('set', P1().id);
    out.setVar = { n: document.querySelectorAll('#set-variants .qitem').length, model: /모범 답안/.test($('#set-variants').textContent), orig: itemsOf(P1().id).length, chip: /쌍둥이/.test($('#set-variants').textContent) && /검증 통과/.test($('#set-variants').textContent) };
    // 새 지문 (독서만)
    K.va.pid = P2().id; K.va.kind = 'newp'; go('variant'); out.newpLit = [...document.querySelectorAll('#va-kinds .chip')].map(c => c.dataset.kind).includes('newp');
    K.va.pid = P1().id; K.va.kind = 'newp'; K.va.results = []; renderVariant(); await vaRun();
    const np = K.passages.find(p => p.madeFrom);
    out.newp = np && { chip: /새 지문/.test($('#view-set .qitem').textContent) && /검증 통과/.test($('#view-set .qitem').textContent), view: K.view, cur: K.cur === np.id, title: np.title, cat: np.cat + '/' + np.sub, src: np.src.name, items: itemsOf(np.id).map(i => [i.num, i.typeId, i.verify.status, !!i.variantOf].join(':')).join(','), n: K.passages.length };
    // 변형·새 지문은 원래 시험의 분류표에 섞이지 않는다
    out.rowsAfter = KX.rows(K.passages, K.items, NAME, { section: '' }).length;
    // ── 정답 풀기·대조: 정답 없는 문항은 AI 풀이로 채우고(표시), 정답표와 다른 문항은 알려 준다 ──
    const i3 = byNum(3); i3.answer = ''; await DB.put('items', i3); await loadAll();
    window.__stub = (t) => ({ items: Array.from({ length: (t.match(/^\[\d+\]/gm) || []).length }, (_, k) => ({ k: k + 1, judge: 'XOXXX', answer: 2 })) });
    go('export'); const nb = calls.length; await solveExam(NAME);
    const ckS = KX.check(KX.rows(K.passages, K.items, NAME, { section: '' }));
    out.solve = { calls: calls.slice(nb).map(c => c.kind + '@' + c.model).join(' '), i3: [byNum(3).answer, byNum(3).ansBy].join(), i1: [byNum(1).answer, byNum(1).ansAi].join(), i5: [byNum(5).answer, byNum(5).ansAi || ''].join(),
      warns: ckS.warns.filter(w => /AI/.test(w)).join(' / '), yellow: document.querySelectorAll('#ex-table td.rule select[aria-label$="정답"]').length, noAnsErr: ckS.errors.some(e => /정답이 없음/.test(e)) };
    await exSetField(byNum(3).id, 'answer', '②'); out.solve.confirmed = [byNum(3).answer, byNum(3).ansBy || ''].join();
    // 출처 이름을 바꾸면 딸린 문항도 함께 옮겨 간다
    go('set', P2().id); K.editing = true; renderSet(); $('#ed-src').value = '새 이름 모의'; await saveSetEdit();
    out.rename = [KX.rows(K.passages, K.items, '새 이름 모의', {}).length, KX.rows(K.passages, K.items, NAME, { section: '' }).length].join();
    go('set', P2().id); K.editing = true; renderSet(); $('#ed-src').value = NAME; await saveSetEdit();
    // ── 백업 왕복: 분류·근거·변형이 그대로 ──
    const data = JSON.stringify({ app: 'sp-korlab', version: 2, passages: K.passages, items: K.items.map(i => i.num === 5 && !i.variantOf ? Object.assign({}, i, { typeId: 'ZZ9', subTypes: ['R01', '<img>'], nature: '<b>' }) : i), images: [] });
    const cnt = [K.passages.length, K.items.length].join();
    for(const s of ['passages', 'items']) await DB.clear(s);
    await importBackup(new File([data], 'b.json'));
    out.backup = { same: [K.passages.length, K.items.length].join() === cnt, type: byNum(2).typeId + '+' + byNum(2).subTypes.join(), ev: byNum(1).ev.x.length, cat: P2().cat + '/' + P2().sub + '/' + P2().author, bad: [byNum(5).typeId, byNum(5).subTypes.join(), byNum(5).nature].join('|'),
      variants: K.items.filter(i => i.variantOf).length, verify: K.items.find(i => i.vkind === 'twin').verify.status, essay: (K.items.find(i => i.kind === 'essay') || {}).model };
    go('dash'); out.dash = $('#view-dash').textContent.replace(/\s+/g, ' ');
    go('items'); K.fi.type = 'R06'; renderItems(); out.search = document.querySelectorAll('#view-items .qitem').length; K.fi.type = ''; K.fi.kind = 'variant'; renderItems(); out.searchVar = document.querySelectorAll('#view-items .qitem').length;
    return out;
  }, { exam, sol });

  check('올릴 때 유형을 먼저 어림 + [3점] 없는 문항은 2점', /유형 어림 6/.test(r.pvChips) && r.points.split(',').filter(p => p === '3').length === 1 && r.points.split(',').filter(p => p === '2').length === 5, r.pvChips + ' / ' + r.points);
  check('엑셀 화면: 문항 6행, 어림 칸 표시, 시험 이름·영문 파일 이름', r.ex0.rows === 6 && r.ex0.rule === 6 && r.ex0.name === '2099 지어낸 모의 국어영역' && r.ex0.file === '2099_mock_korean_exam_template.xlsx', JSON.stringify(r.ex0).slice(0, 300));
  check('점검: 단독 문항의 소분류·제목 빈칸을 잡아냄', r.ex0.err && /소분류가 비어 있음/.test(r.ex0.errTxt) && r.ex0.single === '독서//', r.ex0.single);
  check('표에서 유형을 직접 고르면 사용자 확정', r.user === 'R02,user', r.user);
  check('AI 분류: 세트 2 + 단독 1 = 3번 호출, 센 모델, 마스터 표를 프롬프트에 넣음', r.cls.calls === 3 && r.cls.models === 'strong-model' && r.cls.master, r.cls.calls + ' ' + r.cls.models);
  check('AI 분류: 직접 고른 칸은 그대로, 보조 유형은 같은 대분류만', r.cls.i1 === 'R02,user' && r.cls.i2 === 'R06,R05,ai', r.cls.i1 + ' / ' + r.cls.i2);
  check('AI 분류: 다른 대분류 유형(L03 → 독서)은 받지 않고 검토 요망으로', /^R09 \/ AI가 독서에 쓸 수 없는 유형\(L03\)/.test(r.cls.i3), r.cls.i3);
  check('AI 분류: 제목은 규칙에 맞을 때만(접두어 제목 거부), 없는 소분류 거부, 작성자는 문학만', r.cls.p1 === '도시 열섬 현상의 원인//과학/기술' && r.cls.p2 === '지어낸 시 「봄」/지어낸 시/문학/현대시', r.cls.p1 + ' | ' + r.cls.p2);
  check('AI 분류: 검토 요망 + 대안 유형 + 근거, 유형 있는 대분류에는 성격을 붙이지 않음', r.cls.i4 === '{"alt":"L05","why":"표현과 시어 사이"}' && r.cls.i5 === 'L05,', r.cls.i4 + ' ' + r.cls.i5);
  check('AI 분류: 단독 문항의 대분류·소분류·제목·유형 → 점검 통과, 어림 칸 0', r.cls.i6 === '문법/단어/단어의 쓰임/G05' && r.cls.ok && r.cls.rule === 0 && r.cls.flags === 2, JSON.stringify([r.cls.i6, r.cls.ok, r.cls.rule, r.cls.flags]));
  check('검토 요망 표: [대안으로] · [이대로 확정]', r.flag.i4 === 'L05,user,' && r.flag.i3 === ',user' && !r.flag.left, JSON.stringify(r.flag));
  check('표에서 대분류를 바꾸면 그 대분류 값으로 다시 어림, 없는 소분류는 거부', r.head.cat6 === '매체,매체,,false' && r.head.row6 && r.head.sub6 === '단어', JSON.stringify(r.head));
  check('내려받기: 분류표는 한글 이름, LMS 파일은 영문 이름', r.dl.names[0] === '2099 지어낸 모의_유형분류표.xlsx' && r.dl.names[1] === '2099_mock_korean_exam_template.xlsx', r.dl.names.join(' , '));
  check('분류표 파일: [전체]·[유형 분포] 시트, 복합 유형·문학 제목', r.dl.clsSheets && r.dl.clsHas);
  check('LMS 파일: ExamTemplate + 숨김 _Lookup, 유형 문자열, 빈 셀 자기닫힘 없음, 행 수 = 2 + 그룹 3×3 + 문항 6', r.dl.lmsSheets && r.dl.lmsHas && r.dl.noSelfClose && r.dl.rows === 2 + 3 * 3 + 6, JSON.stringify(r.dl));
  check('LMS 표기 설정이 유형명에 반영', r.opt === 'R06 <보기> 적용—줄글 사례', r.opt);
  check('세트 화면: 문항마다 22유형 표시', /R02 중심 내용·주제 파악/.test(r.setChips) && /R06 <보기> 적용 — 줄글 사례 \+ R05/.test(r.setChips), r.setChips);
  check('정답 근거: 지문에 없는 인용문·선지에 없는 낱말은 버림', r.ev.i1 === '{"quotes":["녹지와 수면이 줄어든 곳일수록 열섬의 세기가 커진다."],"x":[[3,"약해진다"]],"neg":true}' && r.ev.i2q === 2 && r.ev.i2x === 4, r.ev.i1);
  check('정답 근거: 지문 형광펜 + 번호 배지, <보기> 형광펜, 정답 선지 색, 틀린 낱말 X', r.ev.marks >= 3 && r.ev.badges === '2,3,1' && r.ev.viewMark === 1 && r.ev.xw === '약해진다,바람이,교외의,밤에만,나무가' && r.ev.ansColor === 3 && r.ev.dots === 3 && r.ev.passageText, JSON.stringify(r.ev).slice(0, 400));
  check('정답 근거: 센 모델, 해설을 함께 보냄, 밑줄은 〔 〕로', r.ev.model === 'strong-model' && r.ev.sentExplain && r.ev.under);
  check('[근거] 단추: 그 문항만 남기고 흐리게 → 다시 누르면 풀림 / 형광펜 숨기기', r.ev.dim >= 2 && r.ev.undim === 0 && r.ev.hidden === 0, r.ev.dim + ' ' + r.ev.undim + ' ' + r.ev.hidden);
  check('변형 화면: 세트에서 넘어오면 그 지문, 독서는 6종 모두', r.va0.view === 'variant' && r.va0.pid && r.va0.kinds === 'twin,shift,ox,essay,view,newp' && r.va0.picks === 3, JSON.stringify(r.va0));
  check('쌍둥이: 통과한 것만 자동 저장(선지 번호 정리·X 낱말·오답 풀이)', r.twin.saved === 1 && r.twin.v === 'twin|②|R01|pass|① |1|true|4|true', r.twin.v);
  check('쌍둥이: 근거가 지문에 없으면 수리 한 번 → 그래도 실패면 보류', r.twin.results === 'fail:held,pass:saved' && /근거 인용문이 지문에 없음/.test(r.twin.heldNote) && r.twin.cards === 2 && r.twin.failCard === 1, r.twin.results + ' / ' + r.twin.heldNote);
  check('호출 순서: 만들기(센) → 블라인드(가벼운) → 수리(센)', /^gen@strong-model blind@light-model gen@strong-model repair@strong-model$/.test(r.twin.kinds), r.twin.kinds);
  check('보류 문항: [그래도 저장] · [버리기]', r.twin.blocked === 1 && r.twin.kept === 2 && r.twin.afterDrop === 1, r.twin.kept + ' ' + r.twin.afterDrop);
  check('블라인드: 가벼운 모델만 틀리면 주의(보류), 둘 다 틀리면 실패', /^warn:held 가벼운 모델은 다르게/.test(r.blindWarn) && /^fail:held .*정답\(②\)과 다름.*유일 정답 의심/.test(r.blindFail), r.blindWarn + ' || ' + r.blindFail);
  check('OX 분해: 5문항, 블라인드와 답이 다른 1개는 보류', r.ox.n === 4 && r.ox.kind === 'ox' && r.ox.held === 1 && /다름/.test(r.ox.heldWhy), JSON.stringify(r.ox));
  check('서술형: 모범 답안·채점 기준·배점', r.essay === 'essay|낮에 저장된 열이 밤에 나오기 때문이다.|2|5|R05|pass', r.essay);
  check('세트 화면: 변형 문항 묶음이 원 문항과 따로', r.setVar.n >= 6 && r.setVar.model && r.setVar.orig === 3 && r.setVar.chip, JSON.stringify(r.setVar));
  check('새 지문: 독서에서만, 검증 통과 문항만 딸려 저장되고 그 세트로 이동', r.newpLit === false && r.newp && r.newp.view === 'set' && r.newp.cur && r.newp.title === '도시 숲의 냉각 효과' && r.newp.cat === '독서/과학/기술' && /^자체 제작 — 도시 숲의 냉각 효과 /.test(r.newp.src) && r.newp.items === '1:R01:pass:false' && r.newp.chip, JSON.stringify(r.newp));
  check('변형·새 지문은 원래 시험의 표에 섞이지 않음', r.rowsAfter === 6, r.rowsAfter);
  check('정답 풀기·대조: 세트 2 + 단독 1 호출(센 모델), 빈 정답은 채우고 AI 표시, 정답표와 다르면 알림만', r.solve.calls === 'blind@strong-model blind@strong-model blind@strong-model' && r.solve.i3 === '②,ai' && r.solve.i1 === '③,2' && r.solve.i5 === '③,2' && !r.solve.noAnsErr, JSON.stringify(r.solve));
  check('정답 풀기·대조: 점검에 "정답표는 ③, AI 풀이는 ②" · "AI가 풀어 채운 정답" 안내, 표에서 고르면 확정', /1번: 정답표는 ③, AI 풀이는 ②/.test(r.solve.warns) && /AI가 풀어 채운 정답 \(1문항\): 3번/.test(r.solve.warns) && r.solve.yellow === 1 && r.solve.confirmed === '②,', r.solve.yellow + ' ' + r.solve.confirmed);
  check('출처 이름 바꾸기: 지문과 문항이 같은 시험으로 함께 이동', r.rename === '2,4', r.rename);
  check('백업 왕복: 분류·근거·변형 유지, 목록 밖 유형은 버림', r.backup.same && r.backup.type === 'R06+R05' && r.backup.ev === 1 && r.backup.cat === '문학/현대시/지어낸 시' && r.backup.bad === '|R01|' && r.backup.variants >= 6 && r.backup.verify === 'pass' && /저장된 열/.test(r.backup.essay), JSON.stringify(r.backup));
  check('대시보드 유형 분포 · 문제 검색(유형·변형)', /유형 분포/.test(r.dash) && /R06 <보기> 적/.test(r.dash) && /난도 분포/.test(r.dash) && r.search === 1 && r.searchVar >= 6, r.search + ' ' + r.searchVar);
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
