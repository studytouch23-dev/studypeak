// smoke76: 보안 — 남이 준 백업 JSON(twinNo·그림 src·태그·묶음 이름·twinOf 에 스크립트), 프로토타입 오염(__proto__),
//          SVG 설계도 우회(animate onbegin·/onload·set href=javascript:), 작은따옴표 이름(태그·출처) 버튼, pdf.js isEvalSupported:false
const fs = require('fs');
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

  const r = await page.evaluate(async () => {
    window.__pwned = 0;
    const X = 'window.__pwned++';
    const bad = {
      problems: [
        { id:'S1<x>', question:'q1', answer:'1', subject:'수학Ⅰ', chapter:'수열', section:'등차수열', twinKind:'쌍둥이', twinNo:`<img src=x onerror="${X}">`,
          twinOf:`a',${X},'`, batch:`b');${X};('`, images:[`x" onerror="${X}`, 'data:image/png;base64,iVBORw0KGgo='], solImg:`x" onerror="${X}`,
          tags:[`t');${X};('`, { evil:1 }], difficulty:'<b>9</b>', createdAt:1, updatedAt:1 },
        { id:'S2', question:'q2', answer:'2', srcName:`시험'); ${X}; ('`, subject:'수학Ⅰ', chapter:'수열', section:'등차수열', createdAt:2, updatedAt:2, tags:[] },
      ],
      curriculum: { '__proto__': { polluted: ['x'] }, '학원': { 'constructor': ['y'], '단원': ['a', { b:1 }] } },
    };
    const n = await importBackupData(JSON.parse(JSON.stringify(bad).replace('"__proto__"', '"__proto__"')));   // JSON.parse 는 __proto__ 를 일반 키로 만든다
    await new Promise(r => setTimeout(r, 300));
    const p1 = await DB.get('problems', 'S1x');
    // 화면들 그리기 (카드·쌍둥이 묶음·상세·태그·대시보드)
    go('db'); renderDB(); await new Promise(r => setTimeout(r, 200));
    state.dbView = 'twin'; try{ renderDB(); }catch(e){}
    await openDetail('S1x'); await new Promise(r => setTimeout(r, 200)); closeModal();
    go('mytags'); go('dashboard'); try{ renderDashContinue && renderDashContinue(); }catch(e){}
    // 버튼 누르기: 작은따옴표 태그·출처 이름이 JS 밖으로 안 나가는지
    for(const b of document.querySelectorAll('[onclick*="tagGoDB"], [onclick*="dashGo"], [onclick*="batchToSheet"]')){ try{ b.click(); }catch(e){} }
    await new Promise(r => setTimeout(r, 200));
    // SVG 정화
    const svgs = [
      '<svg viewBox="0 0 10 10"><animate/onbegin="window.__pwned++"/attributeName="x"/dur="1s"/></svg>',
      '<svg viewBox="0 0 10 10"><rect/onload="window.__pwned++" width="5" height="5"/></svg>',
      '<svg viewBox="0 0 10 10"><a><set attributeName="href" to="javascript:window.__pwned++"/><text>t</text></a></svg>',
      '<svg viewBox="0 0 10 10"><a href="javascript:window.__pwned++"><text>t</text></a><foreignObject><img src=x onerror="window.__pwned++"></foreignObject></svg>',
    ].map(sanitizeSvg);
    const box = document.createElement('div'); document.body.appendChild(box);
    svgs.forEach(s => { box.innerHTML += s; });
    await new Promise(r => setTimeout(r, 1500));
    const keep = sanitizeSvg('<svg viewBox="0 0 10 10"><defs><marker id="m"><path d="M0 0L2 1"/></marker></defs><line x1="0" y1="0" x2="5" y2="5" marker-end="url(#m)" stroke="#000"/><text x="1" y="9">y=x²</text></svg>');
    return { n, pwned: window.__pwned, proto: ({}).polluted, ctor: typeof CURRICULUM['학원'] && Array.isArray(CURRICULUM['학원']['constructor']),
      sec: (CURRICULUM['학원'] && CURRICULUM['학원']['단원']) || null,
      p1: { images: p1.images.length, solImg: p1.solImg, twinNo: p1.twinNo, twinOf: p1.twinOf, batch: p1.batch, tags: p1.tags, diff: p1.difficulty },
      svgs: svgs.map(s => /onbegin|onload|onerror|javascript:|<set|<animate|foreignObject/i.test(s)), keep: /<marker/.test(keep) && /marker-end="url\(#m\)"/.test(keep) && /y=x²/.test(keep),
      escJs: escJs("a'b\\c"), esc: esc(`'"<>`), pdfEval: /isEvalSupported:\s*false/.test(parsePDF.toString()) };
  });
  check('악성 백업도 가져오기는 됨(2문제)', r.n === 2, r.n);
  check('어떤 스크립트도 실행되지 않음 (카드·쌍둥이 묶음·상세·태그·대시보드 버튼·SVG)', r.pwned === 0, r.pwned);
  check('가져온 값 정리: 그림은 data:image 만, twinNo 숫자, id 류 [\\w.:|-], 태그는 글자만, 난이도 1~5', r.p1.images === 1 && r.p1.solImg === '' && r.p1.twinNo === 0 && !/['(),;]/.test(r.p1.twinOf) && !/['(),;]/.test(r.p1.batch) && r.p1.tags.length === 1 && r.p1.diff === 3, JSON.stringify(r.p1));
  check('__proto__·constructor 키는 무시(프로토타입 오염 없음), 단원 값은 글자만', r.proto === undefined && !r.ctor && JSON.stringify(r.sec) === '["a"]', JSON.stringify([r.proto, r.ctor, r.sec]));
  check('SVG 정화: onbegin·/onload·set href·javascript:·foreignObject 모두 제거', r.svgs.every(x => !x), JSON.stringify(r.svgs));
  check('SVG 정화: 정상 그림(marker·url(#id)·글자)은 유지', r.keep);
  check("escJs: 작은따옴표·역슬래시를 JS 이스케이프 후 HTML 이스케이프", r.escJs === "a\\&#39;b\\\\c" && r.esc === '&#39;&quot;&lt;&gt;', JSON.stringify([r.escJs, r.esc]));
  check('pdf.js isEvalSupported:false (CVE-2024-4367)', r.pdfEval);
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
