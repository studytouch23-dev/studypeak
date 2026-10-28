// smoke62: 쌍둥이·변형 만들 때 원본에 정답·해설이 없으면 먼저 채우기 — 정답 없으면 풀고 독립 검산(다르면 한 번 더, 그래도 다르면 #검산불일치),
//          정답만 있으면 그 정답에 맞는 풀이만, 본문이 잘렸으면 #본문확인, 해설 이미지가 있으면 해설은 둠, 끄면 안 채움, 실황 칩·창 안내
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
    const base = { choices:[], subject:'수학Ⅰ', chapter:'삼각함수', section:'', grade:'고2', srcType:'기출', srcName:'10월 모의고사', srcYear:'', difficulty:3, tags:[], reviewed:true, batch:'bF', batchName:'10월 · 10/27', images:[] };
    const now = Date.now();
    const src = [
      { ...base, id:'NA', origNo:'1', question:'CASE_NA 방정식의 모든 해의 합이 $k\\pi$ 일 때 $k$ 는?', answer:'', solution:'' },     // 정답·해설 없음, 검산 일치
      { ...base, id:'AO', origNo:'2', question:'CASE_AO 문제', answer:'7', solution:'' },                                                 // 정답만 있음
      { ...base, id:'MM', origNo:'3', question:'CASE_MM 문제', answer:'', solution:'' },                                                  // 처음 답이 틀림 → 두 번째에 맞음
      { ...base, id:'BAD', origNo:'4', question:'CASE_BAD 문제', answer:'', solution:'' },                                                // 끝까지 다름
      { ...base, id:'CUT', origNo:'5', question:'CASE_CUT 방정식 $(\\sin x)(\\cos x)=0$', answer:'', solution:'' },                      // 본문 잘림
      { ...base, id:'IMG', origNo:'6', question:'CASE_IMG 문제', answer:'', solution:'', solImg:'data:image/png;base64,iVBORw0KGgo=', solImgN:1 },  // 해설 이미지 있음
      { ...base, id:'FULL', origNo:'7', question:'CASE_FULL 문제', answer:'3', solution:'있음' },                                         // 다 있음
    ];
    for(const [k, p] of src.entries()){ p.createdAt = now+k; p.updatedAt = now+k; await saveProblem(p); state.problems.push(lightenProblem(p)); }
    const log = [];
    const cs = t => (t.match(/CASE_\w+/)||[''])[0];
    const ask = async (t) => {
      if(t.includes('[원본 문제]')){
        const c = cs(t.split('[원본 문제]').pop());
        log.push('gen:'+c+(t.includes('[원본 정답]') ? ':ans='+t.split('[원본 정답] ').pop().split('\n')[0] : ''));
        return { items:[ { kind:'쌍둥이', question:c+' 쌍둥이 새 문제', choices:[], answer:'9', solution:'s' } ] };
      }
      if(t.includes('정답은 일부러 알려주지 않습니다')){
        const c = cs(t); log.push('verify:'+c);
        if(t.includes('쌍둥이 새 문제')) return { answer:'9', wellPosed:true };
        return { answer: { CASE_NA:'5', CASE_MM:'6', CASE_BAD:'8', CASE_IMG:'2' }[c] || '0', work:'다른 풀이', wellPosed:true };
      }
      if(t.includes('해설(풀이)')){
        const c = cs(t), again = t.includes('다른 풀이는 정답을'); log.push('fill:'+c+(again ? ':again' : '')+(t.includes('정답은 7 입니다') ? ':given7' : ''));
        if(c === 'CASE_CUT') return { complete:false, answer:'', solution:'' };
        const ans = { CASE_NA:'5', CASE_AO:'7', CASE_MM: again ? '6' : '4', CASE_BAD: again ? '3' : '1', CASE_IMG:'2' }[c];
        return { complete:true, answer: ans, solution: c+' 풀이 '+(again ? '2차' : '1차') };
      }
      return {};
    };
    const evs = [];
    const res = await makeTwins(src.map(p => state.problems.find(x => x.id === p.id)), { twin:1, variant:0, concurrency:1 }, ask, e => { if(e.type === 'fill') evs.push(e.i+':'+e.state); });
    const rec = {}; for(const p of src) rec[p.id] = await DB.get('problems', p.id);
    const pick = id => ({ a: rec[id].answer, s: rec[id].solution, t: rec[id].tags, v: rec[id].verify && rec[id].verify.result, img: !!rec[id].solImg });
    // 끄면 안 채움
    const p2 = { ...base, id:'OFF', origNo:'8', question:'CASE_OFF 문제', answer:'', solution:'', createdAt: now+20, updatedAt: now+20 };
    await saveProblem(p2); state.problems.push(lightenProblem(p2));
    const n0 = log.length;
    await makeTwins([state.problems.find(x => x.id === 'OFF')], { twin:1, variant:0, fillSrc:false }, ask);
    const offLog = log.slice(n0);
    // 창 안내 + 실황 칩
    openTwinMaker(['NA','FULL','OFF']);
    const modal = $('#modal-body').textContent.replace(/\s+/g, ' ');
    const fillOn = $('#tw-fill').checked;
    closeModal();
    twinLiveStart([{ origNo:'1', question:'q' }, { origNo:'2', question:'q' }, { origNo:'3', question:'q' }], { twin:1, variant:0 });
    twinLiveEvent({ type:'fill', i:0, state:'done', answer:'5' }); twinLiveEvent({ type:'fill', i:1, state:'check' }); twinLiveEvent({ type:'fill', i:2, state:'incomplete' });
    twinLiveRender();
    const chips = [...document.querySelectorAll('#twin-live .tl-chip')].map(c => c.textContent.trim()).filter(t => t.includes('📝'));
    twinLiveClose();
    return { res: { filled: res.filled, fillCheck: res.fillCheck, incomplete: res.incomplete, saved: res.saved.length }, log, evs,
      NA: pick('NA'), AO: pick('AO'), MM: pick('MM'), BAD: pick('BAD'), CUT: pick('CUT'), IMG: pick('IMG'), FULL: pick('FULL'), offLog, modal, fillOn, chips,
      liveNA: state.problems.find(x => x.id === 'NA').answer };
  });
  const L = r.log.join(' ');
  check('정답·해설 없음 → 풀고 독립 검산 일치 → 저장 (#AI해설, 검산 match)', r.NA.a === '5' && /CASE_NA 풀이/.test(r.NA.s) && r.NA.t.includes('AI해설') && r.NA.v === 'match' && r.liveNA === '5', JSON.stringify(r.NA));
  check('채운 정답을 쌍둥이 만들 때 [원본 정답]으로 넘김', /gen:CASE_NA:ans=5/.test(L), L.slice(0, 200));
  check('정답만 있음 → 그 정답에 맞는 풀이만 (검산 호출 없음, 정답 그대로)', r.AO.a === '7' && /CASE_AO 풀이/.test(r.AO.s) && /fill:CASE_AO:given7/.test(L) && r.log.filter(x => x === 'verify:CASE_AO').length === 1 /* 쌍둥이 검산 1번뿐 */, JSON.stringify(r.AO));
  check('처음 답이 검산과 다름 → 한 번 더 풀어 맞으면 그 답·풀이로', r.MM.a === '6' && /2차/.test(r.MM.s) && r.MM.v === 'match' && !r.MM.t.includes('검산불일치') && /fill:CASE_MM:again/.test(L), JSON.stringify(r.MM));
  check('끝까지 다르면 채우되 #검산불일치', r.BAD.a === '1' && r.BAD.t.includes('검산불일치') && r.BAD.v === 'mismatch', JSON.stringify(r.BAD));
  check('본문이 잘렸으면 추측하지 않고 #본문확인 (정답 빈칸)', r.CUT.a === '' && r.CUT.t.includes('본문확인') && !r.CUT.t.includes('AI해설'), JSON.stringify(r.CUT));
  check('해설 이미지가 있으면 해설은 그대로, 정답만 채움', r.IMG.a === '2' && r.IMG.s === '' && r.IMG.img, JSON.stringify(r.IMG));
  check('다 있는 원본은 건드리지 않음', r.FULL.a === '3' && r.FULL.s === '있음' && !/fill:CASE_FULL/.test(L) && !r.FULL.t.includes('AI해설'));
  check('결과 집계: 채움 5(NA·AO·MM·BAD·IMG), 확인 필요 1, 본문 잘림 1, 쌍둥이 7개 저장', r.res.filled === 5 && r.res.fillCheck === 1 && r.res.incomplete === 1 && r.res.saved === 7, JSON.stringify(r.res));
  check('실황 이벤트: run → done/check/incomplete', r.evs.includes('0:run') && r.evs.includes('0:done') && r.evs.includes('3:check') && r.evs.includes('4:incomplete'), r.evs.join(','));
  check('채우기 끄면 원본 채우기 호출 없음', !r.offLog.some(x => x.startsWith('fill')), r.offLog.join(' '));
  check('설정 창: [원본에 정답·해설이 없으면 먼저 채우기] 기본 켜짐 + 비어 있는 원본 수', r.fillOn && /원본에 정답·해설이 없으면 먼저 채우기/.test(r.modal) && /원본 1문항이 비어 있음/.test(r.modal), r.modal.match(/원본에 정답[^—]*—[^#]*/)?.[0]);
  check('실황 칩: 원본 채움·정답 확인 필요·본문 잘림', r.chips.some(t => /원본 채움 · 정답 5/.test(t)) && r.chips.some(t => /정답 확인 필요/.test(t)) && r.chips.some(t => /본문이 잘림/.test(t)), JSON.stringify(r.chips));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
