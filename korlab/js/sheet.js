/* 스터디피크 국어 랩 — 학습지: 지문 세트(원 문항 + 변형)를 골라 2단 학습지로 인쇄(브라우저의 인쇄 → PDF 저장)
 * 지문과 문항이 떨어지지 않게 세트 단위로 담고, 번호는 학습지 안에서 1번부터 다시 매긴다. 맨 뒤에 정답·해설(유형·근거 포함) 쪽을 붙일 수 있다.
 * 그림이 들어 있던 지문·문항([그림] 자리)은 글 대신 PDF에서 잘라 둔 원본 조각으로 싣는다. */
'use strict';
const SH = { title: '', src: '', picks: {}, orig: true, vars: true, answers: true, types: false };
function shSets(){
  return K.passages.filter(p=>SH.picks[p.id]).sort((a, b)=>(a.createdAt - b.createdAt) || ((a.range || [0])[0] - (b.range || [0])[0])).map(p=>({ p, items: (SH.orig ? itemsOf(p.id) : []).concat(SH.vars ? variantsOf(p.id) : []) })).filter(s=>s.items.length);
}
const shHasFig = t=>/\[그림\]/.test(t || '');
async function shImgs(id){ const r = await DB.get('images', id); return r && r.imgs && r.imgs.length ? r.imgs.map(u=>`<img src="${esc(u)}" alt="">`).join('') : ''; }
async function shHtml(){
  const sets = shSets(); let n = 0; const key = [];
  const blocks = [];
  for(const { p, items } of sets){
    const from = n + 1, qs = [];
    for(const it of items){
      const no = ++n, figs = shHasFig(it.stem + it.view + (it.choices || []).join('')) ? await shImgs(it.id) : '';
      key.push({ no, it, cat: p.cat || '' });
      if(figs){ qs.push(`<div class="sq"><b>${no}.</b> <span class="hint">(원본)</span><div class="simg">${figs}</div></div>`); continue; }
      qs.push(`<div class="sq"><div class="sstem"><b>${no}.</b> ${kHtml(it.stem).replace(/^<p class="pl">|<\/p>$/g, '')}${it.kind === 'ox' ? ' <span class="sox">( O / X )</span>' : ''}${it.points && it.kind !== 'ox' ? ` [${it.points}점]` : ''}</div>
        ${KPDF.plain(it.view).trim() ? `<div class="sview">${it.viewLabel ? `<div class="svl">&lt;${esc(it.viewLabel)}&gt;</div>` : ''}${kHtml(it.view)}</div>` : ''}
        ${(it.choices || []).map(c=>`<div class="sch">${kHtml(c).replace(/^<p class="pl">|<\/p>$/g, '')}</div>`).join('')}${it.kind === 'essay' ? '<div class="slines"></div>' : ''}</div>`);
    }
    const pimg = shHasFig(p.body) ? await shImgs(p.id) : '';
    blocks.push(`<section class="sset"><div class="shead">[${from}${n > from ? '~' + n : ''}] ${esc(KPDF.plain(p.head) || '다음 글을 읽고 물음에 답하시오.')}</div>
      <div class="spassage">${pimg ? `<div class="simg">${pimg}</div>` : kHtml(p.body, { passage: true })}</div>${qs.join('')}</section>`);
  }
  const ans = SH.answers && key.length ? `<section class="sans"><h2>정답과 해설</h2><table><tr><th>번호</th><th>정답</th>${SH.types ? '<th>유형</th>' : ''}<th>해설 · 근거</th></tr>${key.map(({ no, it, cat })=>`<tr><td>${no}</td>
      <td>${it.kind === 'essay' ? '서술형' : esc(it.answer || '')}</td>${SH.types ? `<td>${esc(it.typeId ? KT.label(it.typeId) : (KT.typed(cat) ? '' : cat))}</td>` : ''}
      <td>${it.kind === 'essay' ? `<b>모범 답안</b> ${esc(it.model || '')}${(it.rubric || []).map(x=>'<br>· ' + esc(x)).join('')}` : esc(KPDF.plain(it.explain || ''))}${it.ev && (it.ev.quotes || []).length ? `<div class="sev">근거: ${it.ev.quotes.map(q=>'“' + esc(q) + '”').join(' / ')}</div>` : ''}</td></tr>`).join('')}</table></section>` : '';
  return { html: `<div class="sheet"><header class="stitle"><b>${esc(SH.title || '국어 학습지')}</b><span>이름 ____________</span></header>${blocks.join('')}${ans}</div>`, sets: sets.length, items: n };
}
function renderSheet(){
  const el = $('#view-sheet'), names = [...new Set(K.passages.map(p=>p.src && p.src.name).filter(Boolean))];
  if(!K.passages.length){ el.innerHTML = '<h2>학습지</h2><div class="card empty">아직 지문이 없습니다. <b>시험지 올리기</b>에서 PDF를 먼저 올려 주세요.</div>'; return; }
  const list = K.passages.filter(p=>!SH.src || (p.src && p.src.name === SH.src)), nPick = K.passages.filter(p=>SH.picks[p.id]).length;
  const tg = (k, lab)=>`<label class="pick" style="display:inline-block;margin-right:.8rem"><input type="checkbox" ${SH[k] ? 'checked' : ''} onchange="SH.${k}=this.checked;renderSheet()"> ${lab}</label>`;
  el.innerHTML = `
    <h2>학습지</h2><p class="vd">지문 세트를 골라 2단 학습지로 만듭니다. [인쇄 · PDF로 저장]을 누르면 인쇄 창이 열리고, 대상에서 <b>PDF로 저장</b>을 고르면 파일이 됩니다. 한글(HWPX) 파일과 수능형 모의고사 양식은 다음 단계입니다.</p>
    <div class="card"><div class="grid4">
      <div style="grid-column:span 2"><label for="sh-title">학습지 제목</label><input id="sh-title" value="${esc(SH.title)}" placeholder="예) 독서 변형 연습 1회" onchange="SH.title=this.value.trim();shPreview()"></div>
      <div><label for="sh-src">출처로 좁히기</label><select id="sh-src" onchange="SH.src=this.value;renderSheet()">${optList(names, SH.src, '전체')}</select></div></div>
      <div style="margin-top:.6rem">${tg('orig', '원 문항')}${tg('vars', '변형 문항')}${tg('answers', '정답·해설 쪽')}${tg('types', '해설 쪽에 유형 표시')}</div>
      <label style="margin-top:.6rem">담을 지문 <a href="#" class="hint" onclick="K.passages.filter(p=>!SH.src||(p.src&&p.src.name===SH.src)).forEach(p=>SH.picks[p.id]=true);renderSheet();return false">보이는 것 모두</a> · <a href="#" class="hint" onclick="SH.picks={};renderSheet();return false">모두 풀기</a></label>
      <div id="sh-list" style="max-height:260px;overflow:auto">${list.map(p=>`<label class="pick"><input type="checkbox" ${SH.picks[p.id] ? 'checked' : ''} onchange="SH.picks['${escJs(p.id)}']=this.checked;renderSheet()"> ${catChip(p)} <b>${esc(p.title || snippet(p.body, 26))}</b> <span class="hint">${esc((p.src && p.src.name) || '')} · 문항 ${itemsOf(p.id).length}${variantsOf(p.id).length ? ' · 변형 ' + variantsOf(p.id).length : ''}</span></label>`).join('')}</div>
      <div class="row" style="margin-top:.8rem"><button class="btn" id="sh-print" onclick="shPrint()" ${nPick ? '' : 'disabled'}>🖨 인쇄 · PDF로 저장${nPick ? ` (지문 ${nPick}개)` : ''}</button><span class="hint" id="sh-count"></span></div></div>
    <div id="sh-preview"></div>`;
  shPreview();
}
async function shPreview(){
  const box = $('#sh-preview'); if(!box) return;
  const r = await shHtml();
  if($('#sh-preview') !== box) return;                         // 그 사이 화면이 바뀌었으면 버림
  box.innerHTML = r.items ? `<div class="card sheet-preview">${r.html}</div>` : '';
  const c = $('#sh-count'); if(c) c.textContent = r.items ? `문항 ${r.items}개` : '지문을 고르면 아래에 미리보기가 나옵니다.';
}
async function shPrint(){
  const r = await shHtml();
  if(!r.items){ toast('담을 문항이 없습니다 — 지문을 고르고 원 문항·변형 문항 가운데 하나는 켜 주세요.'); return; }
  $('#print-root').innerHTML = r.html;
  await Promise.all([...$('#print-root').querySelectorAll('img')].map(i=>i.complete ? null : new Promise(res=>{ i.onload = i.onerror = res; })));
  window.print();
}
