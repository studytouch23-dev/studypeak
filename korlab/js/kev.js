/* 스터디피크 국어 랩 — 인용문 찾기와 형광펜 자리 표시 (화면 없음: 브라우저 window.KEV, Node require)
 * AI가 "근거"라고 내놓은 문장이 지문에 실제로 있는지 코드로 대조한다 — 띄어쓰기·줄바꿈·밑줄 표시는 무시하고 글자만 견준다.
 * 표시 토큰: {hC#N,N}…{/h} 형광펜(C 색 번호, N 문항 번호들) · {hn#C#N} 번호 배지 · {x}…{/x} 틀린 낱말 */
(function(root, factory){ const o = factory(); if(typeof module === 'object' && module.exports) module.exports = o; else root.KEV = o; })(typeof self !== 'undefined' ? self : this, function(){
  'use strict';
  const TOKEN = /^\{(?:\/?[ub]|\[:[^{}]{1,4}|\/\[)\}/;                    // 밑줄·상자·[A] 구간 표시
  const SKIP = /[⁇\s\uE000\uE001 ]/, PUNCT = /[“”"'‘’`´·․ㆍ.,…~～\-–—〔〕]/;       // 〔 〕: AI에게 밑줄을 보여 줄 때 쓰는 괄호 — 그대로 베껴 와도 찾게
  /* 견줄 글자만 남긴 글과, 그 글자가 원문 어디에 있었는지 */
  function compact(raw){
    raw = String(raw || '');
    let text = ''; const map = [];
    for(let i = 0; i < raw.length; i++){
      if(raw[i] === '{'){ const m = raw.slice(i, i + 8).match(TOKEN); if(m){ i += m[0].length - 1; continue; } }
      if(SKIP.test(raw[i]) || PUNCT.test(raw[i])) continue;
      text += raw[i]; map.push(i);
    }
    return { text, map };
  }
  const key = q=>compact(String(q || '').replace(/^[①-⑤]\s*/, '')).text;
  /* 원문에서 인용문의 자리 [시작, 끝) 들. 없으면 [] */
  function findAll(raw, quote, c){
    c = c || compact(raw);
    const k = key(quote), out = [];
    if(k.length < 2) return out;
    for(let at = c.text.indexOf(k); at >= 0; at = c.text.indexOf(k, at + k.length)) out.push([c.map[at], c.map[at + k.length - 1] + 1]);
    return out;
  }
  const find = (raw, quote, c)=>findAll(raw, quote, c)[0] || null;
  /* spans [{ s, e, color, num } | { s, e, x:true }] → 토큰이 박힌 글. 밑줄·상자 토큰과 줄바꿈에서는 끊었다 다시 연다(겹쳐도 안전) */
  function mark(raw, spans){
    raw = String(raw || '');
    if(!spans || !spans.length) return raw;
    const hl = spans.filter(s=>!s.x).sort((a, b)=>a.s - b.s), xs = spans.filter(s=>s.x);
    const badge = new Map(); for(const s of hl) if(!badge.has(s.s) || badge.get(s.s).indexOf(s) < 0) badge.set(s.s, (badge.get(s.s) || []).concat(s));
    let out = '', open = '', xopen = false;
    const close = ()=>{ if(xopen){ out += '{/x}'; xopen = false; } if(open){ out += '{/h}'; open = ''; } };
    for(let i = 0; i < raw.length; i++){
      const tk = raw[i] === '{' ? (raw.slice(i, i + 8).match(TOKEN) || [''])[0] : '';
      if(tk || raw[i] === '\n'){ close(); out += tk || '\n'; i += (tk ? tk.length : 1) - 1; continue; }
      if(badge.has(i)){ close(); for(const s of badge.get(i)) out += `{hn#${s.color}#${s.num}}`; }
      const act = hl.filter(s=>s.s <= i && i < s.e), want = act.length ? `{h${act[0].color}#${[...new Set(act.map(s=>s.num))].join(',')}}` : '', wx = xs.some(s=>s.s <= i && i < s.e);
      if(want !== open || wx !== xopen){ close(); if(want){ out += want; open = want; } if(wx){ out += '{x}'; xopen = true; } }
      out += raw[i];
    }
    close();
    return out;
  }
  /* 토큰 → HTML (esc 를 거친 글에 쓴다) */
  function html(h){
    return h.replace(/\{hn#(\d+)#(\d+)\}/g, '<sup class="evn ev$1" data-q="$2">$2</sup>').replace(/\{h(\d+)#([\d,]+)\}/g, '<mark class="ev ev$1" data-q="$2">').replace(/\{\/h\}/g, '</mark>')
      .replace(/\{x\}/g, '<span class="xw">').replace(/\{\/x\}/g, '</span>');
  }
  return { compact, key, find, findAll, mark, html };
});
