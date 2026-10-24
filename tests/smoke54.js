// smoke54: 웹 다시 그리기를 Claude Code 수준에 가깝게 + 맥 Claude Code 경로
//  - 단면 입체 guides(x=1·x=e 직선과 글자), _보조점 이름 숨김, 입체는 비교·수정 2회
//  - 직접 그린 SVG(kind:'svg'): 안전 정리·크기 맞춤·문항 저장·HTML 벡터, tools/graph.js 가 .svg 를 render/check
//  - 문제 상세에 문항 ID(맥 Claude Code에 알려 줄 때)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
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
    const cs = figSpecToSvg({ kind:'space', proj:{ x:[1,-0.13], y:[0.6,0.6], z:[0,1] }, axes:{ x:[-0.4,4], y:[-0.6,2.8] },
      solids:[{ type:'crossSection', f:'sqrt(1+(ln(x))^2)', g:0, from:1, to:'e', shape:'semicircle', guides:true, fromLabel:'x=1', toLabel:'x=e' }] });
    const helper = figSpecToSvg({ kind:'space', points:{ _p1:[0,0,0], _p2:[1,0,0], A:[0,1,0] }, segments:[{ p:['_p1','_p2'] }] });
    const geoHelper = figSpecToSvg({ kind:'geometry', points:{ _h:[0,0], B:[2,0], C:[1,1] }, polygons:[{ p:['_h','B','C'] }] });
    const raw = figSpecToSvg({ kind:'svg', svg:"<svg viewBox='0 0 200 100' xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script><rect x='10' y='10' width='50' height='20' onclick='x()'/></svg>" });
    const badRaw = figSpecIssues({ kind:'svg', svg:'<div>no</div>' });
    return { guides: cs.svg.includes('>=<') && (cs.svg.match(/<text[^>]*>e<\/text>/g)||[]).length >= 1,
      helperHidden: !/>_</.test(helper.svg) && !/>p</.test(helper.svg) && helper.svg.includes('>A<'),
      geoHidden: !/>_</.test(geoHelper.svg) && !/>h</.test(geoHelper.svg) && geoHelper.svg.includes('>B<'),
      raw: { noScript: !/script|onclick/i.test(raw.svg), w: raw.w, h: raw.h, sized: raw.svg.includes(`width="${raw.w}" height="${raw.h}"`) && raw.w === 700 }, badRaw };
  });
  check('단면 입체 guides: x=1·x=e 직선과 글자', r.guides);
  check('_ 로 시작하는 보조점 이름은 그리지 않음 (입체·도형)', r.helperHidden && r.geoHidden);
  check('직접 그린 SVG: script·이벤트 제거, 원본 비율로 크기 맞춤', r.raw.noScript && r.raw.sized && r.raw.w/r.raw.h === 2, JSON.stringify(r.raw));
  check('SVG 형식이 아니면 점검에서 알려 줌', r.badRaw.length === 1, JSON.stringify(r.badRaw));

  // 입체는 비교·수정 2회
  const rounds = await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    let n = 0; const sp = { kind:'space', solids:[{ type:'cylinder', c:[0,0,0], r:1, h:2 }] };
    window.fetch = async () => { n++; return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(sp) }] }), { status:200 }); };
    const cv = document.createElement('canvas'); cv.width = 100; cv.height = 80;
    await aiRedrawFigureSpec(cv.toDataURL('image/png'), 100, 80, {});
    const nSpace = n; n = 0;
    const gsp = { kind:'graph', x:[-1,1], y:[-1,1], curves:[{ f:'x' }] };
    window.fetch = async () => { n++; return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(gsp) }] }), { status:200 }); };
    await aiRedrawFigureSpec(cv.toDataURL('image/png'), 100, 80, {});
    return { nSpace, nGraph: n };
  });
  check('입체는 읽기 1 + 비교·수정 2회, 그래프는 1회', rounds.nSpace === 3 && rounds.nGraph === 2, JSON.stringify(rounds));

  // 직접 그린 SVG를 문항에 저장 → HTML 내보내기는 벡터
  const att = await page.evaluate(async () => {
    const p = { id:'svg1', question:'입체 문제\n[그림]', choices:[], answer:'', solution:'', images:[], subject:'수학Ⅰ', chapter:'', section:'', tags:[], srcType:'기출', srcName:'3월', origNo:'26', createdAt:Date.now(), updatedAt:Date.now() };
    await saveProblem(p); state.problems.push(lightenProblem(p));
    await attachFigSpec(await DB.get('problems','svg1'), { kind:'svg', svg:"<svg viewBox='0 0 300 120' xmlns='http://www.w3.org/2000/svg'><path d='M10 100 L290 20' stroke='#000'/></svg>" }, 'new');
    const rec = await DB.get('problems','svg1');
    const { html } = await buildHtmlExport('sheet', [state.problems.find(x => x.id === 'svg1')]);
    openDetail('svg1');
    const idTxt = document.querySelector('#modal-body h3').textContent;
    closeModal();
    return { png: /^data:image\/png/.test(rec.images[0]), kind: rec.figSpecs[0].kind, vec: html.includes('data:image/svg+xml'), idTxt };
  });
  check('직접 그린 SVG를 문항 그림으로(PNG) + 설계도 보관', att.png && att.kind === 'svg', JSON.stringify(att));
  check('HTML 내보내기는 SVG 벡터', att.vec);
  check('문제 상세에 문항 ID 표시(복사용)', att.idTxt.includes('ID svg1'), att.idTxt);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();

  // tools/graph.js 가 .svg 파일을 그대로
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-svg-'));
  const f = path.join(tmp, 'solid.svg');
  fs.writeFileSync(f, `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><circle cx="100" cy="100" r="60" fill="none" stroke="#000"/></svg>`);
  let out = '', code = 0;
  try{ out = execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'graph.js'), 'render', f, '-o', path.join(tmp, 'solid.png')], { encoding:'utf8', timeout:120000 })
    + execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'graph.js'), 'check', f], { encoding:'utf8', timeout:120000 }); }
  catch(e){ code = e.status; out = (e.stdout||'') + (e.stderr||''); }
  const png = fs.existsSync(path.join(tmp, 'solid.png')) ? fs.readFileSync(path.join(tmp, 'solid.png')) : Buffer.alloc(0);
  check('graph.js: .svg 파일 render(PNG)·check', code === 0 && png.slice(1,4).toString() === 'PNG' && out.includes('✓ 설계도 정상 (svg'), out.trim().split('\n').pop());
  fs.rmSync(tmp, { recursive:true, force:true });

  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
