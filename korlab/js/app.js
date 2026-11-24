/* 스터디피크 국어 랩 — 뼈대: 저장소 · 화면 전환 · 표시 문법 그리기 · 대시보드 · 백업·설정
 * 데이터: IndexedDB 'sp-korlab' — passages(지문) · items(문항) · images(원본 조각, 주인 id 로 찾음) · sheets(학습지, 예정)
 *   지문 { id, title, area, genre, body, head, range:[from,to], section, src:{name,kind,year,grade}, summary, theme, batch, createdAt, updatedAt }
 *   문항 { id, passageId|null, num, section, group, stem, view, viewLabel, choices[], answer, explain, wrong, type, points, src, batch, createdAt, updatedAt }
 * 본문 표시 문법: {u}밑줄{/u} · {b}상자{/b} · [그림] · 줄바꿈 = 문단/행 · 줄 이음 추정 표시( 붙임,  띄움 — KPDF.plain 으로 걷어 냄) */
'use strict';
const { $, $$, esc, escJs, uid, toast, downloadBlob, lsJson, fmtDate } = SP;
const KCFG = Object.assign({ cmap: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/', worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' }, window.KCFG || {});
const DB = SP.openDB('sp-korlab', 1, ['passages', 'items', 'images', 'sheets']);
const K = { passages: [], items: [], view: 'dash', cur: null, f: { area: '', q: '', src: '' }, fi: { q: '', area: '', kind: '' }, showOrig: false, editing: false };
const AREAS = ['독서', '문학', '화법', '작문', '언어', '매체'];
const SRC_KINDS = ['수능·모의평가', '학력평가', '내신 기출', '교과서', 'EBS', '자체 제작', '기타'];
const VIEW_TITLES = { dash: '대시보드', passages: '지문·작품', set: '지문·작품', upload: '시험지 올리기', items: '문제 검색', variant: '변형 만들기', sheet: '학습지·모의고사', data: '백업·설정' };

async function loadAll(){
  K.passages = (await DB.all('passages')).sort((a, b)=>(b.createdAt - a.createdAt) || ((a.range || [0])[0] - (b.range || [0])[0]));
  K.items = (await DB.all('items')).sort((a, b)=>(a.createdAt - b.createdAt) || (a.num - b.num));
  $('#n-passages').textContent = K.passages.length; $('#n-items').textContent = K.items.length;
}
const itemsOf = pid=>K.items.filter(i=>i.passageId === pid).sort((a, b)=>a.num - b.num);
const joinsOf = p=>KPDF.joinCount(p.body) + KPDF.joinCount(p.summary) + itemsOf(p.id).reduce((s, i)=>s + itemJoins(i), 0);
const itemJoins = i=>KPDF.joinCount(i.stem) + KPDF.joinCount(i.view) + KPDF.joinCount(i.explain) + KPDF.joinCount(i.wrong) + (i.choices || []).reduce((a, c)=>a + KPDF.joinCount(c), 0);

