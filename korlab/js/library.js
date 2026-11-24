/* 스터디피크 국어 랩 — 지문·작품 목록, 세트 상세(지문 + 문항 + 근거 형광펜 + 변형), 고치기, 문제 검색 */
'use strict';
const VKINDS = { twin: '쌍둥이', shift: '유형 전환', ox: 'OX 분해', essay: '서술형', view: '<보기> 새로 쓰기', newp: '새 지문' };
const catChip = h=>h.cat ? `<span class="chip g">${esc(h.cat)}${h.sub ? ' · ' + esc(h.sub) : ''}</span>` : '<span class="chip w">미분류</span>';
function renderPassages(){
  const f = K.f, q = f.q.trim().toLowerCase();
  const srcs = [...new Set(K.passages.map(p=>p.src && p.src.name).filter(Boolean))];
  const list = K.passages.filter(p=>(!f.cat || (f.cat === '-' ? !p.cat : p.cat === f.cat)) && (!f.src || (p.src && p.src.name === f.src))
    && (!q || [p.title, p.author, p.sub, p.genre, p.theme, KPDF.plain(p.body)].join(' ').toLowerCase().includes(q)));
  const cnt = a=>K.passages.filter(p=>p.cat === a).length, none = K.passages.filter(p=>!p.cat).length;
  $('#view-passages').innerHTML = `
    <div class="spread"><div><h2>지문·작품</h2><p class="vd">지문 하나에 딸린 문항을 함께 봅니다. 눌러서 세트를 여세요.</p></div>
      <button class="btn" onclick="go('upload')">시험지 올리기</button></div>
    <div class="card"><div class="row">
      <span class="chip clk ${!f.cat ? 'on' : ''}" onclick="K.f.cat='';renderPassages()">전체 ${K.passages.length}</span>
      ${KT.CATS.filter(cnt).map(a=>`<span class="chip clk ${f.cat === a ? 'on' : ''}" onclick="K.f.cat='${a}';renderPassages()">${a} ${cnt(a)}</span>`).join('')}
      ${none ? `<span class="chip clk ${f.cat === '-' ? 'on' : ''}" onclick="K.f.cat='-';renderPassages()">미분류 ${none}</span>` : ''}
      <span style="flex:1"></span>
      <select id="pf-src" style="width:auto" onchange="K.f.src=this.value;renderPassages()" aria-label="출처"><option value="">출처 전체</option>${srcs.map(s=>`<option ${f.src === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <input id="pf-q" style="width:220px" placeholder="제목·작가·본문 검색" value="${esc(f.q)}" onchange="K.f.q=this.value;renderPassages()" aria-label="검색"></div></div>
    ${list.length ? `<div class="pcards">${list.map(p=>{
      const its = itemsOf(p.id), j = joinsOf(p), vn = variantsOf(p.id).length, rv = its.filter(i=>i.review).length;
      return `<div class="pcard" data-id="${esc(p.id)}" onclick="go('set','${escJs(p.id)}')">
        <div class="row">${catChip(p)}</div>
        <b>${esc(p.title || snippet(p.body, 30) || '(그림 지문)')}</b>
        <span class="ex">${esc(snippet(p.body, 90))}</span>
        <div class="row"><span class="chip">${esc((p.src && p.src.name) || '출처 없음')}${p.range && p.range[0] ? ` [${p.range[0]}~${p.range[1]}]` : ''}</span><span class="chip">문항 ${its.length}</span>${vn ? `<span class="chip g">변형 ${vn}</span>` : ''}${rv ? `<span class="chip w">검토 ${rv}</span>` : ''}${j ? `<span class="chip w">띄어쓰기 ${j}</span>` : ''}</div></div>`;
    }).join('')}</div>` : `<div class="card empty">${K.passages.length ? '조건에 맞는 지문이 없습니다.' : '아직 지문이 없습니다. <b>시험지 올리기</b>에서 PDF를 올려 보세요.'}</div>`}`;
}

/* 유형 표시: 22유형(R01 …) · 보조 유형 · 화작·매체의 성격 · 검토 요망 */
function typeChips(it, cat){
  const out = [];
  if(it.typeId && KT.has(it.typeId)) out.push(`<span class="chip t" title="${esc(KT.TYPES.find(t=>t.id === it.typeId).d)}">${esc(KT.label(it.typeId))}${(it.subTypes || []).filter(KT.has).map(s=>' + ' + s).join('')}${it.typeBy === 'rule' ? ' <i>어림</i>' : ''}</span>`);
  else if(it.nature) out.push(`<span class="chip" title="화법과 작문·매체는 유형 없이 관리합니다. 이 성격은 LMS 업로드 때 치환에만 씁니다.">${esc(it.nature)}${it.typeBy === 'rule' ? ' <i>어림</i>' : ''}</span>`);
  else if(cat && !KT.typed(cat)) out.push('<span class="chip">유형 없음(' + esc(cat) + ')</span>');
  else if(it.type) out.push(`<span class="chip">${esc(it.type)}</span>`);
  if(it.review) out.push(`<span class="chip w" title="${esc(it.review.why || '')}">검토 요망${it.review.alt ? ' · 대안 ' + esc(it.review.alt) : ''}</span>`);
  return out.join('');
}
function itemHtml(it, opts){
  opts = opts || {};
  const ansNo = KT.ansNo(it.answer) - 1, ev = opts.ev || null, cat = opts.cat != null ? opts.cat : catOfItem(it);
  const ko = Object.assign({}, opts, { spans: null });
  const head = `<div class="row" style="margin-bottom:.3rem"><b>${it.variantOf ? '변형 ' : ''}${it.num}.</b>
      ${ev && ev.has ? `<button class="evdot ev${ev.color}" onclick="focusEv(${+it.num})" title="이 문항의 근거만 보기">근거</button>` : ''}
      ${it.variantOf ? `<span class="chip g">${esc(VKINDS[it.vkind] || '변형')}</span>${it.verify ? `<span class="chip ${it.verify.status === 'pass' ? 'g' : 'w'}" title="${esc((it.verify.notes || []).join(' / '))}">${it.verify.status === 'pass' ? '검증 통과' : '검증 주의'}</span>` : ''}` : ''}
      ${typeChips(it, cat)}${it.points ? `<span class="chip">${it.points}점</span>` : ''}
      ${it.kind === 'essay' ? '' : it.answer ? `<span class="chip ${it.ansBy === 'ai' ? 'w' : 'g'}"${it.ansBy === 'ai' ? ' title="AI가 풀어 채운 정답 — 확인 필요"' : ''}>정답 ${esc(it.answer)}${it.ansBy === 'ai' ? ' (AI)' : ''}</span>` : '<span class="chip w">정답 없음</span>'}${it.oldHangul ? '<span class="chip w" title="옛한글이 들어 있어 글자가 깨져 보일 수 있습니다 — 원본 보기로 확인">옛한글</span>' : ''}
      ${opts.link && it.passageId ? `<a href="#" onclick="go('set','${escJs(it.passageId)}');return false" class="hint">지문 보기 →</a>` : ''}
      ${opts.del ? `<a href="#" onclick="deleteItem('${escJs(it.id)}');return false" class="hint" style="color:var(--danger)">지우기</a>` : ''}</div>`;
  return `<div class="qitem" data-id="${esc(it.id)}">${head}
    <div class="stem ktext">${kHtml(it.stem, ko)}</div>
    ${KPDF.plain(it.view).trim() ? `<div class="view ktext">${it.viewLabel ? `<span class="vl">&lt;${esc(it.viewLabel)}&gt;</span>` : ''}${kHtml(it.view, Object.assign({}, ko, { spans: ev && ev.view }))}</div>` : ''}
    <div class="ktext">${(it.choices || []).map((c, k)=>`<span class="ch ${k === ansNo ? 'ans' : ''}${k === ansNo && ev && ev.has ? ' ev ev' + ev.color : ''}">${kHtml(c, Object.assign({}, ko, { spans: ev && ev.ch[k] })).replace(/^<p class="pl">|<\/p>$/g, '')}</span>`).join('')}</div>
    ${it.kind === 'essay' ? `<div class="exp"><b>모범 답안</b> ${esc(it.model || '')}${(it.rubric || []).length ? `<br><b>채점 기준</b><br>${it.rubric.map(esc).join('<br>')}` : ''}</div>` : ''}
    ${it.vkind && it.ev && (it.ev.quotes || []).length ? `<div class="exp"><b>근거</b> ${it.ev.quotes.map(q=>'“' + esc(q) + '”').join(' · ')}</div>` : ''}
    ${opts.explain && (it.explain || it.wrong) ? `<div class="exp">${it.explain ? `<b>정답 해설</b> ${esc(KPDF.plain(it.explain))}` : ''}${it.wrong ? `<br><b>오답 피하기</b> ${esc(KPDF.plain(it.wrong))}` : ''}</div>` : ''}
    ${opts.orig ? `<div class="orig" data-orig="${esc(it.id)}"></div>` : ''}</div>`;
}
async function fillOrig(root){                               // [원본 보기]: PDF에서 잘라 둔 조각
  for(const el of $$('[data-orig]', root)){
    const rec = await DB.get('images', el.dataset.orig);
    el.innerHTML = rec && rec.imgs.length ? rec.imgs.map(u=>`<img src="${esc(u)}" alt="원본">`).join('') : '<span class="hint">원본 그림이 없습니다.</span>';
  }
}
function renderSet(){
  const p = K.passages.find(x=>x.id === K.cur);
  if(!p){ go('passages'); return; }
  const its = itemsOf(p.id), vars = variantsOf(p.id), j = joinsOf(p), el = $('#view-set');
  if(K.editing){ renderSetEdit(p, its); return; }
  const hasEv = its.some(i=>i.ev && ((i.ev.quotes || []).length || (i.ev.x || []).length)), sp = K.showEv && hasEv ? evSpans(p, its) : { body: [], per: new Map() };
  const o = { joins: true, explain: true, orig: K.showOrig, cat: p.cat || '' }, pid = escJs(p.id);
  el.dataset.focus = '';
  el.innerHTML = `
    <div class="spread" style="margin-bottom:.6rem"><div class="row"><a href="#" onclick="go('passages');return false" class="hint">← 지문·작품</a>
      <b style="font-size:1.1rem">${esc(p.title || snippet(p.body, 30))}</b>${catChip(p)}${p.author ? `<span class="chip">${esc(p.author)}</span>` : ''}
      <span class="chip">${esc((p.src && p.src.name) || '')}${p.range && p.range[0] ? ` [${p.range[0]}~${p.range[1]}]` : ''}</span></div>
      <div class="row"><button class="btn ghost sm" onclick="K.showOrig=!K.showOrig;renderSet()">${K.showOrig ? '원본 닫기' : '원본 보기'}</button>
        <button class="btn ghost sm" onclick="K.editing=true;renderSet()">고치기</button>
        <button class="btn danger sm" onclick="deleteSet('${pid}')">삭제</button></div></div>
    <div class="card toolbar"><div class="row">
      <button class="btn sm" id="btn-classify" onclick="classifySetBtn('${pid}')">🤖 유형 분류</button>
      <button class="btn sm" id="btn-evidence" onclick="evidenceSet('${pid}')">🤖 정답 근거 찾기</button>
      ${hasEv ? `<button class="btn ghost sm" id="btn-evtoggle" onclick="K.showEv=!K.showEv;renderSet()">${K.showEv ? '형광펜 숨기기' : '형광펜 보기'}</button>` : ''}
      <button class="btn sm" id="btn-variant" onclick="K.va.pid='${pid}';K.va.picks={};go('variant')">✨ 변형 만들기</button>
      ${j ? `<button class="btn ghost sm" id="btn-polish" onclick="polishSet('${pid}')">🤖 띄어쓰기 다듬기 (${j}곳)</button>` : '<span class="chip g">띄어쓰기 확인 끝</span>'}</div>
      ${hasEv && K.showEv ? '<p class="hint" style="margin-top:.45rem">문항마다 색이 다릅니다. 정답 선지와 그 근거 문장이 같은 색이고, <span class="xw">빨간 줄</span>은 선지를 틀리게 만든 낱말입니다. 문항의 [근거] 단추를 누르면 그 문항의 근거만 남습니다.</p>' : ''}
      ${j ? '<p class="hint" style="margin-top:.45rem">주황 점(<span class="jm">·</span>)은 PDF에서 줄이 바뀌던 자리입니다. 띄어쓰기를 추정한 곳이라 [🤖 띄어쓰기 다듬기]나 [고치기]로 바로잡을 수 있습니다.</p>' : ''}</div>
    ${p.theme || p.summary ? `<div class="card" style="padding:.7rem 1rem">${p.theme ? `<b>주제</b> ${esc(p.theme)}` : ''}${p.summary ? `<div class="hint" style="margin-top:.2rem">${esc(KPDF.plain(p.summary))}</div>` : ''}</div>` : ''}
    <div class="split">
      <div class="card passage">${p.head ? `<div class="hint" style="font-family:inherit;text-indent:0">${p.range && p.range[0] ? `[${p.range[0]}~${p.range[1]}] ` : ''}${esc(KPDF.plain(p.head))}</div>` : ''}${kHtml(p.body, { joins: true, passage: true, spans: sp.body })}
        ${K.showOrig ? `<div class="orig" data-orig="${esc(p.id)}"></div>` : ''}</div>
      <div><div class="card">${its.map(it=>itemHtml(it, Object.assign({ ev: sp.per.get(it.id) }, o))).join('') || '<div class="empty">딸린 문항이 없습니다.</div>'}</div>
        ${vars.length ? `<div class="card" id="set-variants"><h3>변형 문항 ${vars.length}개</h3>${vars.map(it=>itemHtml(it, { explain: true, cat: p.cat || '', del: true })).join('')}</div>` : ''}</div>
    </div>`;
  if(K.showOrig) fillOrig(el);
}
const optList = (arr, cur, blank)=>(blank != null ? `<option value="">${blank}</option>` : '') + arr.map(v=>`<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
const typeOpts = (cat, cur)=>'<option value="">(미정)</option>' + KT.typesOf(cat).map(t=>`<option value="${t.id}" ${t.id === cur ? 'selected' : ''}>${esc(KT.label(t.id))}</option>`).join('');
function renderSetEdit(p, its){
  const ta = (id, v, rows)=>`<textarea id="${id}" rows="${rows}">${esc(KPDF.plain(v))}</textarea>`, typed = KT.typed(p.cat);
  $('#view-set').innerHTML = `
    <div class="spread" style="margin-bottom:.8rem"><b style="font-size:1.1rem">고치기 — ${esc(p.title || '')}</b>
      <div class="row"><button class="btn" onclick="saveSetEdit()">저장</button><button class="btn ghost" onclick="K.editing=false;renderSet()">취소</button></div></div>
    <p class="hint">밑줄은 <code>{u}글{/u}</code>, 상자는 <code>{b}글{/b}</code>, 그림 자리는 <code>[그림]</code> 으로 적습니다. 저장하면 이 세트의 띄어쓰기 추정 표시는 모두 확정됩니다.
      제목은 LMS 응시 화면에서 학생에게 보입니다 — 문학은 <b>작가 「작품」</b>만, 풀이 힌트는 넣지 마세요.</p>
    <div class="card"><div class="grid4">
      <div><label for="ed-title">지문 제목</label><input id="ed-title" value="${esc(p.title)}"></div>
      <div><label for="ed-author">작성자 (문학만)</label><input id="ed-author" value="${esc(p.author || '')}"></div>
      <div><label for="ed-cat">대분류</label><select id="ed-cat" onchange="$('#ed-sub').innerHTML=optList(KT.subs(this.value),'','(미정)')">${optList(KT.CATS, p.cat, '미분류')}</select></div>
      <div><label for="ed-sub">소분류 (LMS 값)</label><select id="ed-sub">${optList(KT.subs(p.cat), p.sub, '(미정)')}</select></div>
      <div><label for="ed-src">출처</label><input id="ed-src" value="${esc((p.src && p.src.name) || '')}"></div></div>
      <label for="ed-body" style="margin-top:.7rem">지문</label>${ta('ed-body', p.body, 16)}</div>
    ${its.map(it=>`<div class="card" data-edit="${esc(it.id)}"><div class="grid4">
        <div><label>번호</label><input class="e-num" type="number" value="${it.num}"></div>
        <div><label>정답</label><input class="e-ans" value="${esc(it.answer)}"></div>
        <div><label>배점</label><input class="e-pts" type="number" value="${it.points || ''}"></div>
        ${typed ? `<div><label>유형 (22유형)</label><select class="e-type">${typeOpts(p.cat, it.typeId)}</select></div>
        <div><label>보조 유형 (복합일 때)</label><select class="e-sub2">${typeOpts(p.cat, (it.subTypes || [])[0] || '').replace('(미정)', '없음')}</select></div>`
          : `<div><label>성격 (LMS 치환용)</label><select class="e-nat">${optList(KT.naturesOf(p.cat).map(n=>n.n), it.nature, '(미정)')}</select></div>`}
        <div><label>비고</label><input class="e-note" value="${esc(it.note || '')}"></div></div>
      <label style="margin-top:.6rem">발문</label><textarea class="e-stem" rows="2">${esc(KPDF.plain(it.stem))}</textarea>
      <label style="margin-top:.6rem">&lt;보기&gt;·자료</label><textarea class="e-view" rows="4">${esc(KPDF.plain(it.view))}</textarea>
      <label style="margin-top:.6rem">선택지 (한 줄에 하나)</label><textarea class="e-ch" rows="5">${esc((it.choices || []).map(KPDF.plain).join('\n'))}</textarea>
      <label style="margin-top:.6rem">해설</label><textarea class="e-exp" rows="3">${esc(KPDF.plain(it.explain))}</textarea></div>`).join('')}`;
}
/* 사용자가 유형을 직접 고르면 그 값으로 확정(typeBy:user, 검토 표시 지움) */
function setUserType(it, typeId, sub2, nature){
  const changed = (it.typeId || '') !== (typeId || '') || ((it.subTypes || [])[0] || '') !== (sub2 || '') || (it.nature || '') !== (nature || '');
  if(!changed) return false;
  it.typeId = typeId || ''; it.subTypes = sub2 && sub2 !== typeId ? [sub2] : []; it.nature = nature || ''; it.typeBy = 'user'; it.review = null; it.updatedAt = Date.now();
  return true;
}
async function saveSetEdit(){
  const p = K.passages.find(x=>x.id === K.cur); if(!p) return;
  const cat = $('#ed-cat').value, sub = $('#ed-sub').value, title = $('#ed-title').value.trim(), catChanged = cat !== (p.cat || '');
  if(catChanged || sub !== (p.sub || '') || title !== (p.title || '')) p.clsBy = 'user';
  Object.assign(p, { title, author: $('#ed-author').value.trim(), cat, sub, body: $('#ed-body').value, updatedAt: Date.now() });
  p.src = Object.assign({}, p.src, { name: $('#ed-src').value.trim() });
  await DB.put('passages', p);
  for(const box of $$('[data-edit]')){
    const it = K.items.find(i=>i.id === box.dataset.edit); if(!it) continue;
    const oldBody = [it.stem, it.view, (it.choices || []).join('\n')].map(KPDF.plain).join('|');
    if($('.e-ans', box).value.trim() !== (it.answer || '')){ delete it.ansBy; delete it.ansAi; }
    Object.assign(it, { num: +$('.e-num', box).value || it.num, answer: $('.e-ans', box).value.trim(), points: +$('.e-pts', box).value || null, note: $('.e-note', box).value.trim(),
      stem: $('.e-stem', box).value.trim(), view: $('.e-view', box).value.trim(), choices: $('.e-ch', box).value.split('\n').map(s=>s.trim()).filter(Boolean), explain: $('.e-exp', box).value.trim(), updatedAt: Date.now() });
    if(catChanged){ it.typeId = ''; it.subTypes = []; it.nature = ''; it.review = null; it.typeBy = ''; const g = KT.guess({ stem: it.stem, view: it.view, viewLabel: it.viewLabel, solType: it.type }, cat); it.typeId = g.id || ''; it.nature = g.nature || ''; it.typeBy = 'rule'; }
    else if($('.e-type', box)) setUserType(it, $('.e-type', box).value, $('.e-sub2', box).value, '');
    else if($('.e-nat', box)) setUserType(it, '', '', $('.e-nat', box).value);
    if(it.ev && oldBody !== [it.stem, it.view, it.choices.join('\n')].join('|')) delete it.ev;      // 글이 바뀌면 근거 표시는 다시 찾아야 한다
    await DB.put('items', it);
  }
  K.editing = false; await loadAll(); renderSet(); toast('저장했습니다.');
}
async function deleteSet(id){
  const p = K.passages.find(x=>x.id === id); if(!p) return;
  const its = K.items.filter(i=>i.passageId === id);
  if(!confirm(`이 지문과 딸린 문항 ${its.length}개(변형 포함)를 지울까요?`)) return;
  for(const it of its){ await DB.del('items', it.id); await DB.del('images', it.id); }
  await DB.del('passages', id); await DB.del('images', id);
  await loadAll(); toast('지웠습니다.'); go('passages');
}
async function deleteItem(id){
  if(!confirm('이 문항을 지울까요?')) return;
  await DB.del('items', id); await DB.del('images', id); await loadAll();
  if(K.view === 'set') renderSet(); else if(K.view === 'items') renderItems(); else if(K.view === 'variant') renderVariant();
  toast('지웠습니다.');
}

function renderItems(){
  const f = K.fi, q = f.q.trim().toLowerCase();
  const pOf = new Map(K.passages.map(p=>[p.id, p]));
  const catOf = it=>{ const p = it.passageId ? pOf.get(it.passageId) : null; return p ? p.cat || '' : it.cat || ''; };
  const list = K.items.filter(it=>{
    const p = it.passageId ? pOf.get(it.passageId) : null;
    if(f.cat && catOf(it) !== f.cat) return false;
    if(f.type && it.typeId !== f.type && !(it.subTypes || []).includes(f.type)) return false;
    if(f.kind === 'single' && it.passageId) return false;
    if(f.kind === 'noans' && it.answer) return false;
    if(f.kind === 'review' && !it.review) return false;
    if(f.kind === 'variant' && !it.variantOf) return false;
    return !q || [it.stem, it.view, (it.choices || []).join(' '), it.type, it.typeId, KT.name(it.typeId), it.nature, it.group, p ? p.title + ' ' + p.genre + ' ' + (p.author || '') : it.title || ''].join(' ').toLowerCase().includes(q);
  });
  const shown = list.slice(0, 60), kinds = [['', '전체'], ['single', '지문 없는 단독 문항'], ['noans', '정답 없는 문항'], ['review', '검토 요망'], ['variant', '변형 문항']];
  $('#view-items').innerHTML = `
    <h2>문제 검색</h2><p class="vd">문항을 직접 찾습니다. 유형(22유형)으로 좁힐 수 있고, 지문이 있는 문항은 [지문 보기]로 세트를 엽니다.</p>
    <div class="card"><div class="row">
      <select id="if-cat" style="width:auto" onchange="K.fi.cat=this.value;K.fi.type='';renderItems()" aria-label="대분류">${optList(KT.CATS, f.cat, '대분류 전체')}</select>
      <select id="if-type" style="width:auto" onchange="K.fi.type=this.value;renderItems()" aria-label="유형"><option value="">유형 전체</option>${(f.cat ? KT.typesOf(f.cat) : KT.TYPES).map(t=>`<option value="${t.id}" ${f.type === t.id ? 'selected' : ''}>${esc(KT.label(t.id))}</option>`).join('')}</select>
      <select id="if-kind" style="width:auto" onchange="K.fi.kind=this.value;renderItems()" aria-label="종류">${kinds.map(([v, l])=>`<option value="${v}" ${f.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input id="if-q" style="width:240px" placeholder="발문·선택지·유형·작품 검색" value="${esc(f.q)}" onchange="K.fi.q=this.value;renderItems()" aria-label="검색">
      <span class="hint">${list.length}문항${list.length > shown.length ? ` (앞 ${shown.length}개만 표시)` : ''}</span></div></div>
    <div class="card">${shown.map(it=>itemHtml(it, { link: true, explain: false, cat: catOf(it) })).join('') || '<div class="empty">문항이 없습니다.</div>'}</div>`;
}
