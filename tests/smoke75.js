// smoke75: 📊 스터디피크 LMS 업로드 엑셀(ExamTemplate, 지침 2026-09-30판) — 담은 문제 → 대분류 역조회(도형의 이동 → 기하),
//          정답유형·답안개수·정답 int, [n점] 원배점·균일 100점, 난도(등급) 기반 시간 배분(5초 단위·합계 정확), 시험 시간·배점 미선택 시 막음,
//          빈 유형 AI 채우기(후보 안에서·검토요망), 복합 유형 추가 행, xlsx 구조(1~3행·그룹 9열·문항 14열·빈 셀 없음·@·mm:ss·영문 파일명)
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
    localStorage.removeItem('sp-lab-apikey');                        // 열자마자 자동 채우기는 아래에서 따로 확인
    const base = { solution:'s', grade:'', srcType:'기출', srcName:'L', difficulty:3, tags:[], reviewed:true, images:[], choices:[], createdAt:1, updatedAt:1 };
    const C5 = ['① 1','② 2','③ 3','④ 4','⑤ 5'];
    const ps = [
      { ...base, id:'L1', origNo:'11', question:'곡선 위의 점에서의 접선 [3점]', choices:C5, answer:'④', difficulty:3, subject:'미적분Ⅰ', chapter:'미분', section:'접선의 방정식', subsection:'도함수의 활용', utype:'접선의 방정식 구하기(1) : 접점의 좌표가 주어진 경우' },
      { ...base, id:'L2', origNo:'12', question:'점 (1,2)를 평행이동한 점 [4점]', answer:'12', difficulty:5, subject:'공통수학2', chapter:'도형의 방정식', section:'도형의 이동', subsection:'도형의 이동', utype:'점의 평행이동' },
      { ...base, id:'L3', origNo:'13', question:'등차수열의 제5항은? [2점]\n① 1 ② 2 ③ 3 ④ 4 ⑤ 5', answer:'③', difficulty:1, subject:'대수', chapter:'수열', section:'등차수열' },
      { ...base, id:'L4', origNo:'14', question:'f∘g=g∘f 인 함수', answer:'', difficulty:4, subject:'공통수학2', chapter:'함수와 그래프', section:'합성함수', subsection:'함수', utype:'fｏg=gｏf인 경우' },
    ];
    for(const p of ps){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    state.cart = ps.map(p => p.id); state.points = {};
    go('sheet');
    const btn = !!$('#btn-lms');
    lmsOpen();
    const out = { btn, kind: LMS.opt.kind, open: $('#modal-bg').classList.contains('show') && $('#modal-body').classList.contains('lms-wide') };
    out.first = lmsCheck().global.slice();
    // 대분류 역조회·정답
    out.rows0 = LMS.rows.map(r => { const p = lmsProblem(r), L = r.sub ? lmsLookup(p, r.sub, r.type) : null; return [r.no, L && L[0], r.sub, r.ans.kind, r.ans.count, r.ans.choice != null ? r.ans.choice : r.ans.short, r.ans.err || '']; });
    out.tags = [lmsTag(lmsProblem(LMS.rows[0]), LMS.rows[0].sub, LMS.rows[0].type), lmsTag(lmsProblem(LMS.rows[1]), LMS.rows[1].sub, LMS.rows[1].type)];
    // 시험 시간 + 원배점
    lmsSet('mins', '10'); lmsSet('pts', 'orig');
    out.pts = LMS.rows.map(r => r.pts); out.grades = LMS.rows.map(r => r.grade);
    out.secs = LMS.rows.map(r => r.secs);
    // 균일 100점
    lmsSet('pts', 'even'); out.even = LMS.rows.map(r => r.pts);
    lmsSet('pts', 'orig'); lmsSetPts(3, '3');
    // 정답 넣기 (단답형)
    await lmsSetAnswer(3, '2');
    out.l4 = [LMS.rows[3].ans.kind, LMS.rows[3].ans.short, (await DB.get('problems','L4')).answer];
    // AI 채우기 (후보 안에서만)
    let prompt = '';
    window.aiJsonCall = async content => { prompt = content.map(c => c.text || '').join(''); return { items: [{ key:'A', pick: 1, also: [2], sure: false, why: '일반항 공식' }] }; };
    localStorage.setItem('sp-lab-apikey', 'sk-ant-api03-test');
    await lmsAiFill();
    const r3 = LMS.rows[2];
    out.ai = { sub: r3.sub, type: r3.type, extra: r3.extra, unsure: r3.unsure, cand: /\[후보\]\n1\. 등차수열과 등비수열 › 등차수열의 일반항/.test(prompt) && !/미적분/.test(prompt),
      saved: (await DB.get('problems','L3')).utype, warn: (lmsCheck().warn.get(r3) || []).join() };
    // 드롭다운으로 유형 고르기·복합 유형 추가 (유형 이름에 특수문자가 있어도 깨지지 않게)
    lmsRender();
    const pick = document.querySelector('#lms-r3 select:not(.lms-extra)');
    const optF = [...pick.options].find(o => o.textContent === 'fｏg=gｏf인 경우');
    pick.value = optF.value; pick.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 100));
    const ex = document.querySelector('#lms-r3 select.lms-extra');
    const optE = [...ex.options].find(o => o.textContent === '합성함수의 함숫값');
    ex.value = optE.value; ex.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 100));
    const p4 = await DB.get('problems','L4');
    out.dd = { sub: LMS.rows[3].sub, type: LMS.rows[3].type, extra: LMS.rows[3].extra, db: [p4.subsection, p4.utype, (p4.utypeExtra||[]).join('|')] };
    // 등급 직접 고르면 배점을 바꿔도 유지, 점수 지우면 학습지 배점도 지움
    lmsSetGrade(0, 'F'); lmsSet('pts', 'even'); lmsSet('pts', 'orig');
    out.keepGrade = LMS.rows[0].grade;
    lmsSetPts(0, ''); out.clearPts = [LMS.rows[0].pts, state.points.L1]; lmsSetPts(0, '3');
    // 시간 입력 해석: "90" = 90초, "3" = 3분, "1:03" → 5초 단위
    out.parseT = [lmsParseT('90'), lmsParseT('3'), lmsParseT('1:03'), lmsParseT('2:30')];
    // 동그라미 정답이 선택지 수보다 크면 오류
    out.over = lmsAnswerOf({ choices:['① a','② b','③ c','④ d'], answer:'⑤' }).err || '';
    // 소수 시험 시간은 막힘
    lmsSet('mins', '10.5'); out.decMins = lmsCheck().global.some(x => /분 단위 정수/.test(x)); lmsSet('mins', '10');
    // 시간 직접 고치기 → 🔒, 합계 유지
    lmsSetTime(1, '4:00');
    out.lock = { l2: LMS.rows[1].secs, sum: LMS.rows.reduce((s, x) => s + x.secs, 0), five: LMS.rows.every(x => x.secs % 5 === 0) };
    out.check = lmsCheck(); out.check = { g: out.check.global, e: out.check.rowErr.size };
    // xlsx
    out.noMode = LMS.opt.noMode;
    const blob = await xlsxBlob(lmsWorkbook());
    const zip = await JSZip.loadAsync(blob);
    const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
    const sst = [...new DOMParser().parseFromString(await zip.file('xl/sharedStrings.xml').async('string'), 'application/xml').getElementsByTagName('si')].map(x => x.textContent);
    const styles = await zip.file('xl/styles.xml').async('string');
    const wbx = await zip.file('xl/workbook.xml').async('string');
    const lk = await zip.file('xl/worksheets/sheet2.xml').async('string');
    out.lookup = { hidden: /name="_Lookup" sheetId="2" state="hidden"/.test(wbx), first: /name="ExamTemplate"/.test(wbx.split('_Lookup')[0]), cells: (lk.match(/<c /g) || []).length,
      fills: /FFE8EEF5/.test(styles) && /FFD9E1F2/.test(styles) && /FFFCE4D6/.test(styles), cols: /<col min="3" max="3" width="35.7"/.test(sheet) };
    LMS.opt.numType = 'int';
    const z2 = await JSZip.loadAsync(await xlsxBlob(lmsWorkbook())), sh2 = await z2.file('xl/worksheets/sheet1.xml').async('string');
    out.intMode = /<c r="H7"><v>5<\/v><\/c>/.test(sh2) && /<c r="J7"><v>4<\/v><\/c>/.test(sh2);
    LMS.opt.numType = 'str';
    const doc = new DOMParser().parseFromString(sheet, 'application/xml');
    const grid = {};
    for(const c of doc.getElementsByTagName('c')){
      const ref = c.getAttribute('r'), t = c.getAttribute('t'), s = c.getAttribute('s'), v = c.getElementsByTagName('v')[0];
      grid[ref] = { v: t === 's' ? sst[+v.textContent] : +v.textContent, t: t || 'n', s: s || '0' };
    }
    const rowVals = n => { const o = []; for(const k of Object.keys(grid)) { const m = k.match(/^([A-Z]+)(\d+)$/); if(+m[2] === n) o.push([m[1], grid[k].v]); } return o.sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0])).map(x => x[1]); };
    out.x = { r1: rowVals(1), r2: rowVals(2), r3: rowVals(3), g4: rowVals(4), g5: rowVals(5), i6: rowVals(6), i7: rowVals(7),
      a7: grid.A7, g7: grid.G7, j7: grid.J7, h7: grid.H7, a4: grid.A4, a1: grid.A1, e5: grid.E5, k11: grid.K11, b9: grid.B9, i15: rowVals(15), i16: rowVals(16),
      selfClose: /<c [^>]*\/>/.test(sheet), emptyV: /<v><\/v>/.test(sheet), h5: !!grid.H5 || !!grid.I5,
      styles: /numFmtId="164" formatCode="mm:ss"/.test(styles) && /numFmtId="49"/.test(styles) };
    await lmsDownload();
    out.name = LMS.lastName;
    closeModal();
    out.closed = !$('#modal-body').classList.contains('lms-wide');
    return out;
  });
  check('학습지 화면에 [📊 스터디피크 LMS 엑셀] 버튼, 넓은 창', r.btn && r.open);
  check('[n점] 있으면 수능형으로 시작', r.kind === 'suneung');
  check('시험 시간·배점 방식을 고르기 전엔 막힘', r.first.some(x => /시험 시간/.test(x)) && r.first.some(x => /배점 방식/.test(x)), JSON.stringify(r.first));
  check('대분류 역조회(접선 → 함수, 도형의 이동 → 기하)', r.rows0[0][1] === '함수' && r.rows0[1][1] === '기하' && r.rows0[2][1] === null, JSON.stringify(r.rows0));
  check('정답유형·답안개수·정답: 객관식 ④→4/5지, 단답형 12(숫자), 본문 안 ①~⑤도 5지, 정답 없음은 오류', JSON.stringify(r.rows0.map(x => x.slice(3))) === JSON.stringify([['단일 선택',5,4,''],['단답형',1,12,''],['단일 선택',5,3,''],['단답형',1,null,'정답 없음']]), JSON.stringify(r.rows0));
  check('지문 태그 = 과목명(미적분1·공통수학2)', r.tags.join() === '미적분1,공통수학2', r.tags.join());
  check('원배점: [3점]·[4점]·[2점] 읽음, 등급 2점→A·4점 최소 C', r.pts.slice(0, 3).join() === '3,4,2' && r.grades[2] === 'A' && r.grades[1] >= 'C', JSON.stringify([r.pts, r.grades]));
  check('시간: 난도 순 배분(번호 순 아님), 5초 단위, 합계 = 10분', r.secs.every(s => s % 5 === 0) && r.secs.reduce((a, b) => a + b, 0) === 600 && r.secs[2] < r.secs[0] && r.secs[1] > r.secs[3], JSON.stringify(r.secs));
  check('균일배점 100점 (정수, 합 100)', r.even.reduce((a, b) => a + b, 0) === 100 && r.even.every(Number.isInteger), JSON.stringify(r.even));
  check('표에서 정답 넣기 → 단답형·문제 DB에도 저장', r.l4.join() === '단답형,2,2', JSON.stringify(r.l4));
  check('AI 유형 채우기: 그 단원 후보 안에서만, 복합 유형, 검토요망, DB 저장', r.ai.sub === '등차수열과 등비수열' && r.ai.type === '등차수열의 일반항' && r.ai.extra.length === 1 && r.ai.unsure && r.ai.cand && r.ai.saved === '등차수열의 일반항' && /검토요망/.test(r.ai.warn), JSON.stringify(r.ai));
  check('드롭다운으로 유형·복합 유형 고르기 → 깨지지 않고 DB 저장', r.dd.type === 'fｏg=gｏf인 경우' && r.dd.sub === '함수' && r.dd.extra.length === 1 && r.dd.extra[0][1] === '합성함수의 함숫값' && r.dd.db[1] === 'fｏg=gｏf인 경우' && r.dd.db[2] === '함수\u0001합성함수의 함숫값', JSON.stringify(r.dd));
  check('직접 고른 등급은 배점 방식을 바꿔도 유지', r.keepGrade === 'F', r.keepGrade);
  check('점수 지우면 학습지 배점도 지움', r.clearPts[0] === null && r.clearPts[1] === undefined, JSON.stringify(r.clearPts));
  check('시간 입력: 90→1:30, 3→3:00, 1:03→1:05(5초 단위)', r.parseT.join() === '90,180,65,150', r.parseT.join());
  check('정답 ⑤ 인데 선택지 4개 → 오류', /선택지 수\(4개\)보다 큼/.test(r.over), r.over);
  check('시험 시간이 소수면 막힘', r.decMins);
  check('시간 직접 고치면 고정·나머지가 맞춰 합계 유지', r.lock.l2 === 240 && r.lock.sum === 600 && r.lock.five, JSON.stringify(r.lock));
  check('모두 채우면 오류 없음', r.check.g.length === 0 && r.check.e === 0, JSON.stringify(r.check));
  const x = r.x;
  check('1~3행: 시험 제목·과목·시험 시간 / 값 / 공백', x.r1.join() === '시험 제목,과목,시험 시간(분)' && x.r2[1] === '수학' && x.r2[2] === 10 && x.r3.length === 0, JSON.stringify([x.r1, x.r2, x.r3]));
  check('그룹 헤더 9열·그룹 값(1, 대분류, 소분류, 유형, 11번, 지영T, 과목) — 시작·종료 페이지 셀 없음', x.g4.length === 9 && x.g4[8] === '종료 페이지' && x.g5.join('|') === '1|함수|도함수의 활용|접선의 방정식 구하기(1) : 접점의 좌표가 주어진 경우|11번|지영T|미적분1' && !x.h5, JSON.stringify([x.g4, x.g5]));
  check('문항 헤더 14열 (주관식 정답·비교 유형 포함)', x.i6.length === 14 && x.i6[10] === '주관식 정답' && x.i6[11] === '비교 유형' && x.i6[13] === '답안없음', JSON.stringify(x.i6));
  check('문항 값: 원본 번호 텍스트(@)·단일 선택·일반적인 문제·mm:ss 시간·답안개수 \'5\'·정답 \'4\'(v3 샘플처럼 문자열)·아니오', r.noMode === 'orig' && x.a7.t === 's' && x.a7.s === '1' && x.a7.v === '11' && x.e5.v === '11번' && x.i7[4] === '단일 선택' && x.i7[5] === '일반적인 문제' && x.g7.s === '2' && x.g7.t === 'n' && x.h7.t === 's' && x.h7.v === '5' && x.j7.t === 's' && x.j7.v === '4' && x.i7[x.i7.length-1] === '아니오', JSON.stringify([r.noMode, x.a7, x.e5, x.g7, x.h7, x.j7, x.i7]));
  check('[숫자] 고르면 답안개수·정답선택지 int', r.intMode);
  check('숨김 _Lookup 시트(값 목록)·헤더 채움색(E8EEF5·D9E1F2·FCE4D6)·열 너비', r.lookup.hidden && r.lookup.first && r.lookup.cells === 47 && r.lookup.fills && r.lookup.cols && x.a1.s === '3' && x.a4.s === '4', JSON.stringify([r.lookup, x.a1, x.a4]));
  check('단답형 정답 12 = 숫자 셀, 대분류 기하', x.k11 && x.k11.t === 'n' && x.k11.v === 12 && x.b9.v === '기하', JSON.stringify([x.k11, x.b9]));
  check('복합 유형: 같은 번호로 B·C·D만 채운 행 추가', x.i16.length === 4 && x.i16[0] === '13' && x.i15[0] === '13', JSON.stringify([x.i15, x.i16]));
  check('빈 셀(<c/>) 없음, 스타일 @·mm:ss', !x.selfClose && !x.emptyV && x.styles);
  check('다운로드 파일명 영문', /^StudyPeak_ExamTemplate_\d{8}_\d{4}\.xlsx$/.test(r.name), r.name);
  check('닫으면 창 너비 원래대로', r.closed);
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
