/* 스터디피크 국어 랩 — 시험지 보관함(학년·학년도·월·종류로 찾기, 기출 달력) · 대시보드 · 통합 검색 · 난도 표시
 * 시험 정보는 지문·문항마다 들어 있는 src { name, kind, year(학년도), month(시행 월), grade(학년) } 를 이름별로 묶어 쓴다(K.exams — app.js buildExams).
 * 시험 정보를 고치면 그 시험의 모든 지문·문항의 src 를 함께 바꾼다. */
'use strict';
const KIND_SHORT = { '수능': '수능', '모의평가': '모평', '학력평가': '학평', '사설 모의고사': '사설', '내신 기출': '내신', 'EBS': 'EBS', '교과서': '교과서', '자체 제작': '자체', '기타': '기타' };
/* 난도 표시: 1 쉬움 ~ 5 최고난도. 정답률이 있으면 함께, 겉모습으로 어림한 값이면 '어림' */
function diffChip(it){
  const d = +it.diff; if(!(d >= 1 && d <= 5)) return '';
  const how = { rule: '배점·유형·지문 길이로 어림한 값', ai: 'AI가 지문과 선지를 읽고 매긴 값', rate: '실제 정답률에서 나온 값', user: '직접 정한 값' }[it.diffBy] || '';
  return `<span class="dchip d${d}" title="${esc(how)}">난도 ${d} ${KT.DIFF_NAMES[d]}${it.rate != null ? ' · 정답률 ' + it.rate + '%' : ''}${it.diffBy === 'rule' ? ' <i style="font-style:normal;font-weight:500;opacity:.7;margin-left:.3em">어림</i>' : ''}</span>`;
}
const examAvgDiff = e=>e.diffN ? (e.diffSum / e.diffN).toFixed(1) : '';
function examsFiltered(){
  const f = K.xf, q = f.q.trim().toLowerCase();
  const list = K.exams.filter(e=>(!f.grade || (f.grade === '-' ? !e.grade : e.grade === f.grade)) && (!f.kind || (f.kind === '-' ? !e.kind : e.kind === f.kind)) && (!f.year || (f.year === '-' ? !e.year : e.year === f.year))
    && (!f.month || String(e.month) === f.month) && (!q || e.name.toLowerCase().includes(q)));
  if(f.sort === 'when') list.sort((a, b)=>(+b.year - +a.year) || (b.month - a.month) || a.name.localeCompare(b.name));
  return list;
}
function examOpen(name){ K.f = Object.assign({}, K.f, { cat: '', q: '', src: name, grade: '', year: '', month: '', sub: '', n: 60 }); go('passages'); }
function examToExport(name){ K.ex = { src: name, section: '' }; go('export'); }
function examToSheet(name){ const e = K.exams.find(x=>x.name === name); K.ex = { src: name, section: e && e.sections.size ? [...e.sections][0] : '' }; exToSheet(); }
function renderExams(){
  const el = $('#view-exams'), f = K.xf, all = K.exams;
  if(!all.length){ el.innerHTML = '<h2>시험지 보관함</h2><div class="card empty">아직 시험지가 없습니다. <b>시험지 올리기</b>에서 PDF를 올리면 학년·학년도·월·종류별로 여기에 정리됩니다.</div>'; return; }
  const cnt = (k, v)=>all.filter(e=>(v === '-' ? !e[k] : String(e[k]) === String(v))).length;
  const chip = (k, v, lab)=>`<span class="chip clk ${f[k] === String(v) ? 'on' : ''}" data-f="${k}:${esc(String(v))}" onclick="K.xf.${k}=K.xf.${k}==='${escJs(String(v))}'?'':'${escJs(String(v))}';K.xf.n=50;renderExams()">${esc(lab)} ${cnt(k, v)}</span>`;
  const years = [...new Set(all.map(e=>e.year).filter(Boolean))].sort((a, b)=>b - a), months = [...new Set(all.map(e=>e.month).filter(Boolean))].sort((a, b)=>a - b);
  const list = examsFiltered(), shown = list.slice(0, f.n);
  el.innerHTML = `
    <div class="spread"><div><h2>시험지 보관함</h2><p class="vd">올린 시험지를 <b>학년 → 학년도 → 시행 월 → 종류</b>로 좁혀 찾습니다. 기출 달력에서는 학년도와 월이 만나는 칸을 누르면 바로 열립니다.</p></div>
      <button class="btn" onclick="go('upload')">시험지 올리기</button></div>
    <div class="card">
      <div class="facet"><b>학년</b>${KT.GRADES.filter(g=>cnt('grade', g)).map(g=>chip('grade', g, g)).join('')}${cnt('grade', '-') ? chip('grade', '-', '미정') : ''}</div>
      <div class="facet"><b>종류</b>${KT.EXAM_KINDS.filter(k=>cnt('kind', k)).map(k=>chip('kind', k, k)).join('')}${cnt('kind', '-') ? chip('kind', '-', '미정') : ''}</div>
      <div class="facet"><b>학년도</b>${years.length > 9 ? `<select id="xf-year" style="width:auto" onchange="K.xf.year=this.value;K.xf.n=50;renderExams()" aria-label="학년도">${optList(years, f.year, '전체')}</select>` : years.map(y=>chip('year', y, y)).join('')}${cnt('year', '-') ? chip('year', '-', '미정') : ''}</div>
      <div class="facet"><b>시행 월</b>${months.map(m=>chip('month', m, m + '월')).join('') || '<span class="hint">월 정보가 있는 시험이 없습니다.</span>'}</div>
      <div class="row" style="margin-top:.5rem"><input id="xf-q" style="width:260px" placeholder="시험 이름 검색 (예: 바탕 10회)" value="${esc(f.q)}" onchange="K.xf.q=this.value;K.xf.n=50;renderExams()" aria-label="시험 이름 검색">
        <select id="xf-sort" style="width:auto" onchange="K.xf.sort=this.value;renderExams()" aria-label="정렬"><option value="">올린 순(최신부터)</option><option value="when" ${f.sort === 'when' ? 'selected' : ''}>시행 순(학년도·월)</option></select>
        <span class="chip clk ${f.tab !== 'cal' ? 'on' : ''}" id="xt-list" onclick="K.xf.tab='list';renderExams()">목록</span><span class="chip clk ${f.tab === 'cal' ? 'on' : ''}" id="xt-cal" onclick="K.xf.tab='cal';renderExams()">기출 달력</span>
        ${f.grade || f.kind || f.year || f.month || f.q ? `<a href="#" class="hint" onclick="K.xf=Object.assign(K.xf,{grade:'',kind:'',year:'',month:'',q:''});renderExams();return false">조건 지우기</a>` : ''}
        <span class="hint" id="xf-count">${list.length}개 / 전체 ${all.length}개</span></div></div>
    ${f.tab === 'cal' ? examCalHtml(list) : `<div class="card"><div class="tblwrap"><table class="tbl" id="x-table"><tr><th>시험</th><th>학년</th><th>학년도</th><th>월</th><th>종류</th><th>지문</th><th>문항</th><th>정답</th><th>분류</th><th>난도</th><th></th></tr>
      ${shown.map(e=>examRowHtml(e)).join('') || '<tr><td colspan="11" class="empty">조건에 맞는 시험지가 없습니다.</td></tr>'}</table></div>
      ${list.length > shown.length ? `<button class="btn ghost more" onclick="K.xf.n+=50;renderExams()">더 보기 (${list.length - shown.length}개 남음)</button>` : ''}</div>`}`;
}
function examRowHtml(e){
  const n = escJs(e.name), bad = !e.year || !e.grade || !e.kind;
  const row = `<tr data-exam="${esc(e.name)}"><td><a href="#" onclick="examOpen('${n}');return false"><b>${esc(e.name)}</b></a>${e.variants ? ` <span class="chip g">변형 ${e.variants}</span>` : ''}${bad ? ' <span class="chip w" title="학년·학년도·종류 가운데 빈 칸이 있어 찾기에서 빠질 수 있습니다 — [정보]에서 채우세요">정보 부족</span>' : ''}</td>
    <td>${esc(e.grade || '—')}</td><td>${esc(e.year || '—')}</td><td>${e.month ? e.month + '월' : '—'}</td><td>${esc(e.kind || '—')}</td><td>${e.passages}</td><td>${e.items}</td>
    <td>${e.items && e.answers === e.items ? '<span class="chip g">완료</span>' : `<span class="chip w">${e.answers}/${e.items}</span>`}</td>
    <td>${e.review ? `<span class="chip w">검토 ${e.review}</span>` : e.items && e.typed === e.items ? '<span class="chip g">완료</span>' : `<span class="chip">${e.typed}/${e.items}</span>`}</td>
    <td>${examAvgDiff(e) ? `<span class="dchip d${Math.round(e.diffSum / e.diffN)}" title="문항 난도의 평균${e.rated ? ' · 실제 정답률 ' + e.rated + '문항' : ' (어림 포함)'}">${examAvgDiff(e)}</span>` : '—'}</td>
    <td style="white-space:nowrap"><a href="#" onclick="examOpen('${n}');return false">지문</a> · <a href="#" onclick="examToExport('${n}');return false">분류·엑셀</a> · <a href="#" onclick="examToSheet('${n}');return false">🖨 시험지</a> · <a href="#" onclick="K.xf.edit=K.xf.edit==='${n}'?'':'${n}';renderExams();return false">정보</a></td></tr>`;
  if(K.xf.edit !== e.name) return row;
  return row + `<tr class="xedit"><td colspan="11"><div class="grid4" id="x-edit">
      <div style="grid-column:span 2"><label for="xe-name">시험 이름</label><input id="xe-name" value="${esc(e.name)}"></div>
      <div><label for="xe-year">학년도</label><input id="xe-year" inputmode="numeric" value="${esc(e.year)}"></div>
      <div><label for="xe-month">시행 월</label><select id="xe-month"><option value="0">(모름)</option>${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>`<option value="${m}" ${e.month === m ? 'selected' : ''}>${m}월</option>`).join('')}</select></div>
      <div><label for="xe-grade">학년</label><select id="xe-grade">${optList(KT.GRADES, e.grade, '(모름)')}</select></div>
      <div><label for="xe-kind">종류</label><select id="xe-kind">${optList(KT.EXAM_KINDS, e.kind, '(모름)')}</select></div></div>
    <div class="row" style="margin-top:.6rem"><button class="btn sm" id="xe-save" onclick="examSave('${n}')">저장</button>
      <button class="btn ghost sm" onclick="$('#xe-name').value=KT.examName({year:$('#xe-year').value,month:+$('#xe-month').value,grade:$('#xe-grade').value,kind:$('#xe-kind').value})" title="학년도·월·종류·학년으로 이름을 같은 규칙으로 맞춥니다">이름을 표준 꼴로</button>
      <button class="btn ghost sm" onclick="K.xf.edit='';renderExams()">닫기</button><span style="flex:1"></span>
      <button class="btn ghost sm" onclick="examDropImages('${n}')" title="글·문항은 그대로 두고 PDF에서 잘라 둔 원본 그림만 지워 저장 공간을 비웁니다">원본 조각 지우기</button>
      <button class="btn danger sm" onclick="examDelete('${n}')">이 시험 삭제</button></div></td></tr>`;
}
/* 기출 달력: 줄 = 학년도, 칸 = 시행 월. 칸 안의 시험을 누르면 그 시험의 지문 목록으로 */
function examCalHtml(list){
  const cols = KT.MONTHS, years = [...new Set(list.map(e=>e.year || ''))].sort((a, b)=>(b || 0) - (a || 0));
  const cell = es=>es.map(e=>`<button class="ex ${e.kind === '수능' ? 'k1' : e.kind === '모의평가' ? 'k2' : ''}" title="${esc(e.name)} — 지문 ${e.passages} · 문항 ${e.items}" onclick="examOpen('${escJs(e.name)}')">${K.xf.grade ? '' : `<small>${esc(e.grade || '')}</small> `}${esc(KIND_SHORT[e.kind] || e.name.slice(0, 6))}</button>`).join('');
  return `<div class="card"><div class="tblwrap"><table class="cal" id="x-cal"><tr><th>학년도</th>${cols.map(m=>`<th>${m === 11 ? '11월·수능' : m + '월'}</th>`).join('')}<th>그 밖</th></tr>
    ${years.map(y=>{ const ys = list.filter(e=>(e.year || '') === y);
      return `<tr><td class="y">${esc(y || '미정')}</td>${cols.map(m=>`<td>${cell(ys.filter(e=>e.month === m))}</td>`).join('')}<td>${cell(ys.filter(e=>!cols.includes(e.month)))}</td></tr>`; }).join('')}</table></div>
    <p class="hint" style="margin-top:.5rem">위의 학년을 고르면 그 학년만 보입니다. <span class="dchip" style="background:var(--gold-soft);color:#6b4f1d">수능</span> <span class="dchip" style="background:#dbe7fb;color:var(--brand-3)">모평</span> <span class="dchip" style="background:var(--brand-100);color:var(--brand-3)">학평·사설·그 밖</span></p></div>`;
}
const examRecords = name=>({ ps: K.passages.filter(p=>p.src && p.src.name === name), is: K.items.filter(i=>i.src && i.src.name === name) });
async function examSave(old){
  if(aiBusyBlock()) return;
  const name = $('#xe-name').value.trim(), src = { name, kind: $('#xe-kind').value, year: ($('#xe-year').value.match(/20\d\d/) || [''])[0], month: +$('#xe-month').value || 0, grade: $('#xe-grade').value };
  if(!name){ toast('시험 이름을 적어 주세요.'); return; }
  if(name !== old && K.exams.some(e=>e.name === name)){ toast('같은 이름의 시험이 이미 있습니다 — 다른 이름을 써 주세요.'); return; }
  const { ps, is } = examRecords(old), now = Date.now();
  for(const r of ps.concat(is)){ r.src = Object.assign({}, src); r.updatedAt = now; }
  await DB.putMany('passages', ps); await DB.putMany('items', is);
  if(K.ex.src === old) K.ex.src = name; if(K.f.src === old) K.f.src = name;
  K.xf.edit = ''; await loadAll(); renderExams(); toast('시험 정보를 저장했습니다.');
}
async function examDropImages(name){
  const { ps, is } = examRecords(name);
  if(!confirm(`"${name}" 의 원본 조각(PDF에서 잘라 둔 그림)을 지울까요?\n글·문항·정답은 그대로 남습니다. 그림이 들어 있던 문항은 [원본 보기]와 인쇄에서 그림이 나오지 않게 됩니다.`)) return;
  let n = 0; for(const r of ps.concat(is)){ if(await DB.get('images', r.id)){ await DB.del('images', r.id); n++; } }
  toast(`원본 조각 ${n}개를 지웠습니다.`); storageFill();
}
async function examDelete(name){
  if(aiBusyBlock()) return;
  const { ps, is } = examRecords(name), pid = new Set(ps.map(p=>p.id)), more = K.items.filter(i=>i.passageId && pid.has(i.passageId) && !is.includes(i));
  if(!confirm(`"${name}" 을(를) 통째로 지울까요?\n지문 ${ps.length}개 · 문항 ${is.length + more.length}개(변형 포함)가 지워집니다. 되돌릴 수 없습니다.`)) return;
  for(const r of ps){ await DB.del('passages', r.id); await DB.del('images', r.id); }
  for(const r of is.concat(more)){ await DB.del('items', r.id); await DB.del('images', r.id); }
  K.xf.edit = ''; await loadAll(); renderExams(); toast('시험을 지웠습니다.');
}

