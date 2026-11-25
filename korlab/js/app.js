/* 스터디피크 국어 랩 — 뼈대: 저장소 · 화면 전환 · 표시 문법 그리기 · 대시보드 · 백업·설정
 * 데이터: IndexedDB 'sp-korlab' — passages(지문) · items(문항) · images(원본 조각, 주인 id 로 찾음) · sheets(학습지, 예정)
 *   지문 { id, title, author, cat(대분류), sub(소분류 — LMS 값), genre(해설지 갈래 글자), body, head, range:[from,to], section, src:{name,kind,year,grade}, summary, theme, batch, createdAt, updatedAt }
 *   문항 { id, passageId|null, num, section, group, stem, view, viewLabel, choices[], answer, explain, wrong, points, src, batch, createdAt, updatedAt,
 *          typeId(22유형 ID, 화작·매체는 '') · subTypes[](복합 유형의 보조) · nature(화작·매체의 성격 — LMS 치환용) · typeBy('rule'|'ai'|'user') · review{alt,why}|null(검토 요망) · note(비고)
 *          type(해설지가 붙인 유형 이름, 참고용) · 단독 문항만: cat, sub, title
 *          ev{quotes[], x[[선지번호, 낱말]], neg}(정답 근거) · 변형 문항만: variantOf, vkind, kind('ox'|'essay'), model, rubric[], verify{} }
 * 분류값은 ktype.js(KT)의 목록에 있는 것만 쓴다 — 마스터에 없는 유형은 만들지 않는다.
 * 본문 표시 문법: {u}밑줄{/u} · {b}상자{/b} · [그림] · 줄바꿈 = 문단/행 · 줄 이음 추정 표시(\uE000 붙임, \uE001 띄움 — KPDF.plain 으로 걷어 냄) */
'use strict';
const { $, $$, esc, escJs, uid, toast, downloadBlob, lsJson, fmtDate } = SP;
const KCFG = Object.assign({ cmap: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/', worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' }, window.KCFG || {});
const DB = SP.openDB('sp-korlab', 1, ['passages', 'items', 'images', 'sheets']);
const K = { passages: [], items: [], view: 'dash', cur: null, f: { cat: '', q: '', src: '' }, fi: { q: '', cat: '', kind: '', type: '' }, showOrig: false, showEv: true, editing: false, ex: { src: '', section: '' }, va: { pid: '', picks: {}, kind: 'twin', n: 1, results: [], log: [] } };
const SRC_KINDS = ['수능·모의평가', '학력평가', '내신 기출', '교과서', 'EBS', '자체 제작', '기타'];
const VIEW_TITLES = { dash: '대시보드', passages: '지문·작품', set: '지문·작품', upload: '시험지 올리기', items: '문제 검색', variant: '변형 만들기', export: '분류표·LMS 엑셀', sheet: '학습지', data: '백업·설정' };

const LMSOPT_KEY = 'sp-korlab-lmsopt';
function loadLmsOpt(){ const o = lsJson(LMSOPT_KEY, {}) || {}; for(const k in KT.OPT_CHOICES) if(KT.OPT_CHOICES[k].includes(o[k])) KT.opt[k] = o[k]; }
/* 예전 저장분(area: 독서·문학·화법·작문·언어·매체) → 대분류·소분류 */
function migrateRecord(r){
  if(r.cat != null) return false;
  const c = KT.catOf(r.area) || { cat: '', sub: '' };
  r.cat = c.cat; r.sub = c.sub || (c.cat ? KT.subOf(c.cat, r.genre, r.title) : ''); delete r.area;
  return true;
}
async function loadAll(){
  loadLmsOpt();
  const ps0 = await DB.all('passages'), is0 = await DB.all('items');
  const mp = ps0.filter(migrateRecord), mi = is0.filter(i=>!i.passageId && migrateRecord(i));
  if(mp.length) await DB.putMany('passages', mp); if(mi.length) await DB.putMany('items', mi);
  K.passages = ps0.sort((a, b)=>(b.createdAt - a.createdAt) || ((a.range || [0])[0] - (b.range || [0])[0]));
  K.items = is0.sort((a, b)=>(a.createdAt - b.createdAt) || (a.num - b.num));
  $('#n-passages').textContent = K.passages.length; $('#n-items').textContent = K.items.length;
}
const itemsOf = pid=>K.items.filter(i=>i.passageId === pid && !i.variantOf).sort((a, b)=>a.num - b.num);      // 원래 문항만
const variantsOf = pid=>K.items.filter(i=>i.passageId === pid && i.variantOf).sort((a, b)=>(a.num - b.num) || (a.createdAt - b.createdAt));
const catOfItem = it=>{ const p = it.passageId ? K.passages.find(x=>x.id === it.passageId) : null; return p ? p.cat || '' : it.cat || ''; };
const srcNames = ()=>[...new Set(K.passages.map(p=>p.src && p.src.name).concat(K.items.map(i=>i.src && i.src.name)).filter(Boolean))];
const joinsOf = p=>KPDF.joinCount(p.body) + KPDF.joinCount(p.summary) + itemsOf(p.id).reduce((s, i)=>s + itemJoins(i), 0);
const itemJoins = i=>KPDF.joinCount(i.stem) + KPDF.joinCount(i.view) + KPDF.joinCount(i.explain) + KPDF.joinCount(i.wrong) + (i.choices || []).reduce((a, c)=>a + KPDF.joinCount(c), 0);

