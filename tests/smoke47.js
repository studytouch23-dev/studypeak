// smoke47: 그림 설계도(figSpec) — 함수 그래프·평면 도형을 식·좌표로 정확히 그리고(SVG), 설계도를 문제와 함께 저장·동기화,
//          상세 화면에서 고쳐 다시 그리기, HTML 교재엔 벡터(SVG), 문제 생성의 [그림설계] → 그림 자동 생성
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

const TRI = { kind:'geometry', points:{ A:[0,4], B:[0,0], C:[3,0] },
  polygons:[ { p:['A','B','C'] } ], segments:[ { p:['B','C'], label:'3' } ],
  angles:[ { p:['A','B','C'], right:true }, { p:['B','C','A'], label:'θ' } ] };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // 픽셀 검사 도우미: 설계도 → PNG → 지정 좌표 근처에 검은 선이 있는지
  await page.evaluate(() => {
    window.__px = async (png) => {
      const im = new Image(); await new Promise(r => { im.onload = r; im.src = png; });
      const k = document.createElement('canvas'); k.width = im.naturalWidth; k.height = im.naturalHeight;
      const g = k.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, k.width, k.height).data, W = k.width, H = k.height;
      const lum = (x, y) => { x = Math.round(x); y = Math.round(y); if(x<0||y<0||x>=W||y>=H) return 255; const i = (y*W+x)*4; return 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; };
      const dark = (x, y, r=3) => { for(let dy=-r; dy<=r; dy++) for(let dx=-r; dx<=r; dx++) if(lum(x+dx, y+dy) < 110) return true; return false; };
      return { W, H, lum, dark };
    };
  });

  // ── 1) 평면 도형: 같은 배율(원은 원), 꼭짓점·변 위치, 직각 표시, 점 이름 ──
  const geo = await page.evaluate(async TRI => {
    const out = figSpecToSvg(TRI);
    const P = await __px(await svgToPng(out.svg, out.w, out.h));
    // 꼭짓점 위치를 SVG에서 다시 계산하지 않고, 검은 선이 지나는 곳을 찾아 확인: 빗변 AC 의 중점, 밑변 BC 의 중점
    const path = out.svg.match(/<path d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)Z"/);
    const [ax, ay, bx, by, cx, cy] = path.slice(1).map(Number);
    const sx = (cx-bx)/3, sy = (by-ay)/4;                     // x 1 단위·y 1 단위의 픽셀 길이
    return { kind: out.svg.startsWith('<svg'), sameScale: Math.abs(sx - sy) < 0.5, sx, sy,
      midAC: P.dark((ax+cx)/2, (ay+cy)/2), midBC: P.dark((bx+cx)/2, by), inside: P.dark((ax+bx+cx)/3, (ay+by+cy)/3, 2),
      right: /<path d="M[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+" fill="none"/.test(out.svg),
      labels: ['A','B','C','θ','3'].every(t => out.svg.includes('>'+t+'<')),
      italicA: /font-style="italic">A</.test(out.svg), uprightNum: /font-size="\d+">3</.test(out.svg) };
  }, TRI);
  check('도형: SVG 생성', geo.kind);
  check('도형: 가로·세로 같은 배율 (직각·원 모양 보존)', geo.sameScale, `${geo.sx.toFixed(1)} / ${geo.sy.toFixed(1)}`);
  check('도형: 빗변·밑변이 정확한 위치에, 안쪽은 비어 있음', geo.midAC && geo.midBC && !geo.inside, JSON.stringify(geo));
  check('도형: 직각 표시(ㄱ자) 있음', geo.right);
  check('도형: 점 이름·각·길이 라벨, 점 이름은 기울임·숫자는 바로', geo.labels && geo.italicA && geo.uprightNum);

  const circ = await page.evaluate(async () => {
    const spec = { kind:'geometry', points:{ O:[0,0], A:[2,0], B:[0,2] }, circles:[ { c:'O', through:'A' } ],
      arcs:[ { c:'O', r:2, from:'A', to:'B', sector:true, fill:true } ], segments:[ { p:['O','A'], ticks:2 } ] };
    const out = figSpecToSvg(spec);
    const m = out.svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="none"/);
    const [cx, cy, r] = m.slice(1).map(Number);
    const P = await __px(await svgToPng(out.svg, out.w, out.h));
    return { onCircle: [0, 90, 180, 225, 300].every(t => P.dark(cx + r*Math.cos(t*Math.PI/180), cy - r*Math.sin(t*Math.PI/180))),
      sectorFilled: P.lum(cx + r*0.4, cy - r*0.4) < 245 && P.lum(cx + r*0.4, cy - r*0.4) > 180,
      otherWhite: P.lum(cx - r*0.4, cy + r*0.4) > 245, ticks: (out.svg.match(/<line /g)||[]).length >= 2 };
  });
  check('원: 반지름 일정(찌그러짐 없음)', circ.onCircle);
  check('부채꼴(호 from→to 반시계) 색칠, 나머지는 흰색', circ.sectorFilled && circ.otherWhite, JSON.stringify(circ));
  check('같은 길이 표시(ticks:2) 두 줄', circ.ticks);

  const yd = await page.evaluate(() => {
    const a = figSpecToSvg({ kind:'geometry', ydown:true, points:{ A:[100,20], B:[100,220], C:[250,220] }, polygons:[{ p:['A','B','C'] }] }, 300, 240);
    const b = figSpecToSvg({ kind:'geometry', points:{ A:[100,-20], B:[100,-220], C:[250,-220] }, polygons:[{ p:['A','B','C'] }] }, 300, 240);
    const pa = a.svg.match(/<path d="([^"]+)"/)[1], pb = b.svg.match(/<path d="([^"]+)"/)[1];
    return { same: pa === pb, ratio: a.w / a.h };
  });
  check('ydown(원본 픽셀 좌표) = 수학 좌표 뒤집기와 같은 그림', yd.same);
  check('원본 크기를 주면 원본 비율', Math.abs(yd.ratio - 300/240) < 0.01, yd.ratio.toFixed(3));

  // ── 2) 함수 그래프: 눈금·투영 점선·함수 이름 바로 세우기 ──
  const gr = await page.evaluate(async () => {
    const spec = { kind:'graph', x:[-1,4], y:[-1,4], curves:[ { f:'ln(x)+1', from:0.1, to:4, label:'y=ln x+1' } ],
      points:[ { x:1, y:1, label:'P', proj:true } ], xticks:[1], yticks:[ { v:1, label:'1' } ] };
    const out = figSpecToSvg(spec);
    const W = out.w, H = out.h, m = Math.round(W*0.035);
    const px = x => m + (x+1)/5*(W-2*m), py = y => H-m - (y+1)/5*(H-2*m);
    const P = await __px(await svgToPng(out.svg, out.w, out.h));
    return { curve: [0.5, 2, 3.5].every(x => P.dark(px(x), py(Math.log(x)+1))),
      projV: P.dark(px(1), py(0.5)), projH: P.dark(px(0.5), py(1)),
      lnUpright: /font-size="\d+">l<\/text><text[^>]*font-size="\d+">n</.test(out.svg),
      ticks: (out.svg.match(/>1</g)||[]).length >= 2 };
  });
  check('그래프: y=ln x+1 곡선 정확', gr.curve);
  check('그래프: 점에서 두 축으로 점선(proj)', gr.projV && gr.projH, JSON.stringify(gr));
  check('그래프: 축 눈금 숫자', gr.ticks);
  check('라벨: ln 은 바로(기울이지 않음)', gr.lnUpright);

  // ── 3) 설계도 점검 ──
  const iss = await page.evaluate(() => ({
    ok: figSpecIssues({ kind:'geometry', points:{ A:[0,0], B:[1,0] }, segments:[{ p:['A','B'] }] }),
    badPt: figSpecIssues({ kind:'geometry', points:{ A:[0,0] }, segments:[{ p:['A','Z'] }] }),
    badF: figSpecIssues({ kind:'graph', x:[0,1], y:[0,1], curves:[{ f:'alert(1)' }] }),
    badKind: figSpecIssues({ kind:'photo' }),
    throws: (()=>{ try{ figSpecToSvg({ kind:'graph', x:[1,0], y:[0,1] }); return false; }catch(e){ return e.message; } })(),
  }));
  check('점검: 정상 설계도는 문제 없음', iss.ok.length === 0, JSON.stringify(iss.ok));
  check('점검: 없는 점·틀린 식·모르는 종류를 알려 줌', iss.badPt.some(x=>x.includes('"Z"')) && iss.badF.some(x=>x.includes('alert')) && iss.badKind.length === 1, JSON.stringify(iss));
  check('잘못된 범위는 그리지 않고 오류', typeof iss.throws === 'string' && iss.throws.includes('범위'), iss.throws);

  // ── 4) 그림 다시 그리기(도형) → 설계도 보관 → 저장 → DB·클라우드에 figSpecs ──
  await page.evaluate(spec => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    window.__reply = spec;
    window.fetch = async () => new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(window.__reply) }] }), { status:200 });
  }, { ...TRI, ydown:false });
  const saved = await page.evaluate(async () => {
    localStorage.setItem('sp-lab-cloud', '1'); await sbInit();
    const c = await sbLoad(); await c.auth.signInWithPassword({ email:'t@t', password:'x' });
    await new Promise(r => setTimeout(r, 300));
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 200;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 240, 200); g.strokeRect(20, 20, 150, 150);
    const IMG = cv.toDataURL('image/png');
    state.bulkDrafts = [ { num:'5', text:'삼각형 ABC에서 tan θ 의 값은?\n[그림]', choices:[], sol:'', ans:'4/3', img: IMG, aiDone:true } ];
    go('add'); setAddMode('bulk'); document.querySelector('#bulk-preview-card').style.display = 'block'; rerenderBulk();
    await redrawDraftFig(0);
    const d = state.bulkDrafts[0];
    const btn = !!document.querySelector('#bulk-preview button[onclick^="editDraftFigSpec"]');
    const dSpec = d.figSpec && d.figSpec.kind, size = d.figSpec && d.figSpec.size;
    $('#b-srcname').value = '설계도 테스트';
    await saveBulk();
    const p = state.problems.find(x => x.srcName === '설계도 테스트');
    const rec = await DB.get('problems', p.id);
    await sbFlush();
    const row = window.__rows.problems.get(p.id);
    return { id: p.id, btn, dSpec, size, lightHas: !!(p.figSpecs && p.figSpecs[0]), dbHas: !!(rec.figSpecs && rec.figSpecs[0] && rec.figSpecs[0].kind === 'geometry'),
      cloudHas: !!(row && row.data.figSpecs && row.data.figSpecs[0]), imgPng: /^data:image\/png/.test(rec.images[0]) };
  });
  check('다시 그리기: 도형 설계도를 보관(원본 크기 포함)', saved.dSpec === 'geometry' && JSON.stringify(saved.size) === '[240,200]', JSON.stringify(saved));
  check('분할 확인 화면: [📐 설계도 고치기] 버튼', saved.btn);
  check('저장: 메모리·DB·클라우드 모두 설계도 포함, 그림은 PNG', saved.lightHas && saved.dbHas && saved.cloudHas && saved.imgPng, JSON.stringify(saved));

  // ── 5) 상세 화면: 설계도 고치기 → 다시 그려 저장 ──
  const ed = await page.evaluate(async id => {
    openDetail(id);
    await new Promise(r => setTimeout(r, 400));
    const btn = document.querySelector('#detail-imgs button[onclick^="openFigSpecForProblem"]');
    if(!btn) return { err:'no button' };
    btn.click(); await new Promise(r => setTimeout(r, 200));
    const ta = $('#figed-json'), before = $('#figed-prev').innerHTML.includes('<svg');
    const spec = JSON.parse(ta.value); spec.points.C = [6, 0]; spec.segments[0].label = '6';
    ta.value = JSON.stringify(spec); figedPreview();
    const msg = $('#figed-msg').textContent;
    ta.value = '{"kind":"geometry", "points": {'; figedPreview();
    const badMsg = $('#figed-msg').textContent;
    ta.value = JSON.stringify(spec); figedPreview();
    const oldImg = (await DB.get('problems', id)).images[0];
    await figedSave();
    await new Promise(r => setTimeout(r, 300));
    const rec = await DB.get('problems', id);
    return { before, msg, badMsg, changed: rec.images[0] !== oldImg, specC: rec.figSpecs[0].points.C, label: rec.figSpecs[0].segments[0].label,
      closed: !document.querySelector('#figed-ov'), queued: SB.queue.size > 0 || !!window.__rows.problems.get(id) };
  }, saved.id);
  check('상세: 설계도 편집기가 열리고 미리보기(SVG)', ed.before, JSON.stringify(ed));
  check('편집기: 고치면 바로 다시 그림 / 형식 오류는 안내', /그림을 그렸습니다/.test(ed.msg) && /JSON 형식 오류|⚠/.test(ed.badMsg), `${ed.msg} | ${ed.badMsg}`);
  check('편집기 저장: 그림·설계도 갱신', ed.changed && JSON.stringify(ed.specC) === '[6,0]' && ed.label === '6' && ed.closed, JSON.stringify(ed));

  // ── 6) 그림 없는 문제에 새 그래프 추가 ──
  const add = await page.evaluate(async () => {
    const p = { id:'nofig1', question:'함수 $y=x^2-2x+1$ 의 그래프를 보고 답하시오.\n[그림]', choices:[], answer:'1', solution:'', images:[], subject:'수학Ⅰ', chapter:'', section:'',
      tags:[], srcType:'자작', srcName:'', createdAt:Date.now(), updatedAt:Date.now() };
    await saveProblem(p); state.problems.push(lightenProblem(p));
    openDetail('nofig1');
    const btn = [...document.querySelectorAll('#modal-body button')].find(b => b.textContent.includes('그래프·도형 새로 그리기'));
    btn.click(); await new Promise(r => setTimeout(r, 200));
    const tpl = JSON.parse($('#figed-json').value).kind;
    await figedSave(); await new Promise(r => setTimeout(r, 300));
    const rec = await DB.get('problems', 'nofig1');
    return { tpl, n: rec.images.length, spec: rec.figSpecs && rec.figSpecs[0] && rec.figSpecs[0].kind, light: state.problems.find(x=>x.id==='nofig1').imgN };
  });
  check('새 그림: 함수 그래프 예시로 시작 → 저장하면 그림 1개 + 설계도', add.tpl === 'graph' && add.n === 1 && add.spec === 'graph' && add.light === 1, JSON.stringify(add));

  // ── 7) AI로 고치기 (말로 요청 → 고친 설계도) ──
  const ask = await page.evaluate(async () => {
    window.__reply = { kind:'graph', x:[-3,4], y:[-5,6], curves:[{ f:'x^2-4', label:'y=x²−4' }] };
    let sent = '';
    const of = window.fetch;
    window.fetch = async (u, o) => { sent = o && o.body || ''; return of(u, o); };
    openFigSpecEditor({ spec: FIG_TEMPLATES.graph, onSave: null });
    $('#figed-ask').value = '곡선을 y=x²−4 로';
    await figedAskAi();
    const v = JSON.parse($('#figed-json').value);
    figedClose(); window.fetch = of;
    return { f: v.curves[0].f, sentHasSpec: sent.includes('x^2-2*x+1') && sent.includes('곡선을 y=x²−4 로') };
  });
  check('AI로 고치기: 지금 설계도+요청을 보내고 결과로 바꿈', ask.f === 'x^2-4' && ask.sentHasSpec, JSON.stringify(ask));

  // ── 8) 그림 편집기: 손대지 않고 저장하면 설계도 유지, 손으로 고치면 설계도 해제 ──
  const im = await page.evaluate(async id => {
    await openImgEditor(id); await imgedSave(); await new Promise(r => setTimeout(r, 200));
    const keep = !!(await DB.get('problems', id)).figSpecs;
    await openImgEditor(id);
    IMGED.ctx.fillStyle = '#000'; IMGED.ctx.fillRect(5, 5, 30, 30);       // 손으로 그은 수정
    await imgedSave(); await new Promise(r => setTimeout(r, 200));
    const rec = await DB.get('problems', id);
    return { keep, dropped: !rec.figSpecs, light: !state.problems.find(x=>x.id===id).figSpecs };
  }, saved.id);
  check('그림 편집기: 그대로 저장 → 설계도 유지', im.keep);
  check('그림 편집기: 손으로 고치면 설계도 해제(그림과 어긋나지 않게)', im.dropped && im.light, JSON.stringify(im));

  // ── 9) HTML 교재: 설계도 그림은 벡터(SVG) ──
  const html = await page.evaluate(async () => {
    const p = state.problems.find(x => x.id === 'nofig1');
    const { html } = await buildHtmlExport('sheet', [p]);
    return { svg: html.includes('data:image/svg+xml'), noPng: !/<img class="fig" src="data:image\/png/.test(html) };
  });
  check('HTML 내보내기: 설계도 그림은 SVG(확대해도 선명)', html.svg && html.noPng, JSON.stringify(html));

  // ── 10) 문제 생성: [그림설계]{...}[/그림설계] → 그림 자동 + [그림] 자리 ──
  const gen = await page.evaluate(async () => {
    const prompt = buildGenPrompt();
    const sp = JSON.stringify({ kind:'graph', x:[-2,4], y:[-2,5], curves:[{ f:'x^2-2*x', label:'y=x²−2x' }], points:[{ x:0, y:0, label:'O', pos:'bl' }] });
    const txt = [
      '1. 그림과 같이 곡선 $y=x^{2}-2x$ 와 $x$ 축으로 둘러싸인 부분의 넓이는?',
      '[그림설계]'+sp+'[/그림설계]',
      '① $\\dfrac{1}{3}$ ② $\\dfrac{2}{3}$ ③ $1$ ④ $\\dfrac{4}{3}$ ⑤ $\\dfrac{5}{3}$',
      '[답] ④', '[해설] $\\int_{0}^{2}(2x-x^{2})dx=\\dfrac{4}{3}$', '',
      '2. 두 점 사이의 거리는? [그림설계]{"kind":"geometry","points":{"A":[0,0],"B":}[/그림설계]',
      '[답] 5', '[해설] 피타고라스.'
    ].join('\n');
    $('#g-result').value = txt;
    const r = await genResultToBulk();
    const [a, b] = state.bulkDrafts;
    return { prompt: prompt.includes('[그림설계]') && prompt.includes('"kind":"geometry"'), r,
      aImg: /^data:image\/png/.test(a.img||''), aSpec: a.figSpec && a.figSpec.kind, aSlot: /\n\[그림\]\n/.test('\n'+a.text+'\n') && !a.text.includes('그림설계'),
      bWarn: (b.aiIssues||[]).some(x => x.includes('설계도')), bNoImg: !b.img, bSlot: !b.text.includes('그림설계'),
      btn: !!document.querySelector('#bulk-preview button[onclick="editDraftFigSpec(0)"]'), status: $('#bulk-status').textContent };
  });
  check('생성 프롬프트: [그림설계] 형식 안내(그래프·도형)', gen.prompt);
  check('생성 결과: 설계도 → PNG 그림 + 설계도 보관', gen.aImg && gen.aSpec === 'graph', JSON.stringify(gen));
  check('생성 결과: 본문엔 [그림] 자리만 (한 줄 단독)', gen.aSlot);
  check('깨진 설계도: 그림 없이 경고(#검수주의)', gen.bWarn && gen.bNoImg && gen.bSlot);
  check('분할 화면: 생성 그림도 [📐 설계도 고치기] + 상태 안내', gen.btn && gen.status.includes('설계도로 그림 1개'), gen.status);

  // ── 11) tools/graph.js attach 용 함수 ──
  const at = await page.evaluate(async () => {
    const rec = await DB.get('problems', 'nofig1');
    const r1 = await attachFigSpec(rec, { kind:'geometry', points:{ A:[0,0], B:[2,0], C:[1,1.7] }, polygons:[{ p:['A','B','C'] }] }, 'new');
    const r2 = await attachFigSpec(await DB.get('problems', 'nofig1'), { kind:'graph', x:[-1,1], y:[-1,1], curves:[{ f:'x' }] }, 0);
    const after = await DB.get('problems', 'nofig1');
    let err = '';
    try{ await attachFigSpec(after, { kind:'graph', x:[2,1], y:[0,1] }, 0); }catch(e){ err = e.message; }
    return { r1, r2, kinds: after.figSpecs.map(x => x && x.kind), n: after.images.length, err };
  });
  check('attachFigSpec: 새 그림 추가·기존 그림 교체·설계도 순서 일치', at.r1.index === 1 && at.r2.index === 0 && at.n === 2 && JSON.stringify(at.kinds) === '["graph","geometry"]', JSON.stringify(at));
  check('attachFigSpec: 틀린 설계도는 저장하지 않음', at.err.includes('범위'), at.err);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
