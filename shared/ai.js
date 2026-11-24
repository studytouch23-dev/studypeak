/* 스터디피크 공용 부품 — Claude API 호출 (브라우저에서 사용자의 키로 직접)
 * 설정은 수학 랩과 같은 localStorage 키를 쓴다(같은 사이트라 그대로 공유): sp-lab-apikey · sp-lab-aimodel · sp-lab-figmodel · sp-lab-wsid */
(function(){
  'use strict';
  const SYSTEM = '너는 요청받은 JSON 객체 하나만 출력한다. 풀이·검토·설명은 JSON 안의 문자열 칸에만 쓰고, JSON 앞뒤에는 아무 글자도 쓰지 않는다. 코드블록(```)도 쓰지 않는다.';
  const state = { running: false, cancel: false, ctrl: null };
  function settings(){
    return { key: localStorage.getItem('sp-lab-apikey') || '', model: localStorage.getItem('sp-lab-aimodel') || 'claude-haiku-5-5',
      strongModel: localStorage.getItem('sp-lab-figmodel') || 'claude-sonnet-5-5', wsid: localStorage.getItem('sp-lab-wsid') || '' };
  }
  function headers(){
    const { key, wsid } = settings();
    const h = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    if(wsid) h['anthropic-workspace-id'] = wsid;
    return h;
  }
  function extractJson(txt){                                // 글 속에서 JSON 객체 찾기: 마지막 '{"' 부터 거슬러 올라가며 엄격하게
    txt = String(txt || '');
    const cands = [], re = /\{\s*"/g; let m;
    while((m = re.exec(txt))) cands.push(m.index);
    if(!cands.length){ const a = txt.indexOf('{'); if(a >= 0) cands.push(a); }
    const b = txt.lastIndexOf('}');
    for(const a of cands.reverse()) if(b > a){ try{ const v = JSON.parse(txt.slice(a, b + 1)); if(v && typeof v === 'object') return v; }catch(e){} }
    return null;
  }
  function start(){ state.running = true; state.cancel = false; state.ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null; }
  function done(){ state.running = false; state.cancel = false; state.ctrl = null; }
  function cancel(){ if(!state.running) return; state.cancel = true; try{ state.ctrl && state.ctrl.abort(); }catch(e){} }
  /* content: [{type:'text',text} | {type:'image',…}] → JSON. 형식이 깨지면 한 번 더 요청 */
  async function json(content, maxTokens, opts, _retry){
    opts = opts || {};
    const st = settings(), model = opts.model || st.model;
    if(!st.key) throw new Error('API 키가 없습니다 — [백업·설정]에서 키를 저장하세요.');
    const sig = state.running && state.ctrl ? state.ctrl.signal : undefined;
    if(sig && sig.aborted) throw new Error('중지됨');
    const maxT = Math.min(32000, Math.max(6000, maxTokens || 2000));     // 생각(추론)도 출력 한도를 쓰므로 넉넉히
    let r;
    try{
      r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', ...(sig ? { signal: sig } : {}), headers: headers(),
        body: JSON.stringify({ model, max_tokens: maxT, system: SYSTEM, messages: [{ role: 'user', content }] }) });
    }catch(e){
      if((e && e.name === 'AbortError') || (sig && sig.aborted)) throw new Error('중지됨');
      throw new Error('네트워크 차단 — api.anthropic.com에 연결하지 못했습니다. 광고차단 확장프로그램이나 방화벽을 확인하세요.');
    }
    if(!r.ok){
      let msg = ''; try{ const j = await r.json(); msg = (j.error && j.error.message) || ''; }catch(e){}
      if(r.status === 401) throw new Error('API 키가 올바르지 않습니다(401) — [백업·설정]에서 키를 확인하세요.');
      if(/credit balance/i.test(msg)) throw new Error('API 오류 400 — API 크레딧이 부족합니다. console.anthropic.com → Billing 에서 충전하세요.');
      throw new Error('API 오류 ' + r.status + (msg ? ' — ' + msg.slice(0, 160) : ''));
    }
    const data = await r.json();
    const text = (data.content || []).filter(b=>b.type === 'text').map(b=>b.text).join('');
    const v = extractJson(text);
    if(v) return v;
    if(data.stop_reason === 'max_tokens') throw new Error('AI 응답이 길이 제한에 잘렸습니다');
    if(_retry){ const e = new Error('AI가 형식(JSON) 없이 답했습니다: "' + text.slice(0, 60) + '…"'); e.noJson = true; throw e; }
    return json(content.concat([{ type: 'text', text: '[다시 요청] 방금 답은 형식이 맞지 않았습니다. 설명 없이 JSON 객체 하나만 출력하세요.' }]), maxT * 2, opts, true);
  }
  window.SPAI = { settings, headers, extractJson, json, start, done, cancel, state };
})();
