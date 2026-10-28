// smoke64: ① Σ 아래 첨자 전사 실수(k-1 → k=1) 자동 교정(저장된 문항도), ② 단원 분류 한 칸 밀림 방지(글자 꼬리표 + 첫 글자 확인)
//          + 본문 단서(f', log, Σ …)와 안 맞으면 그 문항만 다시 → 그래도 안 맞으면 #단원확인, ③ 쌍둥이·변형 '풀이 아이디어' 기준
//          (쌍둥이 = 모두 같음, 변형 = 1개 이상 다름 — 검산 AI가 판정, 어긋나면 수리), ④ ✍ 강사 요청(쌍둥이·그림 다시 그리기) + ⭐ 저장
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── ① Σ ──
  const sg = await page.evaluate(async () => {
    const a = fixAiNewlines('3. 수열 $\\{a_n\\}$에 대하여 $\\sum_{k-1}^{4}(2a_k-k)=0$일 때, $\\sum_{k-1}^{4} a_k$의 값은?');
    const b = fixAiNewlines('$a_{k-1}+\\sum_{n=1}^{10} n$');
    const p = { id:'SIG', question:'$\\sum_{k-1}^{4}(2a_k-k)=0$', choices:['① $\\sum_{i-1}^{3} i$'], answer:'', solution:'', subject:'수학Ⅰ', chapter:'수열', section:'', grade:'', srcType:'기출', srcName:'s', difficulty:3, tags:[], reviewed:false, images:[], createdAt:1, updatedAt:1 };
    await saveProblem(p);
    return { a, b, prompt: aiPrompt('').includes('\\sum_{k=1}^{4}') };
  });
  check('Σ 아래 첨자 k-1 → k=1 (a_{k-1} 같은 첨자는 그대로)', /\\sum_\{k=1\}\^\{4\}\(2a_k-k\)/.test(sg.a) && /\\sum_\{k=1\}\^\{4\} a_k/.test(sg.a) && sg.b === '$a_{k-1}+\\sum_{n=1}^{10} n$', sg.a);
  check('전사 프롬프트에 Σ 등호 안내', sg.prompt);
  await page.reload(); await page.waitForTimeout(1500);
  const sig2 = await page.evaluate(async () => { const p = await DB.get('problems', 'SIG'); return p.question + ' | ' + p.choices[0]; });
  check('이미 저장된 문항도 열 때 자동 교정', /\\sum_\{k=1\}/.test(sig2) && /\\sum_\{i=1\}/.test(sig2) && !/k-1/.test(sig2), sig2);

  // ── ② 단원 분류 ──
  const cl = await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const items = [
      { i:3, text:'4. 수열 $\\{a_n\\}$에 대하여 $\\sum_{k=1}^{4}(2a_k-k)=0$일 때' },
      { i:4, text:'5. 함수 $f(x)=(x+2)(2x^2-x-2)$에 대하여 $f\'(1)$의 값은?' },
      { i:5, text:'6. 1보다 큰 두 실수 $a, b$가 $\\log_a b=3$ 일 때 $\\log_9 ab$ 의 값은?' },
      { i:6, text:'7. 함수 $g(x)=x^3$ 에서 $g\'(2)$ 는?' },
    ];
    const prompts = [];
    window.fetch = async (u, o) => {
      const t = JSON.parse(o.body).messages[0].content.find(x => x.type === 'text').text; prompts.push(t);
      let reply;
      if(t.includes('[문항 D]')){        // 묶음: 5번(f')을 '함수의 연속'으로, 6번 키를 잘못 붙였지만 head 는 맞음, 7번도 극한으로
        reply = { items: [
          { key:'A', head:'4. 수열', subject:'수학Ⅰ', chapter:'수열', section:'합의 기호 Σ', difficulty:2 },
          { key:'B', head:'5. 함수 f(x)', subject:'수학Ⅱ', chapter:'함수의 극한과 연속', section:'함수의 연속', difficulty:2 },
          { key:'D', head:'6. 1보다 큰', subject:'수학Ⅰ', chapter:'지수함수와 로그함수', section:'로그의 뜻과 성질', difficulty:2 },
          { key:'C', head:'7. 함수 g(x)', subject:'수학Ⅱ', chapter:'함수의 극한과 연속', section:'함수의 극한', difficulty:2 } ] };
      } else if(t.includes('5. 함수')){   // 5번만 다시: 단서 보고 미분으로
        reply = { items: [ { key:'A', head:'5. 함수', subject:'수학Ⅱ', chapter:'미분', section:'미분계수와 도함수', difficulty:2 } ] };
      } else {                            // 7번은 다시 물어도 틀림
        reply = { items: [ { key:'A', head:'7. 함수', subject:'수학Ⅱ', chapter:'함수의 극한과 연속', section:'함수의 극한', difficulty:2 } ] };
      }
      return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(reply) }] }), { status:200 });
    };
    const res = await aiClassifyItems(items);
    const g = i => { const c = res.get(i); return c ? c.chapter + (c._warn ? ' !' : '') : '-'; };
    const d = { text: items[3].text }; applyAiClassifyResult(d, res.get(6));
    return { m: [g(3), g(4), g(5), g(6)], calls: prompts.length, hint: prompts.slice(1).some(t => t.includes("f'") && t.includes('미분')), keyed: prompts[0].includes('[문항 A]') && !/^#\d/m.test(prompts[0]), warn: d.aiUnitWarn,
      ok: [unitKeywordOk("$f'(1)$", { chapter:'미분' }), unitKeywordOk("$f'(1)$", { chapter:'함수의 극한과 연속' }), unitKeywordOk('$\\log_2 8$', { chapter:'지수함수와 로그함수' }), unitKeywordOk('$\\log_2 8$', { chapter:'미분' }), unitKeywordOk('넓이는?', { chapter:'미분' })] };
  });
  check('묶음 분류는 글자 꼬리표 [문항 A]', cl.keyed);
  check('꼬리표가 바뀌어도 첫 글자(head)로 제자리에 (한 칸 밀림 없음)', cl.m[0] === '수열' && cl.m[2] === '지수함수와 로그함수', JSON.stringify(cl.m));
  check("f'(1) 문제가 '함수의 연속' → 단서와 함께 그 문항만 다시 → 미분", cl.m[1] === '미분' && cl.hint, JSON.stringify(cl.m));
  check('다시 물어도 안 맞으면 경고(#단원확인)', cl.m[3] === '함수의 극한과 연속 !' && cl.warn === true, JSON.stringify(cl.m));
  check('키워드 점검 규칙', JSON.stringify(cl.ok) === '[true,false,true,false,true]', JSON.stringify(cl.ok));

  // ── ③ 아이디어 기준 ──
  const id = await page.evaluate(async () => {
    const src = { id:'IDS', origNo:'9', question:'IDQ 원본 문제 $x^2$', choices:[], answer:'5', solution:'원본 풀이', subject:'수학Ⅰ', chapter:'', section:'', grade:'', srcType:'기출', srcName:'아이디어', difficulty:3, tags:[], reviewed:true, images:[], createdAt:1, updatedAt:1 };
    await saveProblem(src); state.problems.push(lightenProblem(src));
    const log = [];
    const ask = async t => {
      if(t.includes('원본 문제를 바탕으로')){
        log.push({ k:'gen', ideasBlock: t.includes('[원본 풀이 아이디어]'), style: t.includes('[강사 요청]') && t.includes('실생활'), rule: t.includes('"모두" 그대로') && t.includes('"최소 1개"') });
        return { srcIdeas:['인수분해로 근 구하기','근과 계수의 관계'], items:[
          { kind:'쌍둥이', ideas:['인수분해로 근 구하기','근과 계수의 관계'], question:'IDQ 쌍둥이 TWIN_DIFF', choices:[], answer:'7', solution:'s' },
          { kind:'변형', ideas:['인수분해로 근 구하기','근과 계수의 관계'], changed:'', question:'IDQ 변형 VAR_SAME', choices:[], answer:'7', solution:'s' } ] };
      }
      if(t.includes('바로잡은 문제 하나')){
        log.push({ k:'repair', twinMsg: t.includes('쌍둥이 기준에 맞지 않습니다'), varMsg: t.includes('유사 변형 기준에 맞지 않습니다'), ideas: t.includes('[원본 풀이 아이디어]'), style: t.includes('[강사 요청]') });
        return t.includes('쌍둥이 기준') ? { kind:'쌍둥이', ideas:['인수분해로 근 구하기','근과 계수의 관계'], question:'IDQ 쌍둥이 FIXED', choices:[], answer:'7', solution:'s' }
                                       : { kind:'변형', ideas:['완전제곱식으로 꼭짓점','근과 계수의 관계'], changed:'인수분해 → 완전제곱식', question:'IDQ 변형 FIXED', choices:[], answer:'7', solution:'s' };
      }
      if(t.includes('정답은 일부러 알려주지 않습니다')){
        log.push({ k:'verify', ideas: t.includes('[원본 풀이 아이디어]') && t.includes('sameIdeas') });
        if(t.includes('TWIN_DIFF')) return { answer:'7', sameIdeas:false, ideaDiff:'판별식을 추가로 씀' };
        if(t.includes('VAR_SAME')) return { answer:'7', sameIdeas:true };
        if(t.includes('변형 FIXED')) return { answer:'7', sameIdeas:false, ideaDiff:'완전제곱식' };
        return { answer:'7', sameIdeas:true };
      }
      return {};
    };
    const res = await makeTwins([state.problems.find(p => p.id === 'IDS')], { twin:1, variant:1, style:'실생활 상황으로 바꿔 주세요' }, ask);
    const recs = []; for(const sid of res.saved) recs.push(await DB.get('problems', sid));
    const srcRec = await DB.get('problems', 'IDS');
    openDetail(recs.find(r => r.twinKind === '변형').id);
    const det = $('#modal-body').textContent.replace(/\s+/g, ' ');
    closeModal();
    return { saved: recs.map(r => r.twinKind + ':' + r.question), repaired: res.repaired, srcIdeas: srcRec.ideas, log,
      varRec: recs.find(r => r.twinKind === '변형'), twinRec: recs.find(r => r.twinKind === '쌍둥이'), det };
  });
  check('첫 생성에서 원본 풀이 아이디어를 정리해 원본에 저장', JSON.stringify(id.srcIdeas) === '["인수분해로 근 구하기","근과 계수의 관계"]', JSON.stringify(id.srcIdeas));
  check('생성 프롬프트: 쌍둥이 "모두 같음"·변형 "최소 1개 다름" 기준 + 강사 요청', id.log.find(x => x.k === 'gen').rule && id.log.find(x => x.k === 'gen').style, JSON.stringify(id.log.find(x => x.k === 'gen')));
  check('검산 AI가 원본 아이디어 목록을 받고 sameIdeas 판정', id.log.filter(x => x.k === 'verify').every(x => x.ideas), JSON.stringify(id.log.filter(x => x.k === 'verify')));
  check('아이디어가 달라진 쌍둥이 → 쌍둥이 기준으로 수리', id.log.some(x => x.k === 'repair' && x.twinMsg && x.ideas && x.style) && id.saved.includes('쌍둥이:IDQ 쌍둥이 FIXED'), JSON.stringify(id.saved));
  check('아이디어가 같은 변형(숫자만 바뀜) → 변형 기준으로 수리', id.log.some(x => x.k === 'repair' && x.varMsg) && id.saved.includes('변형:IDQ 변형 FIXED') && id.repaired === 2, JSON.stringify(id.saved));
  check('저장: 문제별 아이디어·바뀐 아이디어·강사 요청', id.varRec.ideaChange === '인수분해 → 완전제곱식' && id.varRec.ideas.length === 2 && id.twinRec.ideas.length === 2 && /실생활/.test(id.varRec.twinStyle), JSON.stringify([id.varRec.ideaChange, id.varRec.twinStyle]));
  check('상세: 원본 아이디어·이 문제 아이디어·바뀐 아이디어 표시', /원본 풀이 아이디어: ① 인수분해로 근 구하기/.test(id.det) && /바뀐 아이디어: 인수분해 → 완전제곱식/.test(id.det) && /강사 요청: 실생활/.test(id.det), id.det.slice(0, 200));

  // ── ④ 강사 요청 UI ──
  const ui = await page.evaluate(async () => {
    localStorage.removeItem('sp-lab-style-twin'); localStorage.removeItem('sp-lab-stylepresets-twin');
    openTwinMaker(['IDS']);
    const has = !!$('#tw-style'), rule = /아이디어가 모두 같음/.test($('#modal-body').textContent);
    $('#tw-style').value = '보기 ㄱ,ㄴ,ㄷ 형식으로';
    [...document.querySelectorAll('#tw-style-presets button')].find(b => b.textContent.includes('저장')).click();
    $('#tw-style').value = '다른 요청';
    [...document.querySelectorAll('#tw-style-presets button')].find(b => b.textContent.includes('저장')).click();
    const chips = [...document.querySelectorAll('#tw-style-presets .tag')].map(x => x.textContent.trim());
    document.querySelectorAll('#tw-style-presets .tag span')[1].click();
    const used = $('#tw-style').value;
    // 만들기 → 실제 요청에 강사 요청이 들어감
    const bodies = [];
    window.fetch = async (u, o) => { const t = JSON.parse(o.body).messages[0].content.find(x => x.type === 'text').text; bodies.push(t);
      const reply = t.includes('원본 문제를 바탕으로') ? { srcIdeas:['a'], items:[{ kind:'쌍둥이', ideas:['a'], question:'UI 쌍둥이', choices:[], answer:'7', solution:'s' }] } : { answer:'7', sameIdeas:true };
      return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(reply) }] }), { status:200 }); };
    $('#tw-twin').value = '1'; $('#tw-var').value = '0';
    await startTwinMaker(); twinLiveClose();
    const sent = bodies.some(t => t.includes('[강사 요청]') && t.includes('보기 ㄱ,ㄴ,ㄷ 형식으로'));
    openTwinMaker(['IDS']); const remembered = $('#tw-style').value;
    document.querySelectorAll('#tw-style-presets .tag b')[0].click();
    const afterDel = stylePresets('twin');
    closeModal();
    // 그림 다시 그리기 요청
    $('#fig-style').value = '눈금 숫자 빼기'; $('#fig-style').dispatchEvent(new Event('input'));
    const rp = aiRedrawPrompt(400, 300, '');
    $('#fig-style').value = ''; $('#fig-style').dispatchEvent(new Event('input'));
    const rp0 = aiRedrawPrompt(400, 300, '');
    return { has, rule, chips, used, sent, remembered, afterDel, rp: rp.includes('[강사 요청]') && rp.includes('눈금 숫자 빼기'), rp0: !rp0.includes('[강사 요청]'), figBox: !!$('#fig-style') };
  });
  check('쌍둥이 창: 기준 안내 + ✍ 추가 요청 칸', ui.has && ui.rule);
  check('⭐ 자주 쓰는 요청 저장·누르면 채움', ui.chips.length === 2 && /다른 요청/.test(ui.chips[0]) && ui.used === '보기 ㄱ,ㄴ,ㄷ 형식으로', JSON.stringify(ui.chips));
  check('만들기 → AI 요청에 [강사 요청]이 들어감, 다음에 열면 마지막 요청 기억', ui.sent && ui.remembered === '보기 ㄱ,ㄴ,ㄷ 형식으로');
  check('⭐ 요청 지우기', ui.afterDel.length === 1 && ui.afterDel[0] === '보기 ㄱ,ㄴ,ㄷ 형식으로', JSON.stringify(ui.afterDel));
  check('그림 다시 그리기 추가 요청 칸 → 프롬프트에 반영(비우면 빠짐)', ui.figBox && ui.rp && ui.rp0);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
