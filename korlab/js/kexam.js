/* 스터디피크 국어 랩 — 시험 한 회차를 표로: 문항 행 만들기 → 유형 분류표(2시트) · LMS ExamTemplate(국어 규격) · 점검
 * 화면 없이 계산만 한다(브라우저 window.KX, Node require). 규격 근거: 국어 프로젝트 컨텍스트 「ExamTemplate 업로드 규격」「화작·매체 LMS 업로드」 */
(function(root, factory){
  const o = factory(typeof module === 'object' && module.exports ? require('./ktype.js') : root.KT);
  if(typeof module === 'object' && module.exports) module.exports = o; else root.KX = o;
})(typeof self !== 'undefined' ? self : this, function(KT){
  'use strict';
  const CIRC = '①②③④⑤';
  const sectionKey = s=>String(s || '').replace(/\s/g, '');
  /* 시험(출처 이름) 하나의 문항 → 행. opts.section: 선택 과목 이름('' 이면 공통만 있는 시험). 변형 문항은 뺀다.
   * 행 { id, num, section, cat, sub, title, author, typeId, subTypes[], nature, answer(1~5|0), points, review{alt,why}|null, note, gkey, single } */
  function rows(passages, items, srcName, opts){
    opts = opts || {};
    const want = sectionKey(opts.section), pOf = new Map(passages.map(p=>[p.id, p]));
    const list = items.filter(i=>i.src && i.src.name === srcName && !i.variantOf && (!i.section || sectionKey(i.section) === want))
      .sort((a, b)=>(a.num - b.num) || ((a.createdAt || 0) - (b.createdAt || 0)));
    return list.map(it=>{
      const p = it.passageId ? pOf.get(it.passageId) : null, h = p || it;
      return { id: it.id, num: it.num, section: it.section || '', cat: h.cat || '', sub: h.sub || '', title: h.title || '', author: h.author || '',
        typeId: it.typeId || '', subTypes: (it.subTypes || []).slice(), nature: it.nature || '', answer: KT.ansNo(it.answer), points: +it.points || 0,
        review: it.review || null, note: it.note || '', ansBy: it.ansBy || '', ansAi: +it.ansAi || 0, gkey: p ? p.id : (it.group ? 'g:' + it.group + ':' + (it.section || '') : it.id), single: !p };
    });
  }
  const sections = (items, srcName)=>[...new Set(items.filter(i=>i.src && i.src.name === srcName && i.section).map(i=>i.section))];
  /* 이어진 같은 지문끼리 한 그룹 */
  function groups(rs){
    const out = [];
    for(const r of rs){ const g = out[out.length - 1]; if(g && g.key === r.gkey) g.rows.push(r); else out.push({ key: r.gkey, rows: [r] }); }
    return out;
  }
  const typeCell = r=>KT.typed(r.cat) ? [r.typeId].concat(r.subTypes || []).filter(KT.has) : [];
  const noteOf = r=>[r.review ? `검토 요망${r.review.alt ? ` (대안 ${r.review.alt})` : ''}${r.review.why ? ': ' + r.review.why : ''}` : '', r.note || ''].filter(Boolean).join(' / ');

  /* ① 유형 분류표: [전체] [유형 분포] — 화작·매체는 유형 '—', 분포에서 제외. 복합 유형은 " + " 로 잇고 분포는 대표(첫) 유형으로 센다 */
  function classSheets(rs){
    const H = v=>({ v, st: 'h1' });
    const all = [['문항번호', '카테고리', '하위카테고리', '지문', '유형ID', '유형명', '정답', '배점', '비고'].map(H)];
    for(const r of rs){
      const ts = typeCell(r);
      all.push([r.num, r.cat, r.sub, r.title, ts.length ? ts.join(' + ') : '—', ts.length ? ts.map(KT.name).join(' + ') : '—', r.answer ? CIRC[r.answer - 1] : '', r.points || '', noteOf(r)]);
    }
    const dist = [['카테고리', '유형ID', '유형명', '문항 수', '배점 합계', '문항번호'].map(H)];
    for(const t of KT.TYPES){
      const hit = rs.filter(r=>KT.typed(r.cat) && r.typeId === t.id);
      if(hit.length) dist.push([t.cat, t.id, KT.name(t.id), hit.length, hit.reduce((s, r)=>s + (r.points || 0), 0), hit.map(r=>r.num).join(', ')]);
    }
    return [{ name: '전체', rows: all, widths: { A: 10, B: 12, C: 16, D: 46, E: 12, F: 34, G: 8, H: 8, I: 44 } },
      { name: '유형 분포', rows: dist, widths: { A: 12, B: 10, C: 34, D: 10, E: 12, F: 40 } }];
  }
  function distribution(rs){
    return KT.TYPES.map(t=>{ const hit = rs.filter(r=>KT.typed(r.cat) && r.typeId === t.id); return { id: t.id, cat: t.cat, name: KT.name(t.id), n: hit.length, pts: hit.reduce((s, r)=>s + (r.points || 0), 0), nums: hit.map(r=>r.num) }; }).filter(x=>x.n);
  }

  /* ② LMS 행: 화작·매체는 fallback(독서 / 독서이론 + R코드)으로 치환 */
  function lmsRow(r){
    if(KT.typed(r.cat)) return { cat: r.cat, sub: r.sub, type: KT.has(r.typeId) ? KT.label(r.typeId) : '', fb: false, est: false };
    const fb = KT.fallbackOf(r.nature);
    return { cat: '독서', sub: '독서이론', type: fb ? KT.label(fb.id) : '', fb: true, est: !fb || fb.est };
  }
  const GROUP_HEAD = ['Group Order', 'Category', 'Subcategory', 'Question Type', 'Article Title', 'Article Author', 'Article Tag', 'Page From', 'Page To'];
  const ITEM_HEAD = ['Number of questions', 'Category', 'Subcategory', 'Question Type', 'Question Answer Type', 'Level', 'Recommend AnswerTime (mm:ss)', 'Number of answers', 'Score', 'Correct Choices', 'Correct Textual Answers', 'Compare Type', 'Unit', 'Without Answers'];
  const LOOKUP = [['Single Choice', 'General', 'No', null, null, null, null, 'Order Matters'], ['Multiple Choice', 'Easy', 'Yes', null, null, null, null, 'Order Does Not Matter'],
    ['Short Answer', 'Differential', null, null, null, null, null, 'Synonym Processing'], ['Order Matters', 'Trick'], ['Order Does Not Matter', 'Difficult'], ['Synonym Processing', 'Super Difficult']];
  function lmsSheets(rs, meta){
    const T = v=>({ v, st: 'text' });
    const out = [['Exam Name', 'Subject', 'Duration (minutes)'].map(v=>({ v, st: 'h1' })), [meta.name || '', meta.subject || '국어', +meta.duration || 80], null];
    groups(rs).forEach((g, k)=>{
      const f = g.rows[0], l0 = lmsRow(f);
      out.push(GROUP_HEAD.map(v=>({ v, st: 'hg' })));
      out.push([{ v: k + 1, st: 'text' }, l0.cat, l0.sub, l0.type, f.title || '', f.cat === '문학' ? (f.author || '') : '', '', '', '']);
      out.push(ITEM_HEAD.map(v=>({ v, st: 'hi' })));
      for(const r of g.rows){
        const l = lmsRow(r), lv = KT.level(r.points);
        out.push([T(String(r.num)), l0.cat, l0.sub, l.type, 'Single Choice', lv.level, lv.time, T('5'), r.points || 0, T(r.answer ? String(r.answer) : ''), '', '', '', 'No']);
      }
    });
    return [{ name: 'ExamTemplate', rows: out, widths: { A: 22, B: 12, C: 18, D: 30, E: 52, F: 22, G: 14, H: 12, J: 22, L: 18, M: 12, N: 16 } },
      { name: '_Lookup', hidden: true, rows: LOOKUP }];
  }
  /* 올리기 전 점검 → { errors[], warns[], flags[](검토 요망 표), aux[](LMS에서 빠지는 보조 유형), fallback(치환된 문항 번호) } */
  function check(rs){
    const errors = [], warns = [], flags = [], aux = [], fallback = [];
    if(!rs.length) errors.push('문항이 없습니다.');
    groups(rs).forEach(g=>{
      const f = g.rows[0], range = g.rows.length > 1 ? `${f.num}~${g.rows[g.rows.length - 1].num}번` : `${f.num}번`;
      if(!f.cat) errors.push(`${range}: 대분류가 비어 있음 (LMS: 카테고리는 필수 항목입니다)`);
      else if(!KT.CATS.includes(f.cat)) errors.push(`${range}: 대분류 '${f.cat}' 는 LMS에 없는 값`);
      else if(!f.sub) errors.push(`${range}: 소분류가 비어 있음 (LMS: 카테고리는 필수 항목입니다)`);
      else if(!KT.subs(f.cat).includes(f.sub)) errors.push(`${range}: (${f.cat}, ${f.sub}) 조합이 LMS 카테고리에 없음`);
      for(const m of KT.titleIssues(f.cat, f.title)) (m === '제목이 비어 있음' ? errors : warns).push(`${range} 지문 제목: ${m}`);
      if(f.cat === '문학' && !f.author) warns.push(`${range}: 문학인데 작성자(작가)가 비어 있음`);
    });
    const seen = new Set(), noAns = [], noPts = [], byAi = [];
    const list = a=>a.slice(0, 15).join(', ') + (a.length > 15 ? ' …' : '');
    for(const r of rs){
      const l = lmsRow(r);
      if(seen.has(r.num)) errors.push(`${r.num}번이 두 번 들어 있음 — 선택 과목을 확인하세요`); seen.add(r.num);
      if(!l.type) errors.push(`${r.num}번: 유형이 비어 있음 (LMS: 질문 유형은 필수입니다)`);
      if(KT.typed(r.cat) && r.typeId && KT.catOfType(r.typeId) !== r.cat) errors.push(`${r.num}번: ${r.typeId} 는 ${KT.catOfType(r.typeId) || '마스터에 없는'} 유형 — ${r.cat} 문항에 쓸 수 없음 (LMS: 문제 유형을 찾을 수 없습니다)`);
      for(const s of r.subTypes || []) if(!KT.has(s) || KT.catOfType(s) !== r.cat) errors.push(`${r.num}번: 보조 유형 ${s} 가 ${r.cat} 유형이 아님`);
      if(!r.answer) noAns.push(r.num);
      if(!r.points) noPts.push(r.num); else if(r.points !== 2 && r.points !== 3) warns.push(`${r.num}번: 배점 ${r.points}점 — 2점·3점이 아니면 General·01:30 으로 들어감`);
      if(r.ansAi && r.answer) warns.push(`${r.num}번: 정답표는 ${CIRC[r.answer - 1]}, AI 풀이는 ${CIRC[r.ansAi - 1] || '?'} — 어느 쪽이 맞는지 확인`);
      if(r.ansBy === 'ai') byAi.push(r.num);
      if(l.fb){ fallback.push(r.num); if(l.est && l.type) warns.push(`${r.num}번(${r.cat}): 성격 '${r.nature || '미정'}' 은 치환표에 없어 ${l.type.slice(0, 3)} 로 추정`); }
      if(r.review) flags.push({ num: r.num, type: r.typeId || r.nature || '', alt: r.review.alt || '', why: r.review.why || '' });
      if((r.subTypes || []).length && KT.typed(r.cat)) aux.push({ num: r.num, main: r.typeId, subs: r.subTypes.slice() });
    }
    if(noAns.length) errors.push(`정답이 없음 (${noAns.length}문항): ${list(noAns)}번 — 정답·해설 PDF를 함께 올리거나 표에서 넣어 주세요`);
    if(byAi.length) warns.push(`AI가 풀어 채운 정답 (${byAi.length}문항): ${list(byAi)}번 — 정답표와 대조해 확정하세요`);
    if(noPts.length) errors.push(`배점 없음 (${noPts.length}문항): ${list(noPts)}번`);
    const total = rs.reduce((s, r)=>s + (r.points || 0), 0);
    return { errors, warns, flags, aux, fallback, total, count: rs.length, groups: groups(rs).length };
  }
  const ascii = s=>String(s || '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  /* 업로드용 파일명은 ASCII 만 (인코딩 깨짐 방지). 예) 2025_korean_speech_writing_exam_template_fallback.xlsx */
  function lmsFileName(srcName, section, hasFallback){
    const y = (String(srcName).match(/(20\d\d)/) || [])[1] || 'exam', m = (String(srcName).match(/(\d{1,2})\s*월/) || [])[1];
    const kind = /수능/.test(srcName) ? 'csat' : /모의|모평/.test(srcName) ? 'mock' : /학력|학평/.test(srcName) ? 'nat' : '';
    const sec = /화법|작문/.test(section || '') ? 'speech_writing' : /언어|매체/.test(section || '') ? 'language_media' : '';
    return [y, m ? String(m).padStart(2, '0') : '', kind, 'korean', sec, 'exam_template', hasFallback ? 'fallback' : ''].filter(Boolean).join('_') + '.xlsx';
  }
  return { rows, sections, groups, classSheets, distribution, lmsRow, lmsSheets, check, ascii, lmsFileName, GROUP_HEAD, ITEM_HEAD };
});
