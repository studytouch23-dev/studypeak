/* 스터디피크 국어 랩 — 시험지 올리기: 문제지 PDF(+ 정답·해설 PDF) → 지문·문항으로 나눠 미리보기 → 저장
 * 글자·밑줄은 KPDF 가 PDF에서 그대로 읽고(AI 없음), 원본 조각은 쪽을 그려 잘라 둔다([원본 보기]용) */
'use strict';
const UP = { examFile: null, solFile: null, doc: null, seg: null, sol: null, busy: false, nameAuto: false, meta: null };
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
        <span class="hint" id="up-status">글자가 들어 있는 PDF(평가원·교육청 시험지, 한글에서 만든 PDF)를 읽습니다. 사진을 스캔한 PDF와 캡처 이미지는 다음 단계에서 지원합니다.</span></div></div>
    <div id="up-preview">${s ? upPreviewHtml() : ''}</div>`;
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
    if(chars < 200 * ex.pages.length / 4) throw new Error('이 PDF에는 글자 정보가 거의 없습니다(스캔본으로 보입니다). 지금은 글자가 들어 있는 PDF만 읽을 수 있습니다.');
    UP.doc = ex.doc; UP.seg = KPDF.segment(ex.pages); UP.sol = null;
    const m = KT.examMeta(UP.name, ex.pages.slice(0, 1).map(p=>p.items.filter(i=>i.y < p.h * 0.14).map(i=>i.s).join(' ')).join(' '));      // 첫 쪽 맨 위 머리말("2026학년도 대학수학능력시험 9월 모의평가 문제지")에서만 — 본문 낱말에 속지 않게
    upFillMeta(m); UP.meta = upMeta();
    if(UP.nameAuto && UP.meta.year && UP.meta.kind){ UP.name = KT.examName(UP.meta); $('#up-name').value = UP.name; }     // 파일 이름 대신 표준 꼴 이름으로
    if(UP.solFile){
      st('정답·해설을 읽는 중…');
      const so = await loadPdfPages(UP.solFile);
      UP.sol = KPDF.parseSolutionText(KPDF.pagesToText(so.pages));
      upAttachSolution();
    }
    upClassify();
    if(!UP.seg.items.length) throw new Error('문항 번호를 찾지 못했습니다. 번호가 "1." 꼴로 시작하는 시험지인지 확인해 주세요.');
    st(`읽기 완료 — 지문 ${UP.seg.stats.sets}개 · 문항 ${UP.seg.stats.items}개`);
  }catch(e){ UP.seg = null; st('⚠ ' + (e.message || e)); toast('⚠ ' + (e.message || e)); }
  UP.busy = false;
  const pv = $('#up-preview'); if(pv) pv.innerHTML = UP.seg ? upPreviewHtml() : '';
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
    });
    UP.seg.items.forEach((it, k)=>{
      const id = uid() + 'i' + k, set = it.setIdx >= 0 ? UP.seg.sets[it.setIdx] : null;
      items.push({ id, passageId: set ? set._id : null, num: it.num, section: it.section || '', group: it.group || '', stem: it.stem, view: it.view || '', viewLabel: it.viewLabel || '', choices: it.choices || [],
        answer: it.answer || '', explain: it.explain || '', wrong: it.wrong || '', type: it.type || '', points: it.points || null,
        typeId: it.typeId || '', subTypes: [], nature: it.nature || '', typeBy: it.typeBy || '', review: it.review || null, note: '', diff: it.diff || 0, diffBy: it.diff ? 'rule' : '', ...(set ? {} : { cat: it.cat || '', sub: it.sub || '', title: it.title || '' }), oldHangul: !!it.oldHangul, src, batch, createdAt: now + k, updatedAt: now });
      owners.push({ id, rects: it.rects });
    });
    await DB.putMany('passages', passages); await DB.putMany('items', items);
    let imgs = [];
    const keep = (localStorage.getItem(ORIG_KEY) || 'fig'), figIds = new Set(passages.filter(p=>/\[그림\]/.test(p.body) || p.oldHangul).map(p=>p.id).concat(items.filter(i=>/\[그림\]/.test(i.stem + i.view + i.choices.join('')) || i.oldHangul).map(i=>i.id)));
    const want = keep === 'none' ? [] : keep === 'all' ? owners : owners.filter(o=>figIds.has(o.id));
    try{ if(want.length){ imgs = await upCrops(UP.doc, want); if(imgs.length) await DB.putMany('images', imgs); } }catch(e){ console.warn('원본 조각 저장 실패', e); }
    await loadAll();
    UP.seg = null; UP.sol = null; UP.doc = null; UP.examFile = null; UP.solFile = null; UP.name = ''; UP.meta = null; UP.nameAuto = false;
    toast(`지문 ${passages.length}개 · 문항 ${items.length}개를 저장했습니다.`);
    K.f = { cat: '', q: '', src: name }; K.ex = { src: name, section: '' }; go('passages');
  }catch(e){ toast('⚠ 저장 실패: ' + (e.message || e)); if(btn) btn.disabled = false; }
  UP.busy = false;
}
