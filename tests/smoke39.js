// smoke39: OCR 강화 ② 전사/분류 분리 + 렌더 검증 자동 재판독
//  - 전사 프롬프트엔 분류표가 없고, 단원 분류는 텍스트만 묶어 별도 호출
//  - 수식을 실제로 그려(KaTeX·한글 변환) 깨지면 같은 이미지로 1회 재판독 → 나은 쪽 채택
//  - 끝까지 남은 경고는 미리보기에 표시하고 저장 시 #검수주의
const path = require('path');
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addScriptTag({ path: path.join(__dirname, 'node_modules/katex/dist/katex.min.js') });

  // ── 1) 렌더 검증 단위 ──
  const u = await page.evaluate(() => ({
    clean: mathIssues('함수 $f(x)=\\frac{1}{2}x^{2}$ 의 값은?'),
    katex: mathIssues('값 $x^^2$ 은?'),
    brace: mathIssues('값 $\\frac{1}{2$ 은?'),
    dollar: mathIssues('값 $x+1 은?'),
    unknown: mathIssues('$\\begin{array}{c} x \\end{array}$'),
    unread: mathIssues('점 [판독불가] 의 좌표'),
    diagKept: (()=>{ resetEqDiag(); EQ_DIAG.unknown.add('\\keepme'); mathIssues('$\\begin{array}{c}x\\end{array}$'); return [...EQ_DIAG.unknown].join(' '); })(),
    rule: ruleCheckProblem({ question:'값 $x^^2$ 을 구하시오.', choices:[], answer:'1', solution:'풀이', images:[], imgN:0, tags:[] }),
  }));
  check('정상 수식 → 경고 없음', u.clean.length === 0, u.clean.join(' / '));
  check('KaTeX 문법 오류 감지(이중 첨자)', u.katex.some(x=>x.includes('수식 문법 오류')), u.katex.join(' / '));
  check('중괄호 깨짐 감지', u.brace.length > 0, u.brace.join(' / '));
  check('$ 짝 감지', u.dollar.some(x=>x.includes('$ 기호 짝')));
  check('한글 미지원 명령 감지', u.unknown.some(x=>x.includes('지원하지 않는')), u.unknown.join(' / '));
  check('[판독불가] 감지', u.unread.some(x=>x.includes('판독불가')));
  check('검증이 전역 진단(오류 기록용)을 망가뜨리지 않음', u.diagKept === '\\keepme', u.diagKept);
  check('규칙 검수에도 화면 렌더 검사', u.rule.some(x=>x.includes('화면 표시 실패')), u.rule.join(' / '));

  // ── 2) 프롬프트 분리 ──
  const pr = await page.evaluate(() => ({
    t: aiPrompt('힌트'), c: aiClassifyPrompt([{i:0, text:'등차수열 문제'}, {i:3, text:'로그 문제'}]),
    retry: aiPrompt('', ['수식 문법 오류 $x^^2$']),
  }));
  check('전사 프롬프트엔 분류표·단원 칸 없음', !pr.t.includes('분류표') && !pr.t.includes('"subject"') && !pr.t.includes('"difficulty"'));
  check('분류 프롬프트: 분류표 + 문항 번호', pr.c.includes('분류표') && pr.c.includes('#0\n등차수열') && pr.c.includes('#3\n로그'));
  check('재판독 프롬프트에 문제 목록 포함', pr.retry.includes('[재확인 요청]') && pr.retry.includes('$x^^2$'));

  // ── 3) 실제 변환 루프 (스텁 AI) ──
  await page.evaluate(() => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const cv = document.createElement('canvas'); cv.width = 60; cv.height = 30;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,60,30);
    const img = cv.toDataURL('image/png');
    state.bulkDrafts = [
      { num:'1', text:'', sol:'', ans:'', img, pdfText:'HINT-ONE 등차수열 문제' },
      { num:'2', text:'', sol:'', ans:'', img, pdfText:'HINT-TWO 좌표 문제' },
    ];
    window.__calls = [];
    const reply = obj => new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(obj) }] }), { status:200 });
    window.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      const text = (body.messages[0].content.find(c=>c.type==='text')||{}).text || '';
      const hasImg = body.messages[0].content.some(c=>c.type==='image');
      const kind = text.includes('분류표') ? 'classify' : text.includes('HINT-ONE') ? 'one' : text.includes('HINT-TWO') ? 'two' : '?';
      const retry = text.includes('[재확인 요청]');
      window.__calls.push({ kind, retry, hasImg });
      if(kind === 'classify') return reply({ items: [
        { i:0, subject:'수학Ⅰ', chapter:'수열', section:'등차수열', difficulty:4 },
        { i:1, subject:'없는과목', chapter:'?', section:'?', difficulty:9 } ] });
      if(kind === 'one') return reply(retry
        ? { question:'첫째항이 $2$, 공차가 $3$ 인 등차수열의 $a_{5}$ 는?', choices:[], answer:'', hasFigure:false, figureBox:null }
        : { question:'첫째항이 $2$, 공차가 $3$ 인 등차수열의 $a_{5$ 는?', choices:[], answer:'', hasFigure:false, figureBox:null });
      return reply({ question:'점 [판독불가] 의 좌표를 구하시오.', choices:[], answer:'', hasFigure:false, figureBox:null });
    };
  });
  await page.evaluate(async () => { go('add'); setAddMode('bulk'); await aiTranscribeDrafts(); });

  const f = await page.evaluate(() => ({
    calls: window.__calls,
    d: state.bulkDrafts.map(d => ({ text:d.text, issues:d.aiIssues||[], sub:d.aiSub||'', sect:d.aiSect||'', diff:d.aiDiff||0 })),
    preview: document.querySelector('#bulk-preview').textContent,
    status: document.querySelector('#bulk-status').textContent,
  }));
  const one = f.calls.filter(c=>c.kind==='one'), two = f.calls.filter(c=>c.kind==='two'), cl = f.calls.filter(c=>c.kind==='classify');
  check('문항1: 깨진 수식 → 재판독 1회', one.length === 2 && one[1].retry, JSON.stringify(one));
  check('문항1: 재판독 결과(정상) 채택', f.d[0].text.includes('$a_{5}$') && f.d[0].issues.length === 0, f.d[0].text);
  check('문항2: 재판독해도 남은 경고 유지', two.length === 2 && f.d[1].issues.some(x=>x.includes('판독불가')), JSON.stringify(f.d[1].issues));
  check('분류: 텍스트만 1회 묶음 호출', cl.length === 1 && !cl[0].hasImg, JSON.stringify(cl));
  check('분류: 유효한 소단원·난이도 반영', f.d[0].sub==='수학Ⅰ' && f.d[0].sect==='등차수열' && f.d[0].diff===4, JSON.stringify(f.d[0]));
  check('분류: 분류표에 없는 이름은 버림', f.d[1].sub === '' && f.d[1].diff === 0, JSON.stringify(f.d[1]));
  check('미리보기에 경고 표시', f.preview.includes('⚠ 수식 확인 필요') && f.preview.includes('판독불가'));
  check('상태줄에 경고 개수', f.status.includes('수식 확인 필요 1개'), f.status);

  // ── 4) 저장: 경고 문항만 #검수주의 ──
  const saved = await page.evaluate(async () => {
    const before = state.problems.length;
    go('add'); setAddMode('bulk');
    await saveBulk();
    return state.problems.slice(before).map(p => ({ q:p.question.slice(0,12), tags:p.tags, section:p.section, diff:p.difficulty }));
  });
  const s1 = saved.find(p=>p.q.startsWith('첫째항')), s2 = saved.find(p=>p.q.startsWith('점'));
  check('정상 문항: 태그 없음 + 소단원 저장', s1 && s1.tags.length===0 && s1.section==='등차수열' && s1.diff===4, JSON.stringify(s1));
  check('경고 문항: #검수주의', s2 && s2.tags.includes('검수주의'), JSON.stringify(s2));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
