/* 스터디피크 국어 랩 — 출력·교재 만들기: 지문 세트(원 문항 + 변형)와 단독 문항을 골라 인쇄물과 엑셀로 내보낸다
 * 양식 3가지: 학습지(프린트) · 시험지(모의고사 양식) · 교재(세트마다 정답·해설이 바로 뒤에)
 * 문제지와 정답·해설지는 따로 인쇄한다(브라우저 인쇄 → PDF 저장). 번호는 출력물 안에서 1번부터 다시 매긴다.
 * 같은 구성으로 스터디피크 LMS 업로드 엑셀(ExamTemplate)과 유형 분류표도 만든다 — 번호·유형·정답이 인쇄물과 일치한다.
 * 그림이 들어 있던 지문·문항([그림] 자리)은 글 대신 PDF에서 잘라 둔 원본 조각으로 싣는다. */
'use strict';
const SH = { id: '', title: '', sub: '', src: '', form: 'sheet', picks: {}, off: {}, singles: {}, orig: true, vars: true, mcOnly: false, types: true, dur: 80, saved: [] };
const SH_FORMS = { sheet: ['학습지 · 프린트', '제목과 이름 칸이 있는 2단 프린트. 수업용·숙제용.'], exam: ['시험지 · 모의고사', '수능형 머리말(국어 영역 · 성명 · 수험 번호)에 2단으로 이어지는 시험지.'], book: ['교재 · 해설 포함', '표지와 차례, 세트마다 정답·해설·근거가 바로 뒤에 붙는 교재.'] };
const shIsMc = it=>!it.kind;                                // 5지선다(OX·서술형 변형이 아닌 것) — LMS 엑셀에 올릴 수 있는 문항
const shKeep = it=>!SH.off[it.id] && (!SH.mcOnly || shIsMc(it));
/* 고른 것 → [{ p(지문 또는 null), items[] }] — 지문 세트 먼저(올린 순서), 그다음 지문 없는 단독 문항 */
function shCompose(){
  const sets = K.passages.filter(p=>SH.picks[p.id]).sort((a, b)=>(a.createdAt - b.createdAt) || ((a.range || [0])[0] - (b.range || [0])[0]))
    .map(p=>({ p, items: (SH.orig ? itemsOf(p.id) : []).concat(SH.vars ? variantsOf(p.id) : []).filter(shKeep) })).filter(s=>s.items.length);
  const singles = K.items.filter(i=>!i.passageId && SH.singles[i.id] && shKeep(i)).sort((a, b)=>(a.createdAt - b.createdAt) || (a.num - b.num));
  return sets.concat(singles.map(it=>({ p: null, items: [it] })));
}
function shNumbered(){ let n = 0; return shCompose().map(s=>({ p: s.p, from: n + 1, items: s.items.map(it=>({ no: ++n, it })), to: n })); }
const shHasFig = t=>/\[그림\]/.test(t || '');
async function shImgs(id){ const r = await DB.get('images', id); return r && r.imgs && r.imgs.length ? r.imgs.map(u=>`<img src="${esc(u)}" alt="">`).join('') : ''; }
const inl = h=>h.replace(/^<p class="pl">|<\/p>$/g, '');
async function shItemHtml(no, it){
  const figs = shHasFig(it.stem + it.view + (it.choices || []).join('')) ? await shImgs(it.id) : '';
  if(figs) return `<div class="sq"><div class="sstem"><b>${no}.</b> <span class="sorig">원본</span></div><div class="simg">${figs}</div></div>`;
  return `<div class="sq"><div class="sstem"><b>${no}.</b> ${inl(kHtml(it.stem))}${it.kind === 'ox' ? ' <span class="sox">( O / X )</span>' : ''}${it.points && !it.kind && !/\[\s*\d\s*점\s*\]/.test(KPDF.plain(it.stem)) && it.points !== 2 ? ` [${it.points}점]` : ''}</div>
    ${KPDF.plain(it.view).trim() ? `<div class="sview">${it.viewLabel ? `<div class="svl">&lt;${esc(it.viewLabel)}&gt;</div>` : ''}${kHtml(it.view)}</div>` : ''}
    ${(it.choices || []).map(c=>`<div class="sch">${inl(kHtml(c))}</div>`).join('')}${it.kind === 'essay' ? '<div class="slines"></div>' : ''}</div>`;
}
const shAns = it=>it.kind === 'essay' ? '서술형' : (it.answer || '—');
const shType = (it, cat)=>it.typeId ? KT.label(it.typeId) : (it.nature || (cat && !KT.typed(cat) ? cat : ''));
/* 문항 하나의 해설 덩어리: 번호 · 정답 · 유형 · 해설 · 근거 · 오답 풀이 */
function shSolHtml(no, it, cat){
  const ty = SH.types ? shType(it, cat) : '';
  return `<div class="sol"><div class="solh"><b class="soln">${no}</b><b class="sola">${esc(shAns(it))}</b>${ty ? `<span class="solt">${esc(ty)}</span>` : ''}${it.variantOf ? `<span class="solt">${esc(VKINDS[it.vkind] || '변형')}</span>` : ''}</div>
    ${it.kind === 'essay' ? `<div><b>모범 답안</b> ${esc(it.model || '')}</div>${(it.rubric || []).length ? `<div><b>채점 기준</b> ${it.rubric.map(esc).join(' / ')}</div>` : ''}` : ''}
    ${it.explain ? `<div>${esc(KPDF.plain(it.explain))}</div>` : ''}
    ${it.ev && (it.ev.quotes || []).length ? `<div class="sev"><b>근거</b> ${it.ev.quotes.map(q=>'“' + esc(q) + '”').join(' / ')}</div>` : ''}
    ${it.wrong ? `<div class="swr"><b>오답 풀이</b> ${esc(KPDF.plain(it.wrong))}</div>` : ''}</div>`;
}
const shSetTitle = s=>s.p ? (s.p.title || snippet(s.p.body, 24)) : (s.items[0].it.title || '단독 문항');
function shHead(kind){
  const t = esc(SH.title || '국어 학습지'), sub = esc(SH.sub || '');
  if(kind === 'a') return `<header class="shd"><div><div class="shk">정답과 해설</div><b>${t}</b></div><span class="shs">${sub}</span></header>`;
  if(SH.form === 'exam') return `<header class="xhd"><div class="xsub">${t}${sub ? ' · ' + sub : ''}</div><div class="xtitle">국어 영역</div>
    <div class="xinfo"><span>성명</span><i></i><span>수험 번호</span><i class="w"></i></div></header>`;
  return `<header class="shd"><div><div class="shk">STUDYPEAK 국어</div><b>${t}</b></div><span class="shs">${sub ? sub + ' · ' : ''}이름 ______________　점수 ______</span></header>`;
}
/* part: 'q' 문제지 · 'a' 정답·해설지 · 'book' 교재(문제 + 세트별 해설) → { html, sets, items } */
async function shHtml(part){
  const sets = shNumbered(), n = sets.reduce((s, x)=>s + x.items.length, 0);
  if(part === 'a'){
    const quick = `<div class="quick">${sets.flatMap(s=>s.items).map(({ no, it })=>`<span><i>${no}</i><b>${esc(shAns(it))}</b></span>`).join('')}</div>`;
    const body = sets.map(s=>`<section class="aset"><div class="aseth">[${s.from}${s.to > s.from ? '~' + s.to : ''}] ${esc(shSetTitle(s))}</div>${s.items.map(({ no, it })=>shSolHtml(no, it, s.p ? s.p.cat : it.cat)).join('')}</section>`).join('');
    return { html: `<div class="sheet ans">${shHead('a')}<h3 class="qh">빠른 정답</h3>${quick}<h3 class="qh">해설</h3>${body}</div>`, sets: sets.length, items: n };
  }
  const blocks = [];
  for(const s of sets){
    const qs = []; for(const { no, it } of s.items) qs.push(await shItemHtml(no, it));
    const range = `[${s.from}${s.to > s.from ? '~' + s.to : ''}]`;
    let passage = '';
    if(s.p){ const pimg = shHasFig(s.p.body) ? await shImgs(s.p.id) : ''; passage = `<div class="shead"><b>${range}</b> ${esc(KPDF.plain(s.p.head) || '다음 글을 읽고 물음에 답하시오.')}</div><div class="spassage">${pimg ? `<div class="simg">${pimg}</div>` : kHtml(s.p.body, { passage: true })}</div>`; }
    const sol = part === 'book' ? `<div class="ssol"><div class="ssolh">정답과 해설 ${range}</div>${s.items.map(({ no, it })=>shSolHtml(no, it, s.p ? s.p.cat : it.cat)).join('')}</div>` : '';
    blocks.push(`<section class="sset${s.p ? '' : ' single'}">${part === 'book' && s.p ? `<h3 class="bset">${esc(shSetTitle(s))}<span>${esc([s.p.cat, s.p.sub].filter(Boolean).join(' · '))}</span></h3>` : ''}${passage}${qs.join('')}</section>${sol}`);
  }
  if(part === 'book'){
    const toc = sets.filter(s=>s.p).map(s=>`<li><span>${esc(shSetTitle(s))}</span><i>${s.from}${s.to > s.from ? '~' + s.to : ''}번</i></li>`).join('');
    return { html: `<div class="sheet book"><section class="cover"><div class="ck">STUDYPEAK 국어</div><h1>${esc(SH.title || '국어 교재')}</h1><p>${esc(SH.sub || '')}</p><ol class="toc">${toc}</ol></section>${blocks.join('')}</div>`, sets: sets.length, items: n };
  }
  return { html: `<div class="sheet ${SH.form === 'exam' ? 'exam' : 'work'}">${shHead('q')}<div class="sbody">${blocks.join('')}</div>${SH.form === 'exam' ? '<div class="xend">* 확인 사항 — 답안지의 해당란에 필요한 내용을 정확히 기입(표기)했는지 확인하시오.</div>' : ''}</div>`, sets: sets.length, items: n };
}
/* 다른 화면에서 넘어오기: 지문·문항을 골라 둔 채로 이 화면을 연다 */
function shOpenWith(opts){
  SH.picks = {}; SH.off = {}; SH.singles = {}; SH.id = ''; SH.src = '';
  for(const id of opts.passages || []) SH.picks[id] = true;
  for(const it of opts.items || []){                           // 문항 단위: 그 문항만 남기고 같은 지문의 나머지는 끈다
    if(!it.passageId){ SH.singles[it.id] = true; continue; }
    if(!SH.picks[it.passageId]){ SH.picks[it.passageId] = true; K.items.filter(x=>x.passageId === it.passageId).forEach(x=>{ SH.off[x.id] = true; }); }
    delete SH.off[it.id];
  }
  if(opts.form) SH.form = opts.form;
  if(opts.title != null) SH.title = opts.title;
  SH.orig = true; SH.vars = opts.vars !== false; SH.mcOnly = false;
  go('sheet');
}
function renderSheet(){
  const el = $('#view-sheet'), names = srcNames();
  if(!K.passages.length && !K.items.length){ el.innerHTML = '<h2>출력·교재 만들기</h2><div class="card empty">아직 지문이 없습니다. <b>시험지 올리기</b>에서 PDF를 먼저 올려 주세요.</div>'; return; }
  const inSrc = x=>!SH.src || (x.src && x.src.name === SH.src);
  const list = K.passages.filter(inSrc), singles = K.items.filter(i=>!i.passageId && !i.variantOf && inSrc(i)), comp = shNumbered(), nItems = comp.reduce((s, x)=>s + x.items.length, 0);
  const nonMc = comp.flatMap(s=>s.items).filter(x=>!shIsMc(x.it)).length;
  const tg = (k, lab, tip)=>`<label class="pick" style="display:inline-block;margin-right:.8rem" title="${esc(tip || '')}"><input type="checkbox" ${SH[k] ? 'checked' : ''} onchange="SH.${k}=this.checked;renderSheet()"> ${lab}</label>`;
  el.innerHTML = `
    <h2>출력·교재 만들기</h2><p class="vd">지문 세트와 문항을 골라 <b>학습지 · 시험지 · 교재</b>로 인쇄하고, 같은 구성을 <b>스터디피크 LMS 엑셀</b>로 내려받습니다. 문제지와 정답·해설지는 따로 인쇄됩니다. 인쇄 창에서 대상을 <b>PDF로 저장</b>으로 고르면 파일이 됩니다.</p>
    <div class="card"><label>양식</label><div class="forms" id="sh-forms">${Object.entries(SH_FORMS).map(([k, [name, desc]])=>`<button class="form ${SH.form === k ? 'on' : ''}" data-form="${k}" onclick="SH.form='${k}';renderSheet()"><b>${name}</b><span>${desc}</span></button>`).join('')}</div>
      <div class="grid4" style="margin-top:.8rem">
        <div style="grid-column:span 2"><label for="sh-title">제목 (시험 이름)</label><input id="sh-title" value="${esc(SH.title)}" placeholder="예) 독서 변형 연습 1회" onchange="SH.title=this.value.trim();shPreview()"></div>
        <div><label for="sh-sub">부제 · 날짜 · 반</label><input id="sh-sub" value="${esc(SH.sub)}" placeholder="예) 고3 A반 · 11월 4주" onchange="SH.sub=this.value.trim();shPreview()"></div>
        <div><label for="sh-src">출처로 좁히기</label><select id="sh-src" onchange="SH.src=this.value;renderSheet()">${optList(names, SH.src, '전체')}</select></div></div>
      <div style="margin-top:.6rem">${tg('orig', '원 문항')}${tg('vars', '변형 문항')}${tg('mcOnly', '5지선다만', 'OX·서술형을 빼고 담습니다 — LMS 엑셀을 만들 때 켜세요')}${tg('types', '해설에 유형 표시')}</div>
      <label style="margin-top:.6rem">담을 지문 <a href="#" class="hint" onclick="K.passages.filter(p=>!SH.src||(p.src&&p.src.name===SH.src)).forEach(p=>SH.picks[p.id]=true);renderSheet();return false">보이는 것 모두</a> · <a href="#" class="hint" onclick="SH.picks={};SH.off={};SH.singles={};renderSheet();return false">모두 풀기</a></label>
      <div id="sh-list" style="max-height:300px;overflow:auto">${list.map(p=>{
        const its = itemsOf(p.id).concat(variantsOf(p.id)), on = !!SH.picks[p.id];
        return `<div class="shrow"><label class="pick"><input type="checkbox" ${on ? 'checked' : ''} onchange="SH.picks['${escJs(p.id)}']=this.checked;renderSheet()"> ${catChip(p)} <b>${esc(p.title || snippet(p.body, 26))}</b> <span class="hint">${esc((p.src && p.src.name) || '')}</span></label>
          ${on ? `<div class="shitems">${its.map(it=>`<span class="chip clk ${shKeep(it) && (it.variantOf ? SH.vars : SH.orig) ? 'on' : ''}" title="${esc(snippet(it.stem, 60))}" onclick="SH.off['${escJs(it.id)}']=!SH.off['${escJs(it.id)}'];renderSheet()">${it.variantOf ? '변형 ' : ''}${it.num}${it.kind === 'ox' ? ' OX' : it.kind === 'essay' ? ' 서술' : ''}</span>`).join('') || '<span class="hint">문항 없음</span>'}</div>` : ''}</div>`; }).join('') || '<span class="hint">지문이 없습니다.</span>'}
        ${singles.length ? `<div class="shrow"><b style="font-size:.85rem">지문 없는 단독 문항</b><div class="shitems">${singles.map(it=>`<span class="chip clk ${SH.singles[it.id] ? 'on' : ''}" title="${esc(snippet(it.stem, 60))}" onclick="SH.singles['${escJs(it.id)}']=!SH.singles['${escJs(it.id)}'];renderSheet()">${esc(it.section ? it.section.slice(0, 2) + ' ' : '')}${it.num}</span>`).join('')}</div></div>` : ''}</div>
      <div class="row" style="margin-top:.9rem">
        ${SH.form === 'book' ? `<button class="btn" id="sh-print-book" onclick="shPrint('book')" ${nItems ? '' : 'disabled'}>🖨 교재 인쇄 (문제 + 해설)</button>` : ''}
        <button class="btn${SH.form === 'book' ? ' ghost' : ''}" id="sh-print" onclick="shPrint('q')" ${nItems ? '' : 'disabled'}>🖨 문제지 인쇄</button>
        <button class="btn ghost" id="sh-print-ans" onclick="shPrint('a')" ${nItems ? '' : 'disabled'}>🖨 정답·해설지 인쇄</button>
        <span class="vsep"></span>
        <button class="btn ghost" id="sh-lms" onclick="shDownloadLms()" ${nItems ? '' : 'disabled'}>⬇ LMS 업로드 엑셀</button>
        <button class="btn ghost" id="sh-class" onclick="shDownloadClass()" ${nItems ? '' : 'disabled'}>⬇ 유형 분류표</button>
        <button class="btn ghost" id="sh-save" onclick="shSave()" ${nItems ? '' : 'disabled'}>💾 구성 저장</button></div>
      <p class="hint" id="sh-count" style="margin-top:.5rem">${nItems ? `지문 ${comp.filter(s=>s.p).length}개 · 문항 ${nItems}개${nonMc ? ` (OX·서술형 ${nonMc}개 포함 — LMS 엑셀은 5지선다만 올릴 수 있어 [5지선다만]을 켜야 만들어집니다)` : ''}` : '지문을 고르면 아래에 미리보기가 나옵니다.'}</p></div>
    ${SH.saved.length ? `<div class="card"><h3>저장한 구성</h3>${SH.saved.map(s=>`<div class="row" style="margin-bottom:.3rem"><a href="#" onclick="shLoad('${escJs(s.id)}');return false"><b>${esc(s.title || '제목 없음')}</b></a><span class="chip">${esc((SH_FORMS[s.form] || [''])[0])}</span><span class="hint">${fmtDate(s.updatedAt)}</span><a href="#" class="hint" style="color:var(--danger)" onclick="shDelete('${escJs(s.id)}');return false">지우기</a></div>`).join('')}</div>` : ''}
    <div id="sh-preview"></div>`;
  shPreview();
}
async function shPreview(){
  const box = $('#sh-preview'); if(!box) return;
  const part = SH.form === 'book' ? 'book' : 'q', r = await shHtml(part), a = r.items && part !== 'book' ? await shHtml('a') : null;
  if($('#sh-preview') !== box) return;                         // 그 사이 화면이 바뀌었으면 버림
  box.innerHTML = r.items ? `<div class="pvtabs"><b>미리보기</b><span class="hint">인쇄하면 이 모양 그대로 나옵니다.</span></div><div class="card sheet-preview" id="sh-pv-q">${r.html}</div>${a ? `<div class="card sheet-preview" id="sh-pv-a">${a.html}</div>` : ''}` : '';
}
async function shPrint(part){
  const r = await shHtml(part);
  if(!r.items){ toast('담을 문항이 없습니다 — 지문을 고르고 원 문항·변형 문항 가운데 하나는 켜 주세요.'); return; }
  const root = $('#print-root'), old = document.title;
  root.innerHTML = r.html;
  await Promise.all([...root.querySelectorAll('img')].map(i=>i.complete ? null : new Promise(res=>{ i.onload = i.onerror = res; })));
  document.title = (SH.title || '국어 학습지') + (part === 'a' ? '_정답과 해설' : part === 'book' ? '_교재' : '_문제지');     // PDF로 저장할 때의 파일 이름
  window.print();
  setTimeout(()=>{ document.title = old; }, 1500);
}
/* 이 구성 그대로의 엑셀: 번호는 인쇄물의 새 번호, 분류·유형·정답은 문항에 저장된 값 */
function shRows(){
  return shNumbered().flatMap(s=>s.items.map(({ no, it })=>{ const h = s.p || it;
    return { id: it.id, num: no, section: '', cat: h.cat || '', sub: h.sub || '', title: h.title || '', author: h.author || '', typeId: it.typeId || '', subTypes: (it.subTypes || []).slice(), nature: it.nature || '',
      answer: KT.ansNo(it.answer), points: +it.points || 0, review: it.review || null, note: it.variantOf ? (VKINDS[it.vkind] || '변형') : (it.note || ''), ansBy: it.ansBy || '', ansAi: 0, gkey: s.p ? s.p.id : it.id, single: !s.p, mc: shIsMc(it) }; }));
}
async function shDownloadLms(){
  const rs = shRows(); if(!rs.length){ toast('문항이 없습니다.'); return; }
  if(rs.some(r=>!r.mc)){ toast('LMS 엑셀은 5지선다만 올릴 수 있습니다 — [5지선다만]을 켜고 다시 눌러 주세요(번호가 인쇄물과 같아집니다).'); return; }
  const ck = KX.check(rs);
  if(ck.errors.length && !confirm(`고쳐야 할 것이 ${ck.errors.length}건 있습니다. 이대로 올리면 LMS가 거부할 수 있습니다.\n\n${ck.errors.slice(0, 6).join('\n')}\n\n(분류·유형·정답은 [분류표·LMS 엑셀]이나 세트의 [고치기]에서 고칩니다)\n\n그래도 파일을 만들까요?`)) return;
  try{
    const blob = await SPX.blob(KX.lmsSheets(rs, { name: SH.title || '국어 학습지', subject: '국어', duration: SH.dur }));
    const d = new Date(), ymd = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'), a = KX.ascii(SH.title);
    downloadBlob((a.length >= 4 ? a : 'korean_' + ymd + (a ? '_' + a : '')) + '_exam_template' + (ck.fallback.length ? '_fallback' : '') + '.xlsx', blob);   // 업로드용 파일 이름은 영문만(한글 제목이면 날짜로)
    toast(`LMS 업로드 파일을 내려받았습니다 — 문항 ${rs.length}개${ck.fallback.length ? ' (화작·매체는 독서로 치환)' : ''}`);
  }catch(e){ toast('⚠ ' + (e.message || e)); }
}
async function shDownloadClass(){
  const rs = shRows(); if(!rs.length){ toast('문항이 없습니다.'); return; }
  try{ downloadBlob(`${exSafeName(SH.title || '국어 학습지')}_유형분류표.xlsx`, await SPX.blob(KX.classSheets(rs))); toast('유형 분류표를 내려받았습니다.'); }
  catch(e){ toast('⚠ ' + (e.message || e)); }
}
/* 구성 저장·불러오기 (sheets 저장소) */
async function shLoadSaved(){ SH.saved = (await DB.all('sheets')).sort((a, b)=>b.updatedAt - a.updatedAt); }
async function shSave(){
  const now = Date.now(), rec = { id: SH.id || uid() + 's', title: SH.title || '제목 없음', sub: SH.sub, form: SH.form, picks: Object.keys(SH.picks).filter(k=>SH.picks[k]), off: Object.keys(SH.off).filter(k=>SH.off[k]), singles: Object.keys(SH.singles).filter(k=>SH.singles[k]),
    orig: SH.orig, vars: SH.vars, mcOnly: SH.mcOnly, types: SH.types, createdAt: now, updatedAt: now };
  await DB.put('sheets', rec); SH.id = rec.id; await shLoadSaved(); renderSheet(); toast('구성을 저장했습니다 — 다음에 [저장한 구성]에서 다시 엽니다.');
}
function shLoad(id){
  const s = SH.saved.find(x=>x.id === id); if(!s) return;
  const set = a=>Object.fromEntries((a || []).map(k=>[k, true]));
  Object.assign(SH, { id: s.id, title: s.title, sub: s.sub || '', form: SH_FORMS[s.form] ? s.form : 'sheet', picks: set(s.picks), off: set(s.off), singles: set(s.singles), orig: s.orig !== false, vars: s.vars !== false, mcOnly: !!s.mcOnly, types: s.types !== false, src: '' });
  renderSheet();
}
async function shDelete(id){ if(!confirm('이 구성을 지울까요? (지문·문항은 그대로 남습니다)')) return; await DB.del('sheets', id); if(SH.id === id) SH.id = ''; await shLoadSaved(); renderSheet(); }