/* 표시 문법 → HTML. opts.joins: 줄 이음 추정 자리를 주황 점으로 보여 줌(검수용) */
function kHtml(text, opts){
  opts = opts || {};
  let t = String(text || '');
  if(opts.spans && opts.spans.length) t = KEV.mark(t, opts.spans);       // 형광펜·X 자리(원문 기준이라 맨 먼저)
  t = opts.joins ? t.replace(/\uE000/g, '\uE010').replace(/\uE001/g, ' \uE010') : KPDF.plain(t);
  // [A] 구간 {[:A}…{/[} 은 따로 떨어진 덩어리로 그린다. 문단 가운데서 시작·끝나면 그 자리에서 나누고(\uE015 = 이어지는 조각, 들여쓰기 없음)
  t = t.replace(/(\n?)[ \uE010]*\{\[:([^{}\n]{1,4})\}/g, (m, nl, lab, at)=>'\n\uE012' + lab + '\uE013' + (nl || at === 0 ? '' : '\uE015'))
    .replace(/\{\/\[\}[ \uE010]*(\n?)/g, (m, nl)=>'\uE014\n' + (nl ? '' : '\uE015')).replace(/^\n/, '').replace(/\n\uE015?$/, '');
  let open = false; const out = [];
  for(let line of t.split('\n')){
    let lab = null, end = false, cont = false;
    const m = line.match(/^\uE012([^\uE013]*)\uE013/); if(m){ lab = m[1]; line = line.slice(m[0].length); }
    if(line[0] === '\uE015'){ cont = true; line = line.slice(1); }
    if(line.endsWith('\uE014')){ end = true; line = line.slice(0, -1); }
    let h = esc(line).replace(/\{u\}/g, '<u>').replace(/\{\/u\}/g, '</u>').replace(/\{b\}/g, '<span class="bx">').replace(/\{\/b\}/g, '</span>')
      .replace(/\[그림\]/g, '<span class="figph">그림 — [원본 보기]에서 확인</span>').replace(/\uE010/g, '<span class="jm" title="줄이 바뀌던 자리 — 띄어쓰기 추정">·</span>');
    h = KEV.html(h);
    const prose = opts.passage && KPDF.plain(stripTok(line)).length > 45;
    if(lab != null){ if(open) out.push('</div>'); out.push(`<div class="brk"><span class="brl">[${esc(lab)}]</span>`); open = true; }
    out.push(`<p class="pl${prose ? ' prose' : ''}${cont ? ' cont' : ''}">${h || '&nbsp;'}</p>`);
    if(end && open){ out.push('</div>'); open = false; }
  }
  if(open) out.push('</div>');
  return out.join('');
}
const BR_TOK = /\{\[:[^{}\n]{1,4}\}|\{\/\[\}/g;                 // [A] 구간 표시
const stripTok = t=>t.replace(/\{hn#\d+#\d+\}|\{h\d+#[\d,]+\}|\{\/h\}|\{\/?x\}/g, '');
const snippet = (t, n)=>KPDF.plain(t).replace(BR_TOK, ' ').replace(/\{\/?[ub]\}/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 80);

function go(view, arg){
  K.view = view; if(view === 'set') K.cur = arg;
  $$('#sbnav button').forEach(b=>b.classList.toggle('active', b.dataset.view === (view === 'set' ? 'passages' : view)));
  $$('.view').forEach(v=>v.classList.toggle('active', v.id === 'view-' + view));
  $('#topbar-title').textContent = VIEW_TITLES[view] || '';
  $('#sidebar').classList.remove('open');
  if(view === 'dash') renderDash();
  if(view === 'passages') renderPassages();
  if(view === 'set') renderSet();
  if(view === 'upload') renderUpload();
  if(view === 'items') renderItems();
  if(view === 'export') renderExport();
  if(view === 'variant') renderVariant();
  if(view === 'sheet') renderSheet();
  if(view === 'data') renderData();
  window.scrollTo({ top: 0 });
}
$('#sbnav').addEventListener('click', e=>{ const b = e.target.closest('button[data-view]'); if(b) go(b.dataset.view); });
$('#menu-btn').addEventListener('click', ()=>$('#sidebar').classList.toggle('open'));
function busy(label){ const b = $('#busy'); if(label){ $('#busy-label').textContent = label; b.style.display = 'flex'; } else b.style.display = 'none'; }

function renderDash(){
  const byArea = KT.CATS.map(a=>[a, K.passages.filter(p=>p.cat === a).length]).filter(x=>x[1]);
  const orig = K.items.filter(i=>!i.variantOf), typedN = orig.filter(i=>i.typeId || i.nature).length, reviewN = orig.filter(i=>i.review).length;
  const unsure = K.passages.reduce((s, p)=>s + joinsOf(p), 0) + K.items.filter(i=>!i.passageId).reduce((s, i)=>s + itemJoins(i), 0);
  $('#view-dash').innerHTML = `
    <h2>지문 하나로 쌓고, 바꾸고, 검증하는 국어 문제 DB</h2>
    <p class="vd">시험지 PDF를 올리면 지문과 문항을 자동으로 나눠 저장합니다. 글자는 PDF 그대로, 밑줄·상자도 함께 옮깁니다.</p>
    <div class="card"><div class="grid4">
      <div class="stat"><span class="hint">지문·작품</span><b>${K.passages.length}</b></div>
      <div class="stat"><span class="hint">문항 (변형 ${K.items.length - orig.length})</span><b>${orig.length}</b></div>
      <div class="stat"><span class="hint">유형 분류된 문항</span><b>${typedN}</b></div>
      <div class="stat"><span class="hint">검토 요망</span><b>${reviewN}</b></div>
      <div class="stat"><span class="hint">정답 있는 문항</span><b>${orig.filter(i=>i.answer).length}</b></div>
      <div class="stat"><span class="hint">띄어쓰기 확인할 곳</span><b>${unsure}</b></div>
    </div>${byArea.length ? `<div class="row" style="margin-top:.8rem">${byArea.map(([a, n])=>`<span class="chip">${a} ${n}</span>`).join('')}</div>` : ''}</div>
    <div class="card"><h3>시작하기</h3>
      <div class="row"><button class="btn" onclick="go('upload')">① 시험지 올리기</button><button class="btn ghost" onclick="go('export')">② 유형 분류 · LMS 엑셀</button><button class="btn ghost" onclick="go('passages')">③ 지문에서 근거·변형</button></div>
      <p class="hint" style="margin-top:.7rem">시험지 PDF(+ 정답·해설 PDF)를 올리면 지문·문항으로 나뉘고, <b>22유형</b>(독서 R01~R09 · 문학 L01~L08 · 문법 G01~G05)으로 먼저 분류됩니다.
      [분류표·LMS 엑셀]에서 AI 분류로 다듬고 유형 분류표와 스터디피크 LMS 업로드 파일을 내려받습니다. 세트 화면에서는 정답 근거 형광펜과 변형 문제를 만듭니다.<br>
      다음 단계: 학습지·한글 파일, 스캔본·캡처 읽기, 기기 간 동기화.</p></div>
    ${typedN ? `<div class="card"><h3>유형 분포 (전체 DB)</h3><div class="row">${KT.TYPES.map(t=>[t, orig.filter(i=>i.typeId === t.id).length]).filter(x=>x[1]).map(([t, n])=>`<span class="chip" title="${esc(KT.name(t.id))}">${t.id} ${n}</span>`).join('')}</div></div>` : ''}`;
}

function renderData(){
  const st = SPAI.settings();
  $('#view-data').innerHTML = `
    <h2>백업·설정</h2><p class="vd">국어 랩의 자료는 지금 이 브라우저에만 저장됩니다. 기기 간 동기화는 다음 단계에서 붙입니다 — 그때까지는 백업 파일로 옮기세요.</p>
    <div class="card"><h3>AI 설정</h3>
      <p class="hint" style="margin-bottom:.6rem">수학 랩에서 저장한 API 키·모델을 그대로 씁니다(같은 사이트라 함께 쓰임). 여기서 바꾸면 수학 랩에도 적용됩니다.</p>
      <div class="grid4"><div><label for="ai-key">Claude API 키</label><input id="ai-key" type="password" value="${esc(st.key)}" placeholder="sk-ant-…"></div>
      <div><label for="ai-model">기본 모델</label><input id="ai-model" value="${esc(st.model)}"></div></div>
      <div class="row" style="margin-top:.6rem"><button class="btn sm" onclick="saveAiSettings()">저장</button><span class="hint">${st.key ? '키가 저장되어 있습니다.' : '키가 없습니다 — AI 다듬기를 쓰려면 넣어 주세요.'}</span></div></div>
    <div class="card"><h3>LMS 표기 설정</h3>
      <p class="hint" style="margin-bottom:.6rem">스터디피크 LMS에 등록된 글자와 한 글자라도 다르면 업로드가 거부됩니다. 아래 네 가지는 아직 확정되지 않은 표기라 바꿀 수 있게 두었습니다 — 업로드가 통과한 값으로 맞추세요.</p>
      <div class="grid4">${[['drama', '문학 소분류 (극·수필)'], ['dash', 'R06·R07 유형명의 대시'], ['hwaMix', '화법+작문 소분류'], ['mediaLang', '매체 언어 분석 치환 코드']].map(([k, lab])=>`<div><label for="lo-${k}">${lab}</label><select id="lo-${k}" onchange="saveLmsOpt()">${KT.OPT_CHOICES[k].map(v=>`<option value="${esc(v)}" ${KT.opt[k] === v ? 'selected' : ''}>${k === 'dash' ? esc('<보기> 적용' + v + '줄글 사례') : esc(v)}</option>`).join('')}</select></div>`).join('')}</div></div>
    <div class="card"><h3>백업</h3>
      <div class="row"><button class="btn" onclick="exportBackup(false)">백업 내려받기 (글만)</button><button class="btn ghost" onclick="exportBackup(true)">원본 그림 포함</button>
      <button class="btn ghost" onclick="$('#imp').click()">백업 가져오기</button><input id="imp" type="file" accept=".json,application/json" style="display:none" onchange="importBackup(this.files[0]);this.value=''"></div></div>
    <div class="card"><h3 style="color:var(--danger)">전체 삭제</h3><button class="btn danger" onclick="wipeAll()">국어 랩 자료 모두 지우기</button></div>`;
}
function saveAiSettings(){
  const k = $('#ai-key').value.trim(), m = $('#ai-model').value.trim();
  if(k) localStorage.setItem('sp-lab-apikey', k); else localStorage.removeItem('sp-lab-apikey');
  if(m) localStorage.setItem('sp-lab-aimodel', m);
  toast('AI 설정을 저장했습니다.'); renderData();
}
async function saveLmsOpt(){
  const o = {}, before = Object.assign({}, KT.opt);
  for(const k in KT.OPT_CHOICES){ const el = $('#lo-' + k); if(el) o[k] = el.value; }
  localStorage.setItem(LMSOPT_KEY, JSON.stringify(o)); loadLmsOpt();
  const fix = r=>{ let ch = false; for(const k of ['drama', 'hwaMix']) if(before[k] !== KT.opt[k] && r.sub === before[k]){ r.sub = KT.opt[k]; ch = true; } return ch; };   // 저장된 소분류 글자도 함께 바꿈
  const ps = K.passages.filter(fix), is = K.items.filter(fix);
  if(ps.length) await DB.putMany('passages', ps); if(is.length) await DB.putMany('items', is);
  toast('LMS 표기 설정을 저장했습니다.');
}
async function exportBackup(withImages){
  const data = { app: 'sp-korlab', version: 2, exportedAt: Date.now(), passages: K.passages, items: K.items, images: withImages ? await DB.all('images') : [] };
  downloadBlob(`스터디피크_국어랩_백업_${fmtDate(Date.now()).replace(/\./g, '')}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
}
const IMG_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const cleanId = v=>String(v == null ? '' : v).replace(/[^\w.-]/g, '');
const STR_P = ['title', 'author', 'genre', 'body', 'head', 'section', 'summary', 'theme', 'batch'], STR_I = ['section', 'group', 'stem', 'view', 'viewLabel', 'answer', 'explain', 'wrong', 'type', 'batch', 'title', 'author', 'note', 'model'];
const cleanCat = (o, r)=>{ const c = KT.CATS.includes(r.cat) ? r.cat : ((KT.catOf(r.area) || {}).cat || ''); o.cat = c; o.sub = KT.subs(c).includes(r.sub) ? r.sub : ((r.cat == null && (KT.catOf(r.area) || {}).sub) || ''); };
const strArr = (a, n)=>(Array.isArray(a) ? a : []).slice(0, n || 50).map(String);
function cleanRecord(r, strKeys){                            // 남이 준 백업도 안전하게: id 는 [\w.-], 글 칸은 글자, 나머지 모양은 앱이 만드는 대로만
  const o = { id: cleanId(r.id) || uid(), createdAt: +r.createdAt || Date.now(), updatedAt: +r.updatedAt || Date.now() };
  for(const k of strKeys) o[k] = r[k] == null ? '' : String(r[k]);
  const s = r.src && typeof r.src === 'object' ? r.src : {};
  o.src = { name: String(s.name || ''), kind: String(s.kind || ''), year: String(s.year || ''), grade: String(s.grade || '') };
  return o;
}
async function importBackup(file){
  if(!file) return;
  try{
    const d = JSON.parse(await file.text());
    if(!d || d.app !== 'sp-korlab' || !Array.isArray(d.passages) || !Array.isArray(d.items)) throw new Error('국어 랩 백업 파일이 아닙니다');
    const ps = d.passages.map(p=>{ const o = cleanRecord(p, STR_P); if(p.clsBy === 'user' || p.clsBy === 'ai') o.clsBy = p.clsBy; if(p.madeFrom) o.madeFrom = cleanId(p.madeFrom); o.range = Array.isArray(p.range) ? p.range.slice(0, 2).map(n=>+n || 0) : [0, 0]; o.oldHangul = !!p.oldHangul; cleanCat(o, p); return o; });
    const is = d.items.map(i=>{ const o = cleanRecord(i, STR_I); o.passageId = i.passageId ? cleanId(i.passageId) : null; o.num = +i.num || 0; o.points = i.points == null ? null : +i.points || null;
      o.choices = Array.isArray(i.choices) ? i.choices.map(String) : []; o.oldHangul = !!i.oldHangul;
      if(!o.passageId){ cleanCat(o, i); if(i.clsBy === 'user' || i.clsBy === 'ai') o.clsBy = i.clsBy; }                         // 분류값은 목록에 있는 것만 받는다
      o.typeId = KT.has(i.typeId) ? i.typeId : ''; o.subTypes = strArr(i.subTypes, 4).filter(KT.has); o.nature = KT.NATURES.some(n=>n.n === i.nature) ? i.nature : '';
      o.typeBy = ['rule', 'ai', 'user'].includes(i.typeBy) ? i.typeBy : ''; o.review = i.review && typeof i.review === 'object' ? { alt: String(i.review.alt || ''), why: String(i.review.why || '') } : null;
      if(i.ansBy === 'ai') o.ansBy = 'ai'; if(+i.ansAi >= 1 && +i.ansAi <= 5) o.ansAi = +i.ansAi;
      if(i.ev && typeof i.ev === 'object') o.ev = { quotes: strArr(i.ev.quotes, 12), x: (Array.isArray(i.ev.x) ? i.ev.x : []).slice(0, 12).filter(Array.isArray).map(v=>[+v[0] || 0, String(v[1] || '')]), neg: !!i.ev.neg };
      if(i.variantOf || i.vkind){ if(i.variantOf) o.variantOf = cleanId(i.variantOf); o.vkind = String(i.vkind || '').replace(/[^a-z]/g, ''); o.kind = ['ox', 'essay'].includes(i.kind) ? i.kind : '';
        o.rubric = strArr(i.rubric, 12); o.verify = i.verify && typeof i.verify === 'object' ? { status: String(i.verify.status || '').replace(/[^a-z]/g, ''), notes: strArr(i.verify.notes, 12) } : null; }
      return o; });
    const imgs = (Array.isArray(d.images) ? d.images : []).map(x=>({ id: cleanId(x.id), imgs: (Array.isArray(x.imgs) ? x.imgs : []).filter(u=>typeof u === 'string' && IMG_RE.test(u)) })).filter(x=>x.id && x.imgs.length);
    await DB.putMany('passages', ps); await DB.putMany('items', is); if(imgs.length) await DB.putMany('images', imgs);
    await loadAll(); toast(`지문 ${ps.length}개 · 문항 ${is.length}개를 가져왔습니다.`); go('passages');
  }catch(e){ toast('가져오기 실패: ' + (e.message || e)); }
}
async function wipeAll(){
  if(!confirm('국어 랩의 지문·문항을 모두 지울까요? 되돌릴 수 없습니다. 먼저 백업을 내려받으세요.')) return;
  for(const s of ['passages', 'items', 'images', 'sheets']) await DB.clear(s);
  await loadAll(); toast('모두 지웠습니다.'); go('dash');
}
window.addEventListener('DOMContentLoaded', async ()=>{
  if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = KCFG.worker;
  await loadAll(); go('dash'); window.__korReady = true;
});
