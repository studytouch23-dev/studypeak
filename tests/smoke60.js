// smoke60: 👯 쌍둥이·변형 — 빠르게(원본 여러 개 동시 + 다음 묶음 미리 만들기), 실황 패널(원본별 칩·통계·중지·완료 버튼),
//          👯 원본별 묶어 보기(원본 카드 → 쌍둥이·변형 카드 한 줄), 상세 화면의 원본 ↔ 쌍둥이 바로 가기
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── 1) 웹: 원본 4개, 동시 3개 — 실황 패널을 중간에 들여다봄 ──
  const r = await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const base = { answer:'5', solution:'풀이', subject:'수학Ⅰ', chapter:'지수함수와 로그함수', section:'', grade:'고2', srcType:'기출', srcName:'11월 모의고사', srcYear:'', difficulty:3, tags:[], reviewed:true, batch:'bS', batchName:'11월 모의고사 · 11/01 09:00', images:[], choices:[] };
    const now = Date.now();
    for(let k = 1; k <= 4; k++){ const p = { ...base, id:'P'+k, origNo:String(k), question:`KW${k} 문제 본문 $2^{${k}}$ 의 값은?`, createdAt:now+k, updatedAt:now+k }; await saveProblem(p); state.problems.push(lightenProblem(p)); }
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let live = 0, maxLive = 0; const gens = [];
    window.fetch = async (u, o) => {
      const body = JSON.parse(o.body), t = body.messages[0].content.find(x => x.type === 'text').text;
      live++; maxLive = Math.max(maxLive, live);
      let reply;
      if(t.includes('[원본 문제]')){
        const kw = (t.split('[원본 문제]').pop().match(/KW\d/)||[''])[0];
        const av = t.includes('[이미 만든 문제]') ? (t.split('[이미 만든 문제]').pop().match(/^\d+\)/gm)||[]).length : 0;
        gens.push({ kw, av, t0: Date.now() });
        await sleep(120);
        const want = +((t.match(/쌍둥이 (\d+)개/)||[0,0])[1]) || 0, wantV = +((t.match(/유사 변형 (\d+)개/)||[0,0])[1]) || 0;
        const items = [];
        for(let n = 0; n < want; n++) items.push({ kind:'쌍둥이', question:`${kw} 쌍둥이 ${av+n+1} $3^{${av+n+1}}$ 은?`, choices:[], answer:'7', solution:'s' });
        for(let n = 0; n < wantV; n++) items.push({ kind:'변형', question:`${kw} 변형 ${av+n+1} $5^{${av+n+1}}$ 은?`, choices:[], answer:'7', solution:'s' });
        reply = { items };
      } else if(t.includes('정답은 일부러 알려주지 않습니다')){
        await sleep(200);
        reply = { answer:'7', wellPosed:true };
      } else reply = {};
      live--;
      return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(reply) }] }), { status:200 });
    };
    go('db'); resetFilters();
    openTwinMaker(['P1','P2','P3','P4']);
    const modal = { conc: $('#tw-conc').value, est: $('#tw-est').textContent };
    $('#tw-twin').value = '1'; $('#tw-var').value = '1'; $('#tw-twin').dispatchEvent(new Event('change'));
    const run = startTwinMaker();
    await sleep(260);
    const mid = { show: $('#twin-live').classList.contains('show'), text: $('#twin-live').textContent,
      running: document.querySelectorAll('#twin-live .tl-src.run').length, stop: !!$('#twin-live').textContent.includes('중지'),
      chips: [...document.querySelectorAll('#twin-live .tl-chip')].map(c => c.className.replace('tl-chip ', '')) };
    await run;
    await sleep(50);
    const end = { text: $('#twin-live').textContent, saved: document.querySelectorAll('#twin-live .tl-chip.saved').length,
      foot: [...document.querySelectorAll('#twin-live .tl-foot button')].map(b => b.textContent.trim()) };
    // 완료 후 자동으로 👯 원본별 묶어 보기
    const grp = { on: $('#db-twinview').checked, groups: document.querySelectorAll('#plist .tgroup').length,
      rows: [...document.querySelectorAll('#plist .tgroup')].map(g => [...g.querySelectorAll('.tg-row > .pcard')].map(c => c.classList.contains('tg-orig') ? 'O' : (c.querySelector('.twin-badge.var') ? 'V' : 'T')).join('')),
      count: $('#db-count').textContent, imgs: true };
    // 칩 클릭 → 상세
    document.querySelector('#twin-live .tl-chip.saved').click(); await sleep(150);
    const det = $('#modal-body').textContent;
    const twinId = state.problems.find(p => p.twinOf === 'P1').id;
    await openDetail(twinId); await sleep(50); const detTwin = $('#modal-body').textContent;
    const origBtn = [...document.querySelectorAll('#modal-body button')].find(b => b.textContent.includes('1번 ·'));
    origBtn.click(); await sleep(150); const detOrig = $('#modal-body').textContent;
    closeModal();
    // 묶음 한 줄 담기
    clearCart(); const g0 = document.querySelector('#plist .tgroup'); [...g0.querySelectorAll('button')].find(b => b.textContent.includes('모두 선택')).click();
    const cart = cartList().map(p => p.twinKind ? p.twinKind[0] + p.origNo : 'O' + p.origNo);
    // 끄면 평소 목록
    $('#db-twinview').checked = false; $('#db-twinview').dispatchEvent(new Event('change'));
    const flat = document.querySelectorAll('#plist .tgroup').length;
    twinLiveClose();
    return { modal, mid, end, grp, det: det.slice(0, 1500), detTwin: detTwin.slice(0, 1500), detOrig: detOrig.slice(0, 1500), cart, flat, maxLive, gens, hidden: !$('#twin-live').classList.contains('show') };
  });
  check('설정 창: 동시 처리 3개 기본 + 예상 시간', r.modal.conc === '3' && /예상 시간 약 \d+분/.test(r.modal.est), r.modal.est.slice(0, 80));
  check('원본 여러 개를 동시에 (최대 3개가 함께 진행)', r.maxLive >= 3 && r.maxLive <= 6, 'maxLive=' + r.maxLive);
  check('실황 패널: 진행 중에 보이고, 원본별 줄·중지 버튼·칩', r.mid.show && r.mid.running >= 2 && r.mid.stop && /원본 \d\/4/.test(r.mid.text) && r.mid.chips.length > 0, JSON.stringify(r.mid).slice(0, 300));
  check('실황 패널: 끝나면 저장 8개·완료 버튼 [원본별로 보기]·[교재]', /👯 완료/.test(r.end.text) && r.end.saved === 8 && /저장 8\/8/.test(r.end.text)
    && r.end.foot.some(t => t.includes('원본별로 보기')) && r.end.foot.some(t => t.includes('교재')), JSON.stringify(r.end).slice(0, 300));
  check('끝나면 👯 원본별 묶어 보기: 원본 4묶음, 각 줄 [원본 → 쌍둥이 → 변형]', r.grp.on && r.grp.groups === 4 && r.grp.rows.every(x => x === 'OTV') && /원본 4개 묶음/.test(r.grp.count), JSON.stringify(r.grp));
  check('실황 칩 클릭 → 그 문제 상세', /원본:/.test(r.det), r.det.slice(0, 120).replace(/\s+/g, ' '));
  check('상세: 쌍둥이 → 원본 바로 가기, 원본 → 만든 문제 목록', /쌍둥이 1/.test(r.detTwin) && /원본:/.test(r.detTwin) && /이 문제로 만든 문제/.test(r.detOrig) && /쌍둥이 1/.test(r.detOrig) && /변형 1/.test(r.detOrig), r.detOrig.slice(0, 160));
  check('[☑ 모두 선택] → 원본·쌍둥이·변형 순서로 담김', JSON.stringify(r.cart) === JSON.stringify(['O1','쌍1','변1']), JSON.stringify(r.cart));
  check('묶어 보기를 끄면 평소 목록', r.flat === 0);
  check('닫기 → 패널 숨김', r.hidden);

  // ── 2) 한 원본에서 10개: 앞 묶음 검산 중에 다음 묶음을 미리 만듦 ──
  const p2 = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const ev = []; let t0 = Date.now();
    const ask = async (t) => {
      if(t.includes('[원본 문제]')){
        const av = t.includes('[이미 만든 문제]') ? (t.split('[이미 만든 문제]').pop().match(/^\d+\)/gm)||[]).length : 0;
        const want = +((t.match(/쌍둥이 (\d+)개/)||[0,0])[1]) || 0;
        ev.push(['gen', Date.now() - t0, av, want]); await sleep(100);
        return { items: Array.from({ length: want }, (_, n) => ({ kind:'쌍둥이', question:`PIPE 쌍둥이 ${av+n+1} 은?`, choices:[], answer:'3', solution:'s' })) };
      }
      ev.push(['verify', Date.now() - t0]); await sleep(300);
      return { answer:'3' };
    };
    const src = state.problems.find(p => p.id === 'P1');
    t0 = Date.now();
    const res = await makeTwins([src], { twin:10, variant:0 }, ask);
    const g = ev.filter(e => e[0] === 'gen');
    return { saved: res.saved.length, gens: g.map(e => e[2] + ':' + e[3]), secondGenAt: g[1] && g[1][1], firstVerifyEnd: ev.find(e => e[0] === 'verify')[1] + 300,
      nos: res.saved.map(id => state.problems.find(p => p.id === id).twinNo), ms: Date.now() - t0 };
  });
  check('10개: 3+3+3+1 로 나눠 만들고 겹치지 않게(앞에서 만든·검산 중인 문제 목록 전달)', p2.saved === 10 && JSON.stringify(p2.gens) === JSON.stringify(['0:3','3:3','6:3','9:1']), JSON.stringify(p2.gens));
  check('파이프라인: 첫 묶음 검산이 끝나기 전에 다음 묶음 생성 시작', p2.secondGenAt < p2.firstVerifyEnd, `${p2.secondGenAt} < ${p2.firstVerifyEnd}`);
  check('번호는 만든 순서대로 1~10', JSON.stringify(p2.nos) === JSON.stringify([1,2,3,4,5,6,7,8,9,10]), JSON.stringify(p2.nos));
  check('순차(약 4×(0.1+0.3)=1.6초)보다 빠름', p2.ms < 1450, p2.ms + 'ms');

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
