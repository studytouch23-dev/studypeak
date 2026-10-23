// smoke42: 분할 확인 화면 — 긴 문제도 잘리지 않고 전부 보임 + 그림 다시 그리기(문항별·전체·되돌리기·저장)
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── 시드: 긴 문제(AI 변환됨, 그림 있음) + 변환 전 이미지 문항 + 그림 문항 하나 더 ──
  await page.evaluate(() => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    const mk = (w, h, color) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,w,h); g.fillStyle = color; g.fillRect(10,10,w-20,6);
      return c.toDataURL('image/jpeg', 0.9); };
    window.__FIG1 = mk(300, 200, '#333'); window.__FIG2 = mk(280, 180, '#666');
    const long = Array.from({length: 18}, (_, k) => `${k+1}번째 줄: 직선 $y=-x-\\frac{2}{3}$ 가 곡선과 만나는 점`).join('\n');
    state.bulkDrafts = [
      { num:'20', text: long, choices:['① 1','② 2','③ 3','④ 4','⑤ 5'], sol:'', ans:'', img: window.__FIG1, aiDone:true },
      { num:'21', text:'', sol:'', ans:'', img: mk(400, 300, '#000') },                       // 변환 전: 문항 통째 이미지
      { num:'22', text:'두 곡선으로 둘러싸인 부분의 넓이는? [그림]', choices:[], sol:'', ans:'', img: window.__FIG2, aiDone:true },
    ];
    go('add'); setAddMode('bulk');
    document.querySelector('#bulk-preview-card').style.display = 'block';
    rerenderBulk();
  });

  // ── 1) 긴 문제가 잘리지 않음 ──
  const lay = await page.evaluate(() => {
    const el = document.querySelectorAll('#bulk-preview .ptext')[0];
    const cs = getComputedStyle(el);
    return { maxH: cs.maxHeight, overflow: cs.overflowY, clipped: el.scrollHeight > el.clientHeight + 2,
      lineH: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) };
  });
  check('긴 문제: 높이 제한 없음', lay.maxH === 'none', lay.maxH);
  check('긴 문제: 잘린 부분 없음(전부 보임)', !lay.clipped, JSON.stringify(lay));
  check('분수가 윗줄과 겹치지 않게 줄 간격 2배 이상', lay.lineH >= 2, lay.lineH.toFixed(2));

  // ── 2) 버튼: AI 변환으로 그림만 남은 문항에만 ──
  const btns = await page.evaluate(() => [...document.querySelectorAll('#bulk-preview .pitem')].map(it => !!it.querySelector('button[onclick^="redrawDraftFig"]')));
  check('[그림 다시 그리기]는 변환된 그림 문항에만', btns[0] && !btns[1] && btns[2], JSON.stringify(btns));
  check('상단에 [그림 전체 다시 그리기] 버튼', await page.$('button[onclick="redrawAllDraftFigs()"]') !== null);

  // AI 스텁: SVG 응답 (2번째 그림 요청은 실패시켜 일괄 처리의 실패 내성 확인)
  await page.evaluate(() => {
    window.__n = 0; window.__failNext = false;
    window.fetch = async () => {
      window.__n++;
      if(window.__failNext){ window.__failNext = false;
        return new Response(JSON.stringify({ content:[{ type:'text', text:'{"svg":"<svg viewBox=\'0 0 10 10\'><line x1=\'0\'"}' }] }), { status:200 }); }
      const svg = "<svg viewBox='0 0 300 200' xmlns='http://www.w3.org/2000/svg'><rect width='300' height='200' fill='#fff'/><line x1='20' y1='180' x2='280' y2='20' stroke='#000' stroke-width='3'/><text x='30' y='40' font-family='serif'>y</text></svg>";
      return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify({ svg }) }] }), { status:200 });
    };
  });

  // ── 3) 문항별 다시 그리기 → 원본 보관·비교 표시 → 되돌리기 ──
  const one = await page.evaluate(async () => {
    const ok = await redrawDraftFig(0);
    const d = state.bulkDrafts[0];
    const card = document.querySelectorAll('#bulk-preview .pitem')[0];
    const res = { ok, png: d.img.startsWith('data:image/png'), kept: d.imgOrig === window.__FIG1,
      captions: [...card.querySelectorAll('figcaption')].map(f => f.textContent),
      revertBtn: !!card.querySelector('button[onclick^="revertDraftFig"]') };
    // 한 번 더: 항상 원본에서 다시 그림
    await redrawDraftFig(0);
    res.stillOrig = state.bulkDrafts[0].imgOrig === window.__FIG1;
    revertDraftFig(0);
    res.reverted = state.bulkDrafts[0].img === window.__FIG1 && !state.bulkDrafts[0].imgOrig;
    return res;
  });
  check('다시 그리기 → 깨끗한 PNG로 교체', one.ok && one.png, JSON.stringify(one));
  check('원본 보관', one.kept);
  check('원본·새 그림 나란히 비교 표시', one.captions.includes('원본') && one.captions.some(c => c.includes('다시 그린 그림')), JSON.stringify(one.captions));
  check('[↶ 원본 그림 쓰기] 버튼', one.revertBtn);
  check('한 번 더 그려도 원본 기준', one.stillOrig);
  check('되돌리기 → 원본 그림', one.reverted);

  // ── 4) 전체 다시 그리기: 하나 실패해도 나머지는 진행, 실패분은 원본 유지 ──
  const all = await page.evaluate(async () => {
    window.__n = 0; window.__failNext = false;
    const orig = window.fetch;
    let calls = 0;
    window.fetch = async (...a) => { calls++; if(calls === 2) window.__failNext = true; return orig(...a); };
    await redrawAllDraftFigs();
    return { calls, d0: !!state.bulkDrafts[0].imgOrig, d2: !!state.bulkDrafts[2].imgOrig, d2img: state.bulkDrafts[2].img === window.__FIG2,
      d1: !!state.bulkDrafts[1].imgOrig, status: document.querySelector('#bulk-status').textContent };
  });
  check('전체: 변환된 그림 2개만 요청', all.calls === 2, all.calls);
  check('전체: 성공분 교체', all.d0, JSON.stringify(all));
  check('전체: 실패분은 원본 유지', !all.d2 && all.d2img, JSON.stringify(all));
  check('전체: 변환 전 문항은 건드리지 않음', !all.d1);
  check('전체: 결과 안내', all.status.includes('1개를 다시 그렸습니다') && all.status.includes('실패 1개'), all.status);

  // ── 5) 저장하면 다시 그린 그림이 문제 그림으로 ──
  const saved = await page.evaluate(async () => {
    const before = state.problems.length;
    await saveBulk();
    const p = state.problems.slice(before).find(p => p.origNo === '20');
    const imgs = await imagesOf(p);
    return { png: imgs.length === 1 && imgs[0].startsWith('data:image/png') };
  });
  check('저장: 다시 그린 그림이 저장됨', saved.png);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
