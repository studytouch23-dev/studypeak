/* 스터디피크 국어 랩 — 시험지 PDF 읽기 (글자 층이 있는 PDF)
 *
 * AI 없이 PDF 안의 글자·선 정보만으로: 쪽 → 단 → 줄 → [N~M] 세트(지문 + 문항) · 단독 문항으로 나눈다.
 *   · 글자는 PDF 글자 층 그대로(오타 없음), 밑줄은 글자 바로 아래의 가로선을 찾아 {u}…{/u} 로 표시
 *   · 지문은 단·쪽을 넘어가도 읽는 순서(왼쪽 단 → 오른쪽 단 → 다음 쪽)로 이어 붙인다
 *   · 줄바꿈 자리의 띄어쓰기는 PDF에 정보가 없어 추정한다 — 붙임 \uE000 / 띄움 \uE001 표시를 남겨 두었다가
 *     AI 다듬기(또는 사람)가 확정한다. 화면에는 KPDF.plain() 으로 표시를 걷어 내고 보여 준다.
 * 브라우저(window.KPDF)와 Node(require) 양쪽에서 쓴다 — 테스트는 Node에서 바로 돌린다.
 */
(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else root.KPDF = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';
  const J0 = '\uE000', J1 = '\uE001';                       // 줄 이음: 붙임 / 띄움 (추정)
  const CIRC = '①②③④⑤⑥⑦⑧⑨⑩';
  const SET_RE = /^\[\s*(\d{1,2})\s*(?:[～~∼〜\-–−]\s*(\d{1,2})\s*)?\]\s*(.*)$/;
  const PART_RE = /^\((가|나|다|라|마)\)$/;
  const VIEW_RE = /^<\s*(보\s*기|자\s*료|조\s*건|학습\s*활동)\s*>$/;
  const SECTION_RE = /^\(\s*(화법과 작문|언어와 매체|화법과 언어|독서와 작문|문학|확률과 통계|미적분|기하)\s*\)$/;

  /* 한글(HWP)이 PDF에 넣는 사용자 영역 글자 → 표준 글자. 옛한글(한양 PUA)은 표가 커서 아직 그대로 둔다(원본 그림으로 확인) */
  const PUA = { 0xF0854: '『', 0xF0855: '』', 0xF0852: '「', 0xF0853: '」', 0xF00DA: '예:' };
  const fixPua = t=>t.replace(/[\u{F0000}-\u{FFFFD}]/gu, c=>PUA[c.codePointAt(0)] != null ? PUA[c.codePointAt(0)] : c);
  const hasOldHangul = t=>/[\uE002-\uF8FF\u{F0000}-\u{FFFFD}]/u.test(String(t || ''));

  /* ── 1. 한 쪽 읽기: 글자 조각 + 가로선 ── */
  const mul = (m, n)=>[m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
  const ap = (m, x, y)=>[m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
  async function extractPage(page, OPS){
    const vp = page.getViewport({ scale: 1 }), W = vp.width, H = vp.height;
    const tc = await page.getTextContent();
    const items = [];
    for(const it of tc.items){
      if(!it.str) continue;
      const [a, b, , , e, f] = it.transform;
      if(Math.abs(b) > Math.abs(a)) continue;                // 세로로 누운 글자(여백의 표식)는 버림
      items.push({ s: fixPua(it.str), x: e, y: H - f, w: it.width, h: it.height || Math.abs(it.transform[3]) || 10 });
    }
    const hlines = [], vlines = [], images = [];
    try{
      const ol = await page.getOperatorList();
      let ctm = [1,0,0,1,0,0]; const stack = []; let pend = null;
      const PAINT = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
      for(let i = 0; i < ol.fnArray.length; i++){
        const fn = ol.fnArray[i], a = ol.argsArray[i];
        if(fn === OPS.save) stack.push(ctm.slice());
        else if(fn === OPS.restore){ const s = stack.pop(); if(s) ctm = s; }
        else if(fn === OPS.transform) ctm = mul(ctm, a);
        else if(fn === OPS.paintFormXObjectBegin){ stack.push(ctm.slice()); if(a && a[0]) ctm = mul(ctm, a[0]); }
        else if(fn === OPS.paintFormXObjectEnd){ const s = stack.pop(); if(s) ctm = s; }
        else if(fn === OPS.constructPath){
          const ops = a[0], co = a[1]; let k = 0; const segs = []; let cur = null;
          for(const op of ops){
            if(op === OPS.moveTo){ cur = ap(ctm, co[k], co[k+1]); k += 2; }
            else if(op === OPS.lineTo){ const p = ap(ctm, co[k], co[k+1]); k += 2; if(cur) segs.push([cur, p]); cur = p; }
            else if(op === OPS.rectangle){
              const x = co[k], y = co[k+1], w = co[k+2], h = co[k+3]; k += 4;
              const p1 = ap(ctm, x, y), p2 = ap(ctm, x+w, y), p3 = ap(ctm, x+w, y+h), p4 = ap(ctm, x, y+h);
              segs.push([p1, p2], [p2, p3], [p3, p4], [p4, p1]);
            }
            else if(op === OPS.curveTo){ cur = ap(ctm, co[k+4], co[k+5]); k += 6; }
            else if(op === OPS.curveTo2 || op === OPS.curveTo3){ cur = ap(ctm, co[k+2], co[k+3]); k += 4; }
          }
          pend = segs;
        }
        else if(PAINT.has(fn) && pend){
          for(const [p, q] of pend){
            const x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]), y0 = H - Math.max(p[1], q[1]), y1 = H - Math.min(p[1], q[1]);
            if(y1 - y0 < 1.2 && x1 - x0 > 4) hlines.push({ x0, x1, y: (y0 + y1) / 2 });
            else if(x1 - x0 < 1.2 && y1 - y0 > 4) vlines.push({ x: (x0 + x1) / 2, y0, y1 });
          }
          pend = null;
        }
        else if(fn === OPS.endPath) pend = null;
        else if(fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageXObjectRepeat || fn === OPS.paintJpegXObject){
          const ps = [ap(ctm, 0, 0), ap(ctm, 1, 0), ap(ctm, 1, 1), ap(ctm, 0, 1)];
          const xs = ps.map(p=>p[0]), ys = ps.map(p=>H - p[1]);
          images.push({ x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
        }
      }
    }catch(e){ /* 선 정보를 못 읽어도 글자만으로 진행 */ }
    return { w: W, h: H, items, hlines, vlines, images };
  }

  /* ── 2. 단 나누기 + 줄 만들기 ── */
  function findGutter(pg){
    const W = pg.w, H = pg.h;
    // 쪽 가운데의 긴 세로선(단 구분선)이 있으면 그 자리
    const rule = pg.vlines.filter(v=>v.x > W*0.35 && v.x < W*0.65 && v.y1 - v.y0 > H*0.4).sort((a, b)=>(b.y1-b.y0) - (a.y1-a.y0))[0];
    if(rule) return rule.x;
    // 없으면: 본문(위 12%·아래 6% 제외)에서 아무 글자도 걸치지 않는 가운데 빈 띠
    const body = pg.items.filter(it=>it.s.trim() && it.y > H*0.12 && it.y < H*0.94);
    if(body.length < 20) return null;
    const cover = new Uint16Array(Math.ceil(W) + 2);
    for(const it of body){ for(let x = Math.max(0, Math.floor(it.x)); x <= Math.min(W, Math.ceil(it.x + it.w)); x++) cover[x]++; }
    let best = null, run = -1;
    for(let x = Math.floor(W*0.35); x <= Math.ceil(W*0.65); x++){
      if(cover[x] === 0){ if(run < 0) run = x; }
      else if(run >= 0){ if(!best || x - run > best[1] - best[0]) best = [run, x]; run = -1; }
    }
    if(run >= 0 && (!best || Math.ceil(W*0.65) - run > best[1] - best[0])) best = [run, Math.ceil(W*0.65)];
    if(!best || best[1] - best[0] < 6) return null;
    const g = (best[0] + best[1]) / 2;
    const L = body.filter(it=>it.x + it.w <= g).length, R = body.filter(it=>it.x >= g).length;
    return Math.min(L, R) >= body.length * 0.15 ? g : null;
  }
  function lineText(segs, unders){                          // 조각들 → 글자 + 밑줄 표시
    const chars = [];
    let prevEnd = null, h = 10;
    for(const sg of segs){
      h = sg.h || h;
      if(prevEnd != null && sg.x - prevEnd > h * 0.28 && chars.length && chars[chars.length-1].c !== ' ' && sg.s.trim()) chars.push({ c: ' ', x: prevEnd });
      const arr = Array.from(sg.s), n = arr.length, cw = n ? sg.w / n : 0;
      for(let i = 0; i < n; i++) chars.push({ c: arr[i] === '\u00a0' ? ' ' : arr[i], x: sg.x + cw * (i + 0.5) });
      if(sg.s.trim()) prevEnd = sg.x + sg.w;
    }
    for(const ch of chars){                                  // u = 밑줄, b = 상자(위아래 선이 모두 있음)
      const hit = ch.c !== ' ' && unders.find(u=>ch.x >= u.x0 - 0.8 && ch.x <= u.x1 + 0.8);
      ch.m = hit ? (hit.box ? 'b' : 'u') : '';
    }
    let out = '', on = '';
    for(let i = 0; i < chars.length; i++){
      const ch = chars[i];
      if(ch.c === ' '){                                       // 표시 사이의 빈칸은 표시에 포함
        const nx = chars.slice(i + 1).find(c=>c.c !== ' ');
        if(on && !(nx && nx.m === on)){ out += '{/' + on + '}'; on = ''; }
        out += ' '; continue;
      }
      if(ch.m !== on){ if(on) out += '{/' + on + '}'; if(ch.m) out += '{' + ch.m + '}'; on = ch.m; }
      out += ch.c;
    }
    if(on) out += '{/' + on + '}';
    return out.replace(/\s+/g, ' ').replace(/\{\/b\} (?=(은|는|이|가|을|를|의|에|와|과|도|로|으로|에서|에게|이라는|라는)(?![가-힣]))/g, '{/b}').trim();
  }
  function pageLines(pg, pageIdx){
    const g = findGutter(pg);
    const cols = g ? [[], []] : [[]];
    const wide = [];
    for(const it of pg.items){
      if(g && it.x < g - 2 && it.x + it.w > g + 2 && it.s.trim()){ wide.push(it); continue; }   // 단을 가로지르는 글(머리말)
      cols[g && it.x >= g ? 1 : 0].push(it);
    }
    const out = [];
    const build = (items, col)=>{
      items = items.slice().sort((a, b)=>(a.y - b.y) || (a.x - b.x));
      const rows = [];
      for(const it of items){
        const r = rows[rows.length - 1];
        if(r && Math.abs(it.y - r.y) <= Math.max(3.2, Math.min(it.h, r.h) * 0.45)){ r.segs.push(it); if(it.s.trim() && it.h >= r.h){ r.h = it.h; r.y = it.y; } }
        else rows.push({ y: it.y, h: it.h, segs: [it] });
      }
      for(const r of rows){
        const segs = r.segs.filter(s=>s.s.trim() || s.s === ' ').sort((a, b)=>a.x - b.x);
        const ink = segs.filter(s=>s.s.trim());
        if(!ink.length) continue;
        const x0 = ink[0].x, x1 = Math.max(...ink.map(s=>s.x + s.w));
        const unders = pg.hlines.filter(l=>l.y - r.y > 0.4 && l.y - r.y < r.h * 0.5 + 1.5 && l.x0 >= x0 - 2.5 && l.x1 <= x1 + 2.5 && l.x1 - l.x0 > 3)
          .map(l=>({ x0: l.x0, x1: l.x1, box: pg.hlines.some(t=>r.y - t.y > r.h * 0.6 && r.y - t.y < r.h * 1.5 && Math.abs(t.x0 - l.x0) < 2 && Math.abs(t.x1 - l.x1) < 2) }));
        const text = lineText(segs, unders);
        if(!text) continue;
        out.push({ page: pageIdx, col, y: r.y, h: r.h, x0, x1, text, first: ink[0].s.trim() });
      }
    };
    build(wide, -1);
    cols.forEach((c, k)=>build(c, k));
    for(const im of (pg.images || [])){                     // 본문 속 그림(표·도식·자료 상자) = 읽는 순서 속 한 줄
      const w = im.x1 - im.x0, h = im.y1 - im.y0;
      if(w < 45 || h < 28 || im.y0 < pg.h * 0.1 || w > pg.w * 0.9) continue;
      if(g && im.x0 < g - 4 && im.x1 > g + 4) continue;
      const col = g && (im.x0 + im.x1) / 2 >= g ? 1 : 0;
      if(out.some(l=>l.col === col && l.y - l.h > im.y0 + 2 && l.y < im.y1 - 2 && l.x0 >= im.x0 - 2 && l.x1 <= im.x1 + 2)) continue;   // 글자 뒤 바탕 그림
      out.push({ page: pageIdx, col, y: im.y1, h: h, x0: im.x0, x1: im.x1, text: '[그림]', first: '[그림]', img: true });
    }
    return { lines: out, gutter: g };
  }

  /* ── 3. 머리말·꼬리말 걸러 내기 ── */
  const DROP_RE = [/^\d{4}학년도 .*(문제지|모의평가|학력평가)/, /^제\s*\d\s*교시$/, /^(홀수|짝수)형$/, /^국어\s*영역(\s*\(.*\))?$/, /^\d+\s*(\/\s*)?\d*$/,
    /저작권은 한국교육과정평가원/, /^\*\s*확인 사항/, /답안지의 해당란에 필요한 내용을/, /선택한 과목인지 확인하시오/, /^이어서,? .*선택과목.*문제가 제시/, /^\d+\s+\d+$/];
  function dropHeaders(pages){                              // pages: [{lines, h}] — 여러 쪽에 같은 자리·같은 글로 되풀이되는 줄
    const norm = t=>t.replace(/\{\/?[ub]\}/g, '').replace(/\d+/g, '#').replace(/\s+/g, '');
    const seen = new Map();
    pages.forEach((p, pi)=>p.lines.forEach(l=>{ if(l.y < p.h * 0.13 || l.y > p.h * 0.9){ const k = norm(l.text) + '@' + Math.round(l.y / 12); if(!seen.has(k)) seen.set(k, new Set()); seen.get(k).add(pi); } }));
    const need = Math.max(2, Math.ceil(pages.length * 0.3));
    let section = '';
    for(const p of pages){
      p.lines = p.lines.filter(l=>{
        const t = l.text.replace(/\{\/?[ub]\}/g, '').trim();
        const m = t.match(SECTION_RE);
        if(m && l.y < p.h * 0.2){ l.sectionMark = m[1]; return true; }      // (화법과 작문) 같은 선택과목 표시는 남겨서 구역 이름으로
        if(l.col === -1) return false;                                       // 단을 가로지르는 머리말
        if(DROP_RE.some(re=>re.test(t))) return false;
        if(l.y < p.h * 0.13 || l.y > p.h * 0.9){ const k = norm(l.text) + '@' + Math.round(l.y / 12); if(pages.length > 1 && seen.get(k) && seen.get(k).size >= need) return false; }
        return true;
      });
    }
    return section;
  }

  /* ── 4. 줄 이어 붙이기 ── */
  const tokNorm = t=>t.replace(/\{\/?[ub]\}/g, '').replace(/^[^0-9A-Za-z가-힣㉠-㉯ⓐ-ⓩ]+|[^0-9A-Za-z가-힣㉠-㉯ⓐ-ⓩ]+$/g, '');
  function buildVocab(lines){                               // 줄 안쪽(양 끝 제외)에 온전히 나온 어절
    const v = new Map();
    for(const l of lines){
      if(l.img) continue;
      const ts = l.text.split(' ');
      for(let i = 1; i < ts.length - 1; i++){ const t = tokNorm(ts[i]); if(t) v.set(t, (v.get(t) || 0) + 1); }
    }
    return v;
  }
  const TAIL_RE = /^(은|는|이|가|을|를|의|에|와|과|도|만|로|으로|에서|에게|에는|에도|부터|까지|보다|처럼|이다|이며|이고|이라|이란|이나|하다|한다|하며|하고|하여|해서|했다|하는|하지|한|할|함|된다|되어|되는|되고|된|될|됨|지만|므로|면서|다는|라는|라고|다고|었다|았다|였다|였고|있다|없다|적|적인|적으로|들|들이|들은|들을|들의)$/;
  function needSpace(a, b, vocab){                          // 줄 끝 어절 a + 다음 줄 첫 어절 b 사이를 띄울까 → [띄움?, 확실?]
    const A = tokNorm(a), B = tokNorm(b);
    if(!A || !B) return [true, true];
    const a0 = a.replace(/\{\/?[ub]\}/g, ''), b0 = b.replace(/\{\/?[ub]\}/g, '');
    if(/^\([一-龥A-Za-z]/.test(b0) && /[가-힣]$/.test(a0)) return [false, false];       // 화민성속 + (化民成俗) 처럼 풀이 괄호는 앞말에 붙임
    if(/[.,?!:;)\]”’』」〉>]$/.test(a0) || /^[(\[“‘『「〈<①-⑩㉠-㉯ⓐ-ⓩ]/.test(b0)) return [true, true];
    if(vocab.has(A + B)) return [false, true];
    const hasA = vocab.has(A), hasB = vocab.has(B);
    if(TAIL_RE.test(B) && !hasB) return [false, false];     // 조사·어미로만 된 조각은 앞말에 붙임
    return [true, hasA && hasB];                            // 그 밖에는 띄움(양쪽 어절이 문서에 따로 나오면 확실)
  }
  function joinLines(lines, vocab, mode){                   // mode 'flow': 문단 구분 없이 한 덩어리(발문·선지), 'para': 문단·행 구분 유지(지문·보기)
    if(!lines.length) return '';
    const key = l=>l.page + ':' + l.col, left = new Map(), right = new Map();
    for(const l of lines){ const k = key(l); left.set(k, Math.min(left.has(k) ? left.get(k) : 1e9, l.x0)); right.set(k, Math.max(right.get(k) || 0, l.x1)); }
    // 덩어리 모양: 대부분의 줄이 왼쪽 끝에서 시작(들여쓰기 문단) / 대부분이 안쪽에서 시작(내어쓰기 — 대화 "학생 1 : …", 목록)
    const isIn = l=>l.x0 - left.get(key(l)) > l.h * 0.55;
    const txt = lines.filter(l=>!l.img), hanging = txt.length >= 3 && txt.filter(isIn).length > txt.length / 2;
    // 시처럼 오른쪽 끝까지 찬 줄이 거의 없는 덩어리는 줄마다 끊는다(가장 긴 행 하나가 '꽉 찬 줄'로 보이는 것 방지)
    const full = txt.filter(l=>right.get(key(l)) - l.x1 <= 1.5).length, verse = txt.length >= 4 && full / txt.length < 0.3;
    let out = lines[0].text;
    for(let i = 1; i < lines.length; i++){
      const p = lines[i-1], l = lines[i];
      let br = false;
      if(mode === 'para' && verse) br = true;
      else if(mode === 'para'){
        const sameCol = key(p) === key(l);
        const prevShort = right.get(key(p)) - p.x1 > p.h * 1.3;
        const indented = hanging ? !isIn(l) : (isIn(l) && !(isIn(p) && sameCol && !prevShort));
        const gap = sameCol && l.y - p.y > Math.max(p.h, l.h) * 2.3;
        if(l.img || p.img){ out += '\n' + l.text; continue; }
        const label = PART_RE.test(tokStrip(l.text)) || PART_RE.test(tokStrip(p.text)) || VIEW_RE.test(tokStrip(l.text)) || VIEW_RE.test(tokStrip(p.text));
        br = (hanging ? false : prevShort) || indented || gap || label;
      }
      if(br || l.img || p.img){ out += '\n' + l.text; continue; }
      const a = p.text.split(' ').pop(), b = l.text.split(' ')[0];
      const [sp, sure] = needSpace(a, b, vocab);
      out += (sure ? (sp ? ' ' : '') : (sp ? J1 : J0)) + l.text;
    }
    return out.replace(/\{\/([ub])\}([ \uE000\uE001]?)\{\1\}/g, '$2');                 // 줄을 넘어 이어지는 밑줄은 하나로
  }
  const tokStrip = t=>t.replace(/\{\/?[ub]\}/g, '').trim();
  const plain = t=>String(t || '').replace(/\uE000/g, '').replace(/\uE001/g, ' ');
  const joinCount = t=>(String(t || '').match(/[\uE000\uE001]/g) || []).length;

  /* ── 5. 세트·문항으로 나누기 ── */
  function rectsOf(lines, pages){                           // 줄들 → (쪽, 단)별 사각형 — 원본 잘라 보기용
    const m = new Map();
    for(const l of lines){
      const k = l.page + ':' + l.col;
      const r = m.get(k) || { page: l.page, col: l.col, x0: 1e9, x1: 0, y0: 1e9, y1: 0 };
      r.x0 = Math.min(r.x0, l.x0); r.x1 = Math.max(r.x1, l.x1); r.y0 = Math.min(r.y0, l.y - l.h); r.y1 = Math.max(r.y1, l.img ? l.y : l.y + l.h * 0.35);
      m.set(k, r);
    }
    return [...m.values()].map(r=>{
      const pg = pages[r.page], g = pg.gutter, pad = 6;
      const cx0 = r.col === 1 ? g + 2 : pg.w * 0.03, cx1 = r.col === 0 && g ? g - 2 : pg.w * 0.97;      // 단 너비 전체(그림·표가 글자보다 넓을 수 있음)
      return { page: r.page, x: Math.max(0, Math.min(cx0, r.x0 - pad)), y: Math.max(0, r.y0 - pad), w: Math.max(cx1, r.x1 + pad) - Math.max(0, Math.min(cx0, r.x0 - pad)), h: r.y1 - r.y0 + pad * 2 };
    });
  }
  function itemStart(l, expect){                            // 이 줄이 문항 번호로 시작하나 → 번호
    const t = tokStrip(l.text);
    let m = t.match(/^(\d{1,2})\.\s*(\S|$)/);
    if(m && !/^\d{1,2}\.\d/.test(t)) return +m[1];
    m = t.match(/^(\d{1,2})\s+\S/);                          // 번호가 마침표 없는 배지("12 높임 표현이…")인 시험지: 기다리던 번호일 때만
    if(m && expect != null && +m[1] === expect && /^\d{1,2}$/.test(l.first)) return +m[1];
    return null;
  }
  function splitChoices(lines, vocab){
    const groups = []; let cur = null, pre = [];
    for(const l of lines){
      const t = tokStrip(l.text);
      if(CIRC.includes(t[0])){
        // 한 줄에 선지가 여러 개(① 3 ② 4 ③ 5)면 쪼갠다
        const parts = l.text.split(new RegExp('(?=[' + CIRC + '])')).map(s=>s.trim()).filter(Boolean);
        parts.forEach((ptxt, k)=>{ cur = { lines: [k === 0 ? { ...l, text: ptxt } : { ...l, text: ptxt, x0: l.x0 + 1 }] }; groups.push(cur); });
      } else if(cur) cur.lines.push(l);
      else pre.push(l);
    }
    return { pre, choices: groups.map(g=>joinLines(g.lines, vocab, 'flow')) };
  }
  function parseItem(num, lines, vocab, pages){
    const { pre, choices } = splitChoices(lines, vocab);
    // 발문: 번호 줄부터 "…것은?" / "…시오." / "[3점]" 으로 끝나는 줄까지. 나머지는 <보기>·자료
    let end = pre.findIndex(l=>/(\?|시오\.|\[\s*\d\s*점\s*\])\s*$/.test(tokStrip(l.text)));
    if(end >= 0 && pre[end+1] && /^\[\s*\d\s*점\s*\]$/.test(tokStrip(pre[end+1].text))) end++;
    const viewAt = pre.findIndex(l=>VIEW_RE.test(tokStrip(l.text)));
    if(end < 0) end = viewAt > 0 ? viewAt - 1 : pre.length - 1;
    if(viewAt >= 0 && viewAt <= end) end = viewAt - 1;
    const stemLines = pre.slice(0, end + 1), viewLines = pre.slice(end + 1);
    let stem = joinLines(stemLines, vocab, 'flow').replace(/^(\{u\})?\d{1,2}\.?\s*/, '$1').trim();
    let points = null; const pm = plain(stem).match(/\[\s*(\d)\s*점\s*\]/); if(pm) points = +pm[1];
    let viewLabel = '', vl = viewLines;
    if(vl.length && VIEW_RE.test(tokStrip(vl[0].text))){ viewLabel = tokStrip(vl[0].text).replace(/\s+/g, '').replace(/[<>]/g, ''); vl = vl.slice(1); }
    return { num, stem, view: joinLines(vl, vocab, 'para'), viewLabel, choices, points, rects: rectsOf(lines, pages) };
  }
  function segment(pagesRaw){                               // pagesRaw: extractPage 결과 배열 → { sets, items, warnings, stats }
    const pages = pagesRaw.map((pg, i)=>{ const r = pageLines(pg, i); return { w: pg.w, h: pg.h, gutter: r.gutter, lines: r.lines }; });
    dropHeaders(pages);
    const stream = [];
    for(const p of pages){
      const byCol = new Map();
      for(const l of p.lines){ if(!byCol.has(l.col)) byCol.set(l.col, []); byCol.get(l.col).push(l); }
      [...byCol.keys()].sort((a, b)=>a - b).forEach(c=>stream.push(...byCol.get(c).sort((a, b)=>a.y - b.y)));
    }
    const vocab = buildVocab(stream);
    const sets = [], items = [], warnings = [];
    let section = '', curSet = null, curItem = null, passageLines = null, last = null, sectionIdx = 0, sawChoice = false;
    const restart = ()=>{ if(!sawChoice){ items.length = 0; sets.length = 0; curItem = null; curSet = null; passageLines = null; } last = null; };
    const closeItem = ()=>{
      if(!curItem) return;
      const it = parseItem(curItem.num, curItem.lines, vocab, pages);
      it.section = section; it.sectionIdx = sectionIdx; it.setIdx = curItem.set ? sets.indexOf(curItem.set) : -1;
      if(it.setIdx < 0 && curItem.group) it.group = curItem.group;
      items.push(it); if(curItem.set) curItem.set.items.push(it);
      curItem = null;
    };
    const closePassage = ()=>{
      if(!curSet || !passageLines) return;
      curSet.body = joinLines(passageLines, vocab, 'para');
      curSet.rects = rectsOf(passageLines, pages);
      passageLines = null;
    };
    for(const l of stream){
      const t = tokStrip(l.text);
      if(l.sectionMark){ if(l.sectionMark !== section){ closeItem(); closePassage(); section = l.sectionMark; sectionIdx++; last = null; curSet = null; } continue; }
      const sm = t.match(SET_RE);
      if(sm && l.x0 - (l.col === 1 ? pages[l.page].gutter : 0) < pages[l.page].w * 0.12){
        closeItem(); closePassage();
        const from = +sm[1], to = sm[2] ? +sm[2] : +sm[1];
        if(last != null && from <= last){ if(sawChoice) sectionIdx++; restart(); }      // 번호가 되돌아가면 새 구역(앞이 표지 안내문이면 버림)
        curSet = { from, to, head: sm[3].trim(), headLines: [l], section, sectionIdx, body: '', rects: [], items: [] };
        sets.push(curSet); passageLines = []; continue;
      }
      const expect = last == null ? (curSet ? curSet.from : null) : last + 1;
      if(last != null && last > 1 && !sawChoice && /^1\.\s*\S/.test(t) && !curSet) restart();
      const n = itemStart(l, last == null ? (curSet ? curSet.from : 1) : expect);
      const okSeq = n != null && (last == null || n === last + 1 || (curSet && n >= curSet.from && n <= curSet.to && n > last) || (n > last && n - last <= 2));
      if(n != null && okSeq){
        closeItem();
        if(passageLines){
          if(curSet.headLines.length && !passageLines.length && curSet.head && !/시오\.?$/.test(curSet.head)) curSet.label = curSet.head;
          closePassage();
        }
        if(curSet && (n < curSet.from || n > curSet.to)) curSet = null;                   // 세트 범위를 벗어난 번호 = 단독 문항
        curItem = { num: n, lines: [l], set: curSet && (curSet.body || curSet.label == null) ? curSet : null, group: curSet && curSet.label ? curSet.label : '' };
        if(curSet && !curSet.body) { curItem.set = null; curItem.group = curSet.label || curSet.head || ''; }
        last = n; continue;
      }
      if(curItem){ if(CIRC.includes(t[0])) sawChoice = true; curItem.lines.push(l); continue; }
      if(passageLines){
        if(!passageLines.length && curSet.headLines.length === 1 && !/(시오|답하시오)\.?$/.test(curSet.head) && l.y - curSet.headLines[0].y < l.h * 1.9 && l.col === curSet.headLines[0].col && /(시오)\.?$/.test(t)){
          curSet.head += ' ' + t; curSet.headLines.push(l); continue;                    // 두 줄짜리 세트 머리말
        }
        passageLines.push(l); continue;
      }
      // 어디에도 속하지 않는 줄(표지·안내문)은 버림
    }
    closeItem(); closePassage();
    const real = sets.filter(s=>s.body);                    // 지문 없는 [1~4] 어휘력 같은 묶음 머리말은 세트에서 뺌
    items.forEach(it=>{ it.setIdx = it.setIdx >= 0 ? real.indexOf(sets[it.setIdx]) : -1; });
    for(const s of real){
      const got = s.items.map(i=>i.num), want = []; for(let n = s.from; n <= s.to; n++) want.push(n);
      const miss = want.filter(n=>!got.includes(n));
      if(miss.length) warnings.push(`[${s.from}~${s.to}] 세트에서 ${miss.join(', ')}번을 못 찾았습니다`);
      delete s.headLines; s.oldHangul = hasOldHangul(s.body);
    }
    for(const it of items){
      if(it.choices.length && it.choices.length !== 5) warnings.push(`${it.section ? '(' + it.section + ') ' : ''}${it.num}번 선택지가 ${it.choices.length}개로 읽혔습니다`);
      if(!plain(it.stem)) warnings.push(`${it.num}번 발문이 비어 있습니다`);
      it.oldHangul = hasOldHangul(it.stem + it.view + it.choices.join(''));
    }
    const joins = real.reduce((s, x)=>s + joinCount(x.body), 0) + items.reduce((s, x)=>s + joinCount(x.stem) + joinCount(x.view) + x.choices.reduce((a, c)=>a + joinCount(c), 0), 0);
    return { sets: real, items, warnings, stats: { pages: pages.length, sets: real.length, items: items.length, unsureJoins: joins } };
  }

  /* ── 6. 정답·해설지 읽기 (EBS식: "01. ③ 02. ④ …" 표 + "N. 유형" / "정답해설 :" / "정답 ③" / "[오답피하기]") ── */
  function parseSolutionText(text){                         // → { sections: [{ name, answers:{번호:정답}, items:{번호:{type, explain, wrong}}, sets:[{from,to,area,title,summary,theme}] }] }
    const lines = String(text || '').split(/\r?\n/).map(s=>s.replace(/\s+$/, ''));
    const sections = []; let sec = null, item = null, set = null, mode = '';
    const vocab = buildVocab(lines.map(l=>({ text: l.trim() })));
    const add = (prev, t)=>{                                 // 해설지도 줄 끝에서 낱말이 끊긴다 — 같은 방식으로 추정
      if(!prev) return t;
      const [sp, sure] = needSpace(prev.split(/[ \uE000\uE001]/).pop(), t.split(' ')[0], vocab);
      return prev + (sure ? (sp ? ' ' : '') : (sp ? J1 : J0)) + t;
    };
    const AREA_RE = /^(독서|문학|화법과 작문|화법|작문|언어와 매체|언어|매체)$/;
    const unq = t=>t.replace(/[‘’'“”"「」『』]/g, '').trim();
    const newSec = name=>{ sec = { name, answers: {}, items: {}, sets: [] }; sections.push(sec); item = null; set = null; };
    const flush = ()=>{ if(item){ item.explain = item.explain.trim(); item.wrong = item.wrong.trim(); } };
    for(const raw of lines){
      const t = raw.trim();
      if(!t || /^\d+$/.test(t)) continue;
      let m;
      if((m = t.match(/^■\s*\[?\s*([^\]]+?)\s*\]?$/))){ flush(); newSec(m[1].replace(/^(공통|선택)\s*:\s*/, '')); continue; }
      const pairs = [...t.matchAll(/(\d{1,2})\.\s*([①②③④⑤]|\d+)(?=\s|$)/g)];
      if(pairs.length >= 3 && t.replace(/(\d{1,2})\.\s*([①②③④⑤]|\d+)/g, '').trim() === ''){
        if(!sec) newSec('');
        pairs.forEach(p=>{ sec.answers[+p[1]] = p[2]; }); continue;
      }
      if(!sec) newSec('');
      if((m = t.match(/^\[\s*(\d{1,2})\s*[~\-～–]\s*(\d{1,2})\s*\]\s*(.*)$/))){
        flush(); item = null;
        const rest = m[3].trim(), from = +m[1], to = +m[2];
        // "[1~3] 독서"(영역만) / "[1-3] 독서 이론, ‘제목’" / "[22-27] 현대시 - (가) 작가, ‘작품’ / (나) …" / "[35~36] ‘제목’"
        let area = '', genre = '', title = '';
        if(AREA_RE.test(rest)) area = rest;
        else {
          const gm = rest.match(/^([^,，‘'“"(]{1,14}?)\s*(?:[,，]|\s[-_–]\s)\s*(.+)$/);
          if(gm){ genre = gm[1].trim(); const q = gm[2].match(/^[‘'“"]([^’'”"]+)[’'”"]$/); title = q ? q[1].trim() : unq(gm[2]); }
          else title = unq(rest);
        }
        const prev = sec.sets[sec.sets.length - 1];
        if(prev && prev.from === from && prev.to === to){ set = prev; if(genre) set.genre = genre; if(title) set.title = title; if(area) set.area = area; }
        else { set = { from, to, area, genre, title, summary: '', theme: '' }; sec.sets.push(set); }
        mode = 'set'; continue;
      }
      if((m = t.match(/^(\d{1,2})\.\s+(\S.{0,40})$/)) && !/정답|해설/.test(m[2])){
        flush(); item = sec.items[+m[1]] = { type: m[2].trim(), explain: '', wrong: '' }; mode = 'item'; continue;
      }
      if((m = t.match(/^\[주제\]\s*(.*)$/)) && set){ set.theme = m[1].trim(); continue; }
      if((m = t.match(/^지문\s*해설\s*:\s*(.*)$/)) && set){ set.summary = m[1]; mode = 'summary'; continue; }
      if((m = t.match(/^정답\s*해설\s*:\s*(.*)$/)) && item){ item.explain = m[1]; mode = 'explain'; continue; }
      if((m = t.match(/^정답\s*([①②③④⑤]|\d+)$/)) && item){ item.answer = m[1]; continue; }
      if((m = t.match(/^\[오답\s*피하기\]\s*(.*)$/)) && item){ item.wrong = m[1]; mode = 'wrong'; continue; }
      if(mode === 'summary' && set) set.summary = add(set.summary, t);
      else if(mode === 'explain' && item) item.explain = add(item.explain, t);
      else if(mode === 'wrong' && item) item.wrong = add(item.wrong, t);
    }
    flush();
    return { sections: sections.filter(s=>Object.keys(s.answers).length || Object.keys(s.items).length) };
  }
  function pagesToText(pagesRaw){                           // 해설지처럼 한 단짜리 문서를 줄 글로
    return pagesRaw.map((pg, i)=>pageLines(pg, i).lines.sort((a, b)=>(a.col - b.col) || (a.y - b.y)).map(l=>tokStrip(l.text)).join('\n')).join('\n');
  }

  return { extractPage, pageLines, segment, parseSolutionText, pagesToText, plain, joinCount, needSpace, buildVocab, hasOldHangul, J0, J1, CIRC };
});
