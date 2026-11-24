/* 스터디피크 공용 부품 — 화면 도우미 · 이스케이프 · 내려받기 · IndexedDB
 * 국어 랩(korlab/)이 먼저 쓰고, 수학 랩(lab/)은 나중에 테스트로 지키며 하나씩 옮겨 온다. 빌드 도구 없이 <script src> 로 불러 쓴다. */
(function(){
  'use strict';
  const $ = (s, root)=>(root || document).querySelector(s);
  const $$ = (s, root)=>Array.from((root || document).querySelectorAll(s));
  const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
  const esc = s=>String(s == null ? '' : s).replace(CTRL_RE, '').replace(/[&<>"']/g, c=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  // onclick="f('${escJs(x)}')" 용: JS 이스케이프를 먼저, 그다음 HTML 이스케이프
  const escJs = s=>esc(String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n'));
  const uid = ()=>Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function toast(msg, ms){
    let t = $('#toast');
    if(!t){ t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast._t); toast._t = setTimeout(()=>{ t.style.display = 'none'; }, ms || 3200);
  }
  function downloadBlob(name, blob){
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function lsJson(key, dflt){ try{ const v = JSON.parse(localStorage.getItem(key)); return v == null ? dflt : v; }catch(e){ return dflt; } }
  const fmtDate = t=>{ const d = new Date(t || 0), z = n=>String(n).padStart(2, '0'); return `${d.getFullYear()}.${z(d.getMonth()+1)}.${z(d.getDate())}`; };

  /* IndexedDB: openDB('이름', 1, ['store', …]) → { get, put, del, all, clear, count } — 모든 store 의 키는 id */
  function openDB(name, version, stores){
    const ready = new Promise((res, rej)=>{
      const rq = indexedDB.open(name, version);
      rq.onupgradeneeded = ()=>{ for(const s of stores) if(!rq.result.objectStoreNames.contains(s)) rq.result.createObjectStore(s, { keyPath: 'id' }); };
      rq.onsuccess = ()=>res(rq.result); rq.onerror = ()=>rej(rq.error);
    });
    const tx = async (store, mode, fn)=>{
      const db = await ready;
      return new Promise((res, rej)=>{ const t = db.transaction(store, mode), rq = fn(t.objectStore(store)); t.oncomplete = ()=>res(rq && rq.result); t.onerror = ()=>rej(t.error); t.onabort = ()=>rej(t.error); });
    };
    return {
      get: (s, id)=>tx(s, 'readonly', o=>o.get(id)),
      all: s=>tx(s, 'readonly', o=>o.getAll()),
      count: s=>tx(s, 'readonly', o=>o.count()),
      put: (s, v)=>tx(s, 'readwrite', o=>o.put(v)),
      putMany: (s, arr)=>tx(s, 'readwrite', o=>{ let last; for(const v of arr) last = o.put(v); return last; }),
      del: (s, id)=>tx(s, 'readwrite', o=>o.delete(id)),
      clear: s=>tx(s, 'readwrite', o=>o.clear()),
    };
  }
  window.SP = { $, $$, esc, escJs, uid, toast, downloadBlob, lsJson, fmtDate, openDB };
})();
