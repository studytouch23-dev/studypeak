// smoke61: 사용성 개선 — 대시보드 '이어서 하기'(할 일·최근 묶음 바로 가기), 문제 상세 미리보기(고치면 바로 바뀜),
//          ← → 이전/다음·Esc 닫기 단축키, AI변형 출처 유형이 저장 때 '기출'로 바뀌던 문제
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  const empty = await page.evaluate(() => { go('dashboard'); return $('#dash-cont').style.display; });
  check('문제가 없으면 이어서 하기 숨김', empty === 'none');

  const r = await page.evaluate(async () => {
    const base = { solution:'풀이', answer:'3', subject:'수학Ⅰ', chapter:'지수함수와 로그함수', section:'', grade:'고2', srcType:'기출', srcName:'11월 모의고사', srcYear:'', difficulty:3, tags:[], reviewed:true, batch:'bA', batchName:'11월 모의고사 · 11/01 09:00', images:[], choices:[] };
    const now = Date.now();
    const ps = [
      { ...base, id:'A1', origNo:'1', question:'A1 $x^2$ 문제', createdAt:now+1 },
      { ...base, id:'A2', origNo:'2', question:'A2 문제', reviewed:false, createdAt:now+2 },
      { ...base, id:'A3', origNo:'3', question:'A3 문제', solution:'', answer:'', createdAt:now+3 },
      { ...base, id:'T1', origNo:'1', question:'T1 쌍둥이', twinOf:'A1', twinKind:'쌍둥이', twinNo:1, srcType:'AI변형', srcName:'11월 모의고사 쌍둥이·변형', batch:'bT', batchName:'11월 쌍둥이·변형', tags:['쌍둥이','AI생성','검수주의'], createdAt:now+10 },
    ];
    for(const p of ps){ p.updatedAt = p.createdAt; await saveProblem(p); state.problems.push(lightenProblem(p)); }
    go('dashboard');
    const card = $('#dash-cont'), txt = card.textContent;
    const out = { shown: card.style.display, txt: txt.replace(/\s+/g, ' ').slice(0, 400) };
    // 할 일 → 필터된 목록
    const todo = t => [...document.querySelectorAll('#dash-cont .dash-todo button')].find(b => b.textContent.includes(t));
    todo('미검수').click(); out.unrev = [...document.querySelectorAll('#plist .pcard')].map(c => c.dataset.id);
    go('dashboard'); todo('정답·해설 없는').click(); out.noSol = [...document.querySelectorAll('#plist .pcard')].map(c => c.dataset.id); out.noSolLabel = $('#db-count').textContent;
    go('dashboard'); todo('확인 필요').click(); out.check = [...document.querySelectorAll('#plist .pcard')].map(c => c.dataset.id);
    resetFilters(); out.afterReset = document.querySelectorAll('#plist .pcard').length;
    // 최근 묶음 버튼
    go('dashboard');
    const row = [...document.querySelectorAll('#dash-cont .bt')].find(x => x.textContent.includes('11월 쌍둥이·변형'));
    out.twinRowBtns = [...row.querySelectorAll('button')].map(b => b.textContent.trim());
    [...row.querySelectorAll('button')].find(b => b.textContent.includes('원본별로 보기')).click();
    out.grouped = $('#db-twinview').checked && document.querySelectorAll('#plist .tgroup').length === 1;
    go('dashboard');
    const row2 = [...document.querySelectorAll('#dash-cont .bt')].find(x => x.textContent.includes('11월 모의고사 ·'));
    [...row2.querySelectorAll('button')].find(b => b.textContent.trim() === '보기').click();
    out.batchView = $('#filter-batch').value === 'bA' && document.querySelectorAll('#plist .pcard').length === 3;
    // 상세 미리보기
    resetFilters();
    openDetail('T1');
    out.prev0 = $('#e-prev').textContent;
    $('#e-question').value = 'T1 고친 본문 $y=2x$'; $('#e-question').dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 350));
    out.prev1 = $('#e-prev').textContent;
    out.srcSel = $('#e-srctype').value;
    await saveDetail('T1');
    out.saved = (await DB.get('problems', 'T1')).srcType;
    return out;
  });
  check('이어서 하기: 할 일(미검수·해설 없음·확인 필요) + 최근 묶음', r.shown === 'block' && /미검수 1개/.test(r.txt) && /정답·해설 없는 문제 1개/.test(r.txt) && /확인 필요 1개/.test(r.txt) && /11월 쌍둥이·변형/.test(r.txt), r.txt);
  check('할 일 → 해당 문제만 목록에', JSON.stringify(r.unrev) === '["A2"]' && JSON.stringify(r.noSol) === '["A3"]' && /정답·해설 없는 문제만/.test(r.noSolLabel) && JSON.stringify(r.check) === '["T1"]', JSON.stringify([r.unrev, r.noSol, r.check]));
  check('필터 초기화로 할 일 필터 해제', r.afterReset === 4, r.afterReset);
  check('쌍둥이 묶음 줄: [원본별로 보기]·[교재로], 누르면 원본별 묶어 보기', r.twinRowBtns.some(t => t.includes('교재로')) && r.grouped, JSON.stringify(r.twinRowBtns));
  check('묶음 [보기] → 그 묶음 목록', r.batchView);
  check('상세 미리보기: 처음 열 때 본문, 고치면 바로 바뀜', /T1 쌍둥이/.test(r.prev0) && /T1 고친 본문/.test(r.prev1), r.prev1);
  check('AI변형 출처 유형이 그대로 저장 (기출로 바뀌지 않음)', r.srcSel === 'AI변형' && r.saved === 'AI변형', r.srcSel + ' / ' + r.saved);

  // 단축키
  await page.evaluate(() => { resetFilters(); openDetail(state.viewList[0]); });
  const id0 = await page.evaluate(() => $('#modal-body h3').textContent);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  const id1 = await page.evaluate(() => $('#modal-body h3').textContent);
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100);
  const id2 = await page.evaluate(() => $('#modal-body h3').textContent);
  await page.focus('#e-question'); await page.keyboard.press('ArrowRight');
  const stay = await page.evaluate(() => $('#modal-body h3').textContent);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const closed = await page.evaluate(() => !$('#modal-bg').classList.contains('show'));
  check('→ 다음 문제, ← 이전 문제', id1 !== id0 && id2 === id0, [id0, id1, id2].map(s => s.slice(0, 20)).join(' | '));
  check('글 쓰는 칸에서는 화살표가 커서 이동만', stay === id2);
  check('Esc 로 닫기', closed);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
