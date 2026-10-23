// smoke43: 실제 사용자 사례 회귀 — ① 해설의 ",\ " 띄어쓰기가 한글 수식에서 깨지던 문제
//          ② 경고 문구가 수식 중간에서 잘려 ₩·깨진 수식으로 보이던 문제
//          ③ 다른 문제의 해설이 붙던 문제(찾을 문제를 알려 주고, 같은 번호 후보 중 맞는 것만)
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

  // ── ① 띄어쓰기 명령 ──
  const sp = await page.evaluate(() => {
    const cases = {
      s18: '\\left(-k,\\ k+\\frac{2}{3}\\right)',
      s3a: 'a_1a_2=a_1^2\\times2=\\dfrac{1}{2},\\ a_1^2',
      s3b: '\\lim_{x\\to a}(x-3)=a-3=5,\\ a=8',
      s3c: 'a=\\dfrac{1}{4},\\ c=-3',
      s24: '\\frac{6}{a}=2,\\ a=3',
      spaces: 'a\\quad b\\qquad c\\, d\\enspace e\\thinspace f',
    };
    const out = {};
    for(const [k, v] of Object.entries(cases)) out[k] = { hwp: latexToHwpEq(v), issues: mathIssues('$'+v+'$') };
    return out;
  });
  check('18번 해설: (-k,\\ k+2/3) → 한글 간격 ~', sp.s18.hwp === 'left ( -k, ~ k+{2} over {3} right )', sp.s18.hwp);
  for(const k of ['s18','s3a','s3b','s3c','s24']) check(`경고 없음: ${k}`, sp[k].issues.length === 0, sp[k].issues.join(' / '));
  check('\\quad·\\qquad·\\,·\\enspace·\\thinspace → 보이는 간격', sp.spaces.hwp === 'a ~~ b ~~~~ c ` d ~ e ` f', sp.spaces.hwp);

  // ── ② 경고 문구: 수식을 중간에서 자르지 않고, 남은 명령 이름을 알려 줌 ──
  const msg = await page.evaluate(() => {
    const long = 'x+y=\\dfrac{\\overline{BD}}{\\sin(\\angle DCB)}+1 \\& 2';   // \& 는 한글 변환 후에도 남음
    return mathIssues('$'+long+'$');
  });
  const m0 = msg.find(x => x.includes('바꿀 수 없는')) || '';
  check('남은 명령 이름(\\&) 표시', m0.includes('\\&'), m0);
  check('수식 전체 포함(40자에서 안 자름)', m0.includes('\\sin(\\angle DCB)}+1 \\& 2'), m0);

  const view = await page.evaluate(() => {
    state.bulkDrafts = [{ num:'9', text:'문제 $x$?', choices:[], sol:'', ans:'', aiDone:true,
      aiIssues: ['수식 문법 오류 $\\frac{1}{2$ — 끝남', '한글 수식으로 바꿀 수 없는 표기 \\& — $a \\& b$'] }];
    go('add'); setAddMode('bulk'); document.querySelector('#bulk-preview-card').style.display = 'block';
    rerenderBulk();
    const box = document.querySelector('#bulk-preview .iss-list');
    const codes = [...box.querySelectorAll('code.iss-code')].map(c => ({ t: c.textContent, f: getComputedStyle(c).fontFamily }));
    return { items: box.querySelectorAll('li').length, codes };
  });
  check('경고는 항목별 목록', view.items === 2, view.items);
  check('그려지지 않는 수식은 원문 그대로(코드 글꼴)', view.codes.length >= 1 && view.codes[0].t === '\\frac{1}{2', JSON.stringify(view.codes));
  check('코드 글꼴은 역슬래시를 ₩로 바꾸지 않는 글꼴', /Consolas|Menlo|Courier/.test((view.codes[0]||{}).f||''), (view.codes[0]||{}).f);

  // ── ③ 해설 매칭: 찾을 문제를 알려 주고, 맞는 해설만 ──
  const sol = await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const cv = document.createElement('canvas'); cv.width = 40; cv.height = 20;
    const IMG = cv.toDataURL('image/png');
    state.bulkDrafts = [
      { num:'3',  text:'3. 모든 항이 양수인 등비수열', choices:[], sol:'', ans:'', solImg: IMG, solText:'HINT-A 여러 해설이 섞인 조각' },
      { num:'24', text:'24. 확률변수 X가 이항분포', choices:[], sol:'', ans:'', solImg: IMG, solText:'HINT-B 다른 문제',
        solAlts: [{ img: IMG, hint:'HINT-C 이항분포 해설' }] },
      { num:'7',  text:'7. 두 곡선으로 둘러싸인 넓이', choices:[], sol:'', ans:'', solImg: IMG, solText:'HINT-D 엉뚱한 해설' },
    ];
    window.__prompts = [];
    window.fetch = async (url, opts) => {
      const t = JSON.parse(opts.body).messages[0].content.find(c => c.type === 'text').text;
      window.__prompts.push(t);
      const r = t.includes('HINT-A') ? { matches:true, answer:'②', solution:'등비 풀이 $r^{2}=4$,\\ $a_4=8$' }
        : t.includes('HINT-C') ? { matches:true, answer:'④', solution:'이항 풀이 $np=5$' }
        : { matches:false, answer:'', solution:'' };
      return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(r) }] }), { status:200 });
    };
    await aiTranscribeDrafts();
    const d = state.bulkDrafts;
    return {
      p3: window.__prompts.find(t => t.includes('HINT-A')) || '',
      calls: window.__prompts.length,
      d3: { sol: d[0].sol, ans: d[0].ans, iss: d[0].solIssues },
      d24: { sol: d[1].sol, alts: d[1].solAlts },
      d7: { sol: d[2].sol, img: !!d[2].solImg, iss: d[2].solIssues },
      preview: document.querySelector('#bulk-preview').textContent,
    };
  });
  check('해설 프롬프트에 찾을 문제(번호·본문) 포함', sol.p3.includes('[찾을 문제] 3번 — 3. 모든 항이 양수인 등비수열') && sol.p3.includes('matches'), sol.p3.slice(-160).replace(/\n/g,'⏎'));
  check('섞인 조각에서 이 문제 해설만 반영', sol.d3.sol.includes('등비 풀이') && sol.d3.ans === '②', JSON.stringify(sol.d3));
  check('같은 번호 후보 중 맞는 해설 선택', sol.d24.sol.includes('이항 풀이') && !sol.d24.alts, JSON.stringify(sol.d24));
  check('맞는 해설이 없으면 붙이지 않음 + 경고', sol.d7.sol === '' && sol.d7.img && (sol.d7.iss||[]).some(x => x.includes('7번') && x.includes('찾지 못함')), JSON.stringify(sol.d7));
  check('호출: 조각마다 한 번씩(3+후보1=4)', sol.calls === 4, sol.calls);
  check('미리보기에 해설 미발견 경고', sol.preview.includes('해설을 찾지 못함'));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
