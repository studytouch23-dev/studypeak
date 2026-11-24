// smoke79: 국어 랩 화면 — 시험지 올리기(문제지 + 해설지) → 미리보기 → 저장 → 지문·작품 목록 → 세트 상세(밑줄·정답·해설·원본 보기)
//          → 🤖 띄어쓰기 다듬기(AI는 표시 자리만 0/1 로 답함) → 고치기 → 문제 검색 → 백업 내려받기·가져오기(악성 값 정리) → 전체 삭제
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
    const out = { menu: [...document.querySelectorAll('#sbnav button')].map(b => b.dataset.view).join() };
    go('upload');
    UP.examFile = file(exam, '2099 지어낸 모의.pdf'); UP.solFile = file(sol, '해설.pdf'); upAutoName();
    out.autoName = $('#up-name').value;
    await upRead();
    out.status = $('#up-status').textContent;
    out.preview = { sets: document.querySelectorAll('#up-preview details.pv').length, chips: [...document.querySelectorAll('#up-preview .chip')].map(c => c.textContent).join('|'),
      title: $('#up-preview details.pv summary').textContent.replace(/\s+/g, ' ') };
    await upSave();
    out.saved = { p: K.passages.length, i: K.items.length, view: K.view, cards: document.querySelectorAll('#view-passages .pcard').length,
      card: (document.querySelector('#view-passages .pcard') || {}).textContent.replace(/\s+/g, ' ') };
    const p = K.passages.find(x => x.title === '도시 열섬 현상');
    out.p = { cat: p.cat, sub: p.sub, genre: p.genre, theme: p.theme, src: p.src.name, range: p.range.join('~') };
    go('set', p.id);
    const el = $('#view-set');
    out.set = { u: el.querySelectorAll('.passage u').length, items: el.querySelectorAll('.qitem').length, ans: el.querySelector('.qitem .ch.ans').textContent.trim(),
      type: el.querySelector('.qitem .chip.t').textContent, types: itemsOf(p.id).map(i => i.typeId + (i.review ? '?' : '')).join(), exp: /정답 해설/.test(el.textContent), jm: el.querySelectorAll('.jm').length, bogi: !!el.querySelector('.qitem .view .vl'), polishBtn: ($('#btn-polish') || {}).textContent };
    K.showOrig = true; renderSet(); await new Promise(r => setTimeout(r, 400));
    out.orig = { imgs: el.querySelectorAll('.orig img').length, ok: [...el.querySelectorAll('.orig img')].every(i => /^data:image\/jpeg/.test(i.src)) };
    K.showOrig = false;
    // AI 다듬기: 스텁은 모든 자리를 '붙임'(0)으로 답함 → 표시가 사라지고 글자는 그대로
    localStorage.setItem('sp-lab-apikey', 'sk-ant-api03-test');
    let prompt = '';
    SPAI.json = async content => { prompt = content[0].text; const n = +(prompt.match(/정확히 (\d+)글자/) || [0, 0])[1]; return { j: '0'.repeat(n) }; };
    const before = KPDF.plain(p.body).replace(/\s/g, ''), joins = joinsOf(p);
    await polishSet(p.id);
    const p2 = K.passages.find(x => x.id === p.id);
    out.polish = { joins, after: joinsOf(p2), sameChars: KPDF.plain(p2.body).replace(/\s/g, '') === before, marks: /‹1›/.test(prompt) && !/[\uE000\uE001]/.test(prompt), chip: /띄어쓰기 확인 끝/.test($('#view-set').textContent) };
    SPAI.json = async () => ({ j: '01' });                       // 길이가 안 맞으면 아무것도 바꾸지 않음
    const q = K.passages.find(x => /봄/.test(x.title)); out.lit = { title: q.title, author: q.author, cat: q.cat, sub: q.sub, types: itemsOf(q.id).map(i => i.typeId).join() }; const qj = joinsOf(q);
    if(qj){ await polishSet(q.id); out.badLen = joinsOf(K.passages.find(x => x.id === q.id)) === qj; } else out.badLen = true;
    // 고치기
    go('set', p.id); K.editing = true; renderSet();
    $('#ed-title').value = '열섬 현상(고침)'; $('#ed-body').value = $('#ed-body').value + '\n덧붙인 문단.';
    document.querySelector('[data-edit] .e-ans').value = '②';
    await saveSetEdit();
    const p3 = K.passages.find(x => x.id === p.id);
    out.edit = { title: p3.title, body: /덧붙인 문단\.$/.test(p3.body), ans: itemsOf(p.id)[0].answer, shown: /열섬 현상\(고침\)/.test($('#view-set').textContent) };
    // 문제 검색
    go('items'); K.fi.kind = 'single'; renderItems();
    out.items = { single: document.querySelectorAll('#view-items .qitem').length, txt: /결재/.test($('#view-items').textContent) };
    K.fi.kind = ''; K.fi.q = '결제'; renderItems(); out.items.q = document.querySelectorAll('#view-items .qitem').length;
    K.fi.q = '현대시'; renderItems(); out.items.byPassage = document.querySelectorAll('#view-items .qitem').length; K.fi.q = '';
    // 백업 가져오기: 악성 값 정리
    window.__pwned = 0;
    const bad = { app: 'sp-korlab', version: 1, passages: [{ id: 'x<img src=x onerror=__pwned++>', title: '<img src=x onerror="window.__pwned++">', body: "'\"><img src=x onerror=window.__pwned++>", area: '독서', range: ['a', 3], src: { name: "s');window.__pwned++;('" } }],
      items: [{ id: 'bi1', passageId: 'x<img src=x onerror=__pwned++>', num: '7', stem: '<script>window.__pwned++</script>', choices: ['<img src=x onerror=window.__pwned++>', 5] }], images: [{ id: 'bi1', imgs: ['x" onerror="window.__pwned++', 'data:image/png;base64,iVBORw0KGgo='] }] };
    await importBackup(new File([JSON.stringify(bad)], 'b.json'));
    const bp = K.passages.find(x => /onerror/.test(x.title));
    go('set', bp.id); K.showOrig = true; renderSet(); await new Promise(r => setTimeout(r, 300)); K.showOrig = false;
    go('passages'); go('items');
    out.imp = { cat: bp.cat, pwned: window.__pwned, id: bp.id, linked: itemsOf(bp.id).length, img: ((await DB.get('images', 'bi1')) || { imgs: [] }).imgs.length, n: K.passages.length };
    await wipeAll();
    out.wiped = [K.passages.length, K.items.length, (await DB.all('images')).length].join();
    return out;
  }, { exam, sol });

  check('메뉴: 대시보드·지문·작품·시험지 올리기·문제 검색·변형·학습지·백업', r.menu === 'dash,passages,upload,items,export,variant,sheet,data', r.menu);
  check('파일 이름으로 시험 이름 자동 입력', r.autoName === '2099 지어낸 모의', r.autoName);
  check('읽기: 지문 2 · 문항 6 · 정답 6 미리보기', /지문 2개 · 문항 6개/.test(r.status) && r.preview.sets === 3 && /지문 2\|문항 6\|정답 6/.test(r.preview.chips), r.status + ' / ' + r.preview.chips);
  check('미리보기 제목에 해설지의 영역·제목', /\[1~3\] 독서 · 과학\/기술 — 도시 열섬 현상/.test(r.preview.title), r.preview.title);
  check('저장 → 지문·작품 목록(카드 2장)으로', r.saved.p === 2 && r.saved.i === 6 && r.saved.view === 'passages' && r.saved.cards === 2 && /문항 3/.test(r.saved.card), r.saved.card);
  check('지문에 대분류·소분류(LMS 값)·갈래·주제·출처·범위', r.p.cat === '독서' && r.p.sub === '과학/기술' && r.p.genre === '과학' && /원인/.test(r.p.theme) && r.p.src === '2099 지어낸 모의' && r.p.range === '1~3', JSON.stringify(r.p));
  check('세트 상세: 밑줄, 문항 3개, 정답 강조, 유형, 해설, <보기>', r.set.u >= 1 && r.set.items === 3 && /^③/.test(r.set.ans) && /^R01 세부 정보 파악/.test(r.set.type) && r.set.types === 'R01,R06,R09' && r.set.exp && r.set.bogi, JSON.stringify(r.set));
  check('줄 이음 추정 자리 표시(주황 점)와 다듬기 버튼', r.set.jm > 0 && /띄어쓰기 다듬기/.test(r.set.polishBtn || ''), r.set.jm + ' ' + r.set.polishBtn);
  check('원본 보기: 지문 조각 + 문항 조각 그림', r.orig.imgs >= 4 && r.orig.ok, r.orig.imgs);
  check('AI 다듬기: 표시 자리만 바뀌고 글자는 그대로, 표시가 모두 사라짐', r.polish.joins > 0 && r.polish.after === 0 && r.polish.sameChars && r.polish.marks && r.polish.chip, JSON.stringify(r.polish));
  check('문학 지문: 제목은 작가 「작품」, 작성자, 소분류, 유형 어림', r.lit.title === '지어낸 시 「봄」' && r.lit.author === '지어낸 시' && r.lit.cat === '문학' && r.lit.sub === '현대시' && r.lit.types === 'L03,L05', JSON.stringify(r.lit));
  check('AI 답 길이가 안 맞으면 아무것도 바꾸지 않음', r.badLen);
  check('고치기: 제목·지문·정답 저장', r.edit.title === '열섬 현상(고침)' && r.edit.body && r.edit.ans === '②' && r.edit.shown, JSON.stringify(r.edit));
  check('문제 검색: 단독 문항만 / 낱말 검색 / 지문 갈래로 검색', r.items.single === 1 && r.items.txt && r.items.q === 1 && r.items.byPassage === 2, JSON.stringify(r.items));
  check('백업 가져오기: 스크립트 실행 없음, id 정리·문항 연결 유지, 그림은 data:image 만', r.imp.pwned === 0 && r.imp.cat === '독서' && !/[<>\s]/.test(r.imp.id) && r.imp.linked === 1 && r.imp.img === 1, JSON.stringify(r.imp));
  check('전체 삭제', r.wiped === '0,0,0', r.wiped);
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