/* 표시 문법 → HTML. opts.joins: 줄 이음 추정 자리를 주황 점으로 보여 줌(검수용) */
function kHtml(text, opts){
  opts = opts || {};
  let t = String(text || '');
  t = opts.joins ? t.replace(//g, '').replace(//g, ' ') : KPDF.plain(t);
  return t.split('\n').map(line=>{
    let h = esc(line).replace(/\{u\}/g, '<u>').replace(/\{\/u\}/g, '</u>').replace(/\{b\}/g, '<span class="bx">').replace(/\{\/b\}/g, '</span>')
      .replace(/\[그림\]/g, '<span class="figph">그림 — [원본 보기]에서 확인</span>').replace(//g, '<span class="jm" title="줄이 바뀌던 자리 — 띄어쓰기 추정">·</span>');
    const prose = opts.passage && KPDF.plain(line).length > 45;
    return `<p class="pl${prose ? ' prose' : ''}">${h || '&nbsp;'}</p>`;
  }).join('');
}
const snippet = (t, n)=>KPDF.plain(t).replace(/\{\/?[ub]\}/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 80);

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
  if(view === 'data') renderData();
  window.scrollTo({ top: 0 });
}
$('#sbnav').addEventListener('click', e=>{ const b = e.target.closest('button[data-view]'); if(b) go(b.dataset.view); });
$('#menu-btn').addEventListener('click', ()=>$('#sidebar').classList.toggle('open'));
function busy(label){ const b = $('#busy'); if(label){ $('#busy-label').textContent = label; b.style.display = 'flex'; } else b.style.display = 'none'; }

function renderDash(){
  const byArea = AREAS.map(a=>[a, K.passages.filter(p=>p.area === a).length]).filter(x=>x[1]);
  const unsure = K.passages.reduce((s, p)=>s + joinsOf(p), 0) + K.items.filter(i=>!i.passageId).reduce((s, i)=>s + itemJoins(i), 0);
  $('#view-dash').innerHTML = `
    <h2>지문 하나로 쌓고, 바꾸고, 검증하는 국어 문제 DB</h2>
    <p class="vd">시험지 PDF를 올리면 지문과 문항을 자동으로 나눠 저장합니다. 글자는 PDF 그대로, 밑줄·상자도 함께 옮깁니다.</p>
    <div class="card"><div class="grid4">
      <div class="stat"><span class="hint">지문·작품</span><b>${K.passages.length}</b></div>
      <div class="stat"><span class="hint">문항</span><b>${K.items.length}</b></div>
      <div class="stat"><span class="hint">정답 있는 문항</span><b>${K.items.filter(i=>i.answer).length}</b></div>
      <div class="stat"><span class="hint">띄어쓰기 확인할 곳</span><b>${unsure}</b></div>
    </div>${byArea.length ? `<div class="row" style="margin-top:.8rem">${byArea.map(([a, n])=>`<span class="chip">${a} ${n}</span>`).join('')}</div>` : ''}</div>
    <div class="card"><h3>시작하기</h3>
      <div class="row"><button class="btn" onclick="go('upload')">시험지 올리기</button><button class="btn ghost" onclick="go('passages')">지문·작품 보기</button></div>
      <p class="hint" style="margin-top:.7rem">지금 되는 것: 글자가 들어 있는 PDF(평가원·교육청 시험지, 한글에서 만든 PDF) 읽기, 정답·해설지 붙이기, 지문·문항 보기·고치기, 줄바꿈 자리 띄어쓰기 AI 다듬기.<br>
      다음 단계: 변형 만들기와 검증, 학습지·한글 파일, LMS 엑셀, 기기 간 동기화.</p></div>`;
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
async function exportBackup(withImages){
  const data = { app: 'sp-korlab', version: 1, exportedAt: Date.now(), passages: K.passages, items: K.items, images: withImages ? await DB.all('images') : [] };
  downloadBlob(`스터디피크_국어랩_백업_${fmtDate(Date.now()).replace(/\./g, '')}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
}
const IMG_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const cleanId = v=>String(v == null ? '' : v).replace(/[^\w.-]/g, '');
const STR_P = ['title', 'area', 'genre', 'body', 'head', 'section', 'summary', 'theme', 'batch'], STR_I = ['section', 'group', 'stem', 'view', 'viewLabel', 'answer', 'explain', 'wrong', 'type', 'batch'];
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
    const ps = d.passages.map(p=>{ const o = cleanRecord(p, STR_P); o.range = Array.isArray(p.range) ? p.range.slice(0, 2).map(n=>+n || 0) : [0, 0]; o.oldHangul = !!p.oldHangul; return o; });
    const is = d.items.map(i=>{ const o = cleanRecord(i, STR_I); o.passageId = i.passageId ? cleanId(i.passageId) : null; o.num = +i.num || 0; o.points = i.points == null ? null : +i.points || null;
      o.choices = Array.isArray(i.choices) ? i.choices.map(String) : []; o.oldHangul = !!i.oldHangul; return o; });
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
