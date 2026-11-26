/* 스터디피크 국어 랩 — 시험지 올리기: 문제지 PDF(+ 정답·해설 PDF) → 지문·문항으로 나눠 미리보기 → 저장
 * 글자·밑줄은 KPDF 가 PDF에서 그대로 읽고(AI 없음), 원본 조각은 쪽을 그려 잘라 둔다([원본 보기]용) */
'use strict';
const UP = { examFile: null, solFile: null, doc: null, seg: null, sol: null, busy: false, nameAuto: false, meta: null, scan: null, scanImgs: null, scanRes: null, rateWait: 15000 };
const ORIG_KEY = 'sp-korlab-orig';                           // 원본 조각을 얼마나 남길지: fig(그림 있는 곳만) · all · none
function renderUpload(){
  const s = UP.seg;
  $('#view-upload').innerHTML = `
    <h2>시험지 올리기</h2><p class="vd">문제지 PDF를 올리면 <b>[1~3] 지문 + 문항</b> 세트와 단독 문항으로 자동으로 나눕니다. 정답·해설 PDF를 함께 올리면 정답·해설·지문 제목까지 붙고, 문항은 22유형으로 먼저 분류됩니다.</p>
    <div class="card"><div class="grid4">
      <div><label for="up-exam">문제지 PDF</label><input id="up-exam" type="file" accept=".pdf,application/pdf" onchange="UP.examFile=this.files[0]||null;upAutoName()"></div>
      <div><label for="up-sol">정답·해설 PDF (선택)</label><input id="up-sol" type="file" accept=".pdf,application/pdf" onchange="UP.solFile=this.files[0]||null"></div>
      <div style="grid-column:span 2"><label for="up-name">시험 이름 (출처)</label><input id="up-name" placeholder="예) 2026학년도 9월 모의평가 (고3)" oninput="UP.nameAuto=false"></div></div>
      <div class="grid4" style="margin-top:.7rem">
      <div><label for="up-year">학년도</label><input id="up-year" inputmode="numeric" placeholder="예) 2026"></div>
      <div><label for="up-month">시행 월</label><select id="up-month"><option value="0">(모름)</option>${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>`<option value="${m}">${m}월</option>`).join('')}</select></div>
      <div><label for="up-grade">학년</label><select id="up-grade"><option value="">(모름)</option>${KT.GRADES.map(g=>`<option>${g}</option>`).join('')}</select></div>
      <div><label for="up-kind">종류</label><select id="up-kind"><option value="">(모름)</option>${KT.EXAM_KINDS.map(k=>`<option>${k}</option>`).join('')}</select></div>
      <div><label for="up-orig">원본 조각 저장</label><select id="up-orig" onchange="localStorage.setItem(ORIG_KEY,this.value)">${[['fig', '그림·옛한글 있는 곳만 (권장)'], ['all', '모든 지문·문항'], ['none', '저장 안 함']].map(([v, l])=>`<option value="${v}" ${(localStorage.getItem(ORIG_KEY) || 'fig') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <p class="hint" style="margin-top:.4rem">학년도·월·학년·종류는 PDF 첫 쪽과 이름에서 읽어 채웁니다 — [시험지 보관함]에서 이 값으로 찾으니 [읽기] 뒤에 한 번 확인하세요. 원본 조각은 시험지 1회분 전체를 남기면 약 12MB라, 수백 회를 쌓으려면 '그림 있는 곳만'을 권합니다.</p>
      <div class="row" style="margin-top:.8rem"><button class="btn" id="up-read" onclick="upRead()">읽기</button>
        <span class="hint" id="up-status">글자가 들어 있는 PDF(평가원·교육청 시험지, 한글에서 만든 PDF)는 바로 읽고, 복합기로 스캔한 PDF는 AI가 쪽 그림을 보고 옮겨 적습니다(API 키 필요).</span></div></div>
    <div id="up-preview">${s ? upPreviewHtml() : (UP.scan ? upScanCardHtml() : '')}</div>`;
  if(UP.examFile && $('#up-name') && UP.name) $('#up-name').value = UP.name;
  if(UP.meta) upFillMeta(UP.meta, true);
}
function upAutoName(){ const el = $('#up-name'); if(el && (!el.value.trim() || UP.nameAuto) && UP.examFile){ el.value = UP.examFile.name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim(); UP.nameAuto = true; } }
/* 읽어 낸 시험 정보를 칸에 채운다. 사용자가 이미 고른 칸은 건드리지 않는다(force 는 화면을 다시 그릴 때) */
function upFillMeta(m, force){
  const set = (id, v)=>{ const el = $(id); if(el && v && (force || !el.value || el.value === '0')) el.value = String(v); };
  set('#up-year', m.year); set('#up-month', m.month); set('#up-grade', m.grade); set('#up-kind', m.kind);
}
function upMeta(){ return { year: ($('#up-year').value.match(/20\d\d/) || [''])[0], month: +$('#up-month').value || 0, grade: $('#up-grade').value, kind: $('#up-kind').value }; }
async function loadPdfPages(file, onPage){
  if(!window.pdfjsLib) throw new Error('PDF 구성요소가 아직 로딩 중입니다. 잠시 후 다시 눌러 주세요.');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, cMapUrl: KCFG.cmap, cMapPacked: true }).promise;
  const pages = [];
  for(let i = 1; i <= doc.numPages; i++){ pages.push(await KPDF.extractPage(await doc.getPage(i), pdfjsLib.OPS)); if(onPage) onPage(i, doc.numPages); }
  return { doc, pages };
}
async function upRead(){
  if(UP.busy) return;
  if(!UP.examFile){ toast('문제지 PDF를 먼저 고르세요.'); return; }
  UP.busy = true; UP.name = $('#up-name').value.trim();
  const st = t=>{ const el = $('#up-status'); if(el) el.textContent = t; };
  try{
    st('문제지를 읽는 중…');
    const ex = await loadPdfPages(UP.examFile, (i, n)=>st(`문제지를 읽는 중… ${i}/${n}쪽`));
    const chars = ex.pages.reduce((s, p)=>s + p.items.reduce((a, it)=>a + it.s.trim().length, 0), 0);
    UP.scan = null; UP.scanImgs = null; UP.scanRes = null; UP.scanErr = '';
    if(chars < 200 * ex.pages.length / 4){                    // 글자 층이 없는 스캔본 → AI로 읽는 길을 안내
      UP.doc = ex.doc; UP.seg = null; UP.scan = { n: ex.doc.numPages };
      st(`글자 정보가 없는 스캔본입니다(${ex.doc.numPages}쪽) — 아래 [🤖 스캔본 읽기 시작]을 누르면 AI가 읽습니다.`);
      UP.busy = false; const pv0 = $('#up-preview'); if(pv0) pv0.innerHTML = upScanCardHtml(); return;
    }
    UP.doc = ex.doc; UP.seg = KPDF.segment(ex.pages); UP.sol = null;
    const m = KT.examMeta(UP.name, ex.pages.slice(0, 1).map(p=>p.items.filter(i=>i.y < p.h * 0.14).map(i=>i.s).join(' ')).join(' '));      // 첫 쪽 맨 위 머리말("2026학년도 대학수학능력시험 9월 모의평가 문제지")에서만 — 본문 낱말에 속지 않게
    upFillMeta(m); UP.meta = upMeta(); upStdName(m);
    if(UP.solFile) await upLoadSolution(st);
    upClassify();
    if(!UP.seg.items.length) throw new Error('문항 번호를 찾지 못했습니다. 번호가 "1." 꼴로 시작하는 시험지인지 확인해 주세요.');
    st(`읽기 완료 — 지문 ${UP.seg.stats.sets}개 · 문항 ${UP.seg.stats.items}개`);
  }catch(e){ UP.seg = null; st('⚠ ' + (e.message || e)); toast('⚠ ' + (e.message || e)); }
  UP.busy = false;
  const pv = $('#up-preview'); if(pv) pv.innerHTML = UP.seg ? upPreviewHtml() : '';
}

/* 파일 이름 대신 표준 꼴 이름으로 — 공식 시험(수능·모의평가·학력평가)과, 상표·회차를 읽어 낸 사설 모의고사만. 그 밖에는 파일 이름이 시험을 더 잘 구별한다 */
function upStdName(m){
  const k = UP.meta.kind, label = k === '사설 모의고사' ? (m.label || '') : '';
  if(UP.nameAuto && UP.meta.year && (['수능', '모의평가', '학력평가'].includes(k) || label)){ UP.name = KT.examName(Object.assign({}, UP.meta, { label })); $('#up-name').value = UP.name; }
}
/* ── 스캔본(글자 층이 없는 PDF): 쪽을 그림으로 만들어 AI가 옮겨 적는다 ── */
const scanLeft = ()=>UP.scanRes ? Array.from(UP.scanRes).filter(r=>!r || r.error).length : 0;      // Array.from: 아직 안 읽은 빈 칸도 센다       // 아직 못 읽은 쪽 수
function upScanCardHtml(){
  const n = UP.scan.n, key = !!SPAI.settings().key, left = UP.scanRes ? scanLeft() : n, part = left < n;
  return `<div class="card" id="up-scan"><h3>스캔본입니다 — AI가 쪽 그림을 읽어 글로 옮깁니다</h3>
    <p class="hint" style="margin-bottom:.6rem">이 PDF에는 글자 정보가 없습니다(복합기로 스캔한 그림). ${n}쪽을 한 쪽씩 AI(센 모델)에게 보여 주고 지문·발문·<보기>·선택지를 그대로 옮겨 적게 한 뒤, 평소처럼 지문 세트로 엮습니다.
      한 번에 세 쪽씩 읽으며 20쪽 시험지에 몇 분이 걸리고, 쪽 수만큼 AI 사용료가 듭니다.<br>
      <b>AI가 옮긴 글은 틀린 글자가 섞일 수 있습니다.</b> 저장하면 쪽 그림이 원본으로 함께 남으니, 세트 화면의 [원본 보기]로 대조하고 [고치기]로 바로잡으세요.</p>
    ${part ? `<div class="warnbox">${n - left}쪽은 이미 읽었습니다. 남은 ${left}쪽만 이어서 읽습니다(읽은 쪽은 다시 읽지 않습니다).</div>` : ''}
    <div class="row"><button class="btn" id="up-scan-run" onclick="upScanRun()" ${key ? '' : 'disabled'}>🤖 ${part ? `이어서 읽기 (남은 ${left}쪽)` : `스캔본 읽기 시작 (${n}쪽)`}</button>
      ${key ? '' : '<span class="chip w">API 키가 없습니다 — [백업·설정]에서 키를 저장하세요</span>'}<span class="hint" id="up-scan-status">${UP.scanErr ? esc('⚠ ' + UP.scanErr) : ''}</span></div></div>`;
}
/* 한 쪽 → AI에게 보낼 그림들(base64 JPEG): 글 테두리로 여백을 자르고 [쪽 전체(작게), 단마다 위에서 아래로 2~4조각] 차례로.
 * 단을 통째로 보내면 길쭉한 그림이 AI 쪽에서 줄어들어 글자가 작아지므로, 글줄 사이의 빈 줄에서 나눠 조각마다 약 110만 화소 안쪽으로 보낸다(A3·A4 두 단 시험지 = 단마다 3조각). */
async function scanPageImages(doc, pageNo){
  const page = await doc.getPage(pageNo), vp0 = page.getViewport({ scale: 1 }), scale = Math.min(3.4, 3300 / vp0.height), vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  const w = c.width, h = c.height, px = g.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h);
  for(let i = 0, k = 0; i < gray.length; i++, k += 4) gray[i] = (px[k] * 77 + px[k + 1] * 150 + px[k + 2] * 29) >> 8;
  const box = KSCAN.contentBox(gray, w, h), gut = KSCAN.findGutter(gray, w, h, box), pad = Math.round(w * 0.008);
  const Y0 = Math.max(0, box.y0 - pad), Y1 = Math.min(h, box.y1 + pad), X0 = Math.max(0, box.x0 - pad), X1 = Math.min(w, box.x1 + pad);
  const cut = (x0, x1, y0, y1, maxLong, q, mp)=>{
    const sx = Math.max(0, Math.round(x0)), sy = Math.max(0, Math.round(y0)), sw = Math.min(w, Math.round(x1)) - sx, sh = Math.min(h, Math.round(y1)) - sy;
    const k = Math.min(1, maxLong / Math.max(sw, sh), mp ? Math.sqrt(mp / (sw * sh)) : 1);
    const o = document.createElement('canvas'); o.width = Math.round(sw * k); o.height = Math.round(sh * k);
    const og = o.getContext('2d'); og.fillStyle = '#fff'; og.fillRect(0, 0, o.width, o.height); og.drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
    return o.toDataURL('image/jpeg', q);
  };
  const b64 = u=>u.slice(u.indexOf(',') + 1);
  const colsX = gut == null ? [[X0, X1]] : [[X0, gut + 4], [gut - 4, X1]], MP = 1.15e6;
  const imgs = [b64(cut(X0, X1, Y0, Y1, 1100, 0.8, MP))];
  const HH = Y1 - Y0, parts = Math.max(1, Math.min(4, Math.ceil(Math.max(...colsX.map(([a, b])=>(b - a) * HH)) / 1.1e6)));
  for(const [a, b] of colsX){
    const ys = [{ y: Y0, ov: 0 }];
    for(let k = 1; k < parts; k++){                             // 빈 줄을 못 찾으면 그 자리에서 조금 겹쳐 자른다
      const t = Y0 + HH * k / parts, span = HH * 0.3 / parts, cy = KSCAN.findCut(gray, w, Math.round(a), Math.round(b), t - span, t + span);
      ys.push(cy == null ? { y: Math.round(t), ov: Math.round(HH * 0.012) } : { y: cy, ov: 3 });
    }
    ys.push({ y: Y1, ov: 0 });
    for(let k = 0; k < parts; k++) imgs.push(b64(cut(a, b, ys[k].y - ys[k].ov, ys[k + 1].y + ys[k + 1].ov, 1560, 0.85, MP)));
  }
  const pageJpeg = cut(X0, X1, Y0, Y1, 1500, 0.72);           // [원본 보기]용
  c.width = c.height = 0;
  return { imgs, cols: gut != null, lay: { cols: colsX.length, parts }, pageJpeg };
}
const imgPart = b=>({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b } });
const AI_FATAL = /중지됨|API 키|크레딧|네트워크/;
/* 여러 쪽을 세 개씩 나란히 처리: fn(i) 가 던진 오류가 치명적(키·크레딧·중지)이면 전체를 멈춘다 */
async function scanPool(n, fn, onStep){
  let next = 0, done = 0, fatal = null;
  const worker = async ()=>{ while(next < n && !fatal && !SPAI.state.cancel){ const i = next++; try{ await fn(i); }catch(e){ if(AI_FATAL.test(e.message || '')) fatal = e; } done++; if(onStep) onStep(done); } };
  await Promise.all([worker(), worker(), worker()]);
  if(fatal) throw fatal;
  if(SPAI.state.cancel) throw new Error('중지됨');
}
/* 중지를 알아채는 기다림 */
const scanWait = ms=>new Promise((res, rej)=>{ const t0 = Date.now(), iv = setInterval(()=>{ if(SPAI.state.cancel){ clearInterval(iv); rej(new Error('중지됨')); } else if(Date.now() - t0 >= ms){ clearInterval(iv); res(); } }, Math.min(250, ms)); });
/* AI 한 번 부르기: 사용량 한도(429)·서버 혼잡(5xx)이면 잠깐 쉬고 다시(최대 세 번), 그 밖의 오류는 한 번만 더 */
async function scanCall(content, max){
  const strong = SPAI.settings().strongModel;
  for(let k = 0; ; k++){
    try{ return await SPAI.json(content, k ? Math.max(max, 16000) : max, { model: strong }); }
    catch(e){
      const m = e.message || '', rate = /API 오류 (429|5\d\d)/.test(m);
      if(AI_FATAL.test(m) || k >= (rate ? 3 : 1)) throw e;
      if(rate) await scanWait(UP.rateWait * (k + 1));
    }
  }
}
async function upScanRun(){
  if(UP.busy || !(UP.scan || UP.scanRes) || !UP.doc || !aiReady()) return;
  UP.busy = true; UP.name = $('#up-name').value.trim();
  const n = UP.scanRes ? UP.scanRes.length : UP.scan.n, results = UP.scanRes || new Array(n), imgs = UP.scanImgs || new Array(n);
  const todo = []; for(let i = 0; i < n; i++) if(!results[i] || results[i].error) todo.push(i);          // 이미 읽은 쪽은 다시 읽지 않는다(중지·오류 뒤에 이어서)
  const st = t=>{ const el = $('#up-scan-status') || $('#up-status'); if(el) el.textContent = t; };
  SPAI.start(); busy(`🤖 스캔본 읽는 중… 0/${todo.length}쪽`);
  UP.scanRes = results; UP.scanImgs = imgs; UP.scanErr = '';
  try{
    await scanPool(todo.length, async k=>{
      const i = todo[k];
      try{
        const im = await scanPageImages(UP.doc, i + 1); imgs[i] = im.pageJpeg;
        const content = im.imgs.map(imgPart).concat([{ type: 'text', text: KSCAN.prompt(i + 1, n, im.lay) }]);
        results[i] = KSCAN.clean(await scanCall(content, 12000), i);
      }catch(e){ if(AI_FATAL.test(e.message || '')) throw e; results[i] = { page: i, error: String(e.message || e).slice(0, 80) }; }
    }, d=>{ busy(`🤖 스캔본 읽는 중… ${d}/${todo.length}쪽`); st(`${d}/${todo.length}쪽 읽음`); });
    for(let i = 0; i < n; i++) if(!results[i]) results[i] = { page: i, error: '읽지 못함' };
    UP.seg = KSCAN.assemble(results); UP.sol = null;
    const m = KT.examMeta(UP.name, UP.seg.exam); upFillMeta(m); UP.meta = upMeta(); upStdName(m);
    if(UP.solFile) await upLoadSolution(st);
    upClassify();
    if(!UP.seg.items.length) throw new Error('문항을 하나도 읽지 못했습니다. 시험지가 맞는지, 쪽이 뒤집혀 있지 않은지 확인해 주세요.');
    UP.scan = null;
    $('#up-status').textContent = `스캔본 읽기 완료 — 지문 ${UP.seg.stats.sets}개 · 문항 ${UP.seg.stats.items}개 (AI가 옮긴 글 — 원본과 대조하세요)`;
  }catch(e){ UP.seg = null; if(!UP.scan) UP.scan = { n }; UP.scanErr = String(e.message || e); st('⚠ ' + (e.message || e)); toast('⚠ ' + (e.message || e)); }      // 읽은 쪽(UP.scanRes)은 남겨 두어 [이어서 읽기]로 나머지만 읽게 한다
  finally{ SPAI.done(); busy(''); UP.busy = false; }
  const pv = $('#up-preview'); if(pv) pv.innerHTML = UP.seg ? upPreviewHtml() : (UP.scan ? upScanCardHtml() : '');
}
/* 정답·해설 PDF: 글자가 있으면 그대로 읽고, 스캔본이면 정답표만 AI로 읽는다 */
async function upLoadSolution(st){
  st('정답·해설을 읽는 중…');
  const so = await loadPdfPages(UP.solFile);
  const chars = so.pages.reduce((s, p)=>s + p.items.reduce((a, it)=>a + it.s.trim().length, 0), 0);
  if(chars >= 200 * so.pages.length / 4){ UP.sol = KPDF.parseSolutionText(KPDF.pagesToText(so.pages)); upAttachSolution(); return; }
  if(!SPAI.settings().key){ toast('정답·해설 PDF도 스캔본입니다 — API 키가 있어야 정답표를 읽을 수 있습니다.'); return; }
  const own = !SPAI.state.running; if(own) SPAI.start();
  const n = so.doc.numPages, all = [], first = [...new Set([0, 1, n - 1])].filter(i=>i >= 0 && i < n), rest = []; for(let i = 0; i < n; i++) if(!first.includes(i)) rest.push(i);
  const read = list=>scanPool(list.length, async k=>{
    const im = await scanPageImages(so.doc, list[k] + 1);
    all.push(...KSCAN.cleanAnswers(await scanCall(im.imgs.map(imgPart).concat([{ type: 'text', text: KSCAN.answerPrompt() }]), 3000)));
  }, d=>st(`정답표를 찾는 중… ${d}/${list.length}쪽`));
  try{
    await read(first);                                          // 정답표는 보통 맨 앞 두 쪽이나 맨 뒤 쪽에 있다
    if(rest.length && new Set(all.map(a=>a.section + '/' + a.num)).size < UP.seg.items.length / 2) await read(rest);
  }finally{ if(own) SPAI.done(); }
  let hit = 0;
  for(const it of UP.seg.items){ const a = all.find(x=>x.num === it.num && x.section === KSCAN.normSection(it.section)); if(a){ it.answer = KPDF.CIRC[a.ans - 1]; hit++; } }
  UP.sol = { sections: [], scanned: true }; UP.seg.stats.answers = hit;
}
/* 해설지의 구역(공통 / 화법과 작문 / 언어와 매체)과 문제지의 구역을 맞춰 정답·해설·유형·지문 정보를 붙인다 */
function upSolSection(section){
  if(!UP.sol) return null;
  const n = s=>String(s || '').replace(/\s/g, '');
  if(section) return UP.sol.sections.find(s=>n(s.name).includes(n(section))) || null;
  return UP.sol.sections.find(s=>!/화법|작문|언어|매체/.test(s.name)) || UP.sol.sections[0] || null;
}
function upAttachSolution(){
  let hit = 0;
  for(const it of UP.seg.items){
    const sec = upSolSection(it.section); if(!sec) continue;
    const info = sec.items[it.num] || {};
    it.answer = sec.answers[it.num] || info.answer || ''; it.explain = info.explain || ''; it.wrong = info.wrong || ''; it.type = info.type || '';
    if(it.answer) hit++;
  }
  for(const s of UP.seg.sets){
    const sec = upSolSection(s.section); if(!sec) continue;
    const exact = sec.sets.find(x=>x.from === s.from && x.to === s.to), wide = sec.sets.find(x=>x.from <= s.from && x.to >= s.to && upArea(x.area));
    const info = exact || wide;                              // 영역은 "[35~39] 언어"처럼 더 넓은 묶음에만 적혀 있을 수 있다
    if(info) Object.assign(s, { areaText: [info.area, wide && wide.area].find(a=>KT.catOf(a)) || '', genre: info.genre || '', title: info.title || '', summary: info.summary.trim(), theme: info.theme || '' });
  }
  for(const it of UP.seg.items){                             // 단독 문항의 영역
    if(it.setIdx >= 0) continue;
    const sec = upSolSection(it.section), wide = sec && sec.sets.find(x=>x.from <= it.num && x.to >= it.num && upArea(x.area));
    it.areaText = wide ? wide.area : '';
  }
  UP.seg.stats.answers = hit;
}
const upArea = a=>KT.catOf(a);
/* 화법·작문·매체 지문의 머리말("(가)는 학생회 학생들의 대화이고, (나)는 …이다")에서 글의 종류만 뽑아 제목으로 */
function headTitle(head){
  const h = KPDF.plain(head).replace(/물음에 답하시오\.?/, '').trim(), parts = [];
  h.replace(/\(([가-라])\)는\s*([^,.]+?)(?:이고|이며|이다|입니다|이다\.)/g, (m, a, b)=>{ parts.push(`(${a}) ${b.trim()}`); return m; });
  if(parts.length) return parts.join(' / ');
  const m = h.match(/^다음은\s*(.+?)(?:이다|입니다)/);
  return m ? m[1].trim() : '';
}
/* 올리자마자 규칙으로 먼저 분류: 대분류·소분류·제목(문학은 작가 「작품」)·22유형. 해설지 정보가 있으면 그것을 근거로 쓴다 — AI 분류는 [분류표·LMS 엑셀]에서 */
function upGuessItem(it, cat){
  const g = KT.guess({ stem: KPDF.plain(it.stem), view: KPDF.plain(it.view), viewLabel: it.viewLabel, solType: it.type }, cat);
  it.typeId = g.id || ''; it.nature = g.nature || ''; it.typeBy = 'rule'; it.subTypes = [];
  it.review = g.alt ? { alt: g.alt, why: `발문은 ${g.id}, 해설지 유형 이름("${it.type}")은 ${g.alt} 쪽` } : null;
}
function upClassify(){
  const S = UP.seg; if(!S) return;
  for(const s of S.sets){
    const body = KPDF.plain(s.body), c = KT.catOf(s.areaText) || KT.catGuess(s.section, s.items.map(i=>KPDF.plain(i.stem)), body);
    s.cat = c.cat;
    const cs = KT.credits(body), l1 = s.cat === '문학' ? KT.litTitle(s.title) : null;
    const lit = s.cat !== '문학' ? null : (l1 && (l1.title.match(/「/g) || []).length >= cs.length && !/\/\s*(\([가-힣]\))?\s*$/.test(l1.title) ? l1 : KT.titleFromCredits(cs) || l1);   // 해설지 제목이 잘렸으면 지문 끝의 "- 작가, 「작품」 -" 을 쓴다
    if(lit){ s.title = lit.title; s.author = lit.author; } else s.author = '';
    if(!s.title && !KT.typed(s.cat)) s.title = headTitle(s.head);
    s.sub = c.sub || KT.subOf(s.cat, s.genre, s.title);
    if(s.cat === '문법' && !s.title) s.title = (s.items[0] && s.items[0].type) || KT.UNIT[s.sub] || '';
    for(const it of s.items) upGuessItem(it, s.cat);
  }
  for(const it of S.items){
    if(it.setIdx >= 0) continue;
    const c = KT.catOf(it.areaText) || KT.catGuess(it.section, [KPDF.plain(it.stem)], '');
    it.cat = c.cat; it.sub = c.sub || KT.subOf(it.cat, '', it.type) || KT.subOf(it.cat, '', KPDF.plain(it.stem + ' ' + (it.view || '')).slice(0, 400));
    it.title = it.cat === '문법' ? (it.type || KT.UNIT[it.sub] || '') : '';          // 문법 단독 문항: 해설지의 단원 이름을 제목으로(제목 규칙 — 단원명만)
    upGuessItem(it, it.cat);
  }
  if(S.items.some(i=>i.points === 3) && S.items.every(i=>!i.points || i.points === 3)) S.items.forEach(i=>{ if(!i.points) i.points = 2; });   // 수능형: [3점] 표시가 없는 문항은 2점
  const grade = ($('#up-grade') || {}).value || '';
  for(const it of S.items){                                    // 난도 어림(배점·유형·<보기>·지문 길이·선지 길이) — 실제 정답률이 들어오면 그것으로 바뀐다
    const set = it.setIdx >= 0 ? S.sets[it.setIdx] : null;
    it.diff = KT.diffGuess({ points: it.points, typeId: it.typeId, view: KPDF.plain(it.view), choices: (it.choices || []).map(KPDF.plain) }, { bodyLen: set ? KPDF.plain(set.body).length : 0, cat: set ? set.cat : it.cat, sub: set ? set.sub : it.sub, grade });
    it.diffBy = 'rule';
  }
  S.stats.typed = S.items.filter(i=>i.typeId || i.nature).length;
}
function upPreviewHtml(){
  const s = UP.seg, singles = s.items.filter(i=>i.setIdx < 0);
  const secName = x=>x.section ? `(${x.section}) ` : '';
  return `<div class="card"><div class="spread"><div class="row"><b>미리보기</b><span class="chip g">지문 ${s.stats.sets}</span><span class="chip g">문항 ${s.stats.items}</span>
      ${UP.sol ? `<span class="chip g">정답 ${s.stats.answers || 0}</span>` : '<span class="chip">정답·해설 없음</span>'}<span class="chip g">유형 어림 ${s.stats.typed || 0}</span><span class="chip ${s.stats.unsureJoins ? 'w' : ''}">띄어쓰기 추정 ${s.stats.unsureJoins}곳</span></div>
      <button class="btn" id="up-save" onclick="upSave()">이대로 저장</button></div>
    ${s.scan ? `<div class="warnbox"><b>스캔본을 AI가 옮긴 글입니다.</b> 글자가 틀렸을 수 있으니 펼쳐서 훑어보고, 저장한 뒤 세트 화면의 [원본 보기](쪽 그림)와 대조해 [고치기]로 바로잡으세요.
      ${scanLeft() ? `<div class="row" style="margin-top:.4rem"><b>${scanLeft()}쪽을 읽지 못했습니다.</b><button class="btn ghost sm" id="up-scan-retry" onclick="upScanRun()">못 읽은 쪽만 다시 읽기</button></div>` : ''}</div>` : ''}
    ${s.warnings.length ? `<div class="warnbox">확인이 필요한 곳: ${s.warnings.map(esc).join(' · ')}</div>` : ''}
    <p class="hint" style="margin:.5rem 0">펼쳐서 확인하세요. 틀린 곳은 저장한 뒤 세트 화면의 [고치기]에서 바로잡을 수 있습니다.</p>
    ${s.sets.map((x, k)=>`<details class="pv"><summary>${esc(secName(x))}[${x.from}~${x.to}] ${x.cat ? esc(x.cat) + (x.sub ? ' · ' + esc(x.sub) : '') + ' — ' : ''}${esc(x.title || snippet(x.body, 28) || '(그림 지문)')} <span class="hint">문항 ${x.items.map(i=>i.num).join(', ')}</span></summary>
      <div class="split"><div class="passage" style="position:static;max-height:420px">${kHtml(x.body, { joins: true, passage: true })}</div><div>${x.items.map(it=>itemHtml(Object.assign({ id: 'pv' + k + '-' + it.num }, it), { joins: true })).join('')}</div></div></details>`).join('')}
    ${singles.length ? `<details class="pv"><summary>지문 없는 단독 문항 <span class="hint">${singles.map(i=>secName(i) + i.num).join(', ')}</span></summary>${singles.map((it, k)=>itemHtml(Object.assign({ id: 'pvs' + k }, it), { joins: true })).join('')}</details>` : ''}</div>`;
}
/* 원본 조각: 필요한 쪽만 한 번씩 그려서 사각형대로 잘라 JPEG 으로 */
async function upCrops(doc, owners){                         // owners: [{ id, rects }] → [{ id, imgs }]
  const byPage = new Map();
  owners.forEach(o=>(o.rects || []).forEach(r=>{ if(!byPage.has(r.page)) byPage.set(r.page, []); byPage.get(r.page).push([o, r]); }));
  const out = new Map(owners.map(o=>[o.id, []]));
  for(const [pi, list] of [...byPage].sort((a, b)=>a[0] - b[0])){
    const page = await doc.getPage(pi + 1), vp0 = page.getViewport({ scale: 1 }), scale = Math.min(2, 1700 / vp0.width), vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    for(const [o, r] of list){
      const x = Math.max(0, Math.floor(r.x * scale)), y = Math.max(0, Math.floor(r.y * scale)), w = Math.min(c.width - x, Math.ceil(r.w * scale)), h = Math.min(c.height - y, Math.ceil(r.h * scale));
      if(w < 8 || h < 8) continue;
      const cc = document.createElement('canvas'); cc.width = w; cc.height = h; cc.getContext('2d').drawImage(c, x, y, w, h, 0, 0, w, h);
      out.get(o.id).push(cc.toDataURL('image/jpeg', 0.82));
    }
    const st = $('#up-status'); if(st) st.textContent = `원본 조각을 자르는 중… ${pi + 1}쪽`;
  }
  return [...out].map(([id, imgs])=>({ id, imgs })).filter(x=>x.imgs.length);
}
async function upSave(){
  if(UP.busy || !UP.seg) return;
  UP.busy = true; const btn = $('#up-save'); if(btn) btn.disabled = true;
  try{
    const now = Date.now(), batch = 'k' + now.toString(36);
    const name = ($('#up-name').value.trim() || UP.name || (UP.examFile && UP.examFile.name.replace(/\.pdf$/i, '')) || '올린 시험지'), mt = upMeta();
    if(srcNames().includes(name) && !confirm(`"${name}" 은(는) 이미 보관함에 있습니다. 같은 이름으로 또 저장하면 한 시험으로 합쳐져 번호가 겹칩니다.\n\n그래도 저장할까요? (취소하고 시험 이름을 바꾸는 것을 권합니다)`)){ UP.busy = false; if(btn) btn.disabled = false; return; }
    const src = { name, kind: mt.kind, year: mt.year || (name.match(/(20\d\d)/) || [])[1] || '', month: mt.month, grade: mt.grade };
    const passages = [], items = [], owners = [];
    UP.seg.sets.forEach((s, k)=>{
      const id = uid() + 'p' + k;
      passages.push({ id, title: s.title || '', author: s.author || '', cat: s.cat || '', sub: s.sub || '', genre: s.genre || '', body: s.body, head: s.head || '', range: [s.from, s.to], section: s.section || '', src, summary: s.summary || '', theme: s.theme || '',
        oldHangul: !!s.oldHangul, batch, createdAt: now, updatedAt: now });
      owners.push({ id, rects: s.rects }); s._id = id;
      if(UP.seg.scan) Object.assign(passages[passages.length - 1], { ocr: true, scanPages: (s.pages || []).map(n=>`scan-${batch}-${n}`) });
    });
    UP.seg.items.forEach((it, k)=>{
      const id = uid() + 'i' + k, set = it.setIdx >= 0 ? UP.seg.sets[it.setIdx] : null;
      items.push({ id, passageId: set ? set._id : null, num: it.num, section: it.section || '', group: it.group || '', stem: it.stem, view: it.view || '', viewLabel: it.viewLabel || '', choices: it.choices || [],
        answer: it.answer || '', explain: it.explain || '', wrong: it.wrong || '', type: it.type || '', points: it.points || null,
        typeId: it.typeId || '', subTypes: [], nature: it.nature || '', typeBy: it.typeBy || '', review: it.review || null, note: '', diff: it.diff || 0, diffBy: it.diff ? 'rule' : '', ...(set ? {} : { cat: it.cat || '', sub: it.sub || '', title: it.title || '' }), oldHangul: !!it.oldHangul, src, batch, createdAt: now + k, updatedAt: now });
      owners.push({ id, rects: it.rects });
      if(UP.seg.scan) Object.assign(items[items.length - 1], { ocr: true, scanPages: (it.pages || []).map(n=>`scan-${batch}-${n}`) });
    });
    await DB.putMany('passages', passages); await DB.putMany('items', items);
    let imgs = [];
    const keep = (localStorage.getItem(ORIG_KEY) || 'fig'), figIds = new Set(passages.filter(p=>/\[그림\]/.test(p.body) || p.oldHangul).map(p=>p.id).concat(items.filter(i=>/\[그림\]/.test(i.stem + i.view + i.choices.join('')) || i.oldHangul).map(i=>i.id)));
    const want = keep === 'none' ? [] : keep === 'all' ? owners : owners.filter(o=>figIds.has(o.id));
    try{
      if(UP.seg.scan){                                          // 스캔본: 쪽 그림을 한 번씩만 저장하고 지문·문항이 쪽 번호로 가리킨다(AI가 옮긴 글이라 원본이 꼭 필요)
        if(keep !== 'none'){ imgs = (UP.scanImgs || []).map((u, n)=>u ? { id: `scan-${batch}-${n}`, imgs: [u] } : null).filter(Boolean); if(imgs.length) await DB.putMany('images', imgs); }
      }else if(want.length){ imgs = await upCrops(UP.doc, want); if(imgs.length) await DB.putMany('images', imgs); }
    }catch(e){ console.warn('원본 조각 저장 실패', e); }
    await loadAll();
    UP.seg = null; UP.sol = null; UP.doc = null; UP.examFile = null; UP.solFile = null; UP.name = ''; UP.meta = null; UP.nameAuto = false; UP.scan = null; UP.scanImgs = null; UP.scanRes = null;
    toast(`지문 ${passages.length}개 · 문항 ${items.length}개를 저장했습니다.`);
    K.f = { cat: '', q: '', src: name }; K.ex = { src: name, section: '' }; go('passages');
  }catch(e){ toast('⚠ 저장 실패: ' + (e.message || e)); if(btn) btn.disabled = false; }
  UP.busy = false;
}