/* ── 대시보드 ── */
const fmtBytes = n=>n > 1e9 ? (n / 1e9).toFixed(1) + 'GB' : n > 1e6 ? Math.round(n / 1e6) + 'MB' : Math.round(n / 1e3) + 'KB';
async function storageFill(){
  const el = $('#st-usage'); if(!el) return;
  try{
    const e = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null, kept = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const imgs = await DB.count('images');
    if($('#st-usage') !== el) return;
    el.innerHTML = e ? `<div class="bar"><span>사용 중</span><i style="width:${Math.max(2, Math.min(100, e.usage / e.quota * 100)).toFixed(1)}%;max-width:55%"></i><b>${fmtBytes(e.usage)}</b> <span class="hint" style="width:auto">/ 쓸 수 있는 공간 ${fmtBytes(e.quota)}</span></div>
      <p class="hint">원본 조각 ${imgs}개 · ${kept ? '이 브라우저가 자료를 지우지 않도록 보호되어 있습니다.' : '브라우저 저장 공간이 모자라면 자료가 지워질 수 있습니다 — <a href="#" onclick="storageKeep();return false">지워지지 않게 보호</a>'}<br>자료는 이 브라우저에만 있습니다. 정기적으로 [백업·설정]에서 백업 파일을 내려받아 두세요.</p>` : '<p class="hint">이 브라우저는 저장 공간 정보를 알려 주지 않습니다.</p>';
  }catch(err){ el.innerHTML = '<p class="hint">저장 공간 정보를 읽지 못했습니다.</p>'; }
}
async function storageKeep(){ try{ const ok = await navigator.storage.persist(); toast(ok ? '보호되었습니다 — 브라우저가 이 자료를 임의로 지우지 않습니다.' : '브라우저가 보호 요청을 받아들이지 않았습니다. 백업을 자주 받아 두세요.'); }catch(e){ toast('이 브라우저에서는 지원하지 않습니다.'); } storageFill(); }
function renderDash(){
  const orig = K.items.filter(i=>!i.variantOf), nVar = K.items.length - orig.length, ex = K.exams;
  const typedN = orig.filter(i=>i.typeId || i.nature).length, reviewN = orig.filter(i=>i.review).length, noAns = orig.filter(i=>!i.answer).length, ruleN = orig.filter(i=>i.typeBy === 'rule').length, noCat = K.passages.filter(p=>!p.cat).length;
  const infoBad = ex.filter(e=>!e.year || !e.grade || !e.kind).length;
  const unsure = K.passages.reduce((s, p)=>s + joinsOf(p), 0) + K.items.filter(i=>!i.passageId).reduce((s, i)=>s + itemJoins(i), 0);
  const bars = (rows, max, wide)=>rows.map(([lab, n, cls])=>`<div class="bar${wide ? ' w' : ''}"><span title="${esc(lab)}">${esc(lab)}</span><i class="${cls || ''}" style="width:${max ? Math.max(1, n / max * 60) : 0}%"></i><b>${n}</b></div>`).join('');
  const byCat = KT.CATS.map(c=>[c, K.passages.filter(p=>p.cat === c).length]).filter(x=>x[1]);
  const byType = KT.TYPES.map(t=>[t.id + ' ' + KT.name(t.id), orig.filter(i=>i.typeId === t.id).length]).filter(x=>x[1]);
  const byDiff = [1, 2, 3, 4, 5].map(d=>[`${d} ${KT.DIFF_NAMES[d]}`, orig.filter(i=>i.diff === d).length, 'd' + d]), rated = orig.filter(i=>i.rate != null).length;
  const gk = KT.GRADES.map(g=>[g, ex.filter(e=>e.grade === g)]).filter(x=>x[1].length);
  const todo = (lab, n, act)=>n ? `<div class="todo" onclick="${act}"><span>${lab}</span><b>${n} →</b></div>` : '';
  const todos = todo('검토 요망 문항 — 유형이 애매한 것', reviewN, "K.fi={q:'',cat:'',kind:'review',type:'',diff:''};go('items')") + todo('정답이 없는 문항', noAns, "K.fi={q:'',cat:'',kind:'noans',type:'',diff:''};go('items')")
    + todo('유형을 어림만 해 둔 문항 — AI 분류 권장', ruleN, "go('export')") + todo('대분류가 없는 지문', noCat, "K.f=Object.assign(K.f,{cat:'-',src:'',q:''});go('passages')")
    + todo('학년·학년도·종류가 빈 시험', infoBad, "K.xf=Object.assign(K.xf,{grade:'',kind:'',year:'',month:'',q:'',tab:'list'});go('exams')") + todo('띄어쓰기 확인할 곳', unsure, "go('passages')");
  $('#view-dash').innerHTML = `
    <h2>국어 문제 DB</h2><p class="vd">시험지를 올려 쌓고, 22유형과 난도로 정리하고, 변형·출력·LMS 엑셀까지 한곳에서 합니다.</p>
    <div class="card"><div class="grid4">
      <div class="stat" style="cursor:pointer" onclick="go('exams')"><span class="hint">시험지</span><b>${ex.length}</b></div>
      <div class="stat" style="cursor:pointer" onclick="go('passages')"><span class="hint">지문·작품</span><b>${K.passages.length}</b></div>
      <div class="stat" style="cursor:pointer" onclick="go('items')"><span class="hint">문항</span><b>${orig.length}</b></div>
      <div class="stat"><span class="hint">변형 문항</span><b>${nVar}</b></div>
      <div class="stat"><span class="hint">유형 분류</span><b>${orig.length ? Math.round(typedN / orig.length * 100) : 0}%</b></div>
      <div class="stat"><span class="hint">실제 정답률 있는 문항</span><b>${rated}</b></div></div>
      <div class="row" style="margin-top:.9rem"><button class="btn" onclick="go('upload')">① 시험지 올리기</button><button class="btn ghost" onclick="go('exams')">② 시험지 보관함</button><button class="btn ghost" onclick="go('export')">③ 유형 분류 · LMS 엑셀</button><button class="btn ghost" onclick="go('passages')">④ 근거·변형</button><button class="btn ghost" onclick="go('sheet')">⑤ 🖨 출력·교재</button></div></div>
    <div class="dgrid">
      <div class="card" id="d-todo"><h3>할 일</h3>${todos || '<p class="hint">정리할 것이 없습니다.</p>'}</div>
      <div class="card" id="d-recent"><h3>최근 올린 시험</h3>${ex.slice(0, 6).map(e=>`<div class="todo" onclick="examOpen('${escJs(e.name)}')"><span>${esc(e.name)} <span class="hint">${esc([e.grade, KIND_SHORT[e.kind]].filter(Boolean).join(' · '))}</span></span><b>문항 ${e.items} →</b></div>`).join('') || '<p class="hint">아직 없습니다 — <a href="#" onclick="go(\'upload\');return false">시험지 올리기</a></p>'}
        ${ex.length > 6 ? `<a href="#" class="hint" onclick="go('exams');return false">보관함 전체 보기 (${ex.length}개) →</a>` : ''}</div>
      ${gk.length ? `<div class="card" id="d-grade"><h3>학년 · 종류별 시험지</h3><div class="tblwrap"><table class="tbl"><tr><th></th>${KT.EXAM_KINDS.filter(k=>ex.some(e=>e.kind === k)).map(k=>`<th>${KIND_SHORT[k]}</th>`).join('')}<th>합</th></tr>
        ${gk.map(([g, es])=>`<tr><td><a href="#" onclick="K.xf=Object.assign(K.xf,{grade:'${g}',kind:'',year:'',month:'',q:''});go('exams');return false"><b>${g}</b></a></td>${KT.EXAM_KINDS.filter(k=>ex.some(e=>e.kind === k)).map(k=>`<td>${es.filter(e=>e.kind === k).length || ''}</td>`).join('')}<td><b>${es.length}</b></td></tr>`).join('')}</table></div></div>` : ''}
      ${byCat.length ? `<div class="card"><h3>대분류별 지문</h3>${bars(byCat, Math.max(...byCat.map(x=>x[1])))}</div>` : ''}
      ${byType.length ? `<div class="card" id="d-type"><h3>유형 분포 (22유형)</h3>${bars(byType, Math.max(...byType.map(x=>x[1])), true)}</div>` : ''}
      ${byDiff.some(x=>x[1]) ? `<div class="card" id="d-diff"><h3>난도 분포</h3>${bars(byDiff, Math.max(...byDiff.map(x=>x[1])))}<p class="hint" style="margin-top:.4rem">실제 정답률에서 나온 난도 ${rated}문항 · 나머지는 어림입니다. 정답률은 [분류표·LMS 엑셀]에서 붙여 넣습니다.</p></div>` : ''}
      <div class="card"><h3>저장 공간</h3><div id="st-usage"><p class="hint">확인 중…</p></div></div>
    </div>`;
  storageFill();
}

