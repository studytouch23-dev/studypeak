// smoke72: 단원 5단계 — 대단원 → 중단원 → 소단원 → 유형 → 상세유형, 스터디피크 기본 단원 DB(units-db.js),
//          단계별 추가·이름 바꾸기(문제도 이동)·삭제, CSV 양식·내보내기·불러오기(새 과목·단원까지), 기본 DB 합치기,
//          문제 상세·단건 등록의 소단원/유형/상세유형 선택, 문제 검색 왼쪽 트리로 좁히기, 카드 경로, 계정 설정 동기화 포함
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.type() === 'prompt' ? d.accept(globalThis.__ans || '') : d.accept());
  const ans = v => { globalThis.__ans = v; };

  const r = await page.evaluate(async () => {
    const out = {};
    // 이 테스트는 랩 세분류(units-db.js, 상세유형 포함)로 진행 — 스터디피크 유형표 기본값은 smoke73
    localStorage.setItem('sp-lab-units', JSON.stringify(unitsOwnPreset())); UNITS_CACHE = null;
    const U = parseUnitsDSL(window.SP_UNITS_DSL), keys = Object.keys(U), M = unitsPreset();
    let miss = 0, tot = 0; for(const s of Object.keys(PRESET_CURRICULUM)) for(const c of Object.keys(PRESET_CURRICULUM[s])) for(const x of PRESET_CURRICULUM[s][c]){ tot++; if(!M[ukey(s,c,x)] || !Object.keys(M[ukey(s,c,x)]).length) miss++; }
    out.db = { paths: keys.length, tot, miss, alias: JSON.stringify(U[ukey('대수','수열','등차수열')]) === JSON.stringify(U[ukey('수학Ⅰ','수열','등차수열')]),
      ex: U[ukey('수학Ⅰ','수열','등차수열')] && U[ukey('수학Ⅰ','수열','등차수열')]['등차수열'] && U[ukey('수학Ⅰ','수열','등차수열')]['등차수열']['일반항'] };
    // 문제
    const base = { answer:'1', solution:'s', subject:'수학Ⅰ', chapter:'수열', section:'등차수열', grade:'', srcType:'기출', srcName:'u', difficulty:3, tags:[], reviewed:true, images:[], choices:[], createdAt:1, updatedAt:1 };
    const ps = [ { ...base, id:'U1', question:'U1', subsection:'등차수열', utype:'일반항', udetail:'첫째항과 공차' },
                 { ...base, id:'U2', question:'U2', subsection:'등차수열', utype:'등차중항' },
                 { ...base, id:'U3', question:'U3', section:'등비수열' } ];
    for(const p of ps){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    // 단원태그 화면
    go('tags'); state.tagSubject = '수학Ⅰ'; state.tagChapter = '수열'; state.tagSection = '등차수열'; renderTags();
    const heads = [...document.querySelectorAll('#view-tags .cascade .col-h span:first-child')].map(x => x.textContent);
    const subs = [...document.querySelectorAll('#usub-list .col-item')].map(x => x.dataset.nm);
    const types = [...document.querySelectorAll('#utype-list .col-item')].map(x => x.dataset.nm + ':' + x.querySelector('.n').textContent);
    document.querySelector('#utype-list .col-item[data-nm="일반항"]').click();
    const dets = [...document.querySelectorAll('#udet-list .col-item')].map(x => x.dataset.nm + ':' + x.querySelector('.n').textContent);
    out.view = { heads, subs, types, dets, units: $('#tg-units').textContent };
    return out;
  });
  check('기본 단원 DB: 모든 중단원에 소단원·유형 (랩 세분류는 2022 과목에 같은 내용 복사)', r.db.miss === 0 && r.db.tot > 250 && r.db.alias && Array.isArray(r.db.ex), JSON.stringify(r.db));
  check('단원태그 화면 5단계 열', r.view.heads.join() === '대단원,중단원,소단원,유형,상세유형', r.view.heads.join());
  check('중단원 → 소단원 → 유형(문제 수) → 상세유형', r.view.subs.includes('등차수열') && r.view.types.includes('일반항:1') && r.view.types.includes('등차중항:1') && r.view.dets.some(d => /^첫째항과 공차:1$/.test(d)), JSON.stringify(r.view));
  check('통계에 깊은 단원까지 셈', +r.view.units > 50, r.view.units);

  // 단계별 추가·이름 바꾸기·삭제
  ans('공차가 음수인 경우'); await page.evaluate(() => unitDeepAdd(5));
  ans('항 구하기'); await page.evaluate(() => unitDeepRename(4, '일반항')); await page.waitForTimeout(200);
  const ed = await page.evaluate(async () => ({ dets: unitDetails('수학Ⅰ','수열','등차수열','등차수열','항 구하기'), u1: (await DB.get('problems','U1')).utype, saved: !!localStorage.getItem('sp-lab-units') }));
  check('추가·이름 바꾸기 (그 유형이 붙은 문제도 함께 이동, 저장)', ed.dets.includes('공차가 음수인 경우') && ed.u1 === '항 구하기' && ed.saved, JSON.stringify(ed));
  await page.evaluate(() => unitDeepDelete(4, '등차중항')); await page.waitForTimeout(200);
  const del = await page.evaluate(async () => ({ types: unitTypes('수학Ⅰ','수열','등차수열','등차수열'), u2: (await DB.get('problems','U2')).utype }));
  check('삭제 → 문제의 그 단계 태그 비움', !del.types.includes('등차중항') && del.u2 === '', JSON.stringify(del));
  ans('등차수열 기본'); await page.evaluate(() => renameSection('등차수열')); await page.waitForTimeout(300);
  const rs = await page.evaluate(() => ({ moved: unitSubs('수학Ⅰ','수열','등차수열 기본').includes('등차수열'), old: unitSubs('수학Ⅰ','수열','등차수열').length, sel: state.tagSection }));
  check('중단원 이름 바꾸면 아래 단계도 함께 옮겨짐', rs.moved && rs.old === 0 && rs.sel === '등차수열 기본', JSON.stringify(rs));

  // CSV
  const csv = await page.evaluate(async () => {
    const rows = unitsRows(), hasRow = rows.some(r => r.join('|') === '수학Ⅰ|수열|등차수열 기본|등차수열|항 구하기|공차가 음수인 경우');
    const text = '﻿과목,대단원,중단원,소단원,유형,상세유형\n학원 자체,함수 특강,"절댓값, 가우스",절댓값 함수,그래프 그리기,구간 나누기\n수학Ⅰ,수열,등차수열 기본,등차수열,항 구하기,새 상세\n';
    await unitsCsvImport(new File([text], 'u.csv', { type:'text/csv' }));
    return { hasRow, newSubj: !!CURRICULUM['학원 자체'] && CURRICULUM['학원 자체']['함수 특강'].includes('절댓값, 가우스'),
      deep: unitDetails('학원 자체','함수 특강','절댓값, 가우스','절댓값 함수','그래프 그리기'), merged: unitDetails('수학Ⅰ','수열','등차수열 기본','등차수열','항 구하기'),
      parsed: parseCsv('a,"b,c",d\n"x""y",2,3').map(r => r.join('|')).join(' / ') };
  });
  check('CSV 내보내기 줄(과목~상세유형)', csv.hasRow);
  check('CSV 불러오기: 새 과목·대단원·중단원까지 만들고 아래 단계 합침(쉼표·따옴표 처리)', csv.newSubj && csv.deep.join() === '구간 나누기' && csv.merged.includes('새 상세') && csv.merged.includes('공차가 음수인 경우') && csv.parsed === 'a|b,c|d / x"y|2|3', JSON.stringify(csv));
  const pre = await page.evaluate(() => { unitsDropPath(ukey('수학Ⅱ','미분','접선의 방정식')); const before = unitSubs('수학Ⅱ','미분','접선의 방정식').length; unitsLoadPreset(); return { before, after: unitSubs('수학Ⅱ','미분','접선의 방정식').length, kept: unitSubs('학원 자체','함수 특강','절댓값, 가우스').length }; });
  check('랩 세분류 합치기: 지운 것만 다시 채우고 내 것은 유지', pre.before === 0 && pre.after > 0 && pre.kept === 1, JSON.stringify(pre));

  // 문제 상세·단건 등록
  const det = await page.evaluate(async () => {
    await openDetail('U3');
    const has = ['e-sub','e-utype','e-udetail'].every(id => !!$('#'+id));
    $('#e-sub').value = $('#e-sub').options[1].value; $('#e-sub').dispatchEvent(new Event('change'));
    $('#e-utype').value = $('#e-utype').options[1].value; $('#e-utype').dispatchEvent(new Event('change'));
    const dOpt = $('#e-udetail').options.length;
    if(dOpt > 1) $('#e-udetail').value = $('#e-udetail').options[1].value;
    const want = [$('#e-sub').value, $('#e-utype').value, $('#e-udetail').value];
    await saveDetail('U3');
    const p = await DB.get('problems','U3');
    await openDetail('U3'); const again = [$('#e-sub').value, $('#e-utype').value, $('#e-udetail').value]; closeModal();
    go('add'); setAddMode('single'); $('#f-subject').value = '수학Ⅰ'; $('#f-subject').dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 50));
    const fSub = $('#f-sub').options.length;
    return { has, want, got: [p.subsection, p.utype, p.udetail], again, fSub };
  });
  check('문제 상세: 소단원·유형·상세유형 선택 → 저장 → 다시 열면 그대로', det.has && det.want[0] && det.want[1] && JSON.stringify(det.got) === JSON.stringify(det.want) && JSON.stringify(det.again) === JSON.stringify(det.want), JSON.stringify(det));
  check('단건 등록에도 소단원 선택', det.fSub > 1, det.fSub);

  // 문제 검색: 트리로 좁히기·카드 경로
  const tree = await page.evaluate(() => {
    go('db'); resetFilters(); state.treeTab = 'unit';
    $('#filter-subject').value = '수학Ⅰ'; $('#filter-subject').dispatchEvent(new Event('change'));
    document.querySelector('#tree-body [data-t="chapter"][data-v="수열"]').click();
    document.querySelector('#tree-body [data-t="usect"][data-v="등차수열 기본"]').click();
    const n1 = document.querySelectorAll('#plist .pcard').length;
    document.querySelector('#tree-body [data-t="usub"][data-v="등차수열"]').click();
    document.querySelector('#tree-body [data-t="utype"][data-v="항 구하기"]').click();
    const ids = [...document.querySelectorAll('#plist .pcard')].map(c => c.dataset.id);
    const card = document.querySelector('#plist .pcard[data-id="U1"]').textContent.replace(/\s+/g, ' ');
    resetFilters(); const all = document.querySelectorAll('#plist .pcard').length;
    return { n1, ids, card: /수학Ⅰ › 수열 › 등차수열 기본 › 등차수열 › 항 구하기/.test(card), all, sync: SETTINGS_KEYS.includes('sp-lab-units') };
  });
  check('왼쪽 트리: 중단원 → 소단원 → 유형으로 좁히기, 초기화로 풀림', tree.n1 === 2 && tree.ids.join() === 'U1' && tree.all === 3, JSON.stringify(tree));
  check('카드에 소단원·유형까지 경로', tree.card);
  check('단원 DB 도 계정 설정 동기화에 포함', tree.sync);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
