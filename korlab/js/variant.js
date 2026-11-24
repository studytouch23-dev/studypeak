/* 스터디피크 국어 랩 — AI 작업 ②: 변형 만들기 6종 + 검증
 * 만들기(센 모델) → 검증 ① 형식 ② 근거 인용문이 지문에 실제로 있는지(KEV, 코드) ③ 블라인드 풀이(정답을 가린 다른 호출이 선지마다 O/X 판정 → 정답 일치·유일 정답)
 *   → 실패하면 한 번 수리 후 다시 검증 → 통과한 것만 자동 저장. 주의·실패는 사유와 함께 보여 주고 사용자가 고른다. */
'use strict';
const VA_HELP = {
  twin: '같은 지문·같은 유형으로 선지를 새로 씁니다(묻는 지점과 정답 번호가 바뀜).',
  shift: '같은 지문으로 다른 유형의 문항을 만듭니다.',
  ox: '선지 하나하나를 O/X 문항으로 풉니다(내신 대비·선지 끊어 읽기 연습).',
  essay: '조건이 있는 서술형 + 모범 답안 + 채점 기준을 만듭니다.',
  view: '<보기>를 새로 써서 적용·감상 문항을 만듭니다.',
  newp: '같은 제재·구조의 새 독서 지문과 문항 세트를 만듭니다(독서만 — 저작권 부담 없음).',
};
const VA_RULES = `[출제 원칙]
- 정답은 [지문]의 문장에서 확정되어야 한다. 지문 밖 지식이 있어야 풀리면 안 된다.
- 오답은 "결정 조건 하나"만 틀리게 만든다: 주체·대상 바꾸기, 원인·결과 뒤집기, 범위·정도 과장, 지문에 없는 내용 덧붙이기 가운데 하나. 한 선지에 틀린 곳이 둘이면 안 된다.
- 선지 5개는 길이와 문체가 비슷해야 하고 서로 다른 지점을 묻는다. 정답이 둘로 읽힐 여지가 없어야 한다.
- 발문은 수능 문체: "윗글의 내용과 일치하지 않는 것은?", "윗글을 이해한 내용으로 가장 적절한 것은?" 등. 부정 발문의 "않은/않는"은 {u}않은{/u} 처럼 밑줄 표시를 한다.
- 지문의 ㉠·ⓐ·[A] 같은 기호는 지문에 실제로 있는 것만 쓴다. 지문에서 〔 〕로 보이는 곳이 밑줄이다.
- evidence: 정답을 확정짓는 지문(또는 네가 쓴 <보기>) 문장 1~2개를 글자 그대로 복사한다. 바꿔 쓰지 않는다.
- wrongs: [선지 번호, 그 선지를 틀리게 만든 낱말(선지 글자 그대로, 한 어절), 왜 틀렸는지 한 문장]. 긍정 발문이면 오답 4개 각각, 부정 발문이면 정답 선지 하나만.
- type 은 아래 목록의 ID 만 쓴다.`;
const VA_MC = '{"items":[{"stem":"발문","viewLabel":"","view":"","choices":["① …","② …","③ …","④ …","⑤ …"],"answer":3,"type":"R01","points":2,"explain":"정답 해설 한두 문장","evidence":["지문 그대로"],"wrongs":[[1,"낱말","이유"]]}]}';
function vaPrompt(kind, p, src, n, to){
  const cat = p.cat || '독서', types = KT.typesOf(cat).map(t=>`${t.id} ${KT.name(t.id)} — ${t.d}`).join('\n');
  const base = `너는 수능 국어 출제 경험이 많은 출제자다. 아래 [지문]만을 근거로 변형 문항을 만든다.\n${VA_RULES}\n[유형 목록 — ${cat}]\n${types || '(유형 없음 — type 은 "")'}\n${GUARD}\n\n`;
  const tail = `\n\n[지문]\n${passageText(p)}` + (src ? `\n\n[원 문항]\n${itemText(src, { explain: true })}${src.typeId ? `\n원 문항의 유형: ${KT.label(src.typeId)}` : ''}` : '');
  if(kind === 'twin') return base + `[할 일] 원 문항과 같은 유형·같은 발문 방식의 쌍둥이 문항 ${n}개. 선지는 모두 새로 쓴다 — 원 문항의 선지를 그대로 쓰지 말고 지문의 다른 지점을 묻는다. 정답 번호는 원 문항과 다르게.\nJSON 하나만: ${VA_MC}` + tail;
  if(kind === 'shift') return base + `[할 일] 같은 지문으로 유형을 "${KT.label(to)}"(으)로 바꾼 새 문항 ${n}개. 그 유형의 판정 기준에 정확히 맞아야 한다. type 은 "${to}".\nJSON 하나만: ${VA_MC}` + tail;
  if(kind === 'view') return base + `[할 일] <보기>를 새로 쓴 문항 ${n}개. ${cat === '문학' ? '<보기>는 작품을 바라보는 새 감상 준거(비평·시대상·갈래 이론)이고 유형은 L07.' : '<보기>는 지문의 원리·개념을 적용할 새 줄글 사례이고 유형은 R06.'} viewLabel 은 "보기", view 에 <보기> 글(3~5문장)을 쓴다. 원 문항의 <보기>를 베끼지 않는다.\nJSON 하나만: ${VA_MC}` + tail;
  if(kind === 'ox') return base + `[할 일] 원 문항의 선지 5개를 각각 O/X 문항으로 바꾼다(모두 5개). stem 은 지문에 비추어 참·거짓을 가릴 수 있는 한 문장 진술(선지 번호 없이). 원래 선지를 조금 다듬어도 되지만 참·거짓의 근거는 지문에 있어야 한다. O와 X가 섞이게.\nJSON 하나만: {"items":[{"stem":"진술","answer":"O","explain":"근거 한 문장","evidence":["지문 그대로"],"wrong":"X일 때만 — 틀리게 만든 낱말(진술 글자 그대로)"}]}` + tail;
  if(kind === 'essay') return base + `[할 일] 조건이 있는 서술형 문항 ${n}개. 원 문항이 묻는 핵심을 서술형으로 바꾼다. view 에 조건(분량·반드시 넣을 낱말·문장 형식)을 줄바꿈으로 적는다. model 은 조건을 모두 지킨 모범 답안, rubric 은 채점 기준 배열(예: "핵심 내용 A를 썼다 — 2점").\nJSON 하나만: {"items":[{"stem":"발문","viewLabel":"조건","view":"조건 1\\n조건 2","model":"모범 답안","rubric":["기준 — 2점"],"points":5,"type":"R05","evidence":["지문 그대로"]}]}` + tail;
  return base + `[할 일] 아래 [지문]과 같은 제재 영역·같은 글 구조·비슷한 길이와 난도의 **새 독서 지문**을 쓰고, 그 지문으로 문항 ${n}개를 만든다. 원 지문의 문장을 베끼지 않는다(완전히 새 글, 새 사례). 사실관계가 틀리지 않게 널리 알려진 내용으로 쓰고, 문단은 줄바꿈으로 나눈다. 문항의 evidence 는 네가 쓴 새 지문에서 그대로 복사한다. 유형 구성은 원 세트와 비슷하게: ${to || 'R01, R05, R06'}.\nJSON 하나만: {"passage":{"title":"내용 요약 제목","body":"문단1\\n문단2…"},"items":${VA_MC.slice(9, -1)}}` + tail;
}
const circ = (c, k)=>KPDF.CIRC[k] + ' ' + String(c || '').replace(/^\s*[①-⑤]\s*/, '').trim();
/* AI가 만든 것 → 문항 꼴로 다듬고 형식·근거를 코드로 검사. notes: [{ hard, msg }] */
function vaShape(kind, p, src, raw, body){
  const notes = [], cat = p.cat || '', it = { stem: String(raw.stem || '').trim(), view: String(raw.view || '').trim(), viewLabel: String(raw.viewLabel || '').trim().slice(0, 12), choices: [], answer: '', explain: String(raw.explain || '').trim(),
    points: +raw.points || (kind === 'essay' ? 5 : 2), typeId: KT.has(raw.type) && KT.catOfType(raw.type) === cat ? raw.type : (kind === 'twin' && src ? src.typeId || '' : ''), subTypes: [], nature: src && !KT.typed(cat) ? src.nature || '' : '', typeBy: 'ai', review: null, note: '' };
  if(!it.stem) notes.push({ hard: true, msg: '발문이 비어 있음' });
  if(kind === 'ox'){ it.kind = 'ox'; it.answer = /^o$/i.test(String(raw.answer).trim()) ? 'O' : /^x$/i.test(String(raw.answer).trim()) ? 'X' : ''; if(!it.answer) notes.push({ hard: true, msg: 'O/X 정답이 없음' }); it.points = null; }
  else if(kind === 'essay'){ it.kind = 'essay'; it.model = String(raw.model || '').trim(); it.rubric = (Array.isArray(raw.rubric) ? raw.rubric : []).map(String).slice(0, 8);
    if(!it.model) notes.push({ hard: true, msg: '모범 답안이 없음' }); if(!it.rubric.length) notes.push({ hard: false, msg: '채점 기준이 없음' }); }
  else{
    const ch = (Array.isArray(raw.choices) ? raw.choices : []).map(String);
    it.choices = ch.slice(0, 5).map(circ);
    if(ch.length !== 5) notes.push({ hard: true, msg: `선지가 ${ch.length}개` });
    if(new Set(it.choices.map(c=>KEV.key(c))).size !== it.choices.length) notes.push({ hard: true, msg: '같은 선지가 겹침' });
    const a = +raw.answer; if(a >= 1 && a <= 5) it.answer = KPDF.CIRC[a - 1]; else notes.push({ hard: true, msg: '정답 번호가 없음' });
    if(src && kind === 'twin'){ const old = new Set((src.choices || []).map(c=>KEV.key(c))); if(it.choices.filter(c=>old.has(KEV.key(c))).length >= 3) notes.push({ hard: true, msg: '원 문항의 선지를 거의 그대로 씀' }); }
    if(kind === 'view' && KEV.key(it.view).length < 20) notes.push({ hard: true, msg: '<보기>가 없음' });
    if(KT.typed(cat) && !it.typeId) notes.push({ hard: false, msg: '유형을 정하지 못함' });
  }
  /* 근거: 지문(새 지문이면 그 글) 또는 이 문항의 <보기>에 실제로 있는 인용문만 */
  const quotes = [], cb = KEV.compact(body), cv = KEV.compact(it.view); let miss = 0;
  for(const q of (Array.isArray(raw.evidence) ? raw.evidence : []).slice(0, 3).map(String)){ if(KEV.key(q).length >= 6 && (KEV.find(body, q, cb) || KEV.find(it.view, q, cv))) quotes.push(q); else miss++; }
  if(!quotes.length) notes.push({ hard: true, msg: '근거 인용문이 지문에 없음' + (miss ? ` (${miss}개 대조 실패)` : '') });
  else if(miss) notes.push({ hard: false, msg: `근거 ${miss}개는 지문에서 찾지 못해 버림` });
  const x = [];
  if(kind === 'ox'){ const w = String(raw.wrong || ''); if(it.answer === 'X' && KEV.key(w).length >= 2 && KEV.find(it.stem, w)) x.push([0, w]); }
  else for(const v of (Array.isArray(raw.wrongs) ? raw.wrongs : []).slice(0, 5)){ const no = +(v && v[0]), w = String((v && v[1]) || ''); if(it.choices[no - 1] && KEV.key(w).length >= 2 && KEV.find(it.choices[no - 1], w)){ x.push([no, w]); if(v[2]) it.wrong = (it.wrong ? it.wrong + ' ' : '') + `${KPDF.CIRC[no - 1]} ${String(v[2]).trim()}`; } }
  it.ev = { quotes, x, neg: /않|아닌|없는|틀린|거리가 먼/.test(KPDF.plain(it.stem).replace(/\{\/?u\}/g, '')) };
  return { it, notes };
}
/* 블라인드 풀이: 정답·해설을 가리고 선지마다 O/X 판정을 받는다 → [{ answer, judge }] (문항 순서대로) */
async function vaBlind(body, list, model){
  const q = list.map((it, k)=>`[${k + 1}]${it.kind === 'ox' ? ' (O/X 문항)' : ''}\n발문: ${aiText(it.stem)}` + (it.view ? `\n<${it.viewLabel || '보기'}>: ${aiText(it.view)}` : '') + (it.choices.length ? '\n' + it.choices.map(aiText).join('\n') : '')).join('\n\n');
  const res = await SPAI.json([{ type: 'text', text: `아래 [지문]을 읽고 문항을 푼다. 지문에 적힌 내용만 근거로 삼는다.\n- 선택형: 선지 5개를 각각 "지문에 비추어 옳은 진술인가"로 판정해 judge 에 O/X 다섯 글자로 적고(①부터), answer 에 발문이 요구하는 선지 번호를 적는다. 답이 둘 이상이거나 없다고 보이면 answer 를 0 으로.\n- O/X 문항: answer 에 "O" 또는 "X", judge 는 "".\n${GUARD}\nJSON 하나만: {"items":[{"k":1,"judge":"OOXOO","answer":3}]}\n\n[지문]\n${aiText(body)}\n\n[문항]\n${q}` }], 1200 + list.length * 300, { model });
  const by = new Map((Array.isArray(res.items) ? res.items : []).map(x=>[+x.k, x]));
  return list.map((_, k)=>by.get(k + 1) || null);
}
function vaJudge(it, b, who){                                 // 블라인드 답 하나를 정답과 견줌 → notes
  const notes = [];
  if(!b){ notes.push({ hard: false, msg: `${who} 풀이 답을 받지 못함` }); return notes; }
  if(it.kind === 'ox'){ if(String(b.answer).trim().toUpperCase() !== it.answer) notes.push({ hard: true, blind: true, msg: `${who} 풀이의 답(${b.answer})이 정답(${it.answer})과 다름` }); return notes; }
  const key = KT.ansNo(it.answer), j = String(b.judge || '').toUpperCase().replace(/[^OX]/g, '');
  if(+b.answer !== key) notes.push({ hard: true, blind: true, msg: `${who} 풀이의 답(${+b.answer ? KPDF.CIRC[+b.answer - 1] : '없음'})이 정답(${it.answer})과 다름` });
  if(j.length === 5){ const n = [...j].filter(c=>c === (it.ev.neg ? 'X' : 'O')).length; if(n !== 1) notes.push({ hard: true, blind: true, msg: `유일 정답 의심 — ${it.ev.neg ? '틀린' : '옳은'} 진술로 판정된 선지가 ${n}개` }); }
  return notes;
}
/* 묶음 하나를 검증: 가벼운 모델이 먼저 풀고, 어긋난 문항만 센 모델이 다시 푼다(둘 다 어긋나면 실패, 센 모델만 맞으면 '주의') */
async function vaVerify(body, shaped){
  const st = SPAI.settings(), live = shaped.filter(s=>!s.notes.some(n=>n.hard) && s.it.kind !== 'essay');
  if(live.length){
    const b1 = await vaBlind(body, live.map(s=>s.it), st.model);
    const redo = [];
    live.forEach((s, k)=>{ const n = vaJudge(s.it, b1[k], '블라인드'); if(n.some(x=>x.blind)) redo.push([s, n]); else s.notes.push(...n); });
    if(redo.length && !SPAI.state.cancel){
      const b2 = await vaBlind(body, redo.map(r=>r[0].it), st.strongModel);
      redo.forEach(([s, n1], k)=>{ const n2 = vaJudge(s.it, b2[k], '두 번째'); if(n2.some(x=>x.blind)) s.notes.push(...n1, ...n2); else s.notes.push({ hard: false, msg: '가벼운 모델은 다르게 풀었지만 센 모델은 정답과 일치 — 난도가 높거나 함정이 있는 문항' }); });
    }
  }
  for(const s of shaped){ s.status = s.notes.some(n=>n.hard) ? 'fail' : s.notes.length ? 'warn' : 'pass'; s.it.verify = { status: s.status, notes: s.notes.map(n=>n.msg) }; }
  return shaped;
}
async function vaRepair(kind, p, src, s, body){               // 실패한 문항을 사유와 함께 돌려보내 한 번 고치게 한다
  const res = await SPAI.json([{ type: 'text', text: `아래 변형 문항은 검증에서 문제가 나왔다. 문제를 고쳐 같은 형식의 JSON 으로 다시 낸다(문항 1개).\n[검증에서 나온 문제]\n- ${s.notes.map(n=>n.msg).join('\n- ')}\n${VA_RULES}\n${GUARD}\nJSON 하나만: {"items":[ …고친 문항 1개… ]}\n\n[고칠 문항]\n${JSON.stringify(s.raw)}\n\n[지문]\n${aiText(body)}` }], 3000, { model: SPAI.settings().strongModel });
  const raw = Array.isArray(res.items) ? res.items[0] : null; if(!raw) return s;
  const t = vaShape(kind, p, src, raw, body); t.raw = raw; t.src = s.src; t.repaired = true;
  await vaVerify(body, [t]);
  return t.status === 'fail' ? s : t;                           // 고쳐도 실패면 처음 것을(사유와 함께) 그대로 보여 준다
}
function vaItemRecord(p, src, s, kind, k){
  const now = Date.now();
  return Object.assign({ id: uid() + 'v' + k, passageId: p.id, num: src ? src.num : k + 1, section: p.section || '', group: '', src: p.src, batch: 'v' + now.toString(36), createdAt: now + k, updatedAt: now,
    variantOf: src ? src.id : p.id, vkind: kind, explain: '', wrong: '', type: '' }, s.it);
}
async function vaRun(){
  const p = K.passages.find(x=>x.id === K.va.pid); if(!p){ toast('지문을 먼저 고르세요.'); return; }
  const kind = K.va.kind, picks = itemsOf(p.id).filter(i=>K.va.picks[i.id]), n = Math.max(1, Math.min(3, +K.va.n || 1));
  if(kind !== 'newp' && !picks.length){ toast('바탕이 될 문항을 하나 이상 고르세요.'); return; }
  if(kind === 'newp' && p.cat !== '독서'){ toast('새 지문 만들기는 독서 지문에서만 됩니다.'); return; }
  if(kind === 'shift' && !KT.has(K.va.to)){ toast('바꿀 유형을 고르세요.'); return; }
  if(!aiReady()) return;
  const log = m=>{ K.va.log.push(m); const el = $('#va-log'); if(el) el.textContent = K.va.log.slice(-4).join('\n'); };
  K.va.log = []; SPAI.start(); busy('✨ 변형을 만드는 중…');
  const strong = SPAI.settings().strongModel; let saved = 0, held = 0;
  try{
    if(kind === 'newp'){
      const its = itemsOf(p.id), cnt = Math.max(2, Math.min(5, its.length || 3));
      log('새 지문을 쓰는 중…');
      const res = await SPAI.json([{ type: 'text', text: vaPrompt('newp', p, null, cnt, its.map(i=>i.typeId).filter(Boolean).join(', ')) }], 9000, { model: strong });
      const body = String((res.passage && res.passage.body) || '').trim();
      if(KEV.key(body).length < 300) throw new Error('새 지문이 너무 짧게 왔습니다. 다시 눌러 주세요.');
      const now = Date.now(), np = { id: uid() + 'np', title: String(res.passage.title || '새 지문').slice(0, 80), author: '', cat: '독서', sub: p.sub || '', genre: p.genre || '', body, head: '다음 글을 읽고 물음에 답하시오.', range: [1, 0], section: '',
        src: { name: '자체 제작 (새 지문)', kind: '자체 제작', year: String(new Date().getFullYear()), grade: '' }, summary: '', theme: '', madeFrom: p.id, clsBy: 'ai', batch: 'v' + now.toString(36), createdAt: now, updatedAt: now };
      let shaped = (Array.isArray(res.items) ? res.items : []).slice(0, 6).map(raw=>Object.assign(vaShape('newp', np, null, raw, body), { raw, src: null }));
      log(`문항 ${shaped.length}개 검증 중…`); await vaVerify(body, shaped);
      for(let k = 0; k < shaped.length; k++) if(shaped[k].status === 'fail' && !SPAI.state.cancel){ log(`${k + 1}번 수리 중…`); shaped[k] = await vaRepair('newp', np, null, shaped[k], body); }
      const ok = shaped.filter(s=>s.status !== 'fail');
      if(!ok.length) throw new Error('검증을 통과한 문항이 없어 새 지문을 저장하지 않았습니다. 다시 눌러 주세요.');
      np.range = [1, ok.length]; await DB.put('passages', np);
      const recs = ok.map((s, k)=>{ const r = vaItemRecord(np, null, s, 'newp', k); r.num = k + 1; delete r.variantOf; return r; });
      await DB.putMany('items', recs); saved = recs.length; held = shaped.length - ok.length;
      await loadAll(); toast(`새 지문 + 문항 ${saved}개를 저장했습니다${held ? ` (검증 실패 ${held}개는 버림)` : ''}.`); SPAI.done(); busy(''); go('set', np.id); return;
    }
    for(const src of picks){
      if(SPAI.state.cancel) break;
      log(`${src.num}번 — ${VKINDS[kind]} 만드는 중…`);
      const res = await SPAI.json([{ type: 'text', text: vaPrompt(kind, p, src, n, K.va.to) }], 3500 + n * 1500, { model: strong });
      let shaped = (Array.isArray(res.items) ? res.items : []).slice(0, kind === 'ox' ? 5 : n).map(raw=>Object.assign(vaShape(kind, p, src, raw, p.body), { raw, src }));
      if(!shaped.length){ log(`${src.num}번 — 만든 것이 없음`); continue; }
      log(`${src.num}번 — ${shaped.length}개 검증 중…`); await vaVerify(p.body, shaped);
      for(let k = 0; k < shaped.length; k++) if(shaped[k].status === 'fail' && !SPAI.state.cancel){ log(`${src.num}번 — 수리 후 다시 검증…`); shaped[k] = await vaRepair(kind, p, src, shaped[k], p.body); }
      for(const [k, s] of shaped.entries()){
        const rec = vaItemRecord(p, src, s, kind, k);
        if(s.status === 'pass'){ await DB.put('items', rec); saved++; K.va.results.unshift({ rec, status: s.status, saved: true }); }
        else { held++; K.va.results.unshift({ rec, status: s.status, saved: false }); }
      }
    }
    toast(`변형 ${saved}개 저장${held ? ` · 확인 필요 ${held}개(아래에서 고르세요)` : ''}`);
  }catch(e){ toast('⚠ ' + (e.message || e)); }
  finally{ SPAI.done(); busy(''); }
  await loadAll(); if(K.view === 'variant') renderVariant();
}
async function vaKeep(k){ const r = K.va.results[k]; if(!r || r.saved) return; await DB.put('items', r.rec); r.saved = true; await loadAll(); renderVariant(); toast('저장했습니다.'); }
function vaDrop(k){ K.va.results.splice(k, 1); renderVariant(); }
function renderVariant(){
  const el = $('#view-variant'), V = K.va;
  if(!K.passages.length){ el.innerHTML = '<h2>변형 만들기</h2><div class="card empty">아직 지문이 없습니다. <b>시험지 올리기</b>에서 PDF를 먼저 올려 주세요.</div>'; return; }
  if(!K.passages.some(p=>p.id === V.pid)){ V.pid = K.passages[0].id; V.picks = {}; }
  const p = K.passages.find(x=>x.id === V.pid), its = itemsOf(p.id), typed = KT.typed(p.cat);
  if(V.kind === 'newp' && p.cat !== '독서') V.kind = 'twin';
  if(V.kind === 'shift' && (!KT.has(V.to) || KT.catOfType(V.to) !== p.cat)) V.to = (KT.typesOf(p.cat)[0] || {}).id || '';
  const kinds = Object.keys(VKINDS).filter(k=>(k !== 'newp' || p.cat === '독서') && (k !== 'shift' || typed));
  if(!kinds.includes(V.kind)) V.kind = 'twin';
  const vars = variantsOf(p.id), nPick = its.filter(i=>V.picks[i.id]).length;
  el.innerHTML = `
    <h2>변형 만들기</h2><p class="vd">지문은 그대로 두고 문항을 바꿉니다. 만든 문항은 <b>근거 인용문 대조 → 블라인드 풀이 → 유일 정답</b> 검증을 거쳐, 통과한 것만 자동으로 저장됩니다.</p>
    <div class="card"><div class="grid4">
      <div style="grid-column:span 2"><label for="va-p">지문·작품</label><select id="va-p" onchange="K.va.pid=this.value;K.va.picks={};renderVariant()">${K.passages.map(x=>`<option value="${esc(x.id)}" ${x.id === V.pid ? 'selected' : ''}>${esc((x.title || snippet(x.body, 24)) + ' — ' + ((x.src && x.src.name) || ''))}</option>`).join('')}</select></div>
      ${V.kind === 'shift' ? `<div><label for="va-to">바꿀 유형</label><select id="va-to" onchange="K.va.to=this.value">${KT.typesOf(p.cat).map(t=>`<option value="${t.id}" ${t.id === V.to ? 'selected' : ''}>${esc(KT.label(t.id))}</option>`).join('')}</select></div>` : ''}
      ${V.kind !== 'ox' && V.kind !== 'newp' ? `<div><label for="va-n">문항마다 몇 개</label><select id="va-n" onchange="K.va.n=+this.value">${[1, 2, 3].map(v=>`<option ${v === +V.n ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` : ''}</div>
      <label style="margin-top:.7rem">변형 종류</label><div class="row" id="va-kinds">${kinds.map(k=>`<span class="chip clk ${V.kind === k ? 'on' : ''}" data-kind="${k}" onclick="K.va.kind='${k}';renderVariant()">${esc(VKINDS[k])}</span>`).join('')}</div>
      <p class="hint" style="margin-top:.4rem">${esc(VA_HELP[V.kind])}</p>
      ${V.kind === 'newp' ? '' : `<label style="margin-top:.7rem">바탕 문항 <a href="#" onclick="itemsOf(K.va.pid).forEach(i=>K.va.picks[i.id]=true);renderVariant();return false" class="hint">모두 고르기</a></label>
      <div id="va-items">${its.map(it=>`<label class="pick"><input type="checkbox" ${V.picks[it.id] ? 'checked' : ''} onchange="K.va.picks['${escJs(it.id)}']=this.checked;renderVariant()"> <b>${it.num}.</b> ${it.typeId ? `<span class="chip t">${esc(it.typeId)}</span>` : ''} ${esc(snippet(it.stem, 70))}</label>`).join('') || '<span class="hint">이 지문에 딸린 문항이 없습니다.</span>'}</div>`}
      <div class="row" style="margin-top:.8rem"><button class="btn" id="va-run" onclick="vaRun()">✨ ${V.kind === 'newp' ? '새 지문 + 문항 만들기' : `변형 만들기${nPick ? ` (${nPick}문항)` : ''}`}</button>
        <a href="#" onclick="go('set','${escJs(p.id)}');return false" class="hint">이 지문 세트 보기 →</a><pre id="va-log" class="hint" style="margin:0;white-space:pre-wrap">${esc(V.log.slice(-4).join('\n'))}</pre></div></div>
    ${V.results.length ? `<div class="card" id="va-results"><h3>이번에 만든 것</h3>${V.results.map((r, k)=>`<div class="vres ${r.status}">
        <div class="row"><span class="chip ${r.status === 'pass' ? 'g' : 'w'}">${r.status === 'pass' ? '검증 통과' : r.status === 'warn' ? '주의' : '검증 실패'}</span>${r.saved ? '<span class="chip g">저장됨</span>' : `<button class="btn sm" onclick="vaKeep(${k})">${r.status === 'fail' ? '그래도 저장' : '저장'}</button><button class="btn ghost sm" onclick="vaDrop(${k})">버리기</button>`}
          ${(r.rec.verify.notes || []).length ? `<span class="hint">${esc(r.rec.verify.notes.join(' / '))}</span>` : ''}</div>
        ${itemHtml(r.rec, { explain: true, cat: p.cat || '', ev: vaEv(r.rec) })}</div>`).join('')}</div>` : ''}
    ${vars.length ? `<div class="card"><h3>이 지문의 저장된 변형 ${vars.length}개</h3>${vars.map(it=>itemHtml(it, { explain: true, cat: p.cat || '', del: true, ev: vaEv(it) })).join('')}</div>` : ''}`;
}
/* 변형 문항 하나의 표시(<보기> 형광펜·선지 X) — 지문 형광펜은 세트 화면에서 원 문항 것만 보여 준다 */
function vaEv(it){
  if(!it.ev) return null;
  const view = [], ch = {}, cv = KEV.compact(it.view);
  for(const q of it.ev.quotes || []){ const b = KEV.find(it.view, q, cv); if(b) view.push({ s: b[0], e: b[1], color: 1, num: it.num }); }
  for(const [no, w] of it.ev.x || []){ const c = (it.choices || [])[no - 1], a = c && KEV.find(c, w); if(a) (ch[no - 1] = ch[no - 1] || []).push({ s: a[0], e: a[1], x: true }); }
  return { color: 1, view, ch, has: false };
}
