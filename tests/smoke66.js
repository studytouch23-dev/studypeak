// smoke66: 📅 올린 날짜로 문제 찾기 — 오늘·어제·최근 7일·30일·이번 달·날짜별(문항 수)·기간 직접 선택, 왼쪽 [📅 날짜] 탭,
//          다른 필터와 함께, 필터 초기화·내 검색 필터 저장에 포함
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
    const DAY = 86400000, noon = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime(); })();
    const base = { answer:'1', solution:'', subject:'수학Ⅰ', chapter:'수열', section:'', grade:'', srcType:'기출', srcName:'s', difficulty:3, tags:[], reviewed:true, images:[], choices:[] };
    const mk = (id, ago, extra) => ({ ...base, id, question:id, createdAt: noon - ago*DAY, updatedAt: noon - ago*DAY, ...(extra||{}) });
    const ps = [ mk('T0a', 0), mk('T0b', 0, { subject:'수학Ⅱ', chapter:'미분' }), mk('Y1', 1), mk('D3', 3), mk('D10', 10), mk('D40', 40) ];
    for(const p of ps){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    go('db'); resetFilters();
    const ids = () => [...document.querySelectorAll('#plist .pcard')].map(c => c.dataset.id).sort().join(',');
    const set = v => { $('#filter-date').value = v; $('#filter-date').dispatchEvent(new Event('change')); return ids(); };
    const out = {};
    const opts = [...$('#filter-date').options].map(o => o.value);
    out.opts = ['today','yesterday','7d','30d','month','range'].every(v => opts.includes(v)) && opts.filter(v => v.startsWith('d:')).length === 5;
    const todayKey = dayKey(noon), d3Key = dayKey(noon - 3*DAY);
    out.dayLabel = [...$('#filter-date').options].find(o => o.value === 'd:'+todayKey).textContent;
    out.today = set('today'); out.count = $('#db-count').textContent;
    out.yesterday = set('yesterday'); out.w7 = set('7d'); out.d30 = set('30d'); out.day3 = set('d:'+d3Key);
    // 다른 필터와 함께
    set('today'); $('#filter-subject').value = '수학Ⅱ'; $('#filter-subject').dispatchEvent(new Event('change')); out.withSub = ids();
    // 기간 직접 선택
    resetFilters(); set('range'); out.rangeShown = $('#filter-range').style.display !== 'none';
    const iso = t => dayKey(t);
    $('#filter-from').value = iso(noon - 12*DAY); $('#filter-to').value = iso(noon - 2*DAY); $('#filter-to').dispatchEvent(new Event('change'));
    out.range = ids();
    // 필터 초기화
    resetFilters(); out.reset = ids().split(',').length; out.rangeHidden = $('#filter-range').style.display === 'none';
    // 왼쪽 날짜 탭
    document.querySelector('#tree-tabs button[data-tab="date"]').click();
    const items = [...document.querySelectorAll('#tree-body .titem')].map(x => x.textContent.replace(/\s+/g, ' ').trim());
    document.querySelector(`#tree-body .titem[data-v="${d3Key}"]`).click(); out.treePick = ids(); out.treeSel = $('#filter-date').value;
    document.querySelector(`#tree-body .titem[data-v="${d3Key}"]`).click(); out.treeUnpick = ids().split(',').length;
    out.items = items;
    // 내 검색 필터 저장
    set('7d');
    window.prompt = () => '이번주'; savePreset();
    resetFilters();
    const pi = getPresets().findIndex(p => p.name === '이번주'); applyPreset(pi);
    out.preset = $('#filter-date').value + ' ' + ids();
    return out;
  });
  check('날짜 메뉴: 오늘·어제·최근 7일·30일·이번 달·기간 직접 + 날짜별', r.opts, r.dayLabel);
  check('날짜별 항목에 요일·문항 수', /\(\S\) — 2문항$/.test(r.dayLabel), r.dayLabel);
  check('오늘', r.today === 'T0a,T0b' && /📅 오늘 올린 문제/.test(r.count), r.today + ' | ' + r.count);
  check('어제 · 최근 7일 · 최근 30일 · 특정 날짜', r.yesterday === 'Y1' && r.w7 === 'D3,T0a,T0b,Y1' && r.d30 === 'D10,D3,T0a,T0b,Y1' && r.day3 === 'D3', [r.yesterday, r.w7, r.d30, r.day3].join(' | '));
  check('다른 필터(과목)와 함께', r.withSub === 'T0b', r.withSub);
  check('기간 직접 선택 (12일 전 ~ 2일 전)', r.rangeShown && r.range === 'D10,D3', r.range);
  check('필터 초기화로 날짜 필터도 해제', r.reset === 6 && r.rangeHidden, r.reset);
  check('왼쪽 [📅 날짜] 탭: 날짜별 개수, 누르면 그 날짜만 · 다시 누르면 해제', r.items.length === 5 && /2$/.test(r.items[0]) && r.treePick === 'D3' && r.treeUnpick === 6, JSON.stringify(r.items));
  check('내 검색 필터 저장·불러오기에 날짜 포함', r.preset === '7d D3,T0a,T0b,Y1', r.preset);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
