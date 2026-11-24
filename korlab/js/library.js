/* 스터디피크 국어 랩 — 지문·작품 목록, 세트 상세(지문 + 문항), 고치기, 문제 검색 */
'use strict';
function renderPassages(){
  const f = K.f, q = f.q.trim().toLowerCase();
  const srcs = [...new Set(K.passages.map(p=>p.src && p.src.name).filter(Boolean))];
  const list = K.passages.filter(p=>(!f.area || p.area === f.area) && (!f.src || (p.src && p.src.name === f.src))
    && (!q || [p.title, p.genre, p.theme, KPDF.plain(p.body)].join(' ').toLowerCase().includes(q)));
  const cnt = a=>K.passages.filter(p=>p.area === a).length;
  $('#view-passages').innerHTML = `
    <div class="spread"><div><h2>지문·작품</h2><p class="vd">지문 하나에 딸린 문항을 함께 봅니다. 눌러서 세트를 여세요.</p></div>
      <button class="btn" onclick="go('upload')">시험지 올리기</button></div>
    <div class="card"><div class="row">
      <span class="chip clk ${!f.area ? 'on' : ''}" onclick="K.f.area='';renderPassages()">전체 ${K.passages.length}</span>
      ${AREAS.filter(cnt).map(a=>`<span class="chip clk ${f.area === a ? 'on' : ''}" onclick="K.f.area='${a}';renderPassages()">${a} ${cnt(a)}</span>`).join('')}
      ${K.passages.some(p=>!p.area) ? `<span class="chip clk ${f.area === '-' ? 'on' : ''}" onclick="K.f.area='-';renderPassages()">미분류 ${K.passages.filter(p=>!p.area).length}</span>` : ''}
      <span style="flex:1"></span>
      <select id="pf-src" style="width:auto" onchange="K.f.src=this.value;renderPassages()" aria-label="출처"><option value="">출처 전체</option>${srcs.map(s=>`<option ${f.src === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
      <input id="pf-q" style="width:220px" placeholder="제목·작가·본문 검색" value="${esc(f.q)}" onchange="K.f.q=this.value;renderPassages()" aria-label="검색"></div></div>
    ${list.length ? `<div class="pcards">${(f.area === '-' ? list.filter(p=>!p.area) : list).map(p=>{
      const its = itemsOf(p.id), j = joinsOf(p);
      return `<div class="pcard" data-id="${esc(p.id)}" onclick="go('set','${escJs(p.id)}')">
        <div class="row">${p.area ? `<span class="chip g">${esc(p.area)}${p.genre ? ' · ' + esc(p.genre.slice(0, 14)) : ''}</span>` : '<span class="chip w">미분류</span>'}</div>
        <b>${esc(p.title || snippet(p.body, 30) || '(그림 지문)')}</b>
        <span class="ex">${esc(snippet(p.body, 90))}</span>
        <div class="row"><span class="chip">${esc((p.src && p.src.name) || '출처 없음')}${p.range && p.range[0] ? ` [${p.range[0]}~${p.range[1]}]` : ''}</span><span class="chip">문항 ${its.length}</span>${j ? `<span class="chip w">띄어쓰기 ${j}</span>` : ''}</div></div>`;
    }).join('')}</div>` : `<div class="card empty">${K.passages.length ? '조건에 맞는 지문이 없습니다.' : '아직 지문이 없습니다. <b>시험지 올리기</b>에서 PDF를 올려 보세요.'}</div>`}`;
}

function itemHtml(it, opts){
  opts = opts || {};
  const ansNo = KPDF.CIRC.indexOf(String(it.answer || '').trim()[0]);
  return `<div class="qitem" data-id="${esc(it.id)}">
    <div class="row" style="margin-bottom:.3rem"><b>${it.num}.</b>${it.type ? `<span class="chip">${esc(it.type)}</span>` : ''}${it.points ? `<span class="chip">${it.points}점</span>` : ''}
      ${it.answer ? `<span class="chip g">정답 ${esc(it.answer)}</span>` : '<span class="chip w">정답 없음</span>'}${it.oldHangul ? '<span class="chip w" title="옛한글이 들어 있어 글자가 깨져 보일 수 있습니다 — 원본 보기로 확인">옛한글</span>' : ''}
      ${opts.link && it.passageId ? `<a href="#" onclick="go('set','${escJs(it.passageId)}');return false" class="hint">지문 보기 →</a>` : ''}</div>
    <div class="stem ktext">${kHtml(it.stem, opts)}</div>
    ${KPDF.plain(it.view).trim() ? `<div class="view ktext">${it.viewLabel ? `<span class="vl">&lt;${esc(it.viewLabel)}&gt;</span>` : ''}${kHtml(it.view, opts)}</div>` : ''}
    <div class="ktext">${(it.choices || []).map((c, k)=>`<span class="ch ${k === ansNo ? 'ans' : ''}">${kHtml(c, opts).replace(/^<p class="pl">|<\/p>$/g, '')}</span>`).join('')}</div>
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
  const its = itemsOf(p.id), j = joinsOf(p), el = $('#view-set');
  if(K.editing){ renderSetEdit(p, its); return; }
  const o = { joins: true, explain: true, orig: K.showOrig };
  el.innerHTML = `
    <div class="spread" style="margin-bottom:.8rem"><div class="row"><a href="#" onclick="go('passages');return false" class="hint">← 지문·작품</a>
      <b style="font-size:1.1rem">${esc(p.title || snippet(p.body, 30))}</b>${p.area ? `<span class="chip g">${esc(p.area)}${p.genre ? ' · ' + esc(p.genre) : ''}</span>` : ''}
      <span class="chip">${esc((p.src && p.src.name) || '')}${p.range && p.range[0] ? ` [${p.range[0]}~${p.range[1]}]` : ''}</span></div>
      <div class="row">${j ? `<button class="btn sm" id="btn-polish" onclick="polishSet('${escJs(p.id)}')">🤖 띄어쓰기 다듬기 (${j}곳)</button>` : '<span class="chip g">띄어쓰기 확인 끝</span>'}
        <button class="btn ghost sm" onclick="K.showOrig=!K.showOrig;renderSet()">${K.showOrig ? '원본 닫기' : '원본 보기'}</button>
        <button class="btn ghost sm" onclick="K.editing=true;renderSet()">고치기</button>
        <button class="btn danger sm" onclick="deleteSet('${escJs(p.id)}')">삭제</button></div></div>
    ${j ? '<p class="hint" style="margin:-.3rem 0 .7rem">주황 점(<span class="jm">·</span>)은 PDF에서 줄이 바뀌던 자리입니다. 띄어쓰기를 추정한 곳이라 [🤖 띄어쓰기 다듬기]로 한 번에 바로잡거나 [고치기]로 직접 고칠 수 있습니다.</p>' : ''}
    ${p.theme || p.summary ? `<div class="card" style="padding:.7rem 1rem">${p.theme ? `<b>주제</b> ${esc(p.theme)}` : ''}${p.summary ? `<div class="hint" style="margin-top:.2rem">${esc(KPDF.plain(p.summary))}</div>` : ''}</div>` : ''}
    <div class="split">
      <div class="card passage">${p.head ? `<div class="hint" style="font-family:inherit;text-indent:0">[${p.range[0]}~${p.range[1]}] ${esc(KPDF.plain(p.head))}</div>` : ''}${kHtml(p.body, { joins: true, passage: true })}
        ${K.showOrig ? `<div class="orig" data-orig="${esc(p.id)}"></div>` : ''}</div>
      <div class="card">${its.map(it=>itemHtml(it, o)).join('') || '<div class="empty">딸린 문항이 없습니다.</div>'}</div>
    </div>`;
  if(K.showOrig) fillOrig(el);
}
function renderSetEdit(p, its){
  const ta = (id, v, rows)=>`<textarea id="${id}" rows="${rows}">${esc(KPDF.plain(v))}</textarea>`;
  $('#view-set').innerHTML = `
    <div class="spread" style="margin-bottom:.8rem"><b style="font-size:1.1rem">고치기 — ${esc(p.title || '')}</b>
      <div class="row"><button class="btn" onclick="saveSetEdit()">저장</button><button class="btn ghost" onclick="K.editing=false;renderSet()">취소</button></div></div>
    <p class="hint">밑줄은 <code>{u}글{/u}</code>, 상자는 <code>{b}글{/b}</code>, 그림 자리는 <code>[그림]</code> 으로 적습니다. 저장하면 이 세트의 띄어쓰기 추정 표시는 모두 확정됩니다.</p>
    <div class="card"><div class="grid4">
      <div><label for="ed-title">제목</label><input id="ed-title" value="${esc(p.title)}"></div>
      <div><label for="ed-area">영역</label><select id="ed-area"><option value="">미분류</option>${AREAS.map(a=>`<option ${p.area === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div><label for="ed-genre">갈래·제재</label><input id="ed-genre" value="${esc(p.genre)}"></div>
      <div><label for="ed-src">출처</label><input id="ed-src" value="${esc((p.src && p.src.name) || '')}"></div></div>
      <label for="ed-body" style="margin-top:.7rem">지문</label>${ta('ed-body', p.body, 16)}</div>
    ${its.map(it=>`<div class="card" data-edit="${esc(it.id)}"><div class="grid4">
        <div><label>번호</label><input class="e-num" type="number" value="${it.num}"></div>
        <div><label>정답</label><input class="e-ans" value="${esc(it.answer)}"></div>
        <div><label>유형</label><input class="e-type" value="${esc(it.type)}"></div>
        <div><label>배점</label><input class="e-pts" type="number" value="${it.points || ''}"></div></div>
      <label style="margin-top:.6rem">발문</label><textarea class="e-stem" rows="2">${esc(KPDF.plain(it.stem))}</textarea>
      <label style="margin-top:.6rem">&lt;보기&gt;·자료</label><textarea class="e-view" rows="4">${esc(KPDF.plain(it.view))}</textarea>
      <label style="margin-top:.6rem">선택지 (한 줄에 하나)</label><textarea class="e-ch" rows="5">${esc((it.choices || []).map(KPDF.plain).join('\n'))}</textarea>
      <label style="margin-top:.6rem">해설</label><textarea class="e-exp" rows="3">${esc(KPDF.plain(it.explain))}</textarea></div>`).join('')}`;
}
async function saveSetEdit(){
  const p = K.passages.find(x=>x.id === K.cur); if(!p) return;
  Object.assign(p, { title: $('#ed-title').value.trim(), area: $('#ed-area').value, genre: $('#ed-genre').value.trim(), body: $('#ed-body').value, updatedAt: Date.now() });
  p.src = Object.assign({}, p.src, { name: $('#ed-src').value.trim() });
  await DB.put('passages', p);
  for(const box of $$('[data-edit]')){
    const it = K.items.find(i=>i.id === box.dataset.edit); if(!it) continue;
    Object.assign(it, { num: +$('.e-num', box).value || it.num, answer: $('.e-ans', box).value.trim(), type: $('.e-type', box).value.trim(), points: +$('.e-pts', box).value || null,
      stem: $('.e-stem', box).value.trim(), view: $('.e-view', box).value.trim(), choices: $('.e-ch', box).value.split('\n').map(s=>s.trim()).filter(Boolean), explain: $('.e-exp', box).value.trim(), updatedAt: Date.now() });
    await DB.put('items', it);
  }
  K.editing = false; await loadAll(); renderSet(); toast('저장했습니다.');
}
async function deleteSet(id){
  const p = K.passages.find(x=>x.id === id); if(!p) return;
  const its = itemsOf(id);
  if(!confirm(`이 지문과 딸린 문항 ${its.length}개를 지울까요?`)) return;
  for(const it of its){ await DB.del('items', it.id); await DB.del('images', it.id); }
  await DB.del('passages', id); await DB.del('images', id);
  await loadAll(); toast('지웠습니다.'); go('passages');
}

function renderItems(){
  const f = K.fi, q = f.q.trim().toLowerCase();
  const pOf = new Map(K.passages.map(p=>[p.id, p]));
  const list = K.items.filter(it=>{
    const p = it.passageId ? pOf.get(it.passageId) : null, area = p ? p.area : (it.area || '');
    if(f.area && area !== f.area) return false;
    if(f.kind === 'single' && it.passageId) return false;
    if(f.kind === 'noans' && it.answer) return false;
    return !q || [it.stem, it.view, (it.choices || []).join(' '), it.type, it.group, p ? p.title + ' ' + p.genre : ''].join(' ').toLowerCase().includes(q);
  });
  const shown = list.slice(0, 60);
  $('#view-items').innerHTML = `
    <h2>문제 검색</h2><p class="vd">문항을 직접 찾습니다. 지문이 있는 문항은 [지문 보기]로 세트를 엽니다.</p>
    <div class="card"><div class="row">
      <select id="if-area" style="width:auto" onchange="K.fi.area=this.value;renderItems()" aria-label="영역"><option value="">영역 전체</option>${AREAS.map(a=>`<option ${f.area === a ? 'selected' : ''}>${a}</option>`).join('')}</select>
      <select id="if-kind" style="width:auto" onchange="K.fi.kind=this.value;renderItems()" aria-label="종류"><option value="">전체</option><option value="single" ${f.kind === 'single' ? 'selected' : ''}>지문 없는 단독 문항</option><option value="noans" ${f.kind === 'noans' ? 'selected' : ''}>정답 없는 문항</option></select>
      <input id="if-q" style="width:260px" placeholder="발문·선택지·유형 검색" value="${esc(f.q)}" onchange="K.fi.q=this.value;renderItems()" aria-label="검색">
      <span class="hint">${list.length}문항${list.length > shown.length ? ` (앞 ${shown.length}개만 표시)` : ''}</span></div></div>
    <div class="card">${shown.map(it=>itemHtml(it, { link: true, explain: false })).join('') || '<div class="empty">문항이 없습니다.</div>'}</div>`;
}
