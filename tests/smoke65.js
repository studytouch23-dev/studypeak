// smoke65: 카드·상세에 만든 시각(·수정 시각), 원본별 묶어 보기의 묶음 선택 버튼(묶음마다 모두 선택·쌍둥이만·변형만·모두 해제,
//          위쪽 '묶음 전체' 줄: 모두·쌍둥이·변형만·쌍둥이만·변형만·원본만·모두 해제), 선택 n/m 표시, '연속' 단서
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
    const t0 = new Date(new Date().getFullYear(), 9, 28, 14, 32, 5).getTime();
    const base = { answer:'1', solution:'s', subject:'수학Ⅱ', chapter:'함수의 극한과 연속', section:'', grade:'', srcType:'기출', srcName:'test', srcYear:'', difficulty:3, tags:[], reviewed:true, batch:'bG', batchName:'g', images:[], choices:[] };
    const ps = [];
    for(const n of [4, 5]){
      ps.push({ ...base, id:'O'+n, origNo:String(n), question:'원본 '+n, createdAt:t0+n, updatedAt:t0+n });
      ps.push({ ...base, id:'T'+n, origNo:String(n), question:'쌍둥이 '+n, twinOf:'O'+n, twinKind:'쌍둥이', twinNo:1, createdAt:t0+100+n, updatedAt:t0+100+n });
      ps.push({ ...base, id:'V'+n+'a', origNo:String(n), question:'변형 a '+n, twinOf:'O'+n, twinKind:'변형', twinNo:1, createdAt:t0+200+n, updatedAt:t0+200+n });
      ps.push({ ...base, id:'V'+n+'b', origNo:String(n), question:'변형 b '+n, twinOf:'O'+n, twinKind:'변형', twinNo:2, createdAt:t0+300+n, updatedAt: t0+300+n + 3*3600*1000 });
    }
    for(const p of ps){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    clearCart(); go('db'); resetFilters(); $('#db-twinview').checked = true; renderDB();
    const card = id => document.querySelector(`#plist .pcard[data-id="${id}"] .pc-date`).textContent.trim();
    const dates = { o4: card('O4'), v4b: card('V4b') };
    const grp = n => [...document.querySelectorAll('#plist .tgroup')].find(g => g.querySelector('.tg-no').textContent === n+'번');
    const btn = (el, t) => [...el.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(t));
    const cart = () => cartList().map(p => p.id).join(',');
    const out = { dates, bar: !!document.querySelector('#plist .tg-allbar'), sel0: grp(4).querySelector('.tg-sel').textContent };
    btn(grp(4), '쌍둥이만').click(); out.twinOnly = cart();
    btn(grp(4), '변형만').click(); out.plusVar = cart();
    btn(grp(4), '☑ 모두 선택').click(); out.all4 = cart(); out.sel4 = grp(4).querySelector('.tg-sel').textContent;
    btn(grp(4), '☐ 모두 해제').click(); out.none4 = cart();
    const bar = () => document.querySelector('#plist .tg-allbar');
    btn(bar(), '☑ 원본+쌍둥이·변형 모두 선택').click(); out.allAll = cart();
    btn(bar(), '☐ 모두 해제').click(); out.noneAll = cart();
    btn(bar(), '쌍둥이·변형만').click(); out.kids = cart();
    clearCart(); btn(bar(), '원본만').click(); out.origs = cart();
    clearCart(); btn(bar(), '변형만').click(); out.vars = cart();
    clearCart();
    await openDetail('V4b'); out.det = $('#modal-body h3').textContent.replace(/\s+/g, ' '); closeModal();
    out.clue = [unitKeywordOk('x=1에서 연속일 때', { chapter:'수열' }), unitKeywordOk('x=1에서 연속일 때', { chapter:'함수의 극한과 연속' })];
    return out;
  });
  check('카드에 만든 시각 (10.28 14:32)', r.dates.o4 === '🕒 10.28 14:32', r.dates.o4);
  check('수정했으면 수정 시각도', /^🕒 10\.28 14:32 · 수정 10\.28 17:32$/.test(r.dates.v4b), r.dates.v4b);
  check('상세 화면에 만든·수정 시각 (초까지)', /만든 시각 \d{4}\.10\.28 14:32:05 · 수정 \d{4}\.10\.28 17:32:05/.test(r.det), r.det);
  check('묶음마다 선택 n/m, 위쪽 묶음 전체 줄', r.bar && r.sel0 === '선택 0/4', r.sel0);
  check('묶음: 쌍둥이만 → 변형만 추가', r.twinOnly === 'T4' && r.plusVar === 'T4,V4a,V4b', r.plusVar);
  check('묶음: 모두 선택(원본 포함) · 선택 4/4 · 모두 해제', r.all4 === 'T4,V4a,V4b,O4' && r.sel4 === '선택 4/4' && r.none4 === '', r.all4);
  check('전체: 모두 선택 = 원본 → 쌍둥이 → 변형 순, 모두 해제', r.allAll === 'O4,T4,V4a,V4b,O5,T5,V5a,V5b' && r.noneAll === '', r.allAll);
  check('전체: 쌍둥이·변형만 / 원본만 / 변형만', r.kids === 'T4,V4a,V4b,T5,V5a,V5b' && r.origs === 'O4,O5' && r.vars === 'V4a,V4b,V5a,V5b', [r.kids, r.origs, r.vars].join(' | '));
  check("'연속' 단서: 수열로 분류되면 다시 묻기", JSON.stringify(r.clue) === '[false,true]', JSON.stringify(r.clue));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
