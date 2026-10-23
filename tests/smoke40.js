// smoke40: 독립 검산 — 정답을 숨긴 채 AI가 다시 풀어 저장된 정답과 비교, 불일치는 #검산불일치
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── 1) 정답 비교 규칙 ──
  const u = await page.evaluate(() => {
    const MC = ['① 1','② 2','③ 3','④ 4','⑤ 5'];
    return {
      circ: verifyOutcome('②', MC, { answer:'②' }),
      digitMc: verifyOutcome('2', MC, { answer:'②' }),
      wrongMc: verifyOutcome('③', MC, { answer:'②' }),
      frac: verifyOutcome('$\\frac{1}{2}$', [], { answer:'0.5' }),
      dfrac: verifyOutcome('\\dfrac{3}{4}', [], { answer:'3/4' }),
      wrapped: verifyOutcome('정답: 12', [], { answer:'12입니다.' }),
      num: verifyOutcome('3', [], { answer:'4' }),
      expr: verifyOutcome('2\\sqrt{3}', [], { answer:'2\\sqrt{3}' }),
      illPosed: verifyOutcome('5', [], { answer:'5', wellPosed:false }),
      empty: verifyOutcome('5', [], { answer:'' }),
      prompt: aiVerifyPrompt('값을 구하시오.', MC),
    };
  });
  check('원문자 일치', u.circ === 'match');
  check('객관식인데 숫자로 적은 정답(2 = ②)', u.digitMc === 'match');
  check('객관식 다른 번호 → 불일치', u.wrongMc === 'mismatch');
  check('분수 ↔ 소수 같은 값', u.frac === 'match');
  check('\\dfrac ↔ a/b', u.dfrac === 'match');
  check('"정답:", "입니다." 같은 군더더기 무시', u.wrapped === 'match');
  check('다른 수 → 불일치', u.num === 'mismatch');
  check('같은 식(√) → 일치', u.expr === 'match');
  check('풀 수 없는 문제(wellPosed=false) → 불일치', u.illPosed === 'mismatch');
  check('AI 답이 비면 비교 불가', u.empty === 'unknown');
  check('검산 프롬프트: 선택지 포함, 정답 비공개 안내', u.prompt.includes('② 2') && u.prompt.includes('정답은 일부러 알려주지 않습니다'));

  // ── 2) 웹 일괄 검산 ──
  await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const base = { choices:[], solution:'풀이', images:[], imgN:0, subject:'수학Ⅰ', chapter:'수열', section:'',
      grade:'고2', srcType:'기출', srcName:'t', srcYear:'', difficulty:3, origNo:'', reviewed:false };
    const ps = [
      { ...base, id:'v1', question:'VQ1 객관식', choices:['① 1','② 2','③ 3','④ 4','⑤ 5'], answer:'②', tags:[] },
      { ...base, id:'v2', question:'VQ2 단답', answer:'\\frac{1}{2}', tags:['검산불일치'] },   // 예전 불일치 → 이번엔 일치로 해제
      { ...base, id:'v3', question:'VQ3 단답', answer:'3', tags:['기출'] },
      { ...base, id:'v4', question:'VQ4 출제오류', answer:'7', tags:[] },
      { ...base, id:'v5', question:'VQ5 정답없음', answer:'', tags:[] },
    ];
    for(const p of ps){ p.createdAt = p.updatedAt = Date.now(); await saveProblem(p); state.problems.push(lightenProblem(p)); }
    state.cart = ps.map(p=>p.id); persistCart();
    window.__prompts = [];
    window.fetch = async (url, opts) => {
      const text = JSON.parse(opts.body).messages[0].content.find(c=>c.type==='text').text;
      window.__prompts.push(text);
      const ans = text.includes('VQ1') ? { answer:'②', work:'', wellPosed:true }
        : text.includes('VQ2') ? { answer:'0.5', work:'', wellPosed:true }
        : text.includes('VQ3') ? { answer:'4', work:'3+1', wellPosed:true }
        : { answer:'', work:'조건이 모순', wellPosed:false };
      return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(ans) }] }), { status:200 });
    };
  });
  check('선택 바에 [🧮 독립 검산] 버튼', await page.$('button[onclick="batchAiVerify()"]') !== null);
  await page.evaluate(() => batchAiVerify());
  const r = await page.evaluate(() => ({
    p: Object.fromEntries(state.problems.filter(p=>/^v\d$/.test(p.id)).map(p=>[p.id, { tags:p.tags, verify:p.verify||null }])),
    prompts: window.__prompts,
  }));
  check('정답 없는 문항은 건너뜀(4회 호출)', r.prompts.length === 4, r.prompts.length);
  check('프롬프트에 저장된 정답이 새지 않음', !r.prompts.some(t => /\[답\]|정답\s*[:：]\s*[②3]|\\frac\{1\}\{2\}/.test(t)));
  check('v1 일치 → 태그 없음', r.p.v1.tags.length === 0 && r.p.v1.verify.result === 'match', JSON.stringify(r.p.v1));
  check('v2 일치 → 예전 #검산불일치 해제', !r.p.v2.tags.includes('검산불일치') && r.p.v2.verify.result === 'match', JSON.stringify(r.p.v2));
  check('v3 불일치 → #검산불일치 + 기존 태그 유지 + AI 답 기록', r.p.v3.tags.includes('검산불일치') && r.p.v3.tags.includes('기출') && r.p.v3.verify.aiAnswer === '4', JSON.stringify(r.p.v3));
  check('v4 풀 수 없음 → #검산불일치 + 이유 기록', r.p.v4.tags.includes('검산불일치') && r.p.v4.verify.note.includes('모순'), JSON.stringify(r.p.v4));
  check('v5 정답 없음 → 손대지 않음', !r.p.v5.verify, JSON.stringify(r.p.v5));

  // ── 3) 생성 드래프트: 검산 불일치는 미리보기 표시 + 저장 시 태그 ──
  const g = await page.evaluate(async () => {
    state.bulkDrafts = [{ num:'1', text:'GQ 문제', choices:[], ans:'3', sol:'', verifyFail:true, verifyAns:'4' }];
    go('add'); setAddMode('bulk'); rerenderBulk();
    const preview = document.querySelector('#bulk-preview').textContent;
    const before = state.problems.length;
    await saveBulk();
    return { preview, tags: state.problems.slice(before).map(p=>p.tags) };
  });
  check('미리보기에 검산 불일치 표시', g.preview.includes('검산 불일치') && g.preview.includes('AI 재풀이 4'), g.preview.slice(0,120));
  check('저장 시 #검산불일치', g.tags.length === 1 && g.tags[0].includes('검산불일치'), JSON.stringify(g.tags));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
