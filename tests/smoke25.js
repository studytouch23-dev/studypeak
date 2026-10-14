// smoke25: 확장 교육과정 — 2022 개정 포함·세부 단원·기존 태그 보존·저장본 병합
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').join(__dirname, '..');
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(fs.readFileSync(p));
});

// 확장 전 프리셋 스냅샷 — 이 안의 모든 과목/대단원/중단원이 새 프리셋에도 있어야 함(태그 보존)
const OLD = {
  "수학(상)": {"다항식":["다항식의 연산","나머지정리","인수분해"],
    "방정식과 부등식":["복소수","이차방정식","이차방정식과 이차함수","여러 가지 방정식","여러 가지 부등식"],
    "도형의 방정식":["평면좌표","직선의 방정식","원의 방정식","도형의 이동"]},
  "수학(하)": {"집합과 명제":["집합","명제"],
    "함수":["함수","합성함수와 역함수","유리함수","무리함수"],
    "경우의 수":["경우의 수","순열","조합"]},
  "수학Ⅰ": {"지수함수와 로그함수":["지수와 로그","지수함수","로그함수","지수·로그 방정식과 부등식"],
    "삼각함수":["삼각함수의 뜻과 그래프","사인법칙과 코사인법칙"],
    "수열":["등차수열","등비수열","수열의 합","수학적 귀납법"]},
  "수학Ⅱ": {"함수의 극한과 연속":["함수의 극한","함수의 연속"],
    "미분":["미분계수와 도함수","도함수의 활용"],
    "적분":["부정적분","정적분","정적분의 활용"]},
  "미적분": {"수열의 극한":["수열의 극한","급수"],
    "미분법":["지수·로그함수의 미분","삼각함수의 미분","여러 가지 미분법","도함수의 활용"],
    "적분법":["여러 가지 적분법","정적분의 활용"]},
  "확률과 통계": {"경우의 수":["순열과 조합","이항정리"],
    "확률":["확률의 뜻과 활용","조건부확률"],
    "통계":["확률분포","정규분포","통계적 추정"]},
  "기하": {"이차곡선":["포물선","타원","쌍곡선"],
    "평면벡터":["벡터의 연산","평면벡터의 성분과 내적"],
    "공간도형과 공간좌표":["공간도형","공간좌표"]},
  "중등 수학": {"수와 연산":["소인수분해","정수와 유리수","제곱근과 실수"],
    "문자와 식":["일차방정식","연립방정식","이차방정식","다항식의 곱셈과 인수분해"],
    "함수":["좌표평면과 그래프","일차함수","이차함수"],
    "기하":["평면도형","삼각형과 사각형의 성질","도형의 닮음","피타고라스 정리","원의 성질"],
    "확률과 통계":["자료의 정리","확률","대푯값과 산포도"]}
};

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  await new Promise(r => server.listen(9071, r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:9071/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // ── 1) 새 프리셋 규모·2022 개정 과목 ──
  const info = await page.evaluate(() => {
    const subs = Object.keys(PRESET_CURRICULUM);
    let chap = 0, sect = 0;
    for(const s of subs) for(const [c, arr] of Object.entries(PRESET_CURRICULUM[s])){ chap++; sect += arr.length; }
    return { subs, nSub: subs.length, chap, sect,
      matrix: (PRESET_CURRICULUM['공통수학1']||{})['행렬']||null,
      daesu: Object.keys(PRESET_CURRICULUM['대수']||{}),
      mj2: Object.keys(PRESET_CURRICULUM['미적분Ⅱ']||{}) };
  });
  check('과목 13개(2022 개정 5과목 추가)', info.nSub===13, info.subs.join(','));
  check('세부 단원 220개 이상', info.sect>=220, info.chap+'대단원 / '+info.sect+'중단원');
  check('공통수학1 행렬 신설', !!info.matrix && info.matrix.length>=3, (info.matrix||[]).join(','));
  check('대수·미적분Ⅱ 구성', info.daesu.length===3 && info.mj2.length===3, info.daesu.join(','));

  // ── 2) 기존 태그 보존: 옛 프리셋의 모든 항목이 새 프리셋의 부분집합 ──
  const missing = await page.evaluate((OLD) => {
    const out = [];
    for(const [s,chs] of Object.entries(OLD)){
      if(!PRESET_CURRICULUM[s]){ out.push(s); continue; }
      for(const [c,sects] of Object.entries(chs)){
        if(!PRESET_CURRICULUM[s][c]){ out.push(s+'>'+c); continue; }
        for(const sec of sects) if(!PRESET_CURRICULUM[s][c].includes(sec)) out.push(s+'>'+c+'>'+sec);
      }
    }
    return out;
  }, OLD);
  check('옛 단원명 전부 유지(태그 보존)', missing.length===0, missing.slice(0,5).join(' | '));

  // ── 3) 저장된 교육과정에 병합: 사용자 수정분 유지 + 새 과목 추가 ──
  await page.evaluate(() => {
    localStorage.setItem('sp-lab-curriculum', JSON.stringify({
      "수학Ⅰ": {"지수함수와 로그함수":["지수와 로그"], "나만의 단원":["내 커스텀 중단원"]},
      "내 과목": {"내 대단원":["내 중단원"]}
    }));
  });
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(600);
  const merged = await page.evaluate(() => ({
    custom: !!(CURRICULUM['내 과목'] && CURRICULUM['내 과목']['내 대단원']),
    customCh: !!(CURRICULUM['수학Ⅰ']['나만의 단원']),
    newSub: !!CURRICULUM['공통수학1'],
    enriched: (CURRICULUM['수학Ⅰ']['지수함수와 로그함수']||[]).includes('상용로그'),
    saved: JSON.parse(localStorage.getItem('sp-lab-curriculum'))['공통수학1'] !== undefined
  }));
  check('사용자 커스텀 유지', merged.custom && merged.customCh, JSON.stringify(merged));
  check('새 과목·세부 단원 병합 + 저장', merged.newSub && merged.enriched && merged.saved);

  // ── 4) UI: 과목 셀렉트·단원태그 화면 ──
  const ui = await page.evaluate(() => {
    const opts = [...document.querySelectorAll('#filter-subject option')].map(o=>o.textContent);
    renderTags();
    return { has1: opts.some(t=>t.includes('공통수학1')), hasD: opts.some(t=>t==='대수') };
  });
  check('필터 셀렉트에 새 과목', ui.has1 && ui.hasD);

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
