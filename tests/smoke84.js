// smoke84: 국어 랩 스캔본 읽기 — 글자 층이 없는 PDF(복합기 스캔)를 AI가 쪽 그림으로 읽어 지문 세트로 만든다
//   엔진(Node): AI 답 다듬기(clean) · 쪽을 넘는 지문·문항 잇기(assemble) · 선택 과목 구역 · 못 읽은 쪽 경고 · 정답표 · 쪽 그림에서 글 테두리·단 사이·위아래 자를 자리 · 사설 모의고사 이름
//   화면: 스캔 PDF 올리기 → 안내 카드(키 없으면 잠김) → 쪽을 [전체, 단마다 위에서 아래로 여러 조각] 그림으로 → 사용량 한도(429) 쉬고 다시 · 키 오류 뒤 [이어서 읽기] · 못 읽은 쪽만 다시 읽기
//         → 스캔한 정답표 → 저장(쪽 그림을 원본으로) → 세트 화면(스캔본 표시·확인할 낱말·원본 보기) → 백업 왕복 → 원본 지우기·시험 삭제
//   AI는 가짜 답(SPAI.json 바꿔치기)으로 돌린다 — 실제 글자 인식 품질은 이 테스트가 보지 않는다.
const { openKor } = require('../tools/_common.js');
const fx = require('./kor-fixture.js');
const KSCAN = require('../korlab/js/kscan.js');
const KT = require('../korlab/js/ktype.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };
const C5 = a => a.map((t, i) => '①②③④⑤'[i] + ' ' + t);

// 지어낸 시험지(kor-fixture 와 같은 글)를 AI가 쪽마다 옮겨 적은 꼴
const P1 = { exam: '2099학년도 대학수학능력시험 바탕 3회 모의고사 문제지', section: '', blocks: [
  { t: 'head', from: 1, to: 3, text: '다음 글을 읽고 물음에 답하시오.' },
  { t: 'passage', cont: false, text: '도시의 기온이 주변 교외보다 높게 나타나는 현상을 {b}열섬 현상{/b}이라고 한다. 낮 동안 아스팔트와 콘크리트는 태양 에너지를 흡수해 저장했다가 밤에 천천히 내보낸다.\n건물이 빽빽한 곳에서는 "바람길"이 막혀 열이 빠져나가기 어렵다. 나무와 물은 증발⁇ 과정에서 열을 빼앗아 기온을' },
  { t: 'item', num: 1, cont: false, stem: '윗글의 내용과 일치하지 {u}않는{/u} 것은?', viewLabel: '', view: '', choices: C5(['열섬은 도시가 교외보다 더운 현상이다.', '포장된 땅은 낮에 모은 열을 밤에 내보낸다.', '녹지가 줄면 열섬이 약해진다.', '빽빽한 건물은 열이 빠져나가는 것을 막는다.', '냉방기의 열도 열섬에 더해진다.']) },
  { t: 'item', num: 2, cont: false, stem: '<보기>를 바탕으로 ㉠을 이해한 내용으로 가장 적절한 것은? [3점]', viewLabel: '보 기', view: '밤이 되어도 식지 않는 도심의 온도를 재어 보면 교외와의 차이는 새벽에 가장 크다.', choices: C5(['낮에 저장된 열이 밤에 나오기 때문이다.', '밤에는 바람이 더 세게 불기 때문이다.', '교외의 기온이 밤에 오르기 때문이다.']) },
] };
const P2 = { exam: '', section: '', blocks: [
  { t: 'passage', cont: true, text: '낮춘다. 따라서 녹지와 수면이 줄어든 곳일수록 열섬의 세기가 커진다.' },
  { t: 'item', num: 2, cont: true, stem: '', viewLabel: '', view: '', choices: ['④ 냉방기를 밤에만 켜기 때문이다.', '⑤ 나무가 밤에 열을 내기 때문이다.'] },
  { t: 'item', num: 3, cont: false, stem: '윗글을 읽고 나눈 대화로 적절한 것은?', viewLabel: '', view: '', choices: ['바람길을 막아야 시원해지겠군.', '녹지를 늘리면 도움이 되겠군.', '열섬은 낮에만 생기겠군.', '교외가 도시보다 덥겠군.', '수면은 기온과 관계가 없겠군.'] },
  { t: 'head', from: 4, to: 5, text: '다음 시를 읽고 물음에 답하시오.' },
  { t: 'passage', cont: false, text: '봄은 골목 끝에서 온다\n젖은 담장을 넘어\nⓐ {u}아직 덜 마른 빨래{/u} 사이로\n누군가의 이름을 부르며\n- 지어낸 시, 「봄」 -' },
  { t: 'item', num: 4, cont: false, stem: '윗글에 대한 설명으로 가장 적절한 것은?', viewLabel: '', view: '', choices: C5(['공간의 이동에 따라 시상을 전개하고 있다.', '의문형 문장을 되풀이하고 있다.', '색채어를 나란히 늘어놓고 있다.', '과거와 현재를 견주고 있다.', '명령형 어미로 끝맺고 있다.']) },
  { t: 'item', num: 5, cont: false, stem: 'ⓐ에 대한 이해로 적절하지 {u}않은{/u} 것은?', viewLabel: '', view: '', choices: C5(['일상의 사물이다.', '봄이 지나는 길목에 놓여 있다.', '겨울이 끝났음을 알리는 □리다.', '덜 마른 상태로 그려진다.', '골목의 풍경을 이룬다.']) },
  { t: 'item', num: 6, cont: false, stem: '밑줄 친 말의 쓰임이 바르지 {u}않은{/u} 것은?', viewLabel: '', view: '', choices: C5(['부장님께 서류 {u}결재{/u}를 받았다.', '카드로 물건값을 {u}결제{/u}했다.', '두 낱말의 뜻을 {u}혼돈{/u}하여 잘못 썼다.', '갈등을 {u}지양{/u}하고 협력을 지향한다.', '새 제품을 {u}개발{/u}했다.']) },
] };
const ANS = [{ section: '', num: 1, ans: '③' }, { section: '', num: 2, ans: 1 }, { section: '', num: 3, ans: '②' }, { section: '', num: 4, ans: '①' }, { section: '', num: 5, ans: 3 }, { section: '', num: 6, ans: '③' }];

(async () => {
  // ── 엔진(Node) ──
  const c1 = KSCAN.clean(Object.assign({}, P1, { blocks: P1.blocks.concat([{ t: 'memo', text: 'x' }, { t: 'item', num: 0, stem: 'x' }, { t: 'passage', text: '   ' }, null, 'x']) }), 0), c2 = KSCAN.clean(P2, 1);
  check('AI 답 다듬기: 모르는 덩어리·빈 덩어리·틀린 번호를 버리고, <보 기> 이름의 빈칸을 걷고, 곧은 따옴표를 굽은 따옴표로',
    c1.blocks.length === 4 && c1.blocks[3].viewLabel === '보기' && /“바람길”이/.test(c1.blocks[1].text) && KSCAN.clean(null, 3).blocks.length === 0 && KSCAN.clean({ section: '국어 영역(언어와 매체)', blocks: 'x' }, 0).section === '언어와 매체', c1.blocks.length + ' ' + c1.blocks[3].viewLabel);
  const seg = KSCAN.assemble([c1, c2]), s0 = seg.sets[0], it2 = seg.items.find(i => i.num === 2), it3 = seg.items.find(i => i.num === 3), it6 = seg.items.find(i => i.num === 6);
  check('쪽을 넘는 지문은 한 지문으로(이은 자리 표시), 쪽을 넘는 문항은 한 문항으로', seg.sets.length === 2 && seg.items.length === 6 && s0.body.includes('기온을' + KSCAN.J1 + '낮춘다.') && it2.choices.length === 5 && it2.points === 3 && it2.pages.join() === '0,1' && s0.pages.join() === '0,1' && seg.stats.unsureJoins === 1,
    JSON.stringify(seg.stats) + ' ' + it2.choices.length);
  check('선택지 번호가 없으면 붙이고, 세트 범위를 벗어난 번호는 단독 문항', it3.choices[1] === '② 녹지를 늘리면 도움이 되겠군.' && it3.setIdx === 0 && it6.setIdx === -1 && seg.items.find(i => i.num === 5).setIdx === 1, it3.choices[1] + ' ' + it6.setIdx);
  check('못 읽은 글자(□)·확신 없는 낱말(⁇)을 세어 알림', seg.stats.unsureWords === 1 && seg.warnings.some(w => /□/.test(w) && /1곳/.test(w)) && seg.warnings.some(w => /⁇/.test(w)) && seg.exam === P1.exam && seg.scan === true, seg.warnings.join(' / '));
  const sec = KSCAN.assemble([c1, c2,
    KSCAN.clean({ section: '화법과 작문', blocks: [{ t: 'head', from: 35, to: 36, text: '다음은 발표이다.' }, { t: 'passage', text: '발표 글.' }, { t: 'item', num: 35, stem: '가', choices: C5(['a', 'b', 'c', 'd', 'e']) }, { t: 'item', num: 36, stem: '나', choices: C5(['a', 'b', 'c', 'd', 'e']) }] }, 2),
    KSCAN.clean({ section: '국어 영역(언어와 매체)', blocks: [{ t: 'item', num: 35, stem: '다', choices: C5(['a', 'b', 'c', 'd', 'e']) }] }, 3)]);
  const s35 = sec.items.filter(i => i.num === 35);
  check('선택 과목이 바뀌면 같은 번호도 따로(화법과 작문 35번 · 언어와 매체 35번)', s35.length === 2 && s35[0].section === '화법과 작문' && s35[1].section === '언어와 매체' && s35[1].setIdx === -1 && sec.sets.length === 3, s35.map(i => i.section + ':' + i.setIdx).join());
  const gap = KSCAN.assemble([c1, { page: 1, error: 'API 오류 500' }, KSCAN.clean({ blocks: [{ t: 'passage', cont: true, text: '다른 글의 뒷부분.' }] }, 2)]);
  check('못 읽은 쪽: 쪽 번호와 까닭을 알리고, 그 쪽을 건너뛰어 이은 지문·빠진 문항을 경고', gap.warnings.some(w => /^2쪽을 읽지 못했습니다 — API 오류 500/.test(w)) && gap.warnings.some(w => /건너뛰어 이어 붙였습니다/.test(w)) && gap.warnings.some(w => /3번을 못 찾았습니다/.test(w)) && gap.warnings.some(w => /2번 선택지가 3개/.test(w)), gap.warnings.join(' / '));
  const ca = KSCAN.cleanAnswers({ answers: ANS.concat([{ num: 0, ans: 2 }, { num: 7, ans: 9 }, { section: '언어와매체', num: 35, ans: '4' }, null]) });
  check('정답표: ①~⑤·숫자 모두 받고 틀린 칸은 버림', ca.length === 7 && ca[0].ans === 3 && ca[6].section === '언어와 매체' && ca[6].ans === 4 && KSCAN.cleanAnswers(null).length === 0, JSON.stringify(ca.slice(-1)));
  // 쪽 그림(밝기 배열): 두 단 + 가운데 세로선 / 두 단 + 빈 띠 / 한 단
  const W = 600, H = 800, mk = (cols, line) => { const g = new Uint8Array(W * H).fill(255);
    for(let y = 60; y < 740; y++){ if((y - 60) % 20 < 8) for(const [a, b] of cols) for(let x = a; x < b; x++) g[y * W + x] = 20; if(line) { g[y * W + 300] = 20; g[y * W + 301] = 20; } }
    return g; };
  const gLine = mk([[40, 285], [315, 560]], true), gGap = mk([[40, 285], [315, 560]], false), gOne = mk([[40, 560]], false);
  const box = KSCAN.contentBox(gLine, W, H), gut1 = KSCAN.findGutter(gLine, W, H), gut2 = KSCAN.findGutter(gGap, W, H), gut3 = KSCAN.findGutter(gOne, W, H), cut = KSCAN.findCut(gLine, W, 40, 300, 300, 500);
  check('쪽 그림: 글 테두리, 단 사이(세로선·빈 띠), 한 단이면 없음', Math.abs(box.x0 - 40) <= 2 && Math.abs(box.x1 - 559) <= 2 && Math.abs(box.y0 - 60) <= 2 && Math.abs(gut1 - 300) <= 2 && Math.abs(gut2 - 300) <= 6 && gut3 === null, JSON.stringify(box) + ' ' + gut1 + ' ' + gut2 + ' ' + gut3);
  check('한 단을 위·아래로 나눌 자리는 글줄 사이의 빈 줄(가운데 가까이)', cut != null && Math.abs(cut - 400) <= 12 && (cut - 60) % 20 >= 8 && KSCAN.findCut(mk([[40, 285]], false).fill(20), W, 40, 285, 300, 500) === null, String(cut));
  const pr = KSCAN.prompt(3, 20, { cols: 2, parts: 3 }), pr1 = KSCAN.prompt(1, 20, null);
  check('지시문: 쪽 번호·그림 차례·옮겨 적는 규칙', /20쪽 가운데 3번째 쪽/.test(pr) && /왼쪽 단을 위에서 아래로 3조각, 이어서 오른쪽 단을 위에서 아래로 3조각으로/.test(pr) && !/첫 그림은/.test(pr1) && /⁇/.test(pr) && /\{\[:A\}/.test(pr) && /쪽을 위에서 아래로 2조각으로/.test(KSCAN.prompt(1, 2, { cols: 1, parts: 2 })) && /둘째 그림은 같은 쪽을 크게/.test(KSCAN.prompt(1, 2, { cols: 1, parts: 1 })));
  const m1 = KT.examMeta('바탕12회 스캔', '2027학년도 대학수학능력시험 바탕 12회 모의고사 문제지'), m2 = KT.examMeta('x', '2026학년도 대학수학능력시험 문제지'), m3 = KT.examMeta('x', '2026학년도 대학수학능력시험 대비 실전 모의고사 3회');
  check('사설 모의고사: 수능 대비 사설을 수능으로 잘못 읽지 않고 상표·회차를 이름에 남김', KT.examName(m1) === '2027학년도 바탕 12회 모의고사 (고3)' && m1.kind === '사설 모의고사' && m2.kind === '수능' && m3.kind === '사설 모의고사' && !m3.label, KT.examName(m1) + ' / ' + m2.kind + ' / ' + m3.kind);

  // ── 화면 ──
  const lab = await openKor();
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const scan = (await fx.makeScanPdf(lab.browser, page, await fx.makePdf(lab.browser, fx.EXAM))).toString('base64');
  const scanSol = (await fx.makeScanPdf(lab.browser, page, await fx.makePdf(lab.browser, fx.SOLUTION))).toString('base64');

  const r = await page.evaluate(async ({ scan, scanSol, P1, P2, ANS }) => {
    const file = (b64, name) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name, { type: 'application/pdf' });
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    // 1) 스캔 PDF 올리기: 오류 대신 안내 카드. 키가 없으면 시작 단추가 잠긴다
    go('upload'); UP.examFile = file(scan, '스캔 시험지.pdf'); upAutoName(); await upRead();
    out.card = { status: $('#up-status').textContent, card: !!$('#up-scan'), disabled: $('#up-scan-run').disabled, noKey: /API 키가 없습니다/.test($('#up-scan').textContent), pages: UP.scan && UP.scan.n };
    localStorage.setItem('sp-lab-apikey', 'sk-ant-api03-test'); renderUpload();
    out.card.enabled = !$('#up-scan-run').disabled && /읽기 시작 \(2쪽\)/.test($('#up-scan-run').textContent);
    // 2) 쪽 그림: [쪽 전체, 왼쪽 단 위·아래, 오른쪽 단 위·아래]
    const im = await scanPageImages(UP.doc, 1);
    const dims = await Promise.all(im.imgs.map(b => new Promise(res => { const i = new Image(); i.onload = () => res([i.width, i.height]); i.src = 'data:image/jpeg;base64,' + b; })));
    out.img = { n: im.imgs.length, lay: im.lay, cols: im.cols, max: Math.max(...dims.flat()), halves: dims.slice(1).every(d => d[0] * d[1] <= 1.16e6) && Math.abs(dims[1][0] - dims[2][0]) <= 1, dims: dims.map(d => d.join('x')).join(' '), page: /^data:image\/jpeg;base64,/.test(im.pageJpeg) };
    // 3) AI 바꿔치기: 지시문의 쪽 번호를 보고 답한다
    const calls = []; let mode = 'A';
    SPAI.json = async (content, max, opts) => {
      const text = content[content.length - 1].text;
      if(/정답표/.test(text)){ calls.push({ k: 'ans', imgs: content.length - 1 }); return { answers: ANS }; }
      const pg = +text.match(/가운데 (\d+)번째 쪽/)[1], nth = calls.filter(c => c.k === 'p' + pg + mode).length;
      calls.push({ k: 'p' + pg + mode, imgs: content.filter(c => c.type === 'image').length, model: (opts || {}).model, max });
      await sleep(15);
      if(mode === 'A'){ if(pg === 1 && nth === 0) throw new Error('API 오류 429 — rate limit'); if(pg === 2) throw new Error('API 키가 올바르지 않습니다(401) — [백업·설정]에서 키를 확인하세요.'); }
      if(mode === 'B' && pg === 2) throw new Error('AI 응답이 길이 제한에 잘렸습니다');
      return pg === 1 ? P1 : P2;
    };
    UP.rateWait = 10;
    // A: 1쪽은 사용량 한도(429)에 한 번 걸렸다가 다시 읽히고, 2쪽은 키 오류 → 전체를 멈추되 읽은 쪽은 남는다
    await upScanRun();
    out.a = { seg: !!UP.seg, p1: calls.filter(c => c.k === 'p1A').length, p2: calls.filter(c => c.k === 'p2A').length, card: !!$('#up-scan'), resume: $('#up-scan-run') ? $('#up-scan-run').textContent : '', kept: /1쪽은 이미 읽었습니다/.test($('#up-scan') ? $('#up-scan').textContent : ''),
      imgs: calls[0].imgs, model: calls[0].model === SPAI.settings().strongModel, status: $('#up-scan-status') ? $('#up-scan-status').textContent : '' };
    // B: 이어서 읽기 — 남은 2쪽만 부르고(1쪽은 다시 읽지 않음), 2쪽이 두 번 다 실패 → 미리보기에 경고와 [못 읽은 쪽만 다시 읽기]
    mode = 'B'; $('#up-scan-run').click(); while(UP.busy) await sleep(20);
    out.b = { p1: calls.filter(c => c.k === 'p1B').length, p2: calls.filter(c => c.k === 'p2B').map(c => c.max).join(), items: UP.seg ? UP.seg.items.map(i => i.num).join() : '', retry: !!$('#up-scan-retry'),
      warn: UP.seg ? UP.seg.warnings.join(' / ') : '', name: $('#up-name').value, meta: [$('#up-year').value, $('#up-grade').value, $('#up-kind').value].join('/'), left: scanLeft() };
    // C: 못 읽은 쪽만 다시 — 이번에는 성공. 스캔한 정답·해설 PDF도 붙여서 정답표를 읽는다
    mode = 'C'; UP.solFile = file(scanSol, '스캔 해설.pdf'); $('#up-scan-retry').click(); while(UP.busy) await sleep(20);
    const s = UP.seg;
    out.c = { p1: calls.filter(c => c.k === 'p1C').length, p2: calls.filter(c => c.k === 'p2C').length, ans: calls.filter(c => c.k === 'ans').length, ansImgs: (calls.find(c => c.k === 'ans') || {}).imgs,
      sets: s.sets.map(x => `${x.from}~${x.to}:${x.cat}:${x.title}:${x.items.map(i => i.num).join('')}`).join(' | '), items: s.items.length, answers: s.items.map(i => i.answer).join(''), stats: s.stats, retry: !!$('#up-scan-retry'),
      banner: /스캔본을 AI가 옮긴 글입니다/.test($('#up-preview').textContent), chips: /정답 6/.test($('#up-preview').textContent), uq: document.querySelectorAll('#up-preview .uq').length, warn: s.warnings.join(' / '),
      typed: s.items.filter(i => i.typeId).length, pts: s.items.find(i => i.num === 2).points, status: $('#up-status').textContent };
    // 4) 저장: 쪽 그림을 한 번씩만 원본으로 남기고, 지문·문항이 쪽 번호로 가리킨다
    await upSave();
    const imgs = await DB.all('images'), p1 = K.passages.find(p => p.range[0] === 1), p2 = K.passages.find(p => p.range[0] === 4), i6 = K.items.find(i => i.num === 6);
    out.save = { ps: K.passages.length, is: K.items.length, ocr: K.passages.concat(K.items).every(x => x.ocr === true), imgs: imgs.length, ids: imgs.every(x => /^scan-k\w+-[01]$/.test(x.id) && x.imgs.length === 1), sp1: p1.scanPages.length, sp2: p2.scanPages.length, sp6: i6.scanPages.join() === p2.scanPages.join(),
      exam: K.exams.map(e => [e.name, e.kind, e.year, e.grade, e.passages, e.items].join('/')).join() };
    // 5) 세트 화면: 스캔본 표시, 확인할 낱말(빨간 ?) — 검수 화면에서만 보이고 출력·AI·검색에는 섞이지 않는다
    go('set', p1.id); K.showOrig = true; renderSet(); await sleep(500);
    const vs = $('#view-set');
    out.set = { chip: /스캔본 · AI가 옮김 · 확인할 낱말 1/.test(vs.textContent), uq: vs.querySelectorAll('.uq').length, orig: vs.querySelectorAll('.passage .orig img').length, box: vs.querySelectorAll('.passage .bx').length,
      plain: !/⁇/.test(kHtml(p1.body, {})) && !/class="uq"/.test(kHtml(p1.body, {})), ai: !/⁇/.test(aiText(p1.body)), snip: !/⁇/.test(snippet(p1.body, 400)), ev: !!KEV.find(p1.body, '증발 과정에서 열을 빼앗아'), quote: /“바람길”/.test(p1.body) };
    K.showOrig = false;
    // 6) 백업 왕복: 스캔본 표시와 쪽 그림 연결이 남는다
    const backup = JSON.stringify({ app: 'sp-korlab', version: 2, passages: K.passages, items: K.items, images: await DB.all('images') });
    const name = p1.src.name;
    await examDropImages(name);
    out.drop = { imgs: (await DB.all('images')).length, ps: K.passages.length };
    for(const st of ['passages', 'items', 'images']) await DB.clear(st);
    await importBackup(new File([backup], 'b.json', { type: 'application/json' }));
    const q1 = K.passages.find(p => p.range[0] === 1);
    go('set', q1.id); K.showOrig = true; renderSet(); await sleep(400);
    out.back = { ps: K.passages.length, is: K.items.length, ocr: K.passages.concat(K.items).every(x => x.ocr === true), sp: q1.scanPages.length, imgs: (await DB.all('images')).length, orig: $('#view-set').querySelectorAll('.passage .orig img').length };
    K.showOrig = false;
    await examDelete(name); await sleep(100);
    out.del = { ps: K.passages.length, is: K.items.length, imgs: (await DB.all('images')).length };
    return out;
  }, { scan, scanSol, P1, P2, ANS });

  check('스캔 PDF: 오류 대신 안내 카드가 뜨고, API 키가 없으면 시작 단추가 잠김', /스캔본입니다\(2쪽\)/.test(r.card.status) && r.card.card && r.card.disabled && r.card.noKey && r.card.pages === 2 && r.card.enabled, JSON.stringify(r.card));
  check('쪽 그림: 쪽 전체 + 단마다 위에서 아래로 여러 조각(글자가 줄어들지 않는 크기)', r.img.lay.parts >= 2 && r.img.n === 1 + 2 * r.img.lay.parts && r.img.cols && r.img.lay.cols === 2 && r.img.max <= 1560 && r.img.halves && r.img.page, JSON.stringify(r.img));
  check('사용량 한도(429)는 쉬었다 다시, 키 오류는 전체를 멈추되 읽은 쪽은 남김 → [이어서 읽기]', !r.a.seg && r.a.p1 === 2 && r.a.p2 === 1 && r.a.card && /이어서 읽기 \(남은 1쪽\)/.test(r.a.resume) && r.a.kept && r.a.imgs === r.img.n && r.a.model && /API 키/.test(r.a.status), JSON.stringify(r.a));
  check('이어서 읽기: 읽은 쪽은 다시 부르지 않고, 끝내 못 읽은 쪽은 경고와 [못 읽은 쪽만 다시 읽기]', r.b.p1 === 0 && r.b.p2 === '12000,16000' && r.b.items === '1,2' && r.b.retry && r.b.left === 1 && /2쪽을 읽지 못했습니다 — AI 응답이 길이 제한/.test(r.b.warn), JSON.stringify(r.b));
  check('시험 이름·정보를 머리말에서(사설 모의고사는 상표·회차 유지)', r.b.name === '2099학년도 바탕 3회 모의고사 (고3)' && r.b.meta === '2099/고3/사설 모의고사', r.b.name + ' ' + r.b.meta);
  check('못 읽은 쪽만 다시 읽어 완성: 지문 2 · 문항 6 · 단독 1, 분류·유형·배점까지', r.c.p1 === 0 && r.c.p2 === 1 && r.c.items === 6 && /^1~3:독서:.*:123 \| 4~5:문학:.*봄.*:45$/.test(r.c.sets) && !r.c.retry && r.c.banner && r.c.typed >= 4 && r.c.pts === 3 && /스캔본 읽기 완료/.test(r.c.status), r.c.sets + ' typed ' + r.c.typed);
  check('스캔한 정답·해설: 정답표만 읽어 붙임', r.c.ans === 1 && r.c.ansImgs >= 3 && r.c.answers === '③①②①③③' && r.c.chips, r.c.ans + ' ' + r.c.answers);
  check('미리보기: 확신 없는 낱말 표시·경고', r.c.uq === 1 && /□/.test(r.c.warn) && /⁇/.test(r.c.warn) && r.c.stats.unsureWords === 1, r.c.warn);
  check('저장: 쪽 그림 2장을 원본으로, 지문·문항이 쪽으로 연결', r.save.ps === 2 && r.save.is === 6 && r.save.ocr && r.save.imgs === 2 && r.save.ids && r.save.sp1 === 2 && r.save.sp2 === 1 && r.save.sp6 && r.save.exam === '2099학년도 바탕 3회 모의고사 (고3)/사설 모의고사/2099/고3/2/6', JSON.stringify(r.save));
  check('세트 화면: 스캔본 표시 · 빨간 ? · 원본 보기(쪽 그림 2장)', r.set.chip && r.set.uq === 1 && r.set.orig === 2 && r.set.box === 1 && r.set.quote, JSON.stringify(r.set));
  check('확인 표시(⁇)는 출력·AI·목록·근거 찾기에 섞이지 않음', r.set.plain && r.set.ai && r.set.snip && r.set.ev, JSON.stringify(r.set));
  check('원본 지우기는 쪽 그림도 지우고, 백업 왕복 뒤에도 스캔본 표시·원본 연결이 남음', r.drop.imgs === 0 && r.drop.ps === 2 && r.back.ps === 2 && r.back.is === 6 && r.back.ocr && r.back.sp === 2 && r.back.imgs === 2 && r.back.orig === 2, JSON.stringify(r.drop) + ' ' + JSON.stringify(r.back));
  check('시험 삭제: 쪽 그림까지', r.del.ps === 0 && r.del.is === 0 && r.del.imgs === 0, JSON.stringify(r.del));
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
