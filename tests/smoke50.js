// smoke50: 입체도형도 설계도로 — 3차원 좌표·사선 투영·매개변수 곡선(단면 반원 등)·색칠·숨은선,
//          그림 다시 그리기의 결과(원본 유지·실패)를 화면에 남기고 [다시 시도], 윈도10에서 안 보이는 🪄 이모지 제거
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

const SOLID = { kind:'space', proj:{ x:[1,0], y:[0.5,0.5], z:[0,1] }, axes:{ x:[-0.5,4.5], y:[-0.5,2] },
  points:{ A:[0,0,0], B:[4,0,0] },
  curves:[ { x:'2+cos(t)', y:0, z:'sin(t)', t:[0, 3.1416] },                    // xz 평면의 반원(단면)
           { x:'t', y:'sqrt(1+(ln(t))^2)', z:0, t:[1, 2.718], label:'y=√(1+(ln x)²)', lt:2.718, pos:'r' } ],
  segments:[ { p:[[1,0,0],[3,0,0]], dash:true } ],
  fills:[ { p:[ { x:'2+cos(t)', y:0, z:'sin(t)', t:[0, 3.1416] } ], fill:'dark' } ],
  texts:[ { at:[1,0,0], text:'x=1', pos:'b' } ] };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── 1) 매개변수 t 식 ──
  const ex = await page.evaluate(() => {
    const v = (s, x, n) => { try{ return +compileMathExpr(s, n)(x).toFixed(6); }catch(e){ return 'ERR'; } };
    return { a: v('t^2+1', 3, 't'), b: v('2tan(t)', 0, 't'), c: v('x+1', 1, 't'), d: v('x^2', 3) };
  });
  check('곡선 식의 매개변수 t (tan 과 구분), x 식은 그대로', ex.a === 10 && ex.b === 0 && ex.c === 'ERR' && ex.d === 9, JSON.stringify(ex));

  // ── 2) 입체 그림: 투영·반원 단면·숨은선·색칠·라벨 ──
  const sp = await page.evaluate(async SOLID => {
    const out = figSpecToSvg(SOLID);
    const dots = [...out.svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => [+m[1], +m[2]]);
    const [A, B] = dots, s = (B[0] - A[0]) / 4;              // 점 A(0,0,0)·B(4,0,0) 으로 화면 배율
    const scr = (x, y, z) => [A[0] + (x + 0.5*y)*s, A[1] - (0.5*y + z)*s];
    const im = new Image(); await new Promise(r => { im.onload = r; im.src = 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(out.svg); });
    const k = document.createElement('canvas'); k.width = out.w; k.height = out.h;
    const g = k.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, k.width, k.height); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, k.width, k.height).data, W = k.width;
    const lum = (x, y) => { const i = (Math.round(y)*W + Math.round(x))*4; return 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; };
    const dark = (x, y) => { for(let dy=-3; dy<=3; dy++) for(let dx=-3; dx<=3; dx++) if(lum(x+dx, y+dy) < 110) return true; return false; };
    const arc = [0.3, 1.2, 1.5708, 2.2, 2.9].every(t => dark(...scr(2 + Math.cos(t), 0, Math.sin(t))));
    const inside = lum(...scr(2, 0, 0.5));
    const base = [1.2, 2, 2.6].every(x => dark(...scr(x, Math.sqrt(1 + Math.log(x)**2), 0)));
    return { arc, inside, base, sameScale: Math.abs(dots[1][1] - dots[0][1]) < 0.5,
      dash: /stroke-dasharray/.test(out.svg), darkFill: out.svg.includes('fill="#bdbdbd"'),
      overline: /font-size="\d+">√<\/text>(<text[^>]*>[^<]*<\/text>)+<rect x=/.test(out.svg) && !/>√<\/text><text[^>]*>\(</.test(out.svg) };
  }, SOLID);
  check('입체: 단면 반원이 계산한 자리에 (원은 원 모양 그대로)', sp.arc && sp.sameScale, JSON.stringify(sp));
  check('입체: 밑면 곡선 y=√(1+(ln x)²) 정확', sp.base);
  check('입체: 단면 진하게 색칠', sp.darkFill && sp.inside > 150 && sp.inside < 225, sp.inside && sp.inside.toFixed(0));
  check('입체: 숨은선 점선', sp.dash);
  check('라벨 √(…) → 괄호 없이 근호 윗선', sp.overline);

  const iss = await page.evaluate(() => ({
    ok: figSpecIssues({ kind:'space', curves:[{ x:'t', y:'t^2', z:0, t:[0,1] }] }),
    bad: figSpecIssues({ kind:'space', curves:[{ x:'t', y:'q^2', z:0 }] }),
  }));
  check('점검: 정상 입체 설계도', iss.ok.length === 0, JSON.stringify(iss.ok));
  check('점검: 틀린 식·t 범위 없음을 알려 줌', iss.bad.some(x => x.includes('q^2')) && iss.bad.some(x => x.includes('t 범위')), JSON.stringify(iss.bad));

  // ── 3) 그림 다시 그리기: 입체 → 설계도로, 원본 유지·실패는 화면에 남김 ──
  await page.evaluate(spec => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    window.__reply = spec; window.__status = 200;
    window.fetch = async () => new Response(JSON.stringify(window.__status === 200 ? { content:[{ type:'text', text: JSON.stringify(window.__reply) }] } : { error:{ message:'overloaded' } }), { status: window.__status });
  }, SOLID);
  const rd = await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 400; cv.height = 170;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 170); g.strokeRect(50, 30, 300, 100);
    const IMG = cv.toDataURL('image/png');
    state.bulkDrafts = [ { num:'26', text:'입체도형의 부피는?\n[그림]', choices:[], sol:'', ans:'', img: IMG, aiDone:true },
                         { num:'27', text:'사진 문제\n[그림]', choices:[], sol:'', ans:'', img: IMG, aiDone:true },
                         { num:'28', text:'오류 문제\n[그림]', choices:[], sol:'', ans:'', img: IMG, aiDone:true } ];
    go('add'); setAddMode('bulk'); document.querySelector('#bulk-preview-card').style.display = 'block'; rerenderBulk();
    const prompt = aiRedrawPrompt(400, 170);
    const ok = await redrawDraftFig(0);
    window.__reply = { kind:'keep', reason:'실물 사진' };
    const keep = await redrawDraftFig(1);
    window.__status = 500;
    const fail = await redrawDraftFig(2);
    const cards = [...document.querySelectorAll('#bulk-preview > *')].map(c => c.textContent);
    const [a, b, c] = state.bulkDrafts;
    return { prompt: prompt.includes('"kind":"space"') && prompt.includes('입체도형') && prompt.includes('"kind":"keep"'),
      ok, aKind: a.figSpec && a.figSpec.kind, aSize: a.figSpec && a.figSpec.size, aNote: !!a.redrawNote,
      keep, bNote: b.redrawNote, fail, cNote: c.redrawNote,
      bCard: cards.find(t => t.includes('사진 문제')) || '', cCard: cards.find(t => t.includes('오류 문제')) || '' };
  });
  check('다시 그리기 프롬프트: 입체(space) 방식 안내', rd.prompt);
  check('입체 그림도 다시 그림 + 설계도 보관(원본 크기)', rd.ok === true && rd.aKind === 'space' && JSON.stringify(rd.aSize) === '[400,170]' && !rd.aNote, JSON.stringify(rd).slice(0, 200));
  check('원본 유지: 이유가 문항 아래 계속 보임', rd.keep === false && /원본 유지/.test(rd.bNote) && rd.bCard.includes('원본 유지') && rd.bCard.includes('실물 사진'), rd.bNote);
  check('실패: 이유 + [다시 시도] 버튼', rd.fail === false && /다시 그리기 실패/.test(rd.cNote) && rd.cCard.includes('다시 시도'), rd.cNote);

  // ── 4) 편집기 입체 예시·생성 프롬프트·이모지 ──
  const misc = await page.evaluate(() => {
    openFigSpecEditor({ spec: FIG_TEMPLATES.graph });
    const btn = [...document.querySelectorAll('#figed-ov button')].find(b => b.textContent.includes('입체도형'));
    btn.click();
    const kind = JSON.parse($('#figed-json').value).kind, prev = $('#figed-prev').innerHTML.includes('<svg'), msg = $('#figed-msg').textContent;
    figedClose();
    return { kind, prev, msg, gen: buildGenPrompt().includes('"kind":"space"'), wand: document.documentElement.outerHTML.includes('\u{1FA84}') };
  });
  check('편집기: [입체도형] 예시가 바로 그려짐', misc.kind === 'space' && misc.prev && /그림을 그렸습니다/.test(misc.msg), misc.msg);
  check('문제 생성 프롬프트에 입체 설계도 안내', misc.gen);
  check('윈도10에서 네모로 보이던 🪄 이모지 없음', !misc.wand);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
