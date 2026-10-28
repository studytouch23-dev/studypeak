// smoke73: 스터디피크 마스터 유형표(lab/units-sp.js, 원본 tools/data/studypeak-master.md) — 기본 단원 DB가 됨.
//          소단원 = 스터디피크 소분류, 유형 = 원본 문자열 그대로(전각 ｏ·∑ 포함), 2022·2015 과목 양쪽, 초등 수학 과목 추가,
//          [스터디피크 유형표로 맞추기] 버튼(고친 단원 DB도 표 그대로 되돌림, 다른 단원은 유지), 문제 상세에서 선택
const fs = require('fs');
const path = require('path');
const { openLab } = require('../tools/_common.js');
const { parseMaster, build } = require('../tools/build-sp-units.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  // 생성기: 원본 1,471유형이 모두 랩 중단원에 배치되고, 생성 파일이 최신인지
  const rows = parseMaster(fs.readFileSync(path.join(__dirname, '..', 'tools', 'data', 'studypeak-master.md'), 'utf8'));
  const b = build(rows);
  const cnt = { 초등:0, 중등:0, 고등:0 }; rows.forEach(r => cnt[r.lv]++);
  check('유형표 파싱: 초 350 · 중 387 · 고 734', cnt.초등 === 350 && cnt.중등 === 387 && cnt.고등 === 734, JSON.stringify(cnt));
  check('모든 유형이 갈 곳 있음(규칙 누락 없음)', b.miss.length === 0 && b.unused.length === 0, b.miss.slice(0, 3).join(' / '));

  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  const r = await page.evaluate((built) => {
    const out = {};
    const T = (s, c, x, sub) => unitTypes(s, c, x, sub);
    out.fresh = JSON.stringify(window.SP_MASTER_UNITS) === JSON.stringify(built);
    // 모든 교육과정 중단원(초등 포함)에 기본 소단원이 있음
    let miss = [], tot = 0;
    for(const s of Object.keys(PRESET_CURRICULUM)) for(const c of Object.keys(PRESET_CURRICULUM[s])) for(const x of PRESET_CURRICULUM[s][c]){ tot++; if(!unitSubs(s, c, x).length) miss.push(s+'>'+c+'>'+x); }
    out.cover = { tot, miss };
    out.c1 = { subs: unitSubs('공통수학1','방정식과 부등식','복소수와 그 연산'), n: T('공통수학1','방정식과 부등식','복소수와 그 연산','복소수').length,
      same2015: JSON.stringify(unitNode('수학(상)','방정식과 부등식','복소수')) === JSON.stringify(unitNode('공통수학1','방정식과 부등식','복소수와 그 연산')) };
    out.verbatim = {
      fog: T('공통수학2','함수와 그래프','합성함수','함수').includes('fｏg=gｏf인 경우'),
      sigma: T('대수','수열','수열의 합(Σ)','수열의 합').includes('∑의 뜻과 성질'),
      typo: T('미적분Ⅱ','미분법','도함수의 활용(개형·변곡점)','도함수의 활용').includes('함수의 증가, 감수'),
      quote: T('공통수학1','경우의 수','순열','순열과 조합').includes("적어도'조건이 있는 순열의 수") };
    // 한 소분류가 여러 중단원으로 나뉨 (도함수의 활용 → 접선·평균값·증감…)
    out.split = { tan: T('미적분Ⅰ','미분','접선의 방정식','도함수의 활용').length, mvt: T('미적분Ⅰ','미분','평균값 정리','도함수의 활용'),
      vel: T('미적분Ⅰ','미분','속도와 가속도','도함수의 활용').length, um: T('수학Ⅱ','미분','도함수의 활용','도함수의 활용').length };
    out.mid = { gcd: T('중등 수학','수와 연산','최대공약수와 최소공배수','소인수분해').includes('서로소'), pf: T('중등 수학','수와 연산','소인수분해','소인수분해').includes('서로소') };
    out.elem = { subj: !!CURRICULUM['초등 수학'], chaps: Object.keys(CURRICULUM['초등 수학'] || {}), g5: T('초등 수학','수와 연산','약수와 배수','5학년'),
      multi: unitSubs('초등 수학','수와 연산','덧셈과 뺄셈') };
    out.newSect = (CURRICULUM['공통수학1']['방정식과 부등식'] || []).includes('이차방정식') && T('공통수학1','방정식과 부등식','이차방정식','이차방정식').includes('이차방정식의 풀이');
    return out;
  }, b.UNITS);
  check('lab/units-sp.js 가 원본 md 로 만든 최신 결과', r.fresh, '다르면 node tools/build-sp-units.js 다시 실행');
  check('교육과정 모든 중단원(초등 포함)에 소단원', r.cover.miss.length === 0 && r.cover.tot >= 310, JSON.stringify(r.cover).slice(0, 200));
  check('소단원 = 스터디피크 소분류, 2015 과목에도 같은 유형', r.c1.subs.join() === '복소수' && r.c1.n === 11 && r.c1.same2015, JSON.stringify(r.c1));
  check('유형 문자열 원본 그대로(전각 ｏ·∑·오타·작은따옴표)', Object.values(r.verbatim).every(Boolean), JSON.stringify(r.verbatim));
  check('도함수의 활용 → 접선·평균값·속도 중단원으로 나눠 담고, 묶음 중단원에는 전부', r.split.tan === 7 && r.split.mvt.join() === '롤의 정리,평균값의 정리,평균값 정리의 활용 및 변형' && r.split.vel === 5 && r.split.um === 31, JSON.stringify(r.split));
  check('중등: 소인수분해 → 최대공약수·최소공배수 중단원 분리', r.mid.gcd && !r.mid.pf, JSON.stringify(r.mid));
  check('초등 수학 과목: 대단원 = 대분류, 소단원 = 학년', r.elem.subj && r.elem.chaps.includes('수와 연산') && r.elem.chaps.includes('실생활 적용') && r.elem.g5.length === 4 && r.elem.multi.join() === '1학년,2학년,3학년', JSON.stringify(r.elem));
  check('공통수학1 에 이차방정식 중단원 추가(풀이·활용 유형)', r.newSect);

  // [스터디피크 유형표로 맞추기]: 예전(랩 세분류) DB를 쓰던 사람도 표 그대로, 내 단원은 유지
  const ap = await page.evaluate(async () => {
    const own = unitsOwnPreset(); own[ukey('학원 자체','특강','내 단원')] = { '내 소단원': { '내 유형': [] } };
    localStorage.setItem('sp-lab-units', JSON.stringify(own)); UNITS_CACHE = null;
    const before = unitSubs('수학Ⅰ','수열','등차수열');
    delete CURRICULUM['초등 수학']; saveCurriculum();
    go('tags'); renderTags();
    const btn = [...document.querySelectorAll('#view-tags button')].find(x => /스터디피크 유형표로 맞추기/.test(x.textContent));
    btn.click();
    await new Promise(r => setTimeout(r, 100));
    const saved = JSON.parse(localStorage.getItem('sp-lab-units'));
    return { btn: !!btn, before, after: unitSubs('수학Ⅰ','수열','등차수열'), mine: unitSubs('학원 자체','특강','내 단원'),
      elem: !!CURRICULUM['초등 수학'] && !!JSON.parse(localStorage.getItem('sp-lab-curriculum'))['초등 수학'],
      saved: !!saved[ukey('초등 수학','수와 연산','약수와 배수')], toast: ($('#toast') || {}).textContent || '' };
  });
  check('맞추기 버튼: 표 그대로 바뀌고 내 단원은 유지, 초등 과목 복구·저장', ap.btn && ap.before.join() === '등차수열' && ap.after.join() === '등차수열과 등비수열' && ap.mine.length === 1 && ap.elem && ap.saved, JSON.stringify(ap));

  // 문제 상세에서 스터디피크 유형 고르기
  const det = await page.evaluate(async () => {
    const p = { id:'S1', question:'q', answer:'1', solution:'s', subject:'초등 수학', chapter:'수와 연산', section:'약수와 배수', grade:'', srcType:'기출', srcName:'u', difficulty:2, tags:[], reviewed:true, images:[], choices:[], createdAt:1, updatedAt:1 };
    await saveProblem(p); state.problems.push(lightenProblem(p));
    await openDetail('S1');
    const subs = [...$('#e-sub').options].map(o => o.value);
    $('#e-sub').value = '5학년'; $('#e-sub').dispatchEvent(new Event('change'));
    const types = [...$('#e-utype').options].map(o => o.value);
    $('#e-utype').value = '공약수와 최대공약수'; $('#e-utype').dispatchEvent(new Event('change'));
    await saveDetail('S1');
    const got = await DB.get('problems','S1');
    return { subs, types, got: [got.subsection, got.utype] };
  });
  check('문제 상세: 초등 단원 → 학년 → 스터디피크 유형 선택·저장', det.subs.includes('5학년') && det.types.length === 5 && det.got.join() === '5학년,공약수와 최대공약수', JSON.stringify(det));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
