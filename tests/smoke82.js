// smoke82: 국어 랩 출력·교재 만들기 — 양식 3종(학습지·시험지·교재), 문제지와 정답·해설지 따로 인쇄, 번호 다시 매김, 문항 단위 고르기,
//          OX·서술형, 원본 조각, [A] 구간 괄호 그리기, 같은 구성의 LMS 엑셀·유형 분류표(번호·유형·정답 일치), 구성 저장·불러오기, 다른 화면의 인쇄 단추
const { openKor } = require('../tools/_common.js');
const fx = require('./kor-fixture.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openKor();
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const exam = (await fx.makePdf(lab.browser, fx.EXAM)).toString('base64'), sol = (await fx.makePdf(lab.browser, fx.SOLUTION)).toString('base64');

  const r = await page.evaluate(async ({ exam, sol }) => {
    const file = (b64, name) => new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], name, { type: 'application/pdf' });
    const out = {}, NAME = '2099 지어낸 모의';
    go('sheet'); out.empty = /아직 지문이 없습니다/.test($('#view-sheet').textContent);
    localStorage.setItem('sp-korlab-orig', 'all'); go('upload'); UP.examFile = file(exam, NAME + '.pdf'); UP.solFile = file(sol, '해설.pdf'); upAutoName(); await upRead(); await upSave();
    const p1 = K.passages.find(p => /열섬/.test(p.title)), p2 = K.passages.find(p => /봄/.test(p.title)), i1 = itemsOf(p1.id)[0], i5 = itemsOf(p2.id)[1], single = K.items.find(i => !i.passageId), now = Date.now();
    i1.ev = { quotes: ['녹지와 수면이 줄어든 곳일수록 열섬의 세기가 커진다.'], x: [], neg: true }; await DB.put('items', i1);
    i5.stem = i5.stem + ' [그림]'; await DB.put('items', i5);          // 그림이 있던 문항 흉내 → 원본 조각으로 실려야 함
    p1.body = p1.body.replace('냉방기와', '{[:A}냉방기와') + '{/[}'; await DB.put('passages', p1);   // [A] 구간(문단 가운데서 시작)
    Object.assign(single, { cat: '문법', sub: '단어', title: '단어의 쓰임', typeId: 'G05' }); await DB.put('items', single);
    const base = { passageId: p1.id, num: 1, section: '', src: p1.src, variantOf: i1.id, typeId: 'R01', subTypes: [], createdAt: now, updatedAt: now, verify: { status: 'pass', notes: [] } };
    await DB.putMany('items', [Object.assign({ id: 'vox', vkind: 'ox', kind: 'ox', stem: '녹지가 줄면 열섬이 약해진다.', choices: [], answer: 'X', explain: '2문단과 반대' }, base),
      Object.assign({ id: 'ves', vkind: 'essay', kind: 'essay', stem: '㉠의 까닭을 쓰시오.', view: '한 문장으로 쓸 것', viewLabel: '조건', choices: [], answer: '', model: '낮에 저장된 열이 밤에 나오기 때문이다.', rubric: ['저장 — 3점'], points: 5 }, base, { createdAt: now + 1 }),
      Object.assign({ id: 'vtw', vkind: 'twin', stem: '윗글의 내용과 일치하는 것은?', choices: ['① 가', '② 나', '③ 다', '④ 라', '⑤ 마'], answer: '④', points: 2, explain: '쌍둥이 해설', wrong: '① 틀림' }, base, { createdAt: now + 2 })]);
    await loadAll();
    // [A] 구간 괄호 그리기(세트 화면)
    go('set', p1.id);
    const brk = $('#view-set .passage .brk');
    out.brk = { n: document.querySelectorAll('#view-set .passage .brk').length, label: brk && brk.querySelector('.brl').textContent, inside: brk && /냉방기와/.test(brk.textContent), before: brk && !/건물이/.test(brk.textContent), cont: brk && brk.querySelector('.pl.cont') != null, noTok: !/\{\[:|\{\/\[\}/.test($('#view-set').textContent), printBtn: !!$('#btn-print') };
    let printed = 0; const titles = []; window.print = () => { printed++; titles.push(document.title); };
    // 세트 화면의 [인쇄·출력] → 그 지문만 고른 채로
    $('#btn-print').click();
    out.fromSet = { view: K.view, picks: Object.keys(SH.picks).join() === p1.id, title: SH.title, forms: [...document.querySelectorAll('#sh-forms .form')].map(b => b.dataset.form).join(), hiddenRoot: getComputedStyle($('#print-root')).display };
    SH.picks = {}; renderSheet(); out.disabled = $('#sh-print').disabled; await shPrint('q'); out.noPick = printed;
    SH.picks[p1.id] = true; SH.picks[p2.id] = true; SH.singles[single.id] = true; SH.title = '연습 1회'; SH.sub = '고3 A반'; SH.form = 'sheet'; renderSheet(); await new Promise(r => setTimeout(r, 400));
    const pv = $('#sh-pv-q'), pa = $('#sh-pv-a');
    out.pv = { cls: pv.querySelector('.sheet').className, sets: pv.querySelectorAll('.sset').length, heads: [...pv.querySelectorAll('.shead b')].map(h => h.textContent).join('|'), q: pv.querySelectorAll('.sq').length, nums: [...pv.querySelectorAll('.sstem > b:first-child')].map(b => b.textContent).join(''),
      title: pv.querySelector('.shd b').textContent, sub: /고3 A반/.test(pv.querySelector('.shs').textContent), ox: pv.querySelectorAll('.sox').length, lines: pv.querySelectorAll('.slines').length, cond: /<조건>/.test(pv.textContent), u: pv.querySelectorAll('.spassage u').length, noJoinDots: pv.querySelectorAll('.jm').length,
      img: pv.querySelectorAll('.sq .simg img').length, brk: pv.querySelectorAll('.spassage .brk').length, noAnsInQ: pv.querySelectorAll('.sol, .quick').length, count: $('#sh-count').textContent };
    out.pa = { quick: pa.querySelectorAll('.quick span').length, quickTxt: [...pa.querySelectorAll('.quick b')].map(b => b.textContent).join(' '), sols: pa.querySelectorAll('.sol').length, sets: pa.querySelectorAll('.aset').length, txt: pa.textContent.replace(/\s+/g, ' '), noQ: pa.querySelectorAll('.sq, .spassage').length };
    await shPrint('q'); const rootQ = { q: document.querySelectorAll('#print-root .sq').length, a: document.querySelectorAll('#print-root .sol').length };
    await shPrint('a'); const rootA = { q: document.querySelectorAll('#print-root .sq').length, a: document.querySelectorAll('#print-root .sol').length };
    out.print = { printed, rootQ, rootA, titles: titles.join('|') };
    // 문항 단위로 빼기 · 원 문항만 · 5지선다만
    SH.off[i1.id] = true; renderSheet(); await new Promise(r => setTimeout(r, 300)); out.off = $('#sh-pv-q').querySelectorAll('.sq').length; delete SH.off[i1.id];
    SH.mcOnly = true; renderSheet(); await new Promise(r => setTimeout(r, 300)); out.mcOnly = { q: $('#sh-pv-q').querySelectorAll('.sq').length, nums: [...$('#sh-pv-q').querySelectorAll('.sstem > b:first-child')].map(b => b.textContent).join('') };
    // 같은 구성의 LMS 엑셀 · 유형 분류표
    const got = [], oc = URL.createObjectURL, clk = HTMLAnchorElement.prototype.click; let last = null;
    URL.createObjectURL = b => { last = b; return oc.call(URL, b); };
    HTMLAnchorElement.prototype.click = function(){ if(this.download){ got.push({ name: this.download, blob: last }); } else clk.call(this); };
    SH.mcOnly = false; await shDownloadLms(); out.lmsBlocked = got.length;      // OX·서술형이 섞여 있으면 만들지 않음
    SH.mcOnly = true; await shDownloadLms(); await shDownloadClass();
    const open = async b => { const z = await JSZip.loadAsync(await b.arrayBuffer()); return { wb: await z.file('xl/workbook.xml').async('string'), s1: await z.file('xl/worksheets/sheet1.xml').async('string'), sst: await z.file('xl/sharedStrings.xml').async('string') }; };
    const L = await open(got[0].blob), C = await open(got[1].blob), rows = shRows();
    out.lms = { names: got.map(g => g.name).join(' | '), rows: rows.map(x => [x.num, x.cat, x.typeId, x.answer, x.points].join(':')).join(' '), sheets: /name="ExamTemplate"/.test(L.wb) && /state="hidden"/.test(L.wb), xmlRows: (L.s1.match(/<row /g) || []).length,
      has: /연습 1회/.test(L.sst) && /R01 세부 정보 파악/.test(L.sst) && /G05 사례 적용/.test(L.sst) && /지어낸 시 「봄」/.test(L.sst) && /단어의 쓰임/.test(L.sst), noSelfClose: !/<c [^>]*\/>/.test(L.s1), cls: /name="전체"/.test(C.wb) && /쌍둥이/.test(C.sst) };
    // 구성 저장 → 풀기 → 불러오기
    SH.form = 'exam'; await shSave(); const sid = SH.id; SH.picks = {}; SH.singles = {}; SH.title = ''; SH.form = 'sheet'; renderSheet();
    out.saved = { n: SH.saved.length, listed: /저장한 구성/.test($('#view-sheet').textContent) }; shLoad(sid); await new Promise(r => setTimeout(r, 300));
    out.loaded = { title: SH.title, form: SH.form, picks: Object.keys(SH.picks).length, singles: Object.keys(SH.singles).length, mcOnly: SH.mcOnly, q: $('#sh-pv-q').querySelectorAll('.sq').length };
    // 시험지 양식 · 교재 양식
    out.exam = { cls: $('#sh-pv-q .sheet').className, title: ($('#sh-pv-q .xtitle') || {}).textContent, info: !!$('#sh-pv-q .xinfo'), end: !!$('#sh-pv-q .xend') };
    SH.form = 'book'; SH.mcOnly = false; renderSheet(); await new Promise(r => setTimeout(r, 400));
    const bk = $('#sh-pv-q');
    out.book = { cls: bk.querySelector('.sheet').className, cover: bk.querySelector('.cover h1').textContent, toc: bk.querySelectorAll('.toc li').length, sols: bk.querySelectorAll('.ssol').length, sol: bk.querySelectorAll('.ssol .sol').length, btn: !!$('#sh-print-book'), noSeparateAns: !$('#sh-pv-a'), ev: /근거 “녹지와 수면이/.test(bk.textContent.replace(/\s+/g, ' ')) };
    await shPrint('book'); out.book.printed = printed; out.book.title = titles[titles.length - 1];
    // 다른 화면의 인쇄 단추
    go('export'); K.ex.src = NAME; renderExport(); $('#ex-print').click();
    out.fromExport = { view: K.view, form: SH.form, vars: SH.vars, q: shNumbered().reduce((s, x) => s + x.items.length, 0), title: SH.title };
    go('items'); K.fi = { q: '결재', cat: '', kind: '', type: '' }; renderItems(); $('#if-print').click(); out.fromItems = { view: K.view, q: shNumbered().reduce((s, x) => s + x.items.length, 0) };
    K.fi.q = ''; go('passages'); $('#pl-print').click(); out.fromPassages = { view: K.view, picks: Object.keys(SH.picks).length };
    K.va.pid = p1.id; go('variant'); $('#va-print').click(); out.fromVariant = { view: K.view, picks: Object.keys(SH.picks).join() === p1.id, title: SH.title };
    SH.picks = {}; SH.singles = {}; renderSheet(); await new Promise(r => setTimeout(r, 300)); await shPrint('q'); out.none = { printed, preview: $('#sh-preview').children.length };
    out.theme = getComputedStyle(document.querySelector('.btn')).backgroundColor + ' / ' + getComputedStyle(document.querySelector('#sidebar')).backgroundImage.slice(0, 15);
    return out;
  }, { exam, sol });
  await page.emulateMedia({ media: 'print' });
  const media = await page.evaluate(() => [getComputedStyle(document.querySelector('#layout')).display, getComputedStyle(document.querySelector('#print-root')).display].join());

  check('지문이 없으면 안내', r.empty);
  check('[A] 구간: 괄호로 그리고 이름은 왼쪽에, 문단 가운데서 시작하면 그 자리에서 나눔, 표시 글자는 안 보임', r.brk.n === 1 && r.brk.label === '[A]' && r.brk.inside && r.brk.before && r.brk.cont && r.brk.noTok, JSON.stringify(r.brk));
  check('세트 화면 [인쇄·출력] → 그 지문만 고른 출력 화면, 양식 3종, 인쇄용 영역은 화면에서 숨김', r.fromSet.view === 'sheet' && r.fromSet.picks && /열섬/.test(r.fromSet.title) && r.fromSet.forms === 'sheet,exam,book' && r.fromSet.hiddenRoot === 'none', JSON.stringify(r.fromSet));
  check('고른 것이 없으면 인쇄 단추 꺼짐', r.disabled && r.noPick === 0);
  check('학습지: 세트 2 + 단독 1, 번호를 1번부터 다시 매기고 머리말에 범위, 제목·부제', r.pv.cls === 'sheet work' && r.pv.sets === 3 && r.pv.heads === '[1~6]|[7~8]' && r.pv.q === 9 && r.pv.nums === '1.2.3.4.5.6.7.8.9.' && r.pv.title === '연습 1회' && r.pv.sub, JSON.stringify([r.pv.heads, r.pv.nums, r.pv.cls]));
  check('변형 포함: OX는 ( O / X ), 서술형은 조건 상자 + 답 쓸 줄', r.pv.ox === 1 && r.pv.lines === 1 && r.pv.cond);
  check('밑줄·[A] 괄호는 살리고 띄어쓰기 점은 싣지 않음, 그림 있던 문항은 원본 조각', r.pv.u >= 1 && r.pv.brk === 1 && r.pv.noJoinDots === 0 && r.pv.img >= 1, [r.pv.u, r.pv.brk, r.pv.noJoinDots, r.pv.img].join());
  check('문제지에는 정답·해설이 없음', r.pv.noAnsInQ === 0 && /문항 9개/.test(r.pv.count), r.pv.count);
  check('정답·해설지: 빠른 정답 9칸, 문항별 해설(유형·근거·오답 풀이·모범 답안), 문제는 없음', r.pa.quick === 9 && /^③ ① ② X 서술형 ④ ① ③ ③$/.test(r.pa.quickTxt) && r.pa.sols === 9 && r.pa.sets === 3 && /R01 세부 정보 파악/.test(r.pa.txt) && /근거 “녹지와 수면이/.test(r.pa.txt) && /오답 풀이 ① 틀림/.test(r.pa.txt) && /모범 답안 낮에 저장된/.test(r.pa.txt) && /쌍둥이/.test(r.pa.txt) && r.pa.noQ === 0, r.pa.quickTxt);
  check('문제지·정답지를 따로 인쇄(파일 이름도 따로)', r.print.printed === 2 && r.print.rootQ.q === 9 && r.print.rootQ.a === 0 && r.print.rootA.q === 0 && r.print.rootA.a === 9 && r.print.titles === '연습 1회_문제지|연습 1회_정답과 해설', JSON.stringify(r.print));
  check('문항 하나 빼기 / 5지선다만', r.off === 8 && r.mcOnly.q === 7 && r.mcOnly.nums === '1.2.3.4.5.6.7.', r.off + ' ' + JSON.stringify(r.mcOnly));
  check('LMS 엑셀: OX·서술형이 섞이면 만들지 않음', r.lmsBlocked === 0);
  check('LMS 엑셀: 인쇄물과 같은 번호·유형·정답, 변형 포함, 영문 파일 이름', r.lms.rows === '1:독서:R01:3:2 2:독서:R06:1:3 3:독서:R09:2:2 4:독서:R01:4:2 5:문학:L03:1:2 6:문학:L05:3:2 7:문법:G05:3:2' && /^korean_\d{8}_1_exam_template\.xlsx \| 연습 1회_유형분류표\.xlsx$/.test(r.lms.names), r.lms.rows + ' / ' + r.lms.names);
  check('LMS 엑셀 파일: ExamTemplate + 숨김 시트, 행 수 = 2 + 그룹 3×3 + 문항 7, 제목·유형 문자열, 빈 셀 자기닫힘 없음 / 분류표 비고에 변형 종류', r.lms.sheets && r.lms.xmlRows === 2 + 9 + 7 && r.lms.has && r.lms.noSelfClose && r.lms.cls, JSON.stringify(r.lms).slice(0, 200));
  check('구성 저장 → 불러오기(양식·고른 것·옵션)', r.saved.n === 1 && r.saved.listed && r.loaded.title === '연습 1회' && r.loaded.form === 'exam' && r.loaded.picks === 2 && r.loaded.singles === 1 && r.loaded.mcOnly && r.loaded.q === 7, JSON.stringify(r.loaded));
  check('시험지 양식: 국어 영역 머리말·성명·수험 번호·확인 사항', r.exam.cls === 'sheet exam' && r.exam.title === '국어 영역' && r.exam.info && r.exam.end, JSON.stringify(r.exam));
  check('교재 양식: 표지·차례, 세트마다 정답과 해설(근거 포함), 교재 인쇄', r.book.cls === 'sheet book' && r.book.cover === '연습 1회' && r.book.toc === 2 && r.book.sols === 3 && r.book.sol === 9 && r.book.btn && r.book.noSeparateAns && r.book.ev && r.book.title === '연습 1회_교재', JSON.stringify(r.book));
  check('[분류표·LMS 엑셀] → 이 시험을 시험지로(원 문항만)', r.fromExport.view === 'sheet' && r.fromExport.form === 'exam' && r.fromExport.vars === false && r.fromExport.q === 6 && /지어낸 모의/.test(r.fromExport.title), JSON.stringify(r.fromExport));
  check('[문제 검색] 찾은 문항만 / [지문·작품] 보이는 지문 / [변형 만들기] 이 지문 + 변형', r.fromItems.view === 'sheet' && r.fromItems.q === 1 && r.fromPassages.view === 'sheet' && r.fromPassages.picks === 2 && r.fromVariant.view === 'sheet' && r.fromVariant.picks && /변형$/.test(r.fromVariant.title), JSON.stringify([r.fromItems, r.fromPassages, r.fromVariant]));
  check('담을 문항이 없으면 인쇄하지 않음', r.none.printed === r.book.printed && r.none.preview === 0, JSON.stringify(r.none));
  check('네이비 테마(단추·옆 메뉴)', /rgb\(28, 50, 96\)/.test(r.theme) && /linear-gradient/.test(r.theme), r.theme);
  check('인쇄 매체: 앱 화면은 숨고 출력물만', media === 'none,block', media);
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
