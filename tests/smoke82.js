// smoke82: 국어 랩 학습지 — 지문 세트 고르기 → 미리보기(번호를 1번부터 다시 매김, 세트 머리말 [a~b]) → 변형 문항(OX·서술형) 포함 → 정답·해설 쪽(유형·근거) → 인쇄 호출
//          그림이 있던 문항은 원본 조각으로 실림. 화면에서는 인쇄용 영역이 보이지 않고, 인쇄 매체에서는 앱 화면이 숨겨진다.
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
    const out = {};
    go('sheet'); out.empty = /아직 지문이 없습니다/.test($('#view-sheet').textContent);
    go('upload'); UP.examFile = file(exam, '2099 지어낸 모의.pdf'); UP.solFile = file(sol, '해설.pdf'); upAutoName(); await upRead(); await upSave();
    const p1 = K.passages.find(p => /열섬/.test(p.title)), p2 = K.passages.find(p => /봄/.test(p.title)), i1 = itemsOf(p1.id)[0], i5 = itemsOf(p2.id)[1], now = Date.now();
    i1.ev = { quotes: ['녹지와 수면이 줄어든 곳일수록 열섬의 세기가 커진다.'], x: [], neg: true }; await DB.put('items', i1);
    i5.stem = i5.stem + ' [그림]'; await DB.put('items', i5);          // 그림이 있던 문항 흉내 → 원본 조각으로 실려야 함
    const base = { passageId: p1.id, num: 1, section: '', src: p1.src, variantOf: i1.id, typeId: 'R01', subTypes: [], createdAt: now, updatedAt: now, verify: { status: 'pass', notes: [] } };
    await DB.putMany('items', [Object.assign({ id: 'vox', vkind: 'ox', kind: 'ox', stem: '녹지가 줄면 열섬이 약해진다.', choices: [], answer: 'X', explain: '2문단과 반대' }, base),
      Object.assign({ id: 'ves', vkind: 'essay', kind: 'essay', stem: '㉠의 까닭을 쓰시오.', view: '한 문장으로 쓸 것', viewLabel: '조건', choices: [], answer: '', model: '낮에 저장된 열이 밤에 나오기 때문이다.', rubric: ['저장 — 3점'], points: 5, createdAt: now + 1 }, base, { createdAt: now + 1 })]);
    await loadAll();
    let printed = 0; window.print = () => { printed++; };
    go('sheet');
    out.list = { rows: document.querySelectorAll('#sh-list .pick').length, disabled: $('#sh-print').disabled, hiddenRoot: getComputedStyle($('#print-root')).display };
    await shPrint(); out.noPick = printed;
    SH.picks[p1.id] = true; SH.picks[p2.id] = true; SH.title = '연습 1회'; SH.types = true; renderSheet(); await new Promise(r => setTimeout(r, 300));
    const pv = $('#sh-preview');
    out.pv = { sets: pv.querySelectorAll('.sset').length, heads: [...pv.querySelectorAll('.shead')].map(h => h.textContent.trim().slice(0, 7)).join('|'), q: pv.querySelectorAll('.sq').length, nums: [...pv.querySelectorAll('.sq b:first-child')].map(b => b.textContent).join(''),
      title: pv.querySelector('.stitle b').textContent, ox: pv.querySelectorAll('.sox').length, lines: pv.querySelectorAll('.slines').length, cond: /<조건>/.test(pv.textContent), u: pv.querySelectorAll('.spassage u').length, noJoinDots: pv.querySelectorAll('.jm').length,
      img: pv.querySelectorAll('.sq .simg img').length, count: $('#sh-count').textContent,
      ans: pv.querySelectorAll('.sans tr').length - 1, ansTxt: pv.querySelector('.sans').textContent.replace(/\s+/g, ' '), btn: $('#sh-print').textContent };
    await shPrint();
    out.print = { printed, root: document.querySelectorAll('#print-root .sq').length };
    SH.vars = false; SH.answers = false; renderSheet(); await new Promise(r => setTimeout(r, 300));
    out.origOnly = { q: $('#sh-preview').querySelectorAll('.sq').length, ans: $('#sh-preview').querySelectorAll('.sans').length };
    SH.orig = false; renderSheet(); await new Promise(r => setTimeout(r, 300)); await shPrint(); out.none = { printed, preview: $('#sh-preview').children.length };
    return out;
  }, { exam, sol });
  await page.emulateMedia({ media: 'print' });
  const media = await page.evaluate(() => [getComputedStyle(document.querySelector('#layout')).display, getComputedStyle(document.querySelector('#print-root')).display].join());

  check('지문이 없으면 안내', r.empty);
  check('지문 목록 2개, 고르기 전에는 인쇄 단추 꺼짐, 인쇄용 영역은 화면에서 숨김', r.list.rows === 2 && r.list.disabled && r.list.hiddenRoot === 'none' && r.noPick === 0, JSON.stringify(r.list));
  check('미리보기: 세트 2개, 번호를 1번부터 다시 매기고 머리말에 범위', r.pv.sets === 2 && r.pv.heads === '[1~5] 다|[6~7] 다' && r.pv.q === 7 && r.pv.nums === '1.2.3.4.5.6.7.' && r.pv.title === '연습 1회', JSON.stringify([r.pv.heads, r.pv.nums]));
  check('변형 포함: OX 문항은 ( O / X ), 서술형은 조건 상자 + 답 쓸 줄', r.pv.ox === 1 && r.pv.lines === 1 && r.pv.cond, r.pv.ox + ' ' + r.pv.lines);
  check('밑줄은 살리고 띄어쓰기 점은 싣지 않음, 그림 있던 문항은 원본 조각', r.pv.u >= 1 && r.pv.noJoinDots === 0 && r.pv.img >= 1, r.pv.u + ' ' + r.pv.noJoinDots + ' ' + r.pv.img);
  check('정답·해설 쪽: 문항 수만큼, 유형·근거·모범 답안', r.pv.ans === 7 && /R01 세부 정보 파악/.test(r.pv.ansTxt) && /근거: “녹지와 수면이/.test(r.pv.ansTxt) && /모범 답안 낮에 저장된/.test(r.pv.ansTxt) && /문항 7개/.test(r.pv.count) && /지문 2개/.test(r.pv.btn), r.pv.ansTxt.slice(0, 160));
  check('인쇄: 인쇄용 영역에 같은 내용을 넣고 인쇄 창 호출', r.print.printed === 1 && r.print.root === 7, JSON.stringify(r.print));
  check('원 문항만 · 해설 쪽 끄기', r.origOnly.q === 5 && r.origOnly.ans === 0, JSON.stringify(r.origOnly));
  check('담을 문항이 없으면 인쇄하지 않음', r.none.printed === 1 && r.none.preview === 0, JSON.stringify(r.none));
  check('인쇄 매체: 앱 화면은 숨고 학습지만', media === 'none,block', media);
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
