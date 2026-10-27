// smoke63: 실황 패널 버튼이 잘 보이게(흰 바탕 버튼), ⏹ 중지 = 진행 중인 AI 요청까지 바로 끊고 '중지됨' 표시(저장된 것은 그대로),
//          원기둥·원뿔을 proj 로 정확히 투영 — 원 위의 점이 그린 타원 위에 놓이고 옆선이 타원에 접함
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── 1) 중지: 진행 중 요청이 끊기고 새 요청 없음 ──
  const r = await page.evaluate(async () => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const base = { answer:'5', solution:'풀이', subject:'수학Ⅰ', chapter:'', section:'', grade:'', srcType:'기출', srcName:'중지 테스트', srcYear:'', difficulty:3, tags:[], reviewed:true, batch:'bZ', batchName:'중지', images:[], choices:[] };
    for(let k = 1; k <= 6; k++){ const p = { ...base, id:'Z'+k, origNo:String(k), question:`ZW${k} 문제`, createdAt:k, updatedAt:k }; await saveProblem(p); state.problems.push(lightenProblem(p)); }
    let started = 0, aborted = 0, finished = 0;
    window.fetch = (u, o) => new Promise((res, rej) => {
      started++;
      const t = JSON.parse(o.body).messages[0].content.find(x => x.type === 'text').text;
      const quick = !t.includes('[원본 문제]') ;
      const tm = setTimeout(() => { finished++; const kw = (t.match(/ZW\d/)||[''])[0];
        const reply = quick ? { answer:'7', wellPosed:true } : { items:[ { kind:'쌍둥이', question: kw+' 쌍둥이', choices:[], answer:'7', solution:'s' }, { kind:'변형', question: kw+' 변형', choices:[], answer:'7', solution:'s' } ] };
        res(new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify(reply) }] }), { status:200 })); }, quick ? 30 : 400);
      if(o.signal) o.signal.addEventListener('abort', () => { clearTimeout(tm); aborted++; const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
    });
    openTwinMaker(['Z1','Z2','Z3','Z4','Z5','Z6']); $('#tw-conc').value = '2';
    const run = startTwinMaker();
    await new Promise(r => setTimeout(r, 150));
    const btns = [...document.querySelectorAll('#twin-live .tl-head button')].map(b => { const cs = getComputedStyle(b); return { t: b.textContent.trim(), c: cs.color, bg: cs.backgroundColor }; });
    const t0 = Date.now();
    [...document.querySelectorAll('#twin-live .tl-head button')].find(b => b.textContent.includes('중지')).click();
    const stopping = $('#twin-live .tl-head').textContent;
    await run;
    const took = Date.now() - t0, startedAtEnd = started;
    await new Promise(r => setTimeout(r, 600));
    const head = $('#twin-live .tl-head').textContent.replace(/\s+/g, ' '), body = $('#twin-live .tl-body').textContent.replace(/\s+/g, ' ');
    const endBtns = [...document.querySelectorAll('#twin-live .tl-head button')].map(b => { const cs = getComputedStyle(b); return { t: b.textContent.trim(), c: cs.color, bg: cs.backgroundColor }; });
    const waits = document.querySelectorAll('#twin-live .tl-chip.wait').length;
    twinLiveClose();
    return { btns, endBtns, stopping, took, aborted, newAfter: started - startedAtEnd, head, body: body.slice(0, 300), waits, saved: state.problems.filter(p => p.twinOf && /^Z/.test(p.twinOf)).length, running: AI_BATCH.running };
  });
  const lum = c => { const m = c.match(/\d+/g).map(Number); return 0.299*m[0] + 0.587*m[1] + 0.114*m[2]; };
  const contrast = b => Math.abs(lum(b.c) - lum(b.bg)) > 90;
  check('패널 위 버튼이 잘 보임 (글자·바탕 대비)', r.btns.length >= 2 && r.btns.every(contrast) && r.endBtns.every(contrast), JSON.stringify(r.btns.concat(r.endBtns)));
  check('⏹ 누르면 바로 "중지하는 중"', /중지하는 중/.test(r.stopping), r.stopping.slice(0, 60));
  check('진행 중인 AI 요청을 끊어 금방 멈춤 (생성 400ms 기다리지 않음)', r.aborted >= 1 && r.took < 300, `aborted=${r.aborted}, ${r.took}ms`);
  check('중지 뒤 새 AI 요청 없음', r.newAfter === 0, r.newAfter);
  check('패널: ⏹ 중지됨, 남은 원본은 대기 대신 중지됨', /⏹ 중지됨/.test(r.head) && !/완료/.test(r.head) && r.waits === 0 && /중지됨/.test(r.body), r.head + ' | ' + r.body.slice(0, 120));
  check('중지 상태 정리 (다음 작업 가능)', r.running === false);

  // ── 2) 원기둥·원뿔 정확한 투영 ──
  const g = await page.evaluate(() => {
    const res = {};
    for(const proj of [{ x:[1,-0.13], y:[0.5,0.6], z:[0,1] }, { x:[1,0], y:[0.25,0.3], z:[0,1] }]){
      for(const type of ['cylinder','cone']){
        const spec = { kind:'space', proj, solids:[{ type, c:[0,0,0], r:5, h:4 }] };
        const parts = figSpaceParts(spec), P2 = parts.P2, ex = figExpandSolids(spec, P2);
        const curves3 = ex.curves.every(c => c.pts.every(q => q.length === 3));
        // 밑면 곡선 점들이 실제 원(반지름 5, z=0) 위에 있는지
        const onCircle = ex.curves.filter(c => c.pts[0][2] === 0).every(c => c.pts.every(q => Math.abs(Math.hypot(q[0], q[1]) - 5) < 1e-9));
        // 옆선이 타원에 접하는지: 원기둥은 z 방향과 나란한 선이 타원의 가장 바깥, 원뿔은 꼭짓점에서 그은 선이 타원에 닿기만
        const sides = ex.segments.filter(s => !s.dash).map(s => s.p.map(P2));
        const ell = Array.from({ length: 2000 }, (_, k) => P2([5*Math.cos(k/2000*2*Math.PI), 5*Math.sin(k/2000*2*Math.PI), 0]));
        let tangent = true;
        for(const [a, b] of sides){
          const d = [b[0]-a[0], b[1]-a[1]], L = Math.hypot(...d), n = [-d[1]/L, d[0]/L];
          const s0 = (a[0]*n[0] + a[1]*n[1]);
          const vals = ell.map(q => q[0]*n[0] + q[1]*n[1] - s0);
          tangent = tangent && (Math.max(...vals) < 0.02 || Math.min(...vals) > -0.02);
        }
        // 원 위의 점 A(θ=200°) 가 밑면 곡선 위에
        const A = P2([5*Math.cos(3.49), 5*Math.sin(3.49), 0]);
        const near = ex.curves.some(c => c.pts.some(q => { const p = P2(q); return Math.hypot(p[0]-A[0], p[1]-A[1]) < 0.15; }));
        res[type + JSON.stringify(proj.y)] = { curves3, onCircle, tangent, near, sides: sides.length, dashed: ex.curves.some(c => c.dash) };
      }
    }
    return res;
  });
  check('원기둥·원뿔: 3차원 원을 그대로 투영(점이 원 위에)', Object.values(g).every(o => o.curves3 && o.onCircle && o.near), JSON.stringify(g));
  check('옆선이 타원에 정확히 접함 (원기둥 2줄·원뿔 2줄)', Object.values(g).every(o => o.tangent && o.sides === 2), JSON.stringify(Object.values(g).map(o => [o.tangent, o.sides])));
  check('밑면 뒤쪽 반은 점선', Object.values(g).every(o => o.dashed));
  const tw = await page.evaluate(() => {
    const spec = { kind:'space', proj:{ x:[1,-0.13], y:[0.5,0.6], z:[0,1] }, solids:[{ type:'cylinder', c:[0,0,0], r:5, h:4 }],
      points:{ A:[-5,0,0], B:[5,0,0], C:[4,3,4], D:[-4,3,4], H:[-4,3,0] }, segments:[{p:['A','B']},{p:['C','D']},{p:['D','H'],dash:true}] };
    const out = figSpecToSvg(spec);
    return { ok: !!out.svg, noFill: !/fill="#e3e3e3"/.test(out.svg), issues: figSpecIssues(spec) };
  });
  check('원기둥 문제 그림(쌍둥이 27번 꼴): 색칠은 fill:true 일 때만', tw.ok && tw.noFill && tw.issues.length === 0, JSON.stringify(tw));

  // ── 3) 이미 저장된 예전 원기둥 그림 → 설계도로 한 번 다시 그림 ──
  const rr = await page.evaluate(async () => {
    const OLD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const cyl = { kind:'space', proj:{ x:[1,0], y:[0.25,0.3], z:[0,1] }, solids:[{ type:'cylinder', c:[0,0,0], r:5, h:4 }], size:[300,300] };
    const gr = { kind:'graph', x:[-1,3], y:[-1,3], curves:[{ f:'x' }], size:[200,200] };
    const mk = (id, sp) => ({ id, question:id, choices:[], answer:'1', solution:'', subject:'', chapter:'', section:'', grade:'', srcType:'AI변형', srcName:'x', difficulty:3, tags:[], reviewed:false, images:[OLD], figSpecs:[sp], createdAt:1, updatedAt:1 });
    for(const p of [mk('RC', cyl), mk('RG', gr)]){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    const n1 = await figRerenderSolids(), n2 = await figRerenderSolids();
    const a = await DB.get('problems', 'RC'), b = await DB.get('problems', 'RG');
    return { n1, n2, cylNew: a.images[0] !== OLD && /^data:image\/png/.test(a.images[0]) && a.images[0].length > 1000, figV: a.figV, keepSpec: !!(a.figSpecs && a.figSpecs[0].solids), graphSame: b.images[0] === OLD };
  });
  check('저장된 예전 원기둥 그림을 설계도로 다시 그림 (한 번만, 그래프 그림은 그대로)', rr.n1 === 1 && rr.n2 === 0 && rr.cylNew && rr.figV === 2 && rr.keepSpec && rr.graphSame, JSON.stringify(rr));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
