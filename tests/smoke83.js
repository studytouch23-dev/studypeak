// smoke83: 국어 랩 시험지 보관함·대시보드·통합 검색·난도
//   시험 정보 읽기(이름·첫 쪽 머리말 → 학년도·월·학년·종류, 표준 이름) → 보관함(학년·종류·학년도·월로 좁히기, 기출 달력, 정보 고치기, 원본 조각 지우기, 삭제)
//   → 지문 목록(시험 정보로 좁히기, 소분류, 나눠 보기) → 대시보드(할 일·최근 시험·분포·저장 공간) → 통합 검색
//   → 난도: 올릴 때 어림, 정답률 붙여넣기(실제 값), AI 분류의 난도, 직접 고르기, 문제 검색·출력에서 난도로 고르기, 변형의 목표 난도
const { openKor } = require('../tools/_common.js');
const fx = require('./kor-fixture.js');
const KT = require('../korlab/js/ktype.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  // ── 엔진(Node): 시험 정보·난도 ──
  const m1 = KT.examMeta('x', '2026학년도 대학수학능력시험 9월 모의평가 문제지 국어 영역'), m2 = KT.examMeta('2025학년도 수능'), m3 = KT.examMeta('2024년 3월 고1 전국연합학력평가'), m4 = KT.examMeta('2027 바탕 10회'), m5 = KT.examMeta('2025 2학기 중간고사 고2');
  check('시험 정보 읽기: 모의평가·수능·학력평가·사설·내신', [m1.year, m1.month, m1.grade, m1.kind].join() === '2026,9,고3,모의평가' && [m2.month, m2.grade, m2.kind].join() === '11,고3,수능' && [m3.year, m3.month, m3.grade, m3.kind].join() === '2024,3,고1,학력평가' && m4.kind === '사설 모의고사' && [m5.grade, m5.kind].join() === '고2,내신 기출', JSON.stringify([m1, m2, m3, m4, m5]));
  check('표준 이름', KT.examName(m1) === '2026학년도 9월 모의평가 (고3)' && KT.examName(m2) === '2025학년도 대학수학능력시험 (고3)' && KT.examName(m3) === '2024학년도 3월 학력평가 (고1)', KT.examName(m1) + ' | ' + KT.examName(m3));
  check('정답률 → 난도', [92, 80, 70, 55, 40, 20].map(KT.rateToDiff).join('') === '112345');
  const pr = KT.parseRates('문항 정답률\n1 92.1%\n2번 : 81\n14\t36.4\n표 제목\n'), pw = KT.parseRates('14 63.6%', true);
  check('정답률 표 읽기(오답률이면 100에서 뺌)', pr[1] === 92.1 && pr[2] === 81 && pr[14] === 36.4 && Object.keys(pr).length === 3 && pw[14] === 36.4, JSON.stringify([pr, pw]));
  const hard = KT.diffGuess({ points: 3, typeId: 'R07', view: 'x'.repeat(200), choices: ['a'.repeat(60)] }, { bodyLen: 2400, sub: '과학/기술' }), easy = KT.diffGuess({ points: 2, typeId: 'R08', choices: ['가나', '다라'] }, { bodyLen: 1500 });
  check('난도 어림: 3점·자료 해석·긴 지문은 높게, 어휘 문항은 낮게', hard === 5 && easy <= 2, hard + ' ' + easy);

  const lab = await openKor();
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const exam = (await fx.makePdf(lab.browser, fx.EXAM)).toString('base64'), sol = (await fx.makePdf(lab.browser, fx.SOLUTION)).toString('base64');
  // 머리말만 바꾼 두 번째 시험지: 평가원 9월 모의평가 꼴
  const exam2 = (await fx.makePdf(lab.browser, fx.EXAM.split('2099학년도 지어낸 모의 시험 문제지').join('2098학년도 대학수학능력시험 9월 모의평가 문제지'))).toString('base64');

  const r = await page.evaluate(async ({ exam, exam2, sol }) => {
    const file = (b64, name) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name, { type: 'application/pdf' });
    const out = {};
    go('exams'); out.empty = /아직 시험지가 없습니다/.test($('#view-exams').textContent);
    // 1) 파일 이름만 있는 시험지: 표준 이름으로 바뀌고 학년도·월·학년·종류가 채워진다(원본 조각은 기본값 = 그림 있는 곳만)
    go('upload'); out.origDefault = $('#up-orig').value;
    UP.examFile = file(exam2, 'kor_exam_scan01.pdf'); UP.solFile = file(sol, 's.pdf'); upAutoName(); await upRead();
    out.meta1 = { name: $('#up-name').value, year: $('#up-year').value, month: $('#up-month').value, grade: $('#up-grade').value, kind: $('#up-kind').value };
    await upSave();
    out.imgs1 = (await DB.all('images')).length;
    // 2) 직접 이름을 적은 시험지: 이름은 그대로, 정보는 사용자가 고른 값 우선
    go('upload'); UP.examFile = file(exam, 'a.pdf'); UP.solFile = file(sol, 's.pdf'); $('#up-name').value = '2097 지어낸 3월 학력평가 고1'; UP.nameAuto = false; $('#up-kind').value = '사설 모의고사';
    await upRead(); out.meta2 = { name: $('#up-name').value, year: $('#up-year').value, month: $('#up-month').value, grade: $('#up-grade').value, kind: $('#up-kind').value };
    $('#up-kind').value = '학력평가'; await upSave();
    // 같은 이름으로 또 저장하려 하면 확인을 받는다(여기서는 취소)
    const oc = window.confirm; let asked = ''; window.confirm = m => { asked = m; return false; };
    go('upload'); UP.examFile = file(exam, 'a.pdf'); $('#up-name').value = '2097 지어낸 3월 학력평가 고1'; UP.nameAuto = false; await upRead(); await upSave();
    out.dup = { asked: /이미 보관함에 있습니다/.test(asked), n: K.exams.length }; window.confirm = oc; UP.seg = null;
    const E = n => K.exams.find(e => e.name === n), A = '2098학년도 9월 모의평가 (고3)', B = '2097 지어낸 3월 학력평가 고1';
    out.exams = K.exams.map(e => [e.name, e.grade, e.year, e.month, e.kind, e.passages, e.items, e.answers].join('/')).join(' | ');
    out.src = JSON.stringify(K.items.find(i => i.src.name === A).src);
    // ── 보관함 ──
    go('exams');
    const xv = $('#view-exams'), rowsN = () => xv.querySelectorAll('#x-table tr[data-exam]').length;
    out.x0 = { nav: $('#n-exams').textContent, rows: rowsN(), facets: [...xv.querySelectorAll('.facet .chip')].map(c => c.textContent.trim()).join('|'), count: $('#xf-count').textContent };
    xv.querySelector('.chip[data-f="grade:고1"]').click(); out.x1 = { rows: rowsN(), name: (xv.querySelector('#x-table tr[data-exam] b') || {}).textContent };
    xv.querySelector('.chip[data-f="grade:고1"]').click(); xv.querySelector('.chip[data-f="kind:모의평가"]').click(); xv.querySelector('.chip[data-f="month:9"]').click(); out.x2 = { rows: rowsN(), name: (xv.querySelector('#x-table tr[data-exam] b') || {}).textContent };
    xv.querySelector('.chip[data-f="month:9"]').click(); xv.querySelector('.chip[data-f="month:3"]').click(); out.x3 = rowsN();
    K.xf = Object.assign(K.xf, { grade: '', kind: '', year: '', month: '', q: '학력' }); renderExams(); out.x4 = rowsN(); K.xf.q = ''; K.xf.sort = 'when'; renderExams();
    out.sortWhen = [...xv.querySelectorAll('#x-table tr[data-exam] b')].map(b => b.textContent.slice(0, 4)).join(); K.xf.sort = '';
    // 기출 달력
    $('#xt-cal').click();
    const cal = $('#x-cal');
    out.cal = { head: [...cal.querySelectorAll('th')].map(t => t.textContent).join('|'), years: [...cal.querySelectorAll('td.y')].map(t => t.textContent).join(), cells: [...cal.querySelectorAll('.ex')].map(b => b.textContent.trim()).join('|'),
      sep: cal.querySelector('tr:nth-child(2) td:nth-child(7) .ex') ? cal.querySelector('tr:nth-child(2) td:nth-child(7) .ex').textContent.trim() : '' };
    cal.querySelector('.ex').click(); out.calOpen = { view: K.view, src: K.f.src, cards: document.querySelectorAll('#view-passages .pcard').length };
    // 정보 고치기: 이름·학년을 바꾸면 그 시험의 지문·문항이 모두 따라온다
    go('exams'); $('#xt-list').click(); K.xf.edit = B; renderExams();
    $('#xe-grade').value = '고2'; $('#xe-name').value = '2097학년도 3월 학력평가 (고2)'; await examSave(B);
    const B2 = '2097학년도 3월 학력평가 (고2)';
    out.edit = { has: !!E(B2), old: !!E(B), grade: E(B2) && E(B2).grade, srcs: [...new Set(K.items.concat(K.passages).filter(x => x.src.name === B2).map(x => x.src.grade + x.src.month + x.src.kind))].join(), n: K.exams.length };
    K.xf.edit = B2; renderExams(); $('#xe-name').value = A; await examSave(B2); out.editDupBlocked = !!E(B2);
    // ── 지문 목록: 시험 정보로 좁히기 ──
    K.f = { cat: '', q: '', src: '', grade: '', year: '', month: '', sub: '', n: 60 }; go('passages');
    const pc = () => document.querySelectorAll('#view-passages .pcard').length;
    out.pl = { all: pc(), selects: ['pf-grade', 'pf-year', 'pf-month', 'pf-src'].map(id => $('#' + id).options.length).join() };
    K.f.grade = '고3'; renderPassages(); out.pl.g3 = pc(); K.f.grade = ''; K.f.year = '2097'; renderPassages(); out.pl.y = pc(); K.f.year = ''; K.f.month = '9'; renderPassages(); out.pl.m = pc(); K.f.month = '';
    K.f.cat = '독서'; renderPassages(); out.pl.cat = pc(); out.pl.subs = [...document.querySelectorAll('#pf-subs .chip')].map(c => c.textContent.trim()).join('|'); K.f.sub = '과학/기술'; renderPassages(); out.pl.sub = pc();
    K.f = { cat: '', q: '', src: '', grade: '', year: '', month: '', sub: '', n: 1 }; renderPassages(); out.pl.paged = pc(); out.pl.more = !!$('#pl-more'); $('#pl-more').click(); out.pl.afterMore = pc(); K.f.n = 60;
    out.pl.diffChip = document.querySelectorAll('#view-passages .pcard .dchip').length;
    // ── 난도 ──
    const its = n => K.items.filter(i => i.src.name === n && !i.variantOf).sort((a, b) => a.num - b.num);
    out.diff0 = { all: its(A).every(i => i.diff >= 1 && i.diff <= 5 && i.diffBy === 'rule'), vals: its(A).map(i => i.diff).join(''), p3: its(A).find(i => i.points === 3).diff > its(A).find(i => i.num === 1).diff };
    K.ex = { src: A, section: '' }; go('export');
    out.exDiff = { th: /난도/.test($('#ex-table tr').textContent), rule: document.querySelectorAll('#ex-table td.rule select[aria-label$="난도"]').length, card: !!$('#ex-rates') };
    $('#ex-rate-text').value = '번호 정답률\n1 91.2%\n2 33.3%\n3 58\n9 77%'; await exApplyRates(false);
    out.rate = { r: its(A).slice(0, 3).map(i => [i.rate, i.diff, i.diffBy].join(':')).join(' '), i4: its(A)[3].diffBy, ruleLeft: document.querySelectorAll('#ex-table td.rule select[aria-label$="난도"]').length, shown: /33\.3%/.test($('#ex-table').textContent) };
    $('#ex-rate-text').value = '4 30'; await exApplyRates(true); out.rateWrong = [its(A)[3].rate, its(A)[3].diff].join(':');
    await exSetField(its(A)[4].id, 'diff', '5'); out.userDiff = [its(A)[4].diff, its(A)[4].diffBy].join(':');
    // AI 분류가 준 난도: 어림 값만 바꾸고, 실제 정답률·직접 고른 값은 그대로
    localStorage.setItem('sp-lab-apikey', 'sk-ant-api03-test'); let prompt = '';
    SPAI.json = async content => { prompt = content[0].text; return /\[지문\]/.test(prompt) ? { cat: /열섬/.test(prompt) ? '독서' : '문학', sub: /열섬/.test(prompt) ? '과학/기술' : '현대시', title: '', items: [1, 2, 3, 4, 5].map(n => ({ num: n, type: /열섬/.test(prompt) ? 'R01' : 'L03', diff: 4 })) } : { items: [{ num: 6, cat: '문법', sub: '단어', title: '단어의 쓰임', type: 'G05', diff: 9 }] }; };
    await classifyExam(A);
    out.aiDiff = { asked: /diff: 난도를 1~5/.test(prompt), vals: its(A).map(i => i.diff + i.diffBy[0]).join(' ') };
    // 세트 화면·문제 검색·출력에서 난도
    const pA = K.passages.find(p => p.src.name === A && /열섬/.test(p.title));
    go('set', pA.id); out.setChip = [...document.querySelectorAll('#view-set .qitem .dchip')].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    K.editing = true; renderSet(); document.querySelector('[data-edit] .e-diff').value = '2'; await saveSetEdit(); out.editDiff = [its(A)[0].diff, its(A)[0].diffBy, its(A)[0].rate].join(':');
    K.fi = { q: '', cat: '', kind: '', type: '', diff: '5' }; go('items'); out.searchDiff = { n: document.querySelectorAll('#view-items .qitem').length, opts: $('#if-diff').options.length };
    shOpenWith({ passages: K.passages.filter(p => p.src.name === A).map(p => p.id) }); const total = shNumbered().reduce((s, x) => s + x.items.length, 0);
    SH.diff = 'hard'; renderSheet(); const hardN = shNumbered().reduce((s, x) => s + x.items.length, 0); SH.diff = 'easy'; renderSheet(); const easyN = shNumbered().reduce((s, x) => s + x.items.length, 0);
    out.shDiff = { total, hardN, easyN, sel: $('#sh-diff').value }; SH.diff = ''; SH.types = true; renderSheet(); await new Promise(r => setTimeout(r, 300)); out.shDiff.sol = /난도 5/.test(($('#sh-pv-a') || {}).textContent || '');
    // 변형: 목표 난도가 지시문에 들어가고, 저장된 변형의 난도는 원 문항 기준
    K.va.pid = pA.id; K.va.picks = { [its(A)[1].id]: true }; K.va.kind = 'twin'; go('variant'); $('#va-diff').value = 'hard'; K.va.diff = 'hard';
    let gen = '';
    SPAI.json = async (content) => { const t = content[0].text; if(/문항을 푼다/.test(t)) return { items: [{ k: 1, judge: 'XOXXX', answer: 2 }] }; gen = t;
      return { items: [{ stem: '윗글의 내용과 일치하는 것은?', choices: ['교외가 도시보다 덥다.', '포장된 땅은 낮에 모은 열을 밤에 내보낸다.', '녹지는 열섬을 키운다.', '바람길은 열을 가둔다.', '냉방기는 무관하다.'], answer: 2, type: 'R01', points: 2, explain: 'x', evidence: ['낮 동안 아스팔트와 콘크리트는 태양 에너지를 흡수해 저장했다가 밤에 천천히 내보낸다.'], wrongs: [] }] }; };
    await vaRun();
    const v = K.items.find(i => i.variantOf);
    out.vaDiff = { prompt: /\[난도\] 원 문항보다 어렵게/.test(gen) && /원 문항 난도 5\/5, 실제 정답률 33\.3%/.test(gen), v: v && [v.diff, v.diffBy, v.verify.status].join(':'), chip: document.querySelectorAll('#va-items .dchip').length };
    // ── 대시보드 · 통합 검색 ──
    go('dash'); await new Promise(r => setTimeout(r, 300));
    const d = $('#view-dash');
    out.dash = { stats: [...d.querySelectorAll('.stat b')].map(b => b.textContent).join(), todo: d.querySelector('#d-todo').textContent.replace(/\s+/g, ' '), recent: d.querySelectorAll('#d-recent .todo').length, grade: (d.querySelector('#d-grade') || {}).textContent || '', diff: !!d.querySelector('#d-diff'), type: !!d.querySelector('#d-type'), storage: $('#st-usage').textContent.replace(/\s+/g, ' ') };
    d.querySelector('#d-recent .todo').click(); out.dashOpen = K.view + ':' + !!K.f.src;
    $('#gsearch').value = '열섬'; $('#gsearch').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    out.search = { view: K.view, exams: document.querySelectorAll('#s-exams .todo').length, passages: document.querySelectorAll('#s-passages .todo').length, items: document.querySelectorAll('#s-items .qitem').length, head: $('#view-search .vd').textContent };
    $('#gsearch').value = '학력평가'; $('#gsearch').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); out.search2 = document.querySelectorAll('#s-exams .todo').length;
    document.querySelector('#s-exams .todo').click(); out.searchOpen = K.view + ':' + K.f.src;
    // ── 원본 조각 지우기 · 시험 삭제 · 예전 저장분 옮기기 ──
    await DB.put('images', { id: pA.id, imgs: ['data:image/png;base64,iVBORw0KGgo='] }); await examDropImages(A); out.dropImg = !(await DB.get('images', pA.id));
    const old = K.passages.find(p => p.src.name === A); old.src = { name: old.src.name, kind: '수능·모의평가', year: '2098', grade: '' }; await DB.put('passages', old); await loadAll();
    out.migrate = JSON.stringify(K.passages.find(p => p.id === old.id).src);
    await examDelete(A); out.del = { n: K.exams.length, left: K.items.filter(i => i.src.name === A).length + K.passages.filter(p => p.src.name === A).length, variants: K.items.filter(i => i.variantOf).length };
    return out;
  }, { exam, exam2, sol });

  check('보관함: 비어 있으면 안내 / 원본 조각 기본값은 "그림 있는 곳만"', r.empty && r.origDefault === 'fig' && r.imgs1 === 0, r.origDefault + ' ' + r.imgs1);
  check('올리기: 첫 쪽 머리말에서 학년도·월·학년·종류를 읽고, 파일 이름 대신 표준 이름으로', JSON.stringify(r.meta1) === '{"name":"2098학년도 9월 모의평가 (고3)","year":"2098","month":"9","grade":"고3","kind":"모의평가"}', JSON.stringify(r.meta1));
  check('올리기: 직접 적은 이름은 그대로, 이미 고른 칸은 덮어쓰지 않음', JSON.stringify(r.meta2) === '{"name":"2097 지어낸 3월 학력평가 고1","year":"2097","month":"3","grade":"고1","kind":"사설 모의고사"}', JSON.stringify(r.meta2));
  check('올리기: 같은 이름이 이미 있으면 확인을 받음', r.dup.asked && r.dup.n === 2, JSON.stringify(r.dup));
  check('시험 정보가 지문·문항에 저장됨', r.src === '{"name":"2098학년도 9월 모의평가 (고3)","kind":"모의평가","year":"2098","month":9,"grade":"고3"}' && /2097 지어낸 3월 학력평가 고1\/고1\/2097\/3\/학력평가\/2\/6\/6/.test(r.exams), r.src + ' ' + r.exams);
  check('보관함: 시험 2개, 학년·종류·학년도·월 칩과 개수', r.x0.nav === '2' && r.x0.rows === 2 && /고3 1\|고1 1\|모의평가 1\|학력평가 1\|2098 1\|2097 1\|3월 1\|9월 1/.test(r.x0.facets) && /2개 \/ 전체 2개/.test(r.x0.count), r.x0.facets);
  check('보관함: 칩으로 좁히기(학년 / 종류 + 월 / 안 맞는 조합 / 이름 검색)', r.x1.rows === 1 && /학력평가/.test(r.x1.name) && r.x2.rows === 1 && /모의평가/.test(r.x2.name) && r.x3 === 0 && r.x4 === 1, JSON.stringify([r.x1, r.x2, r.x3, r.x4]));
  check('보관함: 시행 순 정렬(학년도·월 최신부터)', r.sortWhen === '2098,2097', r.sortWhen);
  check('기출 달력: 줄 = 학년도, 칸 = 월, 칸을 누르면 그 시험의 지문으로', /^학년도\|3월\|4월\|5월\|6월\|7월\|9월\|10월\|11월·수능\|그 밖$/.test(r.cal.head) && r.cal.years === '2098,2097' && /고3 모평/.test(r.cal.cells) && /고1 학평/.test(r.cal.cells) && /모평/.test(r.cal.sep) && r.calOpen.view === 'passages' && /모의평가/.test(r.calOpen.src) && r.calOpen.cards === 2, JSON.stringify(r.cal) + JSON.stringify(r.calOpen));
  check('시험 정보 고치기: 이름·학년을 바꾸면 딸린 지문·문항이 모두 따라옴, 있는 이름으로는 못 바꿈', r.edit.has && !r.edit.old && r.edit.grade === '고2' && r.edit.srcs === '고23학력평가' && r.edit.n === 2 && r.editDupBlocked, JSON.stringify(r.edit));
  check('지문 목록: 학년·학년도·월·시험으로 좁히기', r.pl.all === 4 && r.pl.selects === '3,3,3,3' && r.pl.g3 === 2 && r.pl.y === 2 && r.pl.m === 2, JSON.stringify(r.pl));
  check('지문 목록: 대분류 → 소분류 칩, 나눠 보기(더 보기), 난도 표시', r.pl.cat === 2 && /과학\/기술 2/.test(r.pl.subs) && r.pl.sub === 2 && r.pl.paged === 1 && r.pl.more && r.pl.afterMore === 4 && r.pl.diffChip >= 1, JSON.stringify(r.pl));
  check('난도: 올릴 때 모든 문항에 어림값, 3점 문항이 더 높게', r.diff0.all && r.diff0.p3, r.diff0.vals);
  check('엑셀 화면: 난도 칸(어림은 노란 칸)과 정답률 넣기', r.exDiff.th && r.exDiff.rule === 6 && r.exDiff.card, JSON.stringify(r.exDiff));
  check('정답률 붙여넣기: 실제 값으로 난도가 바뀜(91.2 → 1, 33.3 → 5, 58 → 3), 없는 번호는 무시', r.rate.r === '91.2:1:rate 33.3:5:rate 58:3:rate' && r.rate.i4 === 'rule' && r.rate.ruleLeft === 3 && r.rate.shown, JSON.stringify(r.rate));
  check('오답률 표는 100에서 빼서 / 직접 고른 난도는 확정', r.rateWrong === '70:2' && r.userDiff === '5:user', r.rateWrong + ' ' + r.userDiff);
  check('AI 분류의 난도: 어림 값만 바꾸고 실제 정답률·직접 고른 값은 그대로, 범위 밖 값은 버림', r.aiDiff.asked && /^1r 5r 3r 2r 5u \d[ra]$/.test(r.aiDiff.vals), r.aiDiff.vals);
  check('세트 화면: 난도·정답률 표시 / 고치기에서 난도를 고르면 확정', /난도 1 쉬움 · 정답률 91\.2%/.test(r.setChip) && /난도 5 최고난도 · 정답률 33\.3%/.test(r.setChip) && r.editDiff === '2:user:91.2', r.setChip + ' / ' + r.editDiff);
  check('문제 검색: 난도로 좁히기', r.searchDiff.n === 2 && r.searchDiff.opts === 6, JSON.stringify(r.searchDiff));
  check('출력: 난도로 골라 담기(어려운 것만 / 쉬운 것만), 해설에 난도', r.shDiff.total === 5 && r.shDiff.hardN === 2 && r.shDiff.easyN === 2 && r.shDiff.sol, JSON.stringify(r.shDiff));
  check('변형: 목표 난도와 원 문항의 난도·정답률이 지시문에, 변형의 난도는 원 문항 기준', r.vaDiff.prompt && r.vaDiff.v === '5:rule:pass' && r.vaDiff.chip === 3, JSON.stringify(r.vaDiff));
  check('대시보드: 통계·할 일·최근 시험·학년×종류·난도·유형 분포·저장 공간', /^2,4,12,1,/.test(r.dash.stats) && /검토 요망|정답이 없는|어림만/.test(r.dash.todo) && r.dash.recent === 2 && /고3/.test(r.dash.grade) && /모평/.test(r.dash.grade) && r.dash.diff && r.dash.type && /사용 중|저장 공간/.test(r.dash.storage) && r.dashOpen === 'passages:true', JSON.stringify(r.dash).slice(0, 400));
  check('통합 검색: 시험지·지문·문항을 한 번에, 누르면 열림', r.search.view === 'search' && r.search.exams === 0 && r.search.passages === 2 && r.search.items >= 2 && r.search2 === 1 && /^passages:2097학년도/.test(r.searchOpen), JSON.stringify(r.search) + ' ' + r.searchOpen);
  check('원본 조각 지우기 / 예전 저장분은 이름에서 시험 정보를 읽어 채움', r.dropImg && r.migrate === '{"name":"2098학년도 9월 모의평가 (고3)","kind":"모의평가","year":"2098","month":9,"grade":"고3"}', r.migrate);
  check('시험 삭제: 지문·문항·변형까지', r.del.n === 1 && r.del.left === 0 && r.del.variants === 0, JSON.stringify(r.del));
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
