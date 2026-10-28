// smoke71: 오류 보고서 회귀 — ① AI가 JSON 앞에 풀이 글(수식 { } 포함)을 쓰거나 글만 쓰다 잘린 답(실제 수집 사례 3건)도 읽음,
//          못 읽으면 한도를 늘려 'JSON만' 다시 한 번, ② 'credit balance is too low'(400) → 우리말 안내 + 일괄 작업은 바로 멈춤,
//          ③ 요청에 'JSON만' system 지시, 출력 한도 넉넉히
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
    // 실제 오류 보고서의 답 모양
    const R5 = '넓이는 $\\int_0^2 \\left[(x^2+3)-\\left(-\\tfrac15x^2+3\\right)\\right]dx=\\int_0^2 \\tfrac65x^2\\,dx=\\tfrac65\\cdot\\tfrac83=\\tfrac{16}{5}$ 이므로, 정답은 ⑤입니다.\n\n{"complete":true,"answer":"⑤","solution":"1단계: 두 곡선 $y=x^2+3$ 과 ... 따라서 $\\\\tfrac{16}{5}$"}';
    const R1 = '전체 경우의 수는 H(4,14) = C(17,3) = 680.\n\nab가 홀수이려면 ... 합 = Σ_{s=0}^';            // 글만 쓰다 잘림
    const R6 = '계산: 넓이 = ∫0^12 [√(x/3) + 2 − (−x/12 + 2)] dx\n합은 22이므로 답은 ④.\n\n검산: x=3t²로 치환하면 ';
    const NEST = '먼저 예시 {"x":1} 를 보면…\n{"answer":"③","work":"…","figure":{"kind":"graph","x":[0,1]}}';
    const CUT = '{"answer":"7","solution":"1단계: $\\\\frac{1}{2}$ 를 계산하면';                                 // JSON 이 중간에 잘림
    const ex = { r5: extractJson(R5), r1: extractJson(R1), r6: extractJson(R6), nest: extractJson(NEST), cut: extractJson(CUT) };
    // aiJsonCall: 첫 답은 글만(잘림) → 다시 요청 → 두 번째 답은 정상
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const sent = []; let n = 0;
    window.fetch = async (u, o) => {
      const body = JSON.parse(o.body); sent.push({ max: body.max_tokens, sys: body.system || '', again: JSON.stringify(body.messages).includes('[다시 요청]') });
      n++;
      const text = n === 1 ? R1 : '{"answer":"680","work":"H(4,14)"}';
      return new Response(JSON.stringify({ content:[{ type:'thinking', thinking:'…' }, { type:'text', text }], stop_reason: n === 1 ? 'max_tokens' : 'end_turn' }), { status:200 });
    };
    const got = await aiJsonCall([{ type:'text', text:'문제' }], 1500);
    // 두 번 다 못 읽으면 분명한 오류
    window.fetch = async () => new Response(JSON.stringify({ content:[{ type:'text', text: R6 }], stop_reason:'end_turn' }), { status:200 });
    let twice = ''; try{ await aiJsonCall([{ type:'text', text:'문제' }], 1500); }catch(e){ twice = e.message; }
    // 크레딧 부족
    window.fetch = async () => new Response(JSON.stringify({ type:'error', error:{ type:'invalid_request_error', message:'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } }), { status:400 });
    let credit = ''; try{ await aiJsonCall([{ type:'text', text:'문제' }], 1500); }catch(e){ credit = e.message; }
    // 쌍둥이 만들기 중 크레딧 부족 → 한 원본에서 멈추고 나머지 원본은 시작하지 않음
    const base = { answer:'1', solution:'s', subject:'수학Ⅰ', chapter:'', section:'', grade:'', srcType:'기출', srcName:'c', difficulty:3, tags:[], reviewed:true, images:[], choices:[], createdAt:1, updatedAt:1 };
    for(const k of [1,2,3]){ const p = { ...base, id:'C'+k, origNo:String(k), question:'CR'+k }; await saveProblem(p); state.problems.push(lightenProblem(p)); }
    let calls = 0;
    const ask = async () => { calls++; return aiJsonCall([{ type:'text', text:'x' }], 1000); };
    let stopped = ''; try{ await makeTwins(['C1','C2','C3'].map(id => state.problems.find(p => p.id === id)), { twin:1, variant:0, concurrency:1, fillSrc:false }, ask); }catch(e){ stopped = e.message; }
    return { ex, got, sent, twice, credit, stopped, calls };
  });
  check('실제 사례 #5: 풀이 글(수식 { }) 뒤의 JSON 을 읽음', r.ex.r5 && r.ex.r5.answer === '⑤' && r.ex.r5.complete === true, JSON.stringify(r.ex.r5).slice(0, 80));
  check('실제 사례 #1·#6: JSON 이 아예 없으면 null (엉뚱한 값을 만들지 않음)', r.ex.r1 === null && r.ex.r6 === null, JSON.stringify([r.ex.r1, r.ex.r6]));
  check('예시 객체가 앞에 있어도 마지막 바깥 JSON 을 고름', r.ex.nest && r.ex.nest.answer === '③' && r.ex.nest.figure && r.ex.nest.figure.kind === 'graph', JSON.stringify(r.ex.nest));
  check('중간에 잘린 JSON 도 살림', r.ex.cut && r.ex.cut.answer === '7', JSON.stringify(r.ex.cut));
  check("글만 쓰다 잘린 답 → 한도를 늘려 'JSON만' 다시 → 읽음", r.got && r.got.answer === '680' && r.sent.length === 2 && r.sent[1].again && r.sent[1].max > r.sent[0].max, JSON.stringify(r.sent));
  check("요청에 'JSON만' system 지시 + 출력 한도 넉넉히(생각에도 쓰이므로)", /JSON 객체 하나만/.test(r.sent[0].sys) && r.sent[0].max >= 6000, r.sent[0].max);
  check('두 번 다 못 읽으면 분명한 오류(AI가 한 말 앞부분과 함께)', /두 번 왔습니다|형식\(JSON\) 없이 답했습니다: "계산/.test(r.twice), r.twice);
  check('크레딧 부족 → 우리말 안내(충전 위치·Max 는 별개)', /크레딧/.test(r.credit) && /Plans & Billing/.test(r.credit) && /Max/.test(r.credit) && /API 오류 400/.test(r.credit), r.credit.slice(0, 90));
  check('쌍둥이 만들기 중 크레딧 부족 → 바로 멈춤(나머지 원본에 헛된 요청 없음)', /크레딧/.test(r.stopped) && r.calls === 1, `${r.calls}회 · ${r.stopped.slice(0, 40)}`);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
