// smoke68: 새 화면 구조 — 사이드바 그룹(태그 관리·문제 DB 관리·AI 작업, 접고 펴기), 상단 제목 '그룹 | 화면',
//          태그 관리 하위 탭(단원태그·출처태그·나만의태그), 출처태그(유형 → 이름 → 연도, 이름 바꾸기·합치기·유형 바꾸기·지우기),
//          나만의태그(태그 그룹 단일/복수·필수, 문제 상세 버튼, 저장 시 필수 확인, 태그 이름 바꾸기·지우기),
//          변형문항 생성 내역(언제·원본·개수·설정, 찾기·기간·종류, 여러 내역 선택 → 교재/만든 문제만 담기)
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let confirmOK = true;
  page.on('dialog', d => d.type() === 'prompt' ? d.accept(globalThis.__promptAns || '') : (d.type() === 'confirm' ? (confirmOK ? d.accept() : d.dismiss()) : d.accept()));
  const prompt = async v => { globalThis.__promptAns = v; };

  // 데이터
  await page.evaluate(async () => {
    const base = { answer:'1', solution:'s', subject:'수학Ⅰ', chapter:'수열', section:'', grade:'', difficulty:3, reviewed:true, images:[], choices:[] };
    const now = Date.now(), DAY = 86400000;
    const ps = [
      { ...base, id:'A1', question:'A1', srcType:'기출', srcName:'10월 모의고사', srcYear:'2025', origNo:'1', tags:['객관식'], createdAt: now - 40*DAY },
      { ...base, id:'A2', question:'A2', srcType:'기출', srcName:'10월모의', srcYear:'2025', origNo:'2', tags:['검수주의'], createdAt: now - 40*DAY },
      { ...base, id:'B1', question:'B1', srcType:'교재', srcName:'쎈', srcYear:'', origNo:'7', tags:[], createdAt: now - 40*DAY },
      // 내역 1 (오래전): A1 → 쌍둥이 2 / 내역 2 (최근): A2 → 쌍둥이 1·변형 1
      { ...base, id:'T1', question:'T1', twinOf:'A1', twinKind:'쌍둥이', twinNo:1, origNo:'1', srcType:'AI변형', srcName:'10월 모의고사 쌍둥이·변형', batch:'bOLD', batchName:'10월 쌍둥이 (예전)', tags:['쌍둥이'], createdAt: now - 20*DAY },
      { ...base, id:'T2', question:'T2', twinOf:'A1', twinKind:'쌍둥이', twinNo:2, origNo:'1', srcType:'AI변형', srcName:'10월 모의고사 쌍둥이·변형', batch:'bOLD', batchName:'10월 쌍둥이 (예전)', tags:['쌍둥이'], createdAt: now - 20*DAY + 1000 },
      { ...base, id:'T3', question:'T3', twinOf:'A2', twinKind:'쌍둥이', twinNo:1, origNo:'2', srcType:'AI변형', srcName:'s', batch:'bNEW', batchName:'10월모의 쌍둥이·변형', tags:['쌍둥이'], twinStyle:'실생활 상황으로', createdAt: now - DAY },
      { ...base, id:'V3', question:'V3', twinOf:'A2', twinKind:'변형', twinNo:1, origNo:'2', srcType:'AI변형', srcName:'s', batch:'bNEW', batchName:'10월모의 쌍둥이·변형', tags:['변형'], twinStyle:'실생활 상황으로', createdAt: now - DAY + 1000 },
    ];
    for(const p of ps){ p.updatedAt = p.createdAt; await saveProblem(p); state.problems.push(lightenProblem(p)); }
    saveTwinRunMeta('bNEW', { opts:{ twin:1, variant:1, diff:'harder' }, ms: 5*60000, repaired:1, rejected:2 });
  });

  // ── 사이드바·제목·하위 탭 ──
  const nav = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('#sbnav .ng')].map(g => g.querySelector('.ng-head').textContent.replace('▾','').trim() + ':' + [...g.querySelectorAll('button[data-view]')].map(b => b.textContent.replace(/\d+/g,'').trim()).join('/'));
    const head = document.querySelector('#sbnav .ng[data-ng="tag"] .ng-head'); head.click(); const closed = document.querySelector('#sbnav .ng[data-ng="tag"]').classList.contains('closed');
    go('srctags'); const reopened = !document.querySelector('#sbnav .ng[data-ng="tag"]').classList.contains('closed');
    const title = $('#topbar-title').textContent.replace(/\s+/g, ' ');
    const sub = [...document.querySelectorAll('#view-srctags .subtabs button')].map(b => (b.classList.contains('on') ? '*' : '') + b.textContent);
    [...document.querySelectorAll('#view-srctags .subtabs button')].find(b => b.textContent === '나만의태그').click();
    const onMy = $('#view-mytags').classList.contains('active');
    return { groups, closed, reopened, title, sub, onMy, active: document.querySelector('#sbnav button.active').dataset.view };
  });
  check('사이드바 그룹: 태그 관리(단원·출처·나만의) · 문제 DB 관리 · AI 작업(변형문항 생성 내역)', nav.groups.join(' | ') === '태그 관리:단원태그/출처태그/나만의태그 | 문제 DB 관리:문제 등록/문제 검색·작업/학습지 생성·관리 | AI 작업:AI 문제 생성/변형문항 생성 내역', nav.groups.join(' | '));
  check('그룹 접기 → 그 그룹 화면으로 가면 다시 펼침', nav.closed && nav.reopened);
  check('상단 제목 "태그 관리 | 출처태그"', nav.title === '태그 관리출처태그' || nav.title === '태그 관리 출처태그', nav.title);
  check('태그 관리 하위 탭 3개, 누르면 이동', JSON.stringify(nav.sub) === '["단원태그","*출처태그","나만의태그"]' && nav.onMy && nav.active === 'mytags', JSON.stringify(nav.sub));

  // ── 출처태그 ──
  const src1 = await page.evaluate(() => { go('srctags');
    const types = [...document.querySelectorAll('#srct-list .col-item')].map(x => x.textContent.replace(/\s+/g,' ').trim());
    document.querySelector('#srcn-list .col-item[data-sn="10월모의"]').click();
    const years = $('#srcy-list').textContent.replace(/\s+/g, ' ');
    return { types, years, sel: state.srcSel }; });
  check('출처 유형별 문제 수', src1.types.includes('기출2') && src1.types.includes('교재1') && src1.types.includes('AI변형4'), JSON.stringify(src1.types));
  check('출처 이름 → 연도·할 일', /20251/.test(src1.years) && /이 출처 문제 보기/.test(src1.years) && /이름 바꾸기/.test(src1.years), src1.years.slice(0, 120));
  await prompt('10월 모의고사');
  await page.evaluate(() => srcRename()); await page.waitForTimeout(200);
  const src2 = await page.evaluate(() => ({ names: [...document.querySelectorAll('#srcn-list .col-item')].map(x => x.textContent.replace(/\s+/g,' ').trim()), a2: state.problems.find(p => p.id === 'A2').srcName }));
  check('이름 바꾸기 = 같은 이름이면 합쳐짐', src2.a2 === '10월 모의고사' && src2.names.join() === '10월 모의고사2', JSON.stringify(src2));
  await page.evaluate(() => { state.srcSel = { type:'교재', name:'쎈' }; }); await prompt('학원 자체');
  await page.evaluate(() => srcChangeType()); await page.waitForTimeout(200);
  const src3 = await page.evaluate(async () => ({ t: (await DB.get('problems', 'B1')).srcType, list: srcTypeList().includes('학원 자체'), sel: [...$('#e-srctype') ? [] : []] }));
  check('유형 바꾸기 (새 유형도 목록에)', src3.t === '학원 자체' && src3.list, JSON.stringify(src3));
  await page.evaluate(() => { state.srcSel = { type:'학원 자체', name:'쎈' }; srcClear(); }); await page.waitForTimeout(200);
  const src4 = await page.evaluate(async () => (await DB.get('problems', 'B1')).srcName);
  check('출처 이름 지우기 (문제는 남음)', src4 === '', src4);

  // ── 나만의태그 ──
  const my = await page.evaluate(async () => {
    go('mytags');
    const empty = $('#tgroup-table').textContent.includes('예시 그룹 넣기');
    addTagGroupExamples();
    editTagGroup(-1); $('#tg-name').value = '오답 유형'; document.querySelector('input[name="tg-mode"][value="single"]').checked = true; $('#tg-req').checked = true; $('#tg-items').value = '계산 실수, 개념 부족\n조건 놓침'; saveTagGroup(-1);
    const rows = [...document.querySelectorAll('#tgroup-table tr')].slice(1).map(r => r.textContent.replace(/\s+/g, ' ').trim());
    moveTagGroup(2, -1); const order = tagGroups().map(g => g.name).join(',');
    // 문제 상세: 버튼으로 태그, 단일 선택은 하나만
    await openDetail('A1');
    const btn = v => document.querySelector(`#e-tgroups button[data-tv="${v}"]`);
    btn('계산 실수').click(); btn('조건 놓침').click(); btn('서술형').click();
    const tagsVal = $('#e-tags').value;
    return { empty, rows, order, tagsVal, hasGroups: !!$('#e-tgroups') };
  });
  check('태그 그룹이 없으면 예시 넣기 버튼', my.empty);
  check('그룹 표: 이름·입력 방식·필수·하위 태그', my.rows.length === 3 && /오답유형단일선택✓필수계산실수개념부족조건놓침/.test(my.rows[2].replace(/\s+/g,'')) && /문항형식복수선택선택객관식/.test(my.rows[0].replace(/\s+/g,'')), JSON.stringify(my.rows));
  check('↑ 로 순서 바꾸기', my.order === '문항형식,오답 유형,출제의도', my.order);
  check('문제 상세: 그룹 버튼(단일은 하나만, 복수는 여러 개)', my.hasGroups && my.tagsVal === '객관식, 조건 놓침, 서술형', my.tagsVal);
  confirmOK = false;
  const req = await page.evaluate(async () => { await openDetail('A2'); await saveDetail('A2'); const stillOpen = $('#modal-bg').classList.contains('show'); closeModal(); return stillOpen; });
  confirmOK = true;
  check('필수 그룹을 안 고르면 저장 전에 확인 (취소하면 저장 안 함)', req === true);
  await prompt('검수필요');
  const ren = await page.evaluate(async () => { go('mytags'); await tagRename('검수주의'); await tagRemoveAll('쌍둥이'); const t = await DB.get('problems', 'A2'); const t1 = await DB.get('problems', 'T1');
    return { a2: t.tags, t1: t1.tags, free: $('#freetag-list').textContent.includes('검수필요') }; });
  check('태그 이름 바꾸기·모두 지우기', ren.a2.includes('검수필요') && !ren.a2.includes('검수주의') && !ren.t1.includes('쌍둥이') && ren.free, JSON.stringify(ren));

  // ── 변형문항 생성 내역 ──
  const th = await page.evaluate(() => {
    go('twinhist');
    const cards = () => [...document.querySelectorAll('#th-list .th-run')].map(c => c.textContent.replace(/\s+/g, ' ').trim());
    const all = cards(), stats = ['st-th-runs','st-th-made','st-th-srcs'].map(id => $('#'+id).textContent);
    $('#th-period').value = '7'; $('#th-period').dispatchEvent(new Event('change')); const recent = cards().length;
    $('#th-period').value = ''; $('#th-kind').value = '변형'; $('#th-kind').dispatchEvent(new Event('change')); const withVar = cards().length;
    $('#th-kind').value = ''; $('#th-q').value = '실생활'; $('#th-q').dispatchEvent(new Event('input')); const byStyle = cards().length;
    $('#th-q').value = ''; $('#th-q').dispatchEvent(new Event('input'));
    document.querySelectorAll('#th-list .th-run input[type=checkbox]').forEach(c => { c.checked = true; c.dispatchEvent(new Event('change')); });
    const bar = $('#th-bar').textContent.replace(/\s+/g, ' ');
    [...document.querySelectorAll('#th-bar button')].find(b => b.textContent.includes('원본 + 쌍둥이·변형')).click();
    const book = cartList().map(p => p.id).join(',');
    go('twinhist'); document.querySelectorAll('#th-list .th-run input[type=checkbox]')[0].click();
    [...document.querySelectorAll('#th-bar button')].find(b => b.textContent.includes('만든 문제만')).click();
    const onlyKids = cartList().map(p => p.id).join(',');
    return { all, stats, recent, withVar, byStyle, bar, book, onlyKids, view: document.querySelector('.view.active').id };
  });
  check('내역: 최근 순, 언제·이름·쌍둥이/변형/원본 수·원본 번호·설정·요청', th.all.length === 2 && /10월모의쌍둥이·변형쌍둥이1변형1원본1/.test(th.all[0].replace(/\s+/g,'')) && /원본당 쌍둥이 1 · 변형 1 · 난이도 조금 어렵게 · 걸린 시간 5분 · 바로잡음 1 · 버리고 다시 2/.test(th.all[0]) && /요청: 실생활/.test(th.all[0]) && /설정 기록 없음/.test(th.all[1]), th.all[0].slice(0, 220));
  check('통계: 생성 2회 · 만든 문제 4 · 원본 2', th.stats.join() === '2,4,2', th.stats.join());
  check('찾기·기간·종류 필터', th.recent === 1 && th.withVar === 1 && th.byStyle === 1, [th.recent, th.withVar, th.byStyle].join());
  check('여러 내역 선택 → 원본 + 쌍둥이·변형으로 교재 (예전 것부터)', /선택한 내역 2개 · 만든 문제 4개/.test(th.bar) && th.book === 'A1,T1,T2,A2,T3,V3' && th.view === 'view-sheet', th.book);
  check('만든 문제만 담기', th.onlyKids === 'T3,V3', th.onlyKids);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
