// smoke44: 해설 ↔ 문제 내용 짝짓기
//  ① 업로드: 번호가 틀리거나(31·99) 없는 해설 조각도 버리지 않고, 내용으로 제 문제에 붙임
//  ② 짝짓기 호출 실패 시 번호로만(정확히 하나 맞는 것)
//  ③ 저장된 문제: 서로 뒤바뀐 해설을 제자리로, 해설 없는 문제는 새 해설 PDF 조각에서 찾아 붙임
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // 스텁 AI: 해설 조각 읽기 / 내용 짝짓기(프롬프트의 P·S 줄에서 같은 키워드끼리 짝)
  await page.evaluate(() => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const cv = document.createElement('canvas'); cv.width = 40; cv.height = 20;
    window.__IMG = cv.toDataURL('image/png');
    window.__calls = []; window.__matchBroken = false;
    const reply = o => new Response(JSON.stringify({ content:[{ type:'text', text: typeof o === 'string' ? o : JSON.stringify(o) }] }), { status:200 });
    window.fetch = async (url, opts) => {
      const msg = JSON.parse(opts.body).messages[0].content;
      const t = msg.find(c => c.type === 'text').text, img = msg.some(c => c.type === 'image');
      if(t.includes('분류표')) return reply({ items:[] });             // 단원 분류 호출(이 테스트 대상 아님)
      if(t.includes('[후보 문제]')){                                    // 엇갈린 짝 재확인: 해설과 같은 키워드의 후보
        window.__calls.push({ kind:'verify', img, t });
        const body = t.split('\n[해설]')[1] || '', solPart = body.split('\n[후보 문제]\n')[0], cands = body.split('\n[후보 문제]\n')[1] || '';
        const sk = (solPart.match(/KW\d+/)||[])[0];
        const ln = cands.split('\n').find(l => /^C\d+:/.test(l) && l.includes(sk+' '));
        return reply({ pick: ln ? +ln.match(/^C(\d+)/)[1] : null });
      }
      if(t.includes('[문제 목록]')){
        window.__calls.push({ kind:'match', img, t });
        if(window.__matchBroken) return reply('죄송합니다, 짝지을 수 없습니다');
        const kw = line => (line.match(/KW\d+/)||[])[0];
        const P = {}, pairs = [];
        t.split('\n').forEach(l => { const m = l.match(/^P(\d+)/); if(m && kw(l)) P[kw(l)] = +m[1]; });
        t.split('\n').forEach(l => { const m = l.match(/^S(\d+)/); if(m) pairs.push({ s:+m[1], p: kw(l) in P ? P[kw(l)] : null }); });
        return reply({ pairs });
      }
      window.__calls.push({ kind:'piece', img, t });
      if(t.includes('HINT-A')) return reply({ items:[
        { num:'31', answer:'③', solution:'KW26 신뢰구간 풀이 $a=1$' },
        { num:'2',  answer:'②', solution:'KW27 극한 풀이 $k=2$' } ] });
      if(t.includes('HINT-B')) return reply({ items:[ { num:'', answer:'④', solution:'KW25 대칭이동 풀이 $AC=6$' } ] });
      if(t.includes('HINT-C')) return reply({ items:[ { num:'27', answer:'⑤', solution:'KW27 새로 올린 해설 PDF의 풀이' } ] });
      return reply({ items:[] });
    };
  });

  // ── ① 업로드 흐름 ──
  const up = await page.evaluate(async () => {
    state.bulkDrafts = [
      { num:'25', text:'KW25 좌표공간의 점 대칭이동', choices:[], sol:'', ans:'', aiDone:true },
      { num:'26', text:'KW26 정규분포 신뢰구간', choices:[], sol:'', ans:'', aiDone:true, solImg: window.__IMG },   // 번호로 엉뚱한 조각이 붙어 있던 상태
      { num:'27', text:'KW27 수열의 극한', choices:[], sol:'', ans:'', aiDone:true },
      { num:'28', text:'KW28 해설이 없는 문제', choices:[], sol:'', ans:'', aiDone:true, solImg: window.__IMG },
    ];
    state.solPool = [ { num:'31', img: window.__IMG, hint:'HINT-A' }, { num:'99', img: window.__IMG, hint:'HINT-B' } ];
    state.solPoolDone = false;
    go('add'); setAddMode('bulk'); document.querySelector('#bulk-preview-card').style.display = 'block';
    await aiTranscribeDrafts();
    const d = state.bulkDrafts;
    const r = { calls: window.__calls.map(c => c.kind + (c.img ? '+img' : '')),
      matchPrompt: (window.__calls.find(c => c.kind === 'match')||{}).t || '',
      sol: d.map(x => x.sol), ans: d.map(x => x.ans), solImg: d.map(x => !!x.solImg), iss28: d[3].solIssues || [],
      status: document.querySelector('#bulk-status').textContent };
    window.__calls = [];
    await aiTranscribeDrafts();                                   // 다시 눌러도 이미 짝지은 해설은 재호출 없음
    r.again = window.__calls.length;
    return r;
  });
  check('조각 2개 읽기(이미지) + 짝짓기 1회(텍스트만) + 번호가 다른 짝 3개 재확인', JSON.stringify(up.calls) === JSON.stringify(['piece+img','piece+img','match','verify','verify','verify']), JSON.stringify(up.calls));
  check('짝짓기 프롬프트: 문제 번호·본문 + 해설 표기 번호(못 읽으면 영역 번호)', up.matchPrompt.includes('P0 (번호 25): KW25') && up.matchPrompt.includes('S0 (해설 표기 번호 31)') && up.matchPrompt.includes('S2 (해설 표기 번호 99) [정답 ④]: KW25'), up.matchPrompt.slice(-260).replace(/\n/g,'⏎'));
  check('25번 ← 번호 없던 해설', up.sol[0].includes('KW25'), up.sol[0]);
  check('26번 ← 번호가 31로 잘못 읽힌 해설', up.sol[1].includes('KW26') && up.ans[1] === '③', up.sol[1]);
  check('27번 ← 번호가 2로 잘못 읽힌 해설', up.sol[2].includes('KW27'), up.sol[2]);
  check('짝지은 문제는 이미지 대신 텍스트 해설', !up.solImg[0] && !up.solImg[1] && !up.solImg[2]);
  check('28번: 번호로만 붙었던 엉뚱한 해설 이미지 → 경고', up.iss28.some(x => x.includes('28번') && x.includes('찾지 못함')), JSON.stringify(up.iss28));
  check('상태줄: 짝 3개, 번호가 달라 내용으로 짝지은 3개를 알려 줌', up.status.includes('해설 3개') && up.status.includes('내용으로 짝지음 3개'), up.status);
  check('다시 눌러도 재호출 없음', up.again === 0, up.again);

  // ── ② 짝짓기 실패 → 번호로만 ──
  const fb = await page.evaluate(async () => {
    window.__matchBroken = true;
    state.bulkDrafts = [
      { num:'1', text:'KW1 문제', choices:[], sol:'', ans:'', aiDone:true },
      { num:'27', text:'KW27 문제', choices:[], sol:'', ans:'', aiDone:true } ];
    state.solPool = [ { num:'5', img: window.__IMG, hint:'HINT-C' } ]; state.solPoolDone = false;
    await aiTranscribeDrafts();
    window.__matchBroken = false;
    return state.bulkDrafts.map(d => d.sol);
  });
  check('짝짓기 실패 시 번호가 정확히 맞는 것만', fb[0] === '' && fb[1].includes('KW27'), JSON.stringify(fb));

  // 저장하면 해설 풀은 비움
  const cleared = await page.evaluate(async () => { await saveBulk(); return (state.solPool||[]).length === 0 && !state.solPoolDone; });
  check('저장 후 해설 풀 비움', cleared);

  // ── ③ 저장된 문제 바로잡기 ──
  const db = await page.evaluate(async () => {
    const base = { choices:[], answer:'', images:[], imgN:0, subject:'수학Ⅰ', chapter:'수열', section:'', grade:'고2',
      srcType:'기출', srcName:'10월', srcYear:'', difficulty:3, tags:[], reviewed:false };
    const ps = [
      { ...base, id:'m25', origNo:'25', question:'KW25 좌표공간', solution:'KW26 신뢰구간 풀이(26번 것)' },
      { ...base, id:'m26', origNo:'26', question:'KW26 신뢰구간', solution:'KW25 대칭이동 풀이(25번 것)' },
      { ...base, id:'m27', origNo:'27', question:'KW27 수열의 극한', solution:'' },
    ];
    for(const p of ps){ p.createdAt = p.updatedAt = Date.now(); await saveProblem(p); state.problems.push(lightenProblem(p)); }
    state.cart = ps.map(p => p.id); persistCart();
    const btn = !!document.querySelector('button[onclick="openSolMatch()"]');
    openSolMatch();
    const modal = { file: !!document.querySelector('#solmatch-file'), title: document.querySelector('#modal-body h3').textContent };
    closeModal();
    window.__calls = [];
    await matchSolutionsForProblems(ps.map(p => p.id), []);          // 해설 PDF 없이: 뒤바뀐 것만 바로잡기
    const get = id => state.problems.find(p => p.id === id);
    const r1 = { btn, modal, s25: get('m25').solution, s26: get('m26').solution, t27: get('m27').tags.slice(), calls: window.__calls.map(c => c.kind) };
    // 해설 PDF 조각을 함께: 27번에 새 해설
    await matchSolutionsForProblems(ps.map(p => p.id), [{ num:'', img: window.__IMG, hint:'HINT-C' }]);
    r1.s27 = get('m27').solution; r1.t27b = get('m27').tags.slice();
    r1.s25b = get('m25').solution;
    return r1;
  });
  check('선택 바에 [🔗 해설 자동 매칭] + 해설 PDF 추가 칸', db.btn && db.modal.file && db.modal.title.includes('해설 자동 매칭'), JSON.stringify(db.modal));
  check('뒤바뀐 해설 제자리로(25번)', db.s25.includes('KW25'), db.s25);
  check('뒤바뀐 해설 제자리로(26번)', db.s26.includes('KW26'), db.s26);
  check('해설 없는 27번 → #해설없음', db.t27.includes('해설없음'), JSON.stringify(db.t27));
  check('텍스트 해설만: 짝짓기 1회 + 번호와 내용이 엇갈린 2개만 재확인', JSON.stringify(db.calls) === JSON.stringify(['match','verify','verify']), JSON.stringify(db.calls));
  check('새 해설 PDF 조각에서 27번 해설을 찾아 붙임', db.s27.includes('KW27 새로 올린'), db.s27);
  check('붙인 뒤 #해설없음 해제', !db.t27b.includes('해설없음'), JSON.stringify(db.t27b));
  check('이미 맞는 해설은 그대로', db.s25b.includes('KW25'), db.s25b);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