/* ── 통합 검색: 시험지 · 지문·작품 · 문항을 한 번에 ── */
function renderSearch(){
  const el = $('#view-search'), q = K.gq.trim().toLowerCase();
  if(!q){ el.innerHTML = '<h2>통합 검색</h2><div class="card empty">위의 검색 칸에 낱말을 넣고 Enter 를 누르세요.</div>'; return; }
  const exs = K.exams.filter(e=>e.name.toLowerCase().includes(q));
  const head = K.passages.filter(p=>[p.title, p.author, p.sub, p.theme, p.genre].join(' ').toLowerCase().includes(q)), hs = new Set(head);
  const body = K.passages.filter(p=>!hs.has(p) && KPDF.plain(p.body).toLowerCase().includes(q));
  const its = K.items.filter(i=>[i.stem, i.view, (i.choices || []).join(' '), i.title || '', i.typeId || '', KT.name(i.typeId)].join(' ').toLowerCase().includes(q));
  const pRow = p=>`<div class="todo" onclick="go('set','${escJs(p.id)}')"><span>${catChip(p)} <b>${esc(p.title || snippet(p.body, 30))}</b> <span class="hint">${esc((p.src && p.src.name) || '')}${p.range && p.range[0] ? ` [${p.range[0]}~${p.range[1]}]` : ''}</span></span><b>→</b></div>`;
  el.innerHTML = `
    <h2>통합 검색</h2><p class="vd">“${esc(K.gq)}” — 시험지 ${exs.length} · 지문·작품 ${head.length + body.length} · 문항 ${its.length}</p>
    <div class="card" id="s-exams"><h3>시험지 ${exs.length}</h3>${exs.slice(0, 12).map(e=>`<div class="todo" onclick="examOpen('${escJs(e.name)}')"><span><b>${esc(e.name)}</b> <span class="hint">${esc([e.grade, e.year, e.month ? e.month + '월' : '', e.kind].filter(Boolean).join(' · '))}</span></span><b>문항 ${e.items} →</b></div>`).join('') || '<p class="hint">없음</p>'}
      ${exs.length > 12 ? `<a href="#" class="hint" onclick="K.xf=Object.assign(K.xf,{q:K.gq,grade:'',kind:'',year:'',month:''});go('exams');return false">보관함에서 모두 보기 →</a>` : ''}</div>
    <div class="card" id="s-passages"><h3>지문·작품 ${head.length + body.length} <span class="hint">제목·작가 ${head.length} · 본문 ${body.length}</span></h3>${head.concat(body).slice(0, 15).map(pRow).join('') || '<p class="hint">없음</p>'}
      ${head.length + body.length > 15 ? `<a href="#" class="hint" onclick="K.f=Object.assign(K.f,{q:K.gq,cat:'',src:'',grade:'',year:'',month:'',sub:''});go('passages');return false">지문·작품에서 모두 보기 →</a>` : ''}</div>
    <div class="card" id="s-items"><h3>문항 ${its.length}</h3>${its.slice(0, 10).map(it=>itemHtml(it, { link: true, explain: false })).join('') || '<p class="hint">없음</p>'}
      ${its.length > 10 ? `<a href="#" class="hint" onclick="K.fi={q:K.gq,cat:'',kind:'',type:'',diff:''};go('items');return false">문제 검색에서 모두 보기 →</a>` : ''}</div>`;
}
