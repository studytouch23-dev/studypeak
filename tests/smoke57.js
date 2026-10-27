// smoke57: 👯 쌍둥이·유사 변형 문제 — 선택 문항으로 만들기 → 그림(설계도) 다시 그림 → 독립 검산 → 원본과 연결해 새 묶음 저장
//          → [📚 원본 + 쌍둥이·변형으로 교재 만들기] (원본 → 쌍둥이 → 변형 순) → HTML·한글에 표시
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
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 120;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,200,120); g.strokeRect(20,20,160,80);
    const IMG = cv.toDataURL('image/png');
    const base = { answer:'', solution:'', subject:'수학Ⅱ', chapter:'적분', section:'', grade:'고3', srcType:'기출', srcName:'10월 모의고사', srcYear:'', difficulty:3, tags:[], reviewed:true, batch:'bSRC', batchName:'10월 모의고사 · 10/24 09:00' };
    const now = Date.now();
    const srcs = [
      { ...base, id:'S2', origNo:'2', question:'KWS2 함수 $f(x)=x^2$ 의 $f(3)$ 은?', choices:['① 6','② 7','③ 8','④ 9','⑤ 10'], answer:'④', solution:'$3^2=9$', images:[], createdAt:now, updatedAt:now },
      { ...base, id:'S1', origNo:'1', question:'KWS1 곡선과 x축으로 둘러싸인 넓이는?\n[그림]', choices:[], answer:'6', solution:'적분', images:[IMG],
        figSpecs:[{ kind:'graph', x:[-1,4], y:[-2,5], curves:[{ f:'x^2-3*x' }], size:[200,120], fontPx:15 }], createdAt:now+1, updatedAt:now+1 },
      { ...base, id:'S3', origNo:'3', question:'KWS3 삼각형 ABC 의 넓이는?\n[그림]', choices:[], answer:'12', solution:'밑변×높이÷2', images:[IMG], createdAt:now+2, updatedAt:now+2 },
    ];
    for(const p of srcs){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    const calls = [];
    window.fetch = async (u, o) => {
      const body = JSON.parse(o.body), c = body.messages[0].content, t = c.find(x => x.type === 'text').text;
      const imgs = c.filter(x => x.type === 'image').length;
      let reply;
      if(t.includes('[원본 문제]')){
        const kw = (t.split('[원본 문제]').pop().match(/KWS\d/)||[''])[0];
        calls.push({ kind:'gen', kw, imgs, model: body.model, hasSpec: t.includes('[원본 그림 설계도]'), diffHarder: t.includes('조금 어렵게'), mc: t.includes('원본이 객관식') });
        const mk = (kind, n) => ({ kind, question: `${kw} ${kind}${n} 새 문제 $x^{2}+${n}$ 의 값은?` + (kw==='KWS1' || kw==='KWS3' ? '\n[그림]' : ''),
          choices: kw === 'KWS2' ? ['① 1','② 2','③ 3','④ 4','⑤ 5'] : [], answer: kw === 'KWS2' ? '③' : String(10+n),
          solution: kw === 'KWS3' && kind === '변형' ? '잘못된 수식 $\\frac{1}{$ 풀이' : `풀이 ${kind}${n}`,
          figure: kw === 'KWS1' ? { kind:'graph', x:[-1,5], y:[-3,6], curves:[{ f:'x^2-4*x' }] } : kw === 'KWS3' ? { kind:'geometry', points:{ A:[0,3], B:[0,0], C:[4,0] }, polygons:[{ p:['A','B','C'] }] } : null });
        reply = { items: [ mk('쌍둥이', 1), mk('변형', 1), mk('쌍둥이', 2) ] };      // 요청(쌍둥이1·변형1)보다 하나 더 → 버려야 함
      } else if(t.includes('정답은 일부러 알려주지 않습니다')){
        calls.push({ kind:'verify', imgs, hasFig: t.includes('[그림 내용(설계도)]') });
        reply = t.includes('KWS2 변형') ? { answer:'①', work:'', wellPosed:true } : t.includes('KWS2') ? { answer:'③', wellPosed:true } : { answer: t.match(/쌍둥이1|변형1/) ? '11' : '0', wellPosed:true };
      } else reply = {};
      return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(reply) }] }), { status:200 });
    };
    // 등록 묶음 화면에서 [👯 이 묶음으로 쌍둥이·변형 만들기]
    go('db'); resetFilters(); $('#filter-batch').value = 'bSRC'; renderDB();
    const bannerBtn = [...document.querySelectorAll('#batch-banner button')].find(b => b.textContent.includes('쌍둥이·변형 만들기'));
    bannerBtn.click();
    const modal = { title: $('#modal-body h3').textContent, est: $('#tw-est').textContent };
    $('#tw-diff').value = 'harder';
    await startTwinMaker();
    await new Promise(r => setTimeout(r, 300));
    const batchKey = $('#filter-batch').value;
    const made = batchProblems(batchKey);
    const banner = $('#batch-banner').textContent;
    const card = [...document.querySelectorAll('#plist .pcard')].map(c => c.textContent).join(' ');
    const recs = []; for(const p of made) recs.push(await DB.get('problems', p.id));
    // 교재
    twinBookToSheet(batchKey);
    const cart = cartList().map(p => p.id === 'S1' || p.id === 'S2' || p.id === 'S3' ? p.id : (p.twinKind + ':' + p.origNo));
    const { html } = await buildHtmlExport('book', cartList());
    return { modal, calls, made: made.map(p => p.twinKind + ':' + p.origNo + ':' + p.twinOf), recs: recs.map(p => ({ k:p.twinKind, no:p.origNo, of:p.twinOf, tags:p.tags, img: (p.images||[]).length, spec: p.figSpecs && p.figSpecs[0] && p.figSpecs[0].kind,
      size: p.figSpecs && p.figSpecs[0] && p.figSpecs[0].size, fontPx: p.figSpecs && p.figSpecs[0] && p.figSpecs[0].fontPx, diff: p.difficulty, src: p.srcName, q: p.question, verify: p.verify && p.verify.result })),
      banner, card, cart, html: { marks: (html.match(/class="twinmark"/g)||[]).length, svg: html.includes('data:image/svg+xml') }, title: $('#s-title').value };
  });
  const gen = r.calls.filter(c => c.kind === 'gen'), ver = r.calls.filter(c => c.kind === 'verify');
  check('창: 원본 3문항, 예상 호출 수 안내', r.modal.title.includes('원본 3문항') && /새 문제 6개/.test(r.modal.est), r.modal.est);
  check('원본마다 1번씩 생성 호출, 그림 모델(Sonnet), 난이도 "조금 어렵게"', gen.length === 3 && gen.every(c => c.model === 'claude-sonnet-5-5' && c.diffHarder), JSON.stringify(gen));
  check('설계도 있는 원본은 설계도를, 그림만 있는 원본은 그림 이미지를 함께 보냄', gen.find(c => c.kw === 'KWS1').hasSpec && gen.find(c => c.kw === 'KWS1').imgs === 0 && gen.find(c => c.kw === 'KWS3').imgs === 1, JSON.stringify(gen));
  check('객관식 원본은 객관식으로 만들라고 안내', gen.find(c => c.kw === 'KWS2').mc && !gen.find(c => c.kw === 'KWS1').mc);
  check('요청한 만큼만 저장 (원본당 쌍둥이 1 + 변형 1 = 6)', r.recs.length === 6, r.made.join(' | '));
  check('독립 검산: 새 문제마다 1번, 그림 있는 문제는 설계도도 함께', ver.length === 6 && ver.filter(c => c.hasFig).length === 4, ver.length);
  const R = (no, k) => r.recs.find(x => x.no === no && x.k === k) || {};
  check('원본과 연결(twinOf)·원래 번호·출처·난이도 한 단계 위', R('1','쌍둥이').of === 'S1' && R('2','변형').of === 'S2' && R('1','쌍둥이').src === '10월 모의고사 쌍둥이·변형' && R('1','쌍둥이').diff === 4, JSON.stringify(R('1','쌍둥이')));
  check('그림: 새 숫자에 맞는 설계도로 다시 그림 (원본 크기·글자 크기 이어받음)', R('1','쌍둥이').img === 1 && R('1','쌍둥이').spec === 'graph' && JSON.stringify(R('1','쌍둥이').size) === '[200,120]' && R('1','쌍둥이').fontPx === 15 && R('3','변형').spec === 'geometry', JSON.stringify([R('1','쌍둥이'), R('3','변형')].map(x => [x.spec, x.size, x.fontPx])));
  check('본문에 [그림] 자리', /\[그림\]/.test(R('1','쌍둥이').q));
  check('태그: 쌍둥이/변형 + AI생성, 검산 불일치 #검산불일치, 깨진 수식 #검수주의', R('2','쌍둥이').tags.join() === '쌍둥이,AI생성' && R('2','변형').tags.includes('검산불일치') && R('3','변형').tags.includes('검수주의'), JSON.stringify(r.recs.map(x => x.tags)));
  check('저장 후 새 묶음 표시 + [📚 원본 + 쌍둥이·변형으로 교재 만들기]', r.banner.includes('쌍둥이·변형') && r.banner.includes('📚 원본 + 쌍둥이·변형으로 교재 만들기'), r.banner.slice(0, 100));
  check('카드에 👯 쌍둥이·변형 표시', /👯 쌍둥이 1번/.test(r.card) && /👯 변형 2번/.test(r.card));
  check('교재 순서: 원본 → 쌍둥이 → 변형 (원본 번호 순)', JSON.stringify(r.cart) === JSON.stringify(['S1','쌍둥이:1','변형:1','S2','쌍둥이:2','변형:2','S3','쌍둥이:3','변형:3']), JSON.stringify(r.cart));
  check('교재 제목 = "10월 모의고사 쌍둥이·변형"', r.title === '10월 모의고사 쌍둥이·변형', r.title);
  check('HTML 교재: 쌍둥이·변형 표시 6개, 설계도 그림은 벡터', r.html.marks === 6 && r.html.svg, JSON.stringify(r.html));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
