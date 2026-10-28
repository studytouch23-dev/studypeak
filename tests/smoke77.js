// smoke77: 스터디피크 유형 자동 분류 — 일괄 등록 [전체 저장] 직후 자동(같은 단원은 한 번에, 그림만 있는 문항은 그림과 함께),
//          후보는 그 단원의 마스터 유형만, 중단원이 비면 고른 유형의 중단원으로 채움, 확신 없음 → 검토요망, 끄기 체크,
//          담기 바 [🏷 스터디피크 유형], LMS 엑셀 창을 열면 빈 유형 자동 채움
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
    localStorage.setItem('sp-lab-apikey', 'sk-ant-api03-test');
    const calls = [];
    window.aiJsonCall = async content => {                       // 후보 1번(또는 '접선' 이 들어간 첫 후보)을 고름, 'UNSURE' 문항은 sure:false
      const text = content.filter(c => c.type === 'text').map(c => c.text).join('');
      const cands = (text.split('[후보]\n')[1] || '').split('\n\n')[0].split('\n');
      const keys = [...text.matchAll(/\[문항 ([A-Z])\]\n([^\n]*)/g)];
      calls.push({ n: keys.length, img: content.some(c => c.type === 'image'), cands });
      return { items: keys.map(([, k, line]) => {
        const want = cands.findIndex(c => /접선/.test(c) && /접선/.test(line));
        return { key: k, head: line.slice(0, 10), pick: want >= 0 ? want + 1 : 1, also: [], sure: !/UNSURE/.test(line), why: '테스트' };
      }) };
    };
    const tick = () => new Promise(r => setTimeout(r, 50));
    const waitAi = async () => { for(let k = 0; k < 200 && (AI_BATCH.running || !calls.length); k++) await tick(); await tick(); };
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    go('add'); setAddMode('bulk');
    const out = { box: !!$('#b-autotype'), boxOn: $('#b-autotype').checked };
    state.bulkDrafts = [
      { num:'1', text:'곡선 $y=x^3$ 위의 점 $(1,1)$에서의 접선의 방정식', ans:'3', choices:[], aiSub:'미적분Ⅰ', aiChap:'미분', aiSect:'접선의 방정식' },
      { num:'2', text:'곡선 $y=x^2$ 에 접하는 접선 UNSURE', ans:'2', choices:[], aiSub:'미적분Ⅰ', aiChap:'미분', aiSect:'접선의 방정식' },
      { num:'3', text:'$\\int_0^1 xe^{x}dx$ 의 값', ans:'1', choices:[], aiSub:'미적분', aiChap:'적분법', aiSect:'' },
      { num:'4', text:'', img: png, ans:'4', choices:[], aiSub:'대수', aiChap:'수열', aiSect:'등차수열' },
    ];
    $('#b-srcname').value = 'AUTO';
    await saveBulk();
    await waitAi();
    const got = state.problems.filter(p => p.srcName === 'AUTO').sort((a, b) => +a.origNo - +b.origNo)
      .map(p => [p.origNo, p.section, p.subsection, p.utype, p.utypeSure, spTypeOk(p)]);
    out.bulk = { got, calls: calls.map(c => [c.n, c.img]), unitOnly: calls[0].cands.every(c => /도함수의 활용/.test(c)) };
    const db = await DB.get('problems', state.problems.find(p => p.srcName === 'AUTO' && p.origNo === '3').id);
    out.saved = [db.section, db.utype];
    // 끄면 안 함
    $('#b-autotype').checked = false; $('#b-autotype').dispatchEvent(new Event('change'));
    calls.length = 0;
    state.bulkDrafts = [{ num:'9', text:'접선 문제', ans:'1', choices:[], aiSub:'미적분Ⅰ', aiChap:'미분', aiSect:'접선의 방정식' }];
    $('#b-srcname').value = 'OFF'; await saveBulk(); for(let k=0;k<10;k++) await tick();
    out.off = { calls: calls.length, ls: localStorage.getItem('sp-lab-autotype'), typed: state.problems.find(p => p.srcName === 'OFF').utype || '' };
    // 담기 바 버튼
    calls.length = 0;
    const off = state.problems.find(p => p.srcName === 'OFF');
    state.cart = [off.id];
    await batchSpType();
    out.cartBtn = { btn: !!document.querySelector('#cartbar button[onclick="batchSpType()"]'), typed: spTypeOk(off), calls: calls.length };
    // LMS 창: 빈 유형 자동 채움
    const base = { solution:'s', grade:'', srcType:'기출', srcName:'LMSAUTO', difficulty:3, tags:[], reviewed:true, images:[], choices:[], createdAt:1, updatedAt:1 };
    const q = { ...base, id:'LA1', origNo:'1', question:'등차수열의 일반항', answer:'5', subject:'대수', chapter:'수열', section:'등차수열' };
    await saveProblem(q); state.problems.push(lightenProblem(q));
    state.cart = ['LA1']; calls.length = 0;
    go('sheet'); lmsOpen();
    await waitAi();
    out.lms = { sub: LMS.rows[0].sub, type: LMS.rows[0].type, calls: calls.length };
    closeModal();
    return out;
  });
  check('일괄 등록에 [저장하면 스터디피크 유형도 AI로 자동 분류] 체크(기본 켜짐)', r.box && r.boxOn);
  const g = r.bulk.got;
  check('저장 직후 자동 분류: 4문항 모두 유형', g.length === 4 && g.every(x => x[5]), JSON.stringify(g));
  check('같은 단원 2문항은 한 번에, 그림만 있는 문항은 그림과 함께 따로', JSON.stringify(r.bulk.calls.slice().sort()) === JSON.stringify([[1,false],[1,true],[2,false]].sort()), JSON.stringify(r.bulk.calls));
  check('후보는 그 단원(접선의 방정식) 마스터 유형만', r.bulk.unitOnly);
  check('접선 문제 → 도함수의 활용 › 접선의 방정식 유형', /접선의 방정식 구하기/.test(g[0][3]) && g[0][2] === '도함수의 활용', JSON.stringify(g[0]));
  check('확신 없음 → 검토요망(utypeSure=false)', g[1][4] === false && g[0][4] === true, JSON.stringify([g[0][4], g[1][4]]));
  check('중단원이 비어 있던 문항(미적분 › 적분법)은 고른 유형의 중단원으로 채움 + DB 저장', g[2][1] !== '' && r.saved[0] === g[2][1] && r.saved[1] === g[2][3], JSON.stringify([g[2], r.saved]));
  check('끄면 자동 분류 안 함(설정 기억)', r.off.calls === 0 && r.off.ls === '0' && !r.off.typed, JSON.stringify(r.off));
  check('담기 바 [🏷 스터디피크 유형]으로 선택 문항 분류', r.cartBtn.btn && r.cartBtn.typed && r.cartBtn.calls === 1, JSON.stringify(r.cartBtn));
  check('LMS 엑셀 창을 열면 빈 유형 자동 채움', r.lms.sub === '등차수열과 등비수열' && !!r.lms.type && r.lms.calls === 1, JSON.stringify(r.lms));
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
