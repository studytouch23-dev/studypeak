// smoke12: 모의고사(수능 A3) HWPX 출력 검증
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const SCRATCH = __dirname;
const ROOT = require('path').join(__dirname, '..');

const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(fs.readFileSync(p));
});

let fails = 0;
function check(name, ok, extra){ console.log((ok?'PASS':'FAIL'), name, extra!==undefined?('— '+extra):''); if(!ok) fails++; }

(async () => {
  await new Promise(r => server.listen(8931, r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  let dialogs = [];
  let dialogAction = 'accept';
  page.on('dialog', d => { dialogs.push(d.message().slice(0,120)); dialogAction==='accept'?d.accept():d.dismiss(); });

  await page.goto('http://127.0.0.1:8931/lab/', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: path.join(SCRATCH, 'node_modules/jszip/dist/jszip.min.js') });
  await page.waitForTimeout(600);

  // ── 10문항 시드 (10%4==2 → 마지막 두 문항 단 전체 슬롯) ──
  await page.evaluate(async () => {
    // 흰 여백이 큰 도형 이미지(400×300, 내용은 60,40~240,160) — 트리밍 검증용
    const cv = document.createElement('canvas'); cv.width=400; cv.height=300;
    const cx = cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,400,300);
    cx.strokeStyle='#000'; cx.lineWidth=3; cx.strokeRect(60,40,180,120);
    const PX = cv.toDataURL('image/png');
    const cw = document.createElement('canvas'); cw.width=300; cw.height=200;
    cw.getContext('2d').fillStyle='#fff'; cw.getContext('2d').fillRect(0,0,300,200);
    const WHITE = cw.toDataURL('image/png');   // 완전 빈 이미지 — 제거되어야 함
    const mk = (i, q, ch, imgs) => ({ id:'mock'+i, question:q, choices:ch||[], answer:'①', solution:'',
      images:imgs||[], imgN:(imgs||[]).length, subject:'수학Ⅰ', chapter:'지수함수', section:'', grade:'고2',
      srcType:'자작', srcName:'테스트', srcYear:'2026', difficulty:3, tags:[], origNo:String(i),
      reviewed:true, createdAt:Date.now(), updatedAt:Date.now() });
    const ps = [];
    for(let i=1;i<=10;i++){
      const hasChoice = i<=8;                      // 9·10번 = 단답형
      const q = i===2
        ? '함수 $f(x)=\\dfrac{x^{2}+1}{x-1}$ 에 대하여\n$\\lim_{x \\to 2} f(x)$\n의 값은?'
        : (i===3 ? '그림과 같이 반지름이 $r$ 인 원이 있다. 넓이를 구하면?' : `${i}번 문제: $2^{x}=8$ 일 때 $x$ 의 값${hasChoice?'은?':'을 구하시오.'}`);
      ps.push(mk(i, q, hasChoice?['① $1$','② $2$','③ $3$','④ $4$','⑤ $5$']:[], i===3?[PX]:(i===5?[WHITE]:[])));
    }
    for(const p of ps){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    state.cart = ps.map(p=>p.id);
    state.points['mock1'] = 2; state.points['mock10'] = 4;
    persistCart(); renderSheet();
  });

  await page.evaluate(() => go('sheet'));
  check('모의고사 버튼 존재', await page.$('#btn-mock') !== null);
  await page.evaluate(() => { document.querySelector('#s-title').value='2026학년도 스터디피크 모의고사 1회';
    document.querySelector('#s-sub').value='확률과 통계'; });

  // ── 정상 다운로드 ──
  const [dl] = await Promise.all([ page.waitForEvent('download', {timeout:15000}), page.click('#btn-mock') ]);
  const out = path.join(SCRATCH, 'mock.hwpx');
  await dl.saveAs(out);
  check('다운로드 완료', fs.existsSync(out), dl.suggestedFilename());

  const zip = await JSZip.loadAsync(fs.readFileSync(out));
  const names = Object.keys(zip.files);
  check('section0+section1 존재', names.includes('Contents/section0.xml') && names.includes('Contents/section1.xml'));
  const bins = names.filter(n=>n.startsWith('BinData/') && !n.endsWith('/'));
  check('BinData 그림 1장만(빈 이미지 제거)', bins.length===1, bins.join(','));

  const header = await zip.file('Contents/header.xml').async('string');
  const s0 = await zip.file('Contents/section0.xml').async('string');
  const s1 = await zip.file('Contents/section1.xml').async('string');
  const manifest = await zip.file('META-INF/manifest.xml').async('string');
  const hpf = await zip.file('Contents/content.hpf').async('string');

  check('manifest에 두 구역', manifest.includes('section0.xml') && manifest.includes('section1.xml'));
  check('hpf spine 두 구역', hpf.includes('idref="section0"') && hpf.includes('idref="section1"'));
  check('head secCnt=2', /secCnt="2"/.test(header));
  check('charPr 13.2pt 굵게(번호)', /id="3" height="1320"/.test(header));
  check('charPr 37.9pt(수학영역)', /id="4" height="3790"/.test(header));
  check('paraPr 내어쓰기 1130 + left 0', /<hc:intent value="-1130" unit="HWPUNIT"\/><hc:left value="0"/.test(header));
  check('아래선 0.4mm borderFill', /bottomBorder type="SOLID" width="0.4 mm"/.test(header));

  // 구역별 기하
  check('sec0 A3 용지', /width="84188" height="119055"/.test(s0));
  check('sec0 머리말 11800', /header="11800"/.test(s0));
  check('sec1 머리말 4800', /header="4800"/.test(s1));
  check('2단+간격 2260', /colCount="2" sameSz="1" sameGap="2260"/.test(s0) && /sameGap="2260"/.test(s1));
  check('단 구분선 0.3mm', /colLine type="SOLID" width="0.3 mm"/.test(s0));
  check('sec0 머리말에 제목', s0.includes('스터디피크 모의고사') && s0.includes('수학 영역'));
  check('sec1 머리말 수학 영역(선택과목)', s1.includes('수학 영역(확률과 통계)'));

  // 슬롯 표 높이
  const hts = s => [...s.matchAll(/<hp:cellSz width="32155" height="(\d+)"/g)].map(m=>+m[1]);
  check('sec0 슬롯 4개(40000×2, 44700×2)', JSON.stringify(hts(s0).sort((a,b)=>a-b))===JSON.stringify([40000,40000,44700,44700]), hts(s0).join(','));
  const h1 = hts(s1).sort((a,b)=>a-b);
  check('sec1 슬롯(44700×2, 47000×2, 91700×2)', JSON.stringify(h1)===JSON.stringify([44700,44700,47000,47000,91700,91700]), h1.join(','));

  // 나누기
  const cnt = (s,re) => (s.match(re)||[]).length;
  check('sec0 단나누기 1회', cnt(s0, /columnBreak="1"/g)===1, cnt(s0,/columnBreak="1"/g));
  check('sec0 쪽나누기 0회', cnt(s0, /pageBreak="1"/g)===0);
  check('sec1 단나누기 2회', cnt(s1, /columnBreak="1"/g)===2, cnt(s1,/columnBreak="1"/g));
  check('sec1 쪽나누기 1회', cnt(s1, /pageBreak="1"/g)===1, cnt(s1,/pageBreak="1"/g));

  // 수식·번호·라벨·그림
  check('수식 baseUnit 1100', /baseUnit="1100"/.test(s0) && !/baseUnit="1000"/.test(s0+s1));
  check('번호 run(13.2pt) 1. ', /charPrIDRef="3"><hp:t>1\. <\/hp:t>/.test(s0));
  check('배점 [2점] 1번에', /1\. <\/hp:t>/.test(s0) && s0.includes('[2점]'));
  check('5지선다형 라벨(sec0)', s0.includes('5지선다형'));
  check('단답형 라벨(sec1)', s1.includes('단답형'));
  check('그림 임베드(sec0 3번)', /binaryItemIDRef="image1"/.test(s0));
  const picW = +(s0.match(/<hp:pic[\s\S]*?<hp:orgSz width="(\d+)"/)||[])[1] || 0;
  check('그림 흰 여백 트리밍(400px→약 205px)', picW>8000 && picW<12500, picW+'HU (원본이면 20000)');
  check('독립수식 문단(paraPr3)', /paraPrIDRef="3"/.test(s0));

  // well-formed 검사 (페이지 DOMParser)
  for(const [n,x] of [['header',header],['sec0',s0],['sec1',s1],['manifest',manifest],['hpf',hpf]]){
    const err = await page.evaluate(x => new DOMParser().parseFromString(x,'text/xml').querySelector('parsererror')?.textContent||'', x);
    check('well-formed '+n, !err, err.slice(0,100));
  }

  // EQ_BASE 복원 확인
  check('EQ_BASE 복원(1000)', await page.evaluate(()=>EQ_BASE)===1000);

  // ── 넘침 경고 경로: 아주 긴 문항 → confirm 떠야 하고, 취소하면 다운로드 없음 ──
  dialogs = []; dialogAction = 'dismiss';
  await page.evaluate(async () => {
    const long = Array.from({length:60},(_,i)=>`매우 긴 문장이 반복되는 지문입니다 ${i}`).join('\n');
    const p = { id:'mockBIG', question:long, choices:['① 1','② 2','③ 3','④ 4','⑤ 5'], answer:'', solution:'',
      images:[], imgN:0, subject:'수학Ⅰ', chapter:'지수함수', section:'', grade:'고2', srcType:'자작',
      srcName:'테스트', srcYear:'', difficulty:3, tags:[], origNo:'99', reviewed:true, createdAt:Date.now(), updatedAt:Date.now() };
    await saveProblem(p); state.problems.push(lightenProblem(p));
    state.cart = ['mockBIG']; persistCart(); renderSheet();
  });
  let dl2 = null;
  page.waitForEvent('download', {timeout:2500}).then(d=>dl2=d).catch(()=>{});
  await page.click('#btn-mock');
  await page.waitForTimeout(3000);
  check('넘침 confirm 표시', dialogs.length===1 && dialogs[0].includes('넘칠'), dialogs[0]);
  check('취소 시 다운로드 없음', dl2===null);
  check('취소 후에도 EQ_BASE 복원', await page.evaluate(()=>EQ_BASE)===1000);

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | '));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
