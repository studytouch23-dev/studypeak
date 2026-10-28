// smoke67: 📋 캡처 이미지 Ctrl+V 붙여넣기(이미지 파일 올리기도) → 모음 → [✂ 문제로 나누기] = 이미지마다 한 페이지인 PDF → 영역 인식 에디터,
//          쌍둥이 생성 답이 형식(JSON) 없이 오거나 잘려도 개수를 줄여 다시 — 원본 전체가 오류로 끝나지 않게, 이유 표시
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // ── 1) 붙여넣기 ──
  const r = await page.evaluate(async () => {
    go('add'); setAddMode('bulk');
    const mk = (w, h, label) => new Promise(res => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#000'; g.font = '28px serif'; g.fillText(label, 30, 60); g.fillText('함수 f(x)=x^2+1 의 값은?', 30, 110);
      c.toBlob(b => res(new File([b], label+'.png', { type:'image/png' })), 'image/png'); });
    const paste = async files => { const dt = new DataTransfer(); files.forEach(f => dt.items.add(f)); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles:true, cancelable:true })); await new Promise(r => setTimeout(r, 300)); };
    await paste([await mk(600, 400, '1.')]);
    await paste([await mk(500, 300, '2.')]);
    const tray1 = $('#paste-tray').textContent.replace(/\s+/g, ' ');
    // 글자 붙여넣기는 그대로 (이미지 없음 → 모음에 안 들어감)
    const dt = new DataTransfer(); dt.setData('text/plain', '1. 문제'); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles:true, cancelable:true }));
    const n2 = PASTE.imgs.length;
    // 이미지 파일 올리기 → 모음
    await handleUploadFiles([await mk(400, 300, '3.')], '#bulk-text');
    const n3 = PASTE.imgs.length;
    PASTE.imgs.splice(2, 1); renderPasteTray();
    // PDF 만들기 → pdf.js 로 읽힘
    const f = await imagesToPdfFile(PASTE.imgs.map(x => x.src), 't.pdf');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    const p1 = await pdf.getPage(1), vp = p1.getViewport({ scale:1 });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await p1.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let dark = 0; for(let i=0; i<d.length; i+=4) if(d[i] < 100) dark++;
    // [✂ 문제로 나누기] → 영역 인식 에디터
    [...document.querySelectorAll('#paste-tray button')].find(b => b.textContent.includes('문제로 나누기')).click();
    for(let k=0; k<40 && !$('#pdfed-bg').classList.contains('show'); k++) await new Promise(r => setTimeout(r, 150));
    await new Promise(r => setTimeout(r, 500));
    const ed = { show: $('#pdfed-bg').classList.contains('show'), pages: PDFED.pages.length, title: $('#pdfed-title').textContent, src: $('#b-srcname').value };
    return { tray1, n2, n3, pdfPages: pdf.numPages, size: [Math.round(vp.width), Math.round(vp.height)], dark, ed, trayAfter: PASTE.imgs.length,
      hint: $('#dropzone').textContent.includes('Ctrl+V') };
  });
  check('Ctrl+V 이미지 → 모음에 쌓임 (2장)', /붙여넣은 이미지 2장/.test(r.tray1), r.tray1.slice(0, 60));
  check('글자 붙여넣기는 모음에 안 들어감', r.n2 === 2);
  check('이미지 파일 올리기도 모음으로', r.n3 === 3);
  check('이미지 → PDF (한 장 = 한 페이지, 크기 유지, 내용 보임)', r.pdfPages === 2 && r.size[0] === 450 && r.size[1] === 300 && r.dark > 200, JSON.stringify([r.pdfPages, r.size, r.dark]));
  check('[✂ 문제로 나누기] → 영역 인식 에디터, 모음 비움', r.ed.show && r.ed.pages === 2 && /캡처/.test(r.ed.title) && r.trayAfter === 0, JSON.stringify(r.ed));
  check('업로드 칸에 Ctrl+V 안내', r.hint);
  await page.evaluate(() => { try{ pdfedClose && pdfedClose(); }catch(e){} $('#pdfed-bg').classList.remove('show'); });

  // ── 2) 생성 답 형식 오류 → 다시 ──
  const g = await page.evaluate(async () => {
    const base = { answer:'5', solution:'s', subject:'수학Ⅰ', chapter:'수열', section:'', grade:'', srcType:'기출', srcName:'g', srcYear:'', difficulty:4, tags:[], reviewed:true, images:[], choices:[], createdAt:1, updatedAt:1 };
    const A = { ...base, id:'GA', origNo:'11', question:'GEN_A 수열 문제' }, B = { ...base, id:'GB', origNo:'12', question:'GEN_B 문제' }, C = { ...base, id:'GC', origNo:'13', question:'GEN_C 잘린 문제' };
    for(const p of [A, B, C]){ await saveProblem(p); state.problems.push(lightenProblem(p)); }
    const log = [], evs = [];
    let aFails = 0;
    const noJson = () => { const e = new Error('AI가 형식(JSON) 없이 답했습니다: "이 문제는…"'); e.noJson = true; return e; };
    const ask = async t => {
      const c = (t.match(/GEN_\w/)||[''])[0];
      if(t.includes('원본 문제를 바탕으로')){
        const n = +((t.match(/쌍둥이 (\d+)개/)||[0,0])[1]); log.push(c+':'+n);
        if(c === 'GEN_A' && aFails++ < 1) throw noJson();
        if(c === 'GEN_B') throw new Error('AI 응답이 길이 제한에 잘렸습니다');
        if(c === 'GEN_C') return { items:[], reason:'본문이 잘려 조건을 알 수 없음' };
        return { srcIdeas:['a'], items: Array.from({ length:n }, (_, k) => ({ kind:'쌍둥이', ideas:['a'], question:`GEN_A 쌍둥이 ${log.length}-${k}`, choices:[], answer:'7', solution:'s' })) };
      }
      return { answer:'7', sameIdeas:true };
    };
    const res = await makeTwins([A, B, C].map(p => state.problems.find(x => x.id === p.id)), { twin:2, variant:0, concurrency:1 }, ask, e => { if(e.type === 'gen' && e.retry) evs.push(e.retry+':'+e.why); if(e.type === 'srcDone') evs.push('done'+e.i+':'+(e.error||'ok')); });
    return { log, evs, saved: res.saved.length, fail: res.fail, prompt: twinPrompt(A, 1, 0, 'same', null, []).includes('{"items":[],"reason"') };
  });
  check('형식 없는 답 → 1개만 다시 → 저장 (원본 오류로 끝나지 않음)', g.log.slice(0, 2).join() === 'GEN_A:2,GEN_A:1' && g.evs.includes('done0:ok') && g.saved === 2, JSON.stringify(g));
  check('다시 시도 이유가 실황에 표시', g.evs.some(x => /^1:AI가 형식에 맞지 않게 답함/.test(x)), JSON.stringify(g.evs));
  check('3번 모두 실패하면 그 원본만 이유와 함께 오류 (다른 원본은 계속)', g.evs.some(x => /^done1:새 문제를 만들지 못했습니다 — 답이 너무 길어 잘림/.test(x)) && g.log.filter(x => x.startsWith('GEN_B')).length === 3, JSON.stringify(g.evs));
  check('AI가 만들 수 없다고 하면 그 이유 표시', g.evs.some(x => /^done2:AI가 만들지 못한 이유: 본문이 잘려/.test(x)) && g.prompt, JSON.stringify(g.evs));

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
