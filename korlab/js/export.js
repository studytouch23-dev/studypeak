/* 스터디피크 국어 랩 — 분류표·LMS 엑셀: 시험 한 회차의 문항을 표로 보고 고치고, 유형 분류표(2시트)와 LMS ExamTemplate 을 내려받는다
 * 계산은 kexam.js(KX), 엑셀 쓰기는 shared/xlsx.js(SPX). 여기는 화면만. */
'use strict';
const EX = { name: {}, file: {}, dur: 80 };                  // 시험별로 고친 Exam Name·파일명(이 화면에 머무는 동안만)
function exRows(){ return KX.rows(K.passages, K.items, K.ex.src, { section: K.ex.section }); }
function exKey(){ return K.ex.src + '|' + K.ex.section; }
function renderExport(){
  const names = srcNames(), el = $('#view-export');
  if(!names.length){ el.innerHTML = '<h2>분류표·LMS 엑셀</h2><div class="card empty">아직 시험지가 없습니다. <b>시험지 올리기</b>에서 PDF를 먼저 올려 주세요.</div>'; return; }
  if(!names.includes(K.ex.src)){ K.ex.src = names[0]; K.ex.section = ''; }
  const secs = KX.sections(K.items, K.ex.src);
  if(secs.length && !secs.includes(K.ex.section)) K.ex.section = secs[0];
  if(!secs.length) K.ex.section = '';
  const rs = exRows(), ck = KX.check(rs), key = exKey(), fb = ck.fallback.length > 0;
  if(EX.name[key] == null) EX.name[key] = K.ex.src + (/국어/.test(K.ex.src) ? '' : ' 국어영역') + (K.ex.section ? ` (${K.ex.section})` : '');
  const fileDefault = KX.lmsFileName(K.ex.src, K.ex.section, fb);
  if(EX.file[key] == null || EX.file[key + ':auto'] === EX.file[key]){ EX.file[key] = fileDefault; EX.file[key + ':auto'] = fileDefault; }
  const ruleN = rs.filter(r=>{ const it = K.items.find(i=>i.id === r.id); return it && it.typeBy === 'rule'; }).length;
  const dist = KX.distribution(rs), gs = KX.groups(rs);
  el.innerHTML = `
    <h2>분류표·LMS 엑셀</h2><p class="vd">시험 한 회차의 문항을 <b>22유형</b>으로 분류해 유형 분류표(엑셀 2시트)와 스터디피크 LMS 업로드 파일(ExamTemplate)을 만듭니다. 표에서 바로 고칠 수 있습니다.</p>
    <div class="card"><div class="grid4">
      <div><label for="ex-src">시험</label><select id="ex-src" onchange="K.ex.src=this.value;K.ex.section='';renderExport()">${optList(names, K.ex.src)}</select></div>
      ${secs.length ? `<div><label for="ex-sec">선택 과목</label><select id="ex-sec" onchange="K.ex.section=this.value;renderExport()">${optList(secs, K.ex.section)}</select></div>` : ''}
      <div><label for="ex-name">Exam Name (LMS 시험 이름)</label><input id="ex-name" value="${esc(EX.name[key])}" onchange="EX.name[exKey()]=this.value.trim()"></div>
      <div><label for="ex-dur">시간 (분)</label><input id="ex-dur" type="number" value="${EX.dur}" onchange="EX.dur=+this.value||80"></div>
      <div><label for="ex-file">LMS 파일 이름 (영문만)</label><input id="ex-file" value="${esc(EX.file[key])}" onchange="EX.file[exKey()]=(KX.ascii(this.value.replace(/\\.xlsx$/i,''))||'korean_exam_template')+'.xlsx';this.value=EX.file[exKey()]"></div></div>
      <div class="row" style="margin-top:.8rem">
        <button class="btn" id="ex-ai" onclick="classifyExam(K.ex.src)">🤖 AI로 유형 분류 (이 시험 전체)</button>
        <button class="btn ghost" id="ex-solve" onclick="solveExam(K.ex.src)" title="정답표가 없으면 AI가 풀어 채우고, 있으면 AI 풀이와 견줘 다른 문항을 알려 줍니다">🤖 정답 풀기·대조</button>
        <button class="btn ghost" id="ex-class" onclick="exDownloadClass()">⬇ 유형 분류표 (엑셀 2시트)</button>
        <button class="btn ghost" id="ex-lms" onclick="exDownloadLms()">⬇ LMS 업로드 파일${fb ? ' (fallback)' : ''}</button>
        <button class="btn ghost" id="ex-print" onclick="exToSheet()">🖨 이 시험을 시험지로 인쇄</button>
        <span class="hint">문항 ${ck.count} · 지문 그룹 ${ck.groups} · 배점 합계 ${ck.total}점</span></div>
      ${ruleN ? `<p class="hint" style="margin-top:.5rem">⚠ ${ruleN}문항은 발문 낱말만 보고 <b>어림한</b> 유형입니다(노란 칸). [🤖 AI로 유형 분류]를 누르면 지문과 선지를 읽고 다시 판정합니다. 직접 고른 칸은 AI가 건드리지 않습니다.</p>` : ''}
      ${fb ? `<p class="hint" style="margin-top:.3rem">화법과 작문·매체 문항(${ck.fallback.length}개)은 LMS에 등록된 유형이 없어 <b>독서 / 독서이론 + R코드</b>로 치환해 올립니다(fallback). 학생 리포트에서는 독서로 집계됩니다. 분류표에는 '—' 로 적습니다.</p>` : ''}</div>
    ${ck.errors.length ? `<div class="card errbox" id="ex-errors"><b>업로드 전에 고쳐야 할 것 ${ck.errors.length}건</b><ul>${ck.errors.slice(0, 30).map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div>` : `<div class="card okbox" id="ex-ok"><b>점검 통과</b> — 유형 빈칸 0 · 대분류별 유형 일치 · 그룹 유형 = 첫 문항 유형 · (대분류, 소분류) 조합 확인</div>`}
    ${ck.warns.length ? `<div class="card warnbox" style="margin-bottom:1rem"><b>확인해 볼 것 ${ck.warns.length}건</b><ul>${ck.warns.slice(0, 30).map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    ${ck.flags.length ? `<div class="card" id="ex-flags"><h3>검토 요망 ${ck.flags.length}건</h3><div class="tblwrap"><table class="tbl"><tr><th>문항</th><th>부여 유형</th><th>대안 유형</th><th>근거</th><th></th></tr>
      ${ck.flags.map(f=>{ const r = { id: f.id }; return `<tr><td>${f.num}</td><td>${esc(KT.label(f.type) || f.type)}</td><td>${esc(KT.label(f.alt) || f.alt || '—')}</td><td>${esc(f.why)}</td>
        <td style="white-space:nowrap">${f.alt ? `<a href="#" onclick="exUseAlt('${escJs(r.id)}');return false">대안으로</a> · ` : ''}<a href="#" onclick="exClearFlag('${escJs(r.id)}');return false">이대로 확정</a></td></tr>`; }).join('')}</table></div></div>` : ''}
    ${ck.aux.length ? `<div class="card"><h3>복합 유형 — LMS 파일에서는 대표 유형만 들어갑니다</h3><p class="hint">${ck.aux.map(a=>`${a.num}번 ${a.main} + ${a.subs.join(' + ')}`).join(' · ')}</p></div>` : ''}
    <div class="card"><h3>문항 표</h3><div class="tblwrap"><table class="tbl" id="ex-table"><tr><th>번호</th><th>대분류</th><th>소분류</th><th>지문 제목</th><th>작성자</th><th>유형 / 성격</th><th>보조</th><th>정답</th><th>배점</th></tr>
      ${gs.map(g=>g.rows.map((r, k)=>exRowHtml(r, k === 0, g.rows.length)).join('')).join('')}</table></div></div>
    ${dist.length ? `<div class="card"><h3>유형 분포</h3><div class="tblwrap"><table class="tbl"><tr><th>카테고리</th><th>유형</th><th>문항 수</th><th>배점 합계</th><th>문항번호</th></tr>
      ${dist.map(d=>`<tr><td>${d.cat}</td><td>${esc(d.id + ' ' + d.name)}</td><td>${d.n}</td><td>${d.pts}</td><td>${d.nums.join(', ')}</td></tr>`).join('')}</table></div></div>` : ''}`;
}
function exRowHtml(r, first, span){
  const it = K.items.find(i=>i.id === r.id) || {}, id = escJs(r.id), typed = KT.typed(r.cat), rule = it.typeBy === 'rule';
  const head = first ? `<td rowspan="${span}"><select onchange="exSetHead('${id}','cat',this.value)" aria-label="대분류">${optList(KT.CATS, r.cat, '미분류')}</select></td>
      <td rowspan="${span}"><select onchange="exSetHead('${id}','sub',this.value)" aria-label="소분류">${optList(KT.subs(r.cat), r.sub, '(미정)')}</select></td>
      <td rowspan="${span}"><input value="${esc(r.title)}" onchange="exSetHead('${id}','title',this.value)" aria-label="지문 제목" style="min-width:210px"></td>
      <td rowspan="${span}">${r.cat === '문학' ? `<input value="${esc(r.author)}" onchange="exSetHead('${id}','author',this.value)" aria-label="작성자" style="min-width:90px">` : '<span class="hint">—</span>'}</td>` : '';
  return `<tr data-num="${r.num}" class="${first ? 'gfirst' : ''}"><td><a href="#" onclick="${it.passageId ? `go('set','${escJs(it.passageId)}')` : `K.fi={q:'',cat:'',kind:'single',type:''};go('items')`};return false">${r.num}</a>${r.review ? ' <span class="chip w" title="' + esc(r.review.why || '') + '">검토</span>' : ''}</td>${head}
    <td class="${rule ? 'rule' : ''}">${typed ? `<select onchange="exSetType('${id}',this.value,null)" aria-label="${r.num}번 유형">${typeOpts(r.cat, r.typeId)}</select>`
      : r.cat ? `<select onchange="exSetNature('${id}',this.value)" aria-label="${r.num}번 성격">${optList(KT.naturesOf(r.cat).map(n=>n.n), r.nature, '(성격 미정)')}</select><span class="hint"> → ${esc((KX.lmsRow(r).type || '').slice(0, 3) || '?')}</span>` : '<span class="hint">대분류부터</span>'}</td>
    <td>${typed ? `<select onchange="exSetType('${id}',null,this.value)" aria-label="${r.num}번 보조 유형">${typeOpts(r.cat, r.subTypes[0] || '').replace('(미정)', '—')}</select>` : ''}</td>
    <td class="${it.ansBy === 'ai' ? 'rule' : ''}"><select onchange="exSetField('${id}','answer',this.value)" aria-label="${r.num}번 정답">${optList([...KPDF.CIRC.slice(0, 5)], r.answer ? KPDF.CIRC[r.answer - 1] : '', '?')}</select></td>
    <td><select onchange="exSetField('${id}','points',this.value)" aria-label="${r.num}번 배점">${optList(['2', '3'], String(r.points || ''), '?')}</select></td></tr>`;
}
/* 표에서 고친 것은 바로 저장한다. 지문에 딸린 문항이면 지문을, 단독 문항이면 그 문항을 고친다 */
/* AI 작업이 도는 동안에는 저장을 막는다 — 작업이 쥐고 있는 옛 사본이 방금 고친 것을 덮어쓰지 않게 */
function aiBusyBlock(){ if(!SPAI.state.running) return false; toast('AI 작업이 끝난 뒤에 고쳐 주세요(아래 [중지]로 멈출 수 있습니다).'); if(K.view === 'export') renderExport(); return true; }
async function exSetHead(itemId, field, value){
  const it = K.items.find(i=>i.id === itemId); if(!it || aiBusyBlock()) return;
  const p = it.passageId ? K.passages.find(x=>x.id === it.passageId) : null, h = p || it, store = p ? 'passages' : 'items';
  const mates = !p && it.group ? K.items.filter(x=>x !== it && !x.passageId && !x.variantOf && x.group === it.group && (x.section || '') === (it.section || '') && x.src && it.src && x.src.name === it.src.name) : [];   // "[1~4] 어휘력"처럼 머리말만 같은 단독 문항 묶음
  value = String(value || '').trim();
  if(field === 'cat'){
    if(value && !KT.CATS.includes(value)) return;
    h.cat = value; h.sub = KT.subs(value).length === 1 ? KT.subs(value)[0] : KT.subOf(value, h.genre, h.title);
    for(const x of (p ? itemsOf(p.id) : [it].concat(mates))){                 // 대분류가 바뀌면 유형은 그 대분류의 것으로 다시 어림
      const g = KT.guess({ stem: KPDF.plain(x.stem), view: KPDF.plain(x.view), viewLabel: x.viewLabel, solType: x.type }, value);
      Object.assign(x, { typeId: g.id || '', nature: g.nature || '', subTypes: [], typeBy: 'rule', review: null, updatedAt: Date.now() });
      if(x !== h) await DB.put('items', x);
    }
  }else if(field === 'sub'){ if(value && !KT.subs(h.cat).includes(value)) return; h.sub = value; }
  else h[field] = value;
  h.clsBy = 'user'; h.updatedAt = Date.now();
  for(const m of mates){ Object.assign(m, { cat: h.cat, sub: h.sub, title: h.title, clsBy: 'user', updatedAt: Date.now() }); await DB.put('items', m); }
  await DB.put(store, h); renderExport();
}
async function exSetType(itemId, typeId, sub2){
  const it = K.items.find(i=>i.id === itemId); if(!it || aiBusyBlock()) return;
  if(setUserType(it, typeId == null ? it.typeId : typeId, sub2 == null ? (it.subTypes || [])[0] || '' : sub2, '')) await DB.put('items', it);
  renderExport();
}
async function exSetNature(itemId, nature){
  const it = K.items.find(i=>i.id === itemId); if(!it || aiBusyBlock()) return;
  if(setUserType(it, '', '', nature)) await DB.put('items', it);
  renderExport();
}
async function exSetField(itemId, field, value){
  const it = K.items.find(i=>i.id === itemId); if(!it || aiBusyBlock()) return;
  if(field === 'points') it.points = +value || null; else { it.answer = value; delete it.ansBy; delete it.ansAi; }      // 사람이 고른 정답으로 확정
  it.updatedAt = Date.now(); await DB.put('items', it); renderExport();
}
async function exUseAlt(itemId){
  const it = K.items.find(i=>i.id === itemId); if(!it || !it.review || !KT.has(it.review.alt) || aiBusyBlock()) return;
  setUserType(it, it.review.alt, '', ''); await DB.put('items', it); renderExport();
}
async function exClearFlag(itemId){
  const it = K.items.find(i=>i.id === itemId); if(!it || aiBusyBlock()) return;
  it.review = null; it.typeBy = 'user'; it.updatedAt = Date.now(); await DB.put('items', it); renderExport();
}
/* 이 시험(공통 + 고른 선택 과목)의 원 문항을 그대로 시험지 양식으로 */
function exToSheet(){
  const ids = new Set(exRows().map(r=>r.id)), its = K.items.filter(i=>ids.has(i.id));
  shOpenWith({ items: its, form: 'exam', title: EX.name[exKey()] || K.ex.src, vars: false });
}
const exSafeName = s=>String(s || '시험').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
async function exDownloadClass(){
  const rs = exRows(); if(!rs.length){ toast('문항이 없습니다.'); return; }
  try{
    const blob = await SPX.blob(KX.classSheets(rs));
    downloadBlob(`${exSafeName(K.ex.src)}${K.ex.section ? '_' + exSafeName(K.ex.section) : ''}_유형분류표.xlsx`, blob);
    toast('유형 분류표를 내려받았습니다.');
  }catch(e){ toast('⚠ ' + (e.message || e)); }
}
async function exDownloadLms(){
  const rs = exRows(), ck = KX.check(rs);
  if(ck.errors.length && !confirm(`아직 고쳐야 할 것이 ${ck.errors.length}건 있습니다. 이대로 올리면 LMS가 거부할 수 있습니다.\n\n${ck.errors.slice(0, 6).join('\n')}\n\n그래도 파일을 만들까요?`)) return;
  try{
    const key = exKey(), blob = await SPX.blob(KX.lmsSheets(rs, { name: EX.name[key] || K.ex.src, subject: '국어', duration: EX.dur }));
    downloadBlob((KX.ascii(String(EX.file[key] || '').replace(/\.xlsx$/i, '')) || 'korean_exam_template') + '.xlsx', blob);
    toast('LMS 업로드 파일을 내려받았습니다.');
  }catch(e){ toast('⚠ ' + (e.message || e)); }
}
