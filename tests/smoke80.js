// smoke80: 국어 랩 유형 체계·엑셀 엔진 (화면 없이 Node) — 22유형 문자열(마스터 원문 그대로) · LMS 소분류 · 화작·매체 fallback 치환표 ·
//          규칙 분류(발문 + 해설지 이름) · 문학 제목(작가 「작품」) · 인용문 대조와 형광펜 자리 · 유형 분류표 2시트 · LMS ExamTemplate(14열, 빈 문자열 셀) · 업로드 전 점검
const path = require('path');
const KT = require('../korlab/js/ktype.js'), KX = require('../korlab/js/kexam.js'), KEV = require('../korlab/js/kev.js'), SPX = require('../shared/xlsx.js');
const JSZip = require('jszip');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  // ── 마스터 22종: LMS에 등록된 글자 그대로여야 한다(한 글자라도 다르면 업로드 거부) ──
  const MASTER = ['R01 세부 정보 파악', 'R02 중심 내용·주제 파악', 'R03 구조·전개 방식 파악', 'R04 공통점·차이점 비교', 'R05 밑줄·구절 의미 추론', 'R06 <보기> 적용 — 줄글 사례', 'R07 자료 해석·결합 — 그림·도표·그래프', 'R08 어휘·개념어 의미 파악', 'R09 비판·평가',
    'L01 세부 정보 파악', 'L02 중심 내용·주제 파악', 'L03 표현·서술상 특징 파악', 'L04 공통점·차이점 비교', 'L05 시어·구절·장면 의미 추론', 'L06 정서·태도·인물 심리 파악', 'L07 <보기> 적용 감상', 'L08 어휘·개념어 의미 파악',
    'G01 개념 이해', 'G02 구조 분석', 'G03 <보기> 규칙 적용', 'G04 <보기> 자료 탐구·비교', 'G05 사례 적용'];
  check('22유형: ID + 공백 + 유형명이 마스터와 한 글자도 다르지 않음', KT.TYPES.length === 22 && KT.TYPES.every((t, i) => KT.label(t.id) === MASTER[i]), KT.TYPES.map(t => KT.label(t.id)).filter((l, i) => l !== MASTER[i]).join(' | '));
  check('유형은 대분류별: 독서 9 · 문학 8 · 문법 5, 화작·매체는 유형 없음', KT.typesOf('독서').length === 9 && KT.typesOf('문학').length === 8 && KT.typesOf('문법').length === 5 && !KT.typesOf('매체').length && !KT.typed('화법과 작문') && KT.typed('문법'));
  check('LMS 소분류 문자열', KT.subs('독서').join() === '독서이론,인문/철학/예술,사회/경제/법,과학/기술,주제복합' && KT.subs('문학').join() === '현대시,현대소설,고전시,고전소설,고전 산문,극·수필,갈래 복합'
    && KT.subs('문법').join() === '음운,단어,문장,담화,국어사' && KT.subs('화법과 작문').join() === '화법,화법과 작문,작문' && KT.subs('매체').join() === '매체', KT.subs('문학').join());
  KT.opt.dash = '—'; KT.opt.drama = '극 수필';
  check('확인 필요 표기는 설정으로 바뀜(대시 공백·극 수필)', KT.label('R06') === 'R06 <보기> 적용—줄글 사례' && KT.subs('문학').includes('극 수필'), KT.label('R06'));
  KT.opt.dash = ' — '; KT.opt.drama = '극·수필';
  const fb = n => (KT.fallbackOf(n) || {}).id;
  check('화작·매체 fallback 치환표(2026-11-06판)', fb('말하기 방식·전략 파악') === 'R03' && fb('글쓰기 방법·전략 파악') === 'R03' && fb('고쳐쓰기 (표현·어법 수정)') === 'R03' && fb('매체 활용 목적·효과 파악') === 'R03'
    && fb('발화 내용 이해') === 'R01' && fb('매체 자료 내용 이해') === 'R01' && fb('매체 특성 파악') === 'R01' && fb('작문 계획·개요의 적절성') === 'R06' && fb('매체 자료 생산·편집의 적절성') === 'R06'
    && fb('자료 활용의 적절성') === 'R07' && fb('반응·태도의 적절성 평가') === 'R09' && fb('매체 비판적 수용') === 'R09' && fb('매체 언어·표현 분석') === 'R08' && KT.fallbackOf('없는 성격') === null);
  check('배점 → Level·권장 시간', KT.level(2).level === 'General' && KT.level(2).time === '01:30' && KT.level(3).level === 'Differential' && KT.level(3).time === '02:30');

  // ── 글자에서 분류 읽기 ──
  check('영역 이름 → 대분류·소분류', KT.catOf('화법').sub === '화법' && KT.catOf('화법과 작문').sub === '화법과 작문' && KT.catOf('작문').cat === '화법과 작문' && KT.catOf('언어').cat === '문법' && KT.catOf('매체').sub === '매체' && KT.catOf('') === null);
  check('갈래 글자 → LMS 소분류', KT.subOf('독서', '주제 통합', '') === '주제복합' && KT.subOf('독서', '기술', '') === '과학/기술' && KT.subOf('독서', '사회', '') === '사회/경제/법' && KT.subOf('독서', '독서 이론', '') === '독서이론'
    && KT.subOf('문학', '현대 소설', '') === '현대소설' && KT.subOf('문학', '고전시가', '') === '고전시' && KT.subOf('문학', '현대시', '수필') === '현대시' && KT.subOf('문법', '', '국어의 음운 변동') === '음운' && KT.subOf('문법', '', '인용 표현') === '문장' && KT.subOf('문법', '', '중세 국어의 표기법') === '국어사');
  const lt = KT.litTitle('(가) 김가을, 겨울 강 / (나) 박봄, 「새벽」'), cr = KT.titleFromCredits(KT.credits('…\n- 이여름, ｢한낮｣ -'));
  check('문학 제목 규칙: 작가 「작품」, 복수 작품은 (가)/(나), 작성자는 쉼표', lt.title === '(가) 김가을 「겨울 강」 / (나) 박봄 「새벽」' && lt.author === '김가을, 박봄' && cr.title === '이여름 「한낮」' && cr.author === '이여름', lt.title + ' | ' + cr.title);
  check('제목 점검: 접두어·대괄호 메모·문학 꼴', KT.titleIssues('문학', '현대 소설 — 봄').length >= 1 && KT.titleIssues('독서', '열섬 [힌트]').length === 1 && KT.titleIssues('문학', '이여름 「한낮」').length === 0 && KT.titleIssues('독서', '').length === 1);
  const g = (cat, stem, o) => KT.guess(Object.assign({ stem }, o || {}), cat);
  check('규칙 분류(독서)', g('독서', '윗글의 내용과 일치하지 않는 것은?', { solType: '세부 내용 파악' }).id === 'R01' && g('독서', '윗글을 바탕으로 <보기>를 이해한 내용으로 적절하지 않은 것은?', { view: '사례 글' }).id === 'R06'
    && g('독서', 'ⓐ와 문맥상 의미가 가장 가까운 것은?').id === 'R08' && g('독서', '윗글의 내용 전개 방식으로 가장 적절한 것은?').id === 'R03' && g('독서', '<보기>의 그래프를 이해한 내용은?', { view: '[그림]' }).id === 'R07');
  const cf = g('독서', '㉠과 ㉡에 대한 이해로 가장 적절한 것은?', { solType: '다른 견해와의 비교' }), wk = g('독서', '윗글에 대한 이해로 적절한 것은?', { solType: '중심 내용 파악' });
  check('발문과 해설지 이름이 다르면 대안 유형을 남김 / 두루뭉술한 발문은 해설지 이름을 따름', cf.id === 'R05' && cf.alt === 'R04' && !cf.sure && wk.id === 'R02' && !wk.alt, JSON.stringify([cf, wk]));
  check('규칙 분류(문학·문법)', g('문학', '<보기>를 참고하여 윗글을 감상한 내용으로 적절하지 않은 것은?', { view: '비평', viewLabel: '보기' }).id === 'L07' && g('문학', '윗글의 서술상 특징으로 가장 적절한 것은?').id === 'L03'
    && g('문학', '(가)～(다)의 공통점으로 가장 적절한 것은?').id === 'L04' && g('문법', '<보기>의 ㉠～㉤에 해당하는 것은?', { view: '규칙' }).id === 'G03' && g('문법', '[A]와 <자료>를 통해 탐구한 내용은?', { view: '자료' }).id === 'G04');
  const n1 = g('화법과 작문', '위 발표자의 말하기 방식으로 가장 적절한 것은?', { solType: '발표 표현 전략 사용하기' }), n2 = g('매체', '(가)에 대한 설명으로 적절하지 않은 것은?', { solType: '매체 유형에 따른 특성' });
  check('화작·매체는 유형 없이 성격만', !n1.id && n1.nature === '말하기 방식·전략 파악' && !n2.id && n2.nature === '매체 특성 파악', JSON.stringify([n1, n2]));
  check('구역 이름으로 대분류 어림', KT.catGuess('언어와 매체', ['(가)의 화면 구성에 대한 설명'], '').cat === '매체' && KT.catGuess('언어와 매체', ['<보기>의 ㉠에 해당하는 것은?'], '').cat === '문법'
    && KT.catGuess('화법과 작문', ['초고를 고쳐 쓴 것은?'], '').sub === '작문' && KT.catGuess('', ['화자의 태도로 적절한 것은?'], '').cat === '문학' && KT.catGuess('', ['윗글의 내용과 일치하는 것은?'], '').cat === '독서');
  check('정답 읽기', KT.ansNo('③') === 3 && KT.ansNo('5') === 5 && KT.ansNo('') === 0 && KT.ansNo('O') === 0);

  // ── 인용문 대조 · 형광펜 자리 ──
  const raw = '도시는 {u}낮에{/u} 열을 저장\uE001한다. 밤에 그 열이\n나온다. 녹지는 열을 빼앗는다.';
  const a = KEV.find(raw, '낮에 열을  저장한다'), b = KEV.find(raw, '그 열이 나온다.'), none = KEV.find(raw, '낮에 열을 내보낸다');
  check('인용문 찾기: 띄어쓰기·밑줄 표시·줄바꿈·문장부호 무시, 없는 문장은 못 찾음', !!a && raw.slice(a[0], a[1]).startsWith('낮에') && !!b && none === null, JSON.stringify([a, b, none]));
  const mk = KEV.mark(raw, [{ s: a[0], e: a[1], color: 1, num: 2 }, { s: b[0], e: b[1], color: 2, num: 3 }]), html = KEV.html(mk);
  check('형광펜 토큰: 밑줄·줄바꿈에서 끊었다 다시 열고 번호 배지를 붙임', (mk.match(/\{h1#2\}/g) || []).length === 2 && (mk.match(/\{h2#3\}/g) || []).length === 2 && /\{hn#1#2\}/.test(mk) && (mk.match(/\{\/h\}/g) || []).length === 4
    && /<mark class="ev ev1" data-q="2">/.test(html) && /<sup class="evn ev2" data-q="3">3<\/sup>/.test(html) && mk.replace(/\{hn#\d+#\d+\}|\{h\d+#[\d,]+\}|\{\/h\}/g, '') === raw, mk);
  const xw = KEV.find('③ 녹지가 줄면 열섬이 약해진다.', '약해진다');
  check('선지 안의 틀린 낱말 자리', KEV.html(KEV.mark('③ 녹지가 줄면 열섬이 약해진다.', [{ s: xw[0], e: xw[1], x: true }])) === '③ 녹지가 줄면 열섬이 <span class="xw">약해진다</span>.');

  // ── 시험 → 행 → 엑셀 ──
  const src = { name: '2099 지어낸 모의' };
  const P = [{ id: 'p1', cat: '독서', sub: '과학/기술', title: '도시 열섬 현상', author: '', src }, { id: 'p2', cat: '문학', sub: '현대시', title: '지어낸 시 「봄」', author: '지어낸 시', src },
    { id: 'p3', cat: '화법과 작문', sub: '화법', title: '학생의 발표', author: '', section: '화법과 작문', src }, { id: 'p4', cat: '매체', sub: '매체', title: '(가) 방송 / (나) 블로그', section: '언어와 매체', src }];
  const I = (id, pid, num, o) => Object.assign({ id, passageId: pid, num, answer: '③', points: 2, typeId: '', subTypes: [], nature: '', src, createdAt: num }, o);
  const items = [I('i1', 'p1', 1, { typeId: 'R01' }), I('i2', 'p1', 2, { typeId: 'R06', subTypes: ['R05'], points: 3, answer: '①' }), I('i3', 'p2', 3, { typeId: 'L03', review: { alt: 'L05', why: '표현과 시어 사이' } }),
    I('i4', 'p3', 35, { nature: '말하기 방식·전략 파악', section: '화법과 작문' }), I('i5', 'p3', 36, { nature: '자료 활용의 적절성', section: '화법과 작문', points: 3 }),
    I('i6', null, 35, { cat: '문법', sub: '단어', title: '단어의 의미 관계', typeId: 'G03', section: '언어와 매체' }), I('i7', 'p4', 40, { nature: '매체 언어·표현 분석', section: '언어와 매체' }),
    I('v1', 'p1', 1, { typeId: 'R01', variantOf: 'i1', vkind: 'twin' })];
  check('선택 과목 목록', KX.sections(items, src.name).join() === '화법과 작문,언어와 매체');
  const hw = KX.rows(P, items, src.name, { section: '화법과 작문' }), em = KX.rows(P, items, src.name, { section: '언어와 매체' });
  check('행: 공통 + 고른 선택 과목만, 변형 문항은 빠짐', hw.map(r => r.num).join() === '1,2,3,35,36' && em.map(r => r.num).join() === '1,2,3,35,40' && em[3].title === '단어의 의미 관계' && em[3].single, hw.map(r => r.num).join() + ' / ' + em.map(r => r.num).join());
  const cls = KX.classSheets(hw), all = cls[0].rows, dist = cls[1].rows, val = c => c && typeof c === 'object' ? c.v : c;
  check('분류표 [전체]: 열 이름, 복합 유형은 " + ", 화작은 —, 비고에 검토 요망', cls[0].name === '전체' && all[0].map(val).join() === '문항번호,카테고리,하위카테고리,지문,유형ID,유형명,정답,배점,비고'
    && all[2][4] === 'R06 + R05' && all[2][5] === '<보기> 적용 — 줄글 사례 + 밑줄·구절 의미 추론' && all[2][6] === '①' && all[4][4] === '—' && all[4][5] === '—' && /검토 요망 \(대안 L05\)/.test(all[3][8]), JSON.stringify(all[2]));
  check('분류표 [유형 분포]: 화작·매체 제외, 문항 수·배점 합계·문항번호', cls[1].name === '유형 분포' && dist[0].map(val).join() === '카테고리,유형ID,유형명,문항 수,배점 합계,문항번호' && dist.length === 4
    && dist[1].join('|') === '독서|R01|세부 정보 파악|1|2|1' && dist[2].join('|') === '독서|R06|<보기> 적용 — 줄글 사례|1|3|2', JSON.stringify(dist.slice(1)));
  const lms = KX.lmsSheets(hw, { name: '2099 지어낸 모의 국어영역 (화법과 작문)', duration: 80 }), R = lms[0].rows;
  check('LMS: 1~3행(시험 이름·과목·시간, 3행 공백)과 숨김 _Lookup', R[0].map(val).join('|') === 'Exam Name|Subject|Duration (minutes)' && R[1].join('|') === '2099 지어낸 모의 국어영역 (화법과 작문)|국어|80' && R[2] === null && lms[1].name === '_Lookup' && lms[1].hidden && lms[1].rows.length === 6);
  check('LMS: 그룹 헤더 9열·문항 헤더 14열(원문 그대로)', R[3].map(val).join('|') === 'Group Order|Category|Subcategory|Question Type|Article Title|Article Author|Article Tag|Page From|Page To'
    && R[5].map(val).join('|') === 'Number of questions|Category|Subcategory|Question Type|Question Answer Type|Level|Recommend AnswerTime (mm:ss)|Number of answers|Score|Correct Choices|Correct Textual Answers|Compare Type|Unit|Without Answers');
  check('LMS: 행 수 = 3 + 그룹×3 + 문항', R.length === 3 + 3 * 3 + 5, R.length);
  check('LMS: 그룹 행 — 연번(@), 대분류·소분류, 유형 = 첫 문항 유형, 제목, 작성자는 문학만', val(R[4][0]) === 1 && R[4][0].st === 'text' && R[4].slice(1, 6).join('|') === '독서|과학/기술|R01 세부 정보 파악|도시 열섬 현상|' && R[4].length === 9 && R[9][5] === '지어낸 시' && R[9][3] === 'L03 표현·서술상 특징 파악', JSON.stringify(R[4]));
  check('LMS: 문항 행 — 번호·선지 수·정답은 글자(@), 점수는 숫자, 2점 General 01:30 / 3점 Differential 02:30, 복합 유형은 대표만', val(R[6][0]) === '1' && R[6][0].st === 'text' && val(R[6][7]) === '5' && R[6][7].st === 'text' && R[6][8] === 2 && val(R[6][9]) === '3' && R[6][9].st === 'text'
    && R[6].slice(4, 7).join('|') === 'Single Choice|General|01:30' && R[7][3] === 'R06 <보기> 적용 — 줄글 사례' && R[7].slice(5, 7).join('|') === 'Differential|02:30' && R[7][8] === 3 && R[6].slice(10).join('|') === '|||No', JSON.stringify(R[7]));
  check('LMS fallback: 화작은 독서 / 독서이론 + R코드, 그룹 행도 같은 값', R[13].slice(1, 4).join('|') === '독서|독서이론|R03 구조·전개 방식 파악' && R[15].slice(1, 4).join('|') === '독서|독서이론|R03 구조·전개 방식 파악' && R[16][3] === 'R07 자료 해석·결합 — 그림·도표·그래프', JSON.stringify(R[16].slice(0, 5)));
  const mR = KX.lmsSheets(em, { name: 'x' })[0].rows;
  check('LMS: 언매의 문법 단독 문항은 자기 그룹(문법 / 단어 / G코드), 매체 언어 분석은 R08', mR[13].slice(1, 5).join('|') === '문법|단어|G03 <보기> 규칙 적용|단어의 의미 관계' && mR[19][3] === 'R08 어휘·개념어 의미 파악', JSON.stringify(mR[13]));
  const xml = SPX.parts(lms)['xl/worksheets/sheet1.xml'], wbx = SPX.parts(lms)['xl/workbook.xml'], sty = SPX.parts(lms)['xl/styles.xml'];
  check('엑셀 XML: 빈 셀은 빈 문자열 셀(자기닫힘 없음), 3행 없음, _Lookup 숨김, Calibri 11, @ 서식', !/<c [^>]*\/>/.test(xml) && /<c r="F5" t="inlineStr"><is><t><\/t><\/is><\/c>/.test(xml) && !/<row r="3"/.test(xml) && /<c r="A5" s="1"><v>1<\/v><\/c>/.test(xml)
    && /name="_Lookup" sheetId="2" state="hidden"/.test(wbx) && /<name val="Calibri"\/>/.test(sty) && /numFmtId="49"/.test(sty) && /<col min="5" max="5" width="52"/.test(xml));
  const buf = await SPX.blob(lms, JSZip, 'nodebuffer'), zip = await JSZip.loadAsync(buf);
  check('xlsx 파일로 묶임', !!zip.file('xl/worksheets/sheet2.xml') && !!zip.file('[Content_Types].xml') && buf.length > 1500, buf.length);
  const ok = KX.check(hw);
  check('점검: 통과 + 검토 요망 표 + 보조 유형 요약 + fallback 문항', ok.errors.length === 0 && ok.flags.length === 1 && ok.flags[0].alt === 'L05' && ok.aux[0].num === 2 && ok.fallback.join() === '35,36' && ok.total === 12 && ok.groups === 3, JSON.stringify(ok));
  const bad = KX.check([{ num: 1, cat: '독서', sub: '과학/기술/생명', title: '', typeId: '', subTypes: [], nature: '', answer: 0, points: 0, gkey: 'a' },
    { num: 2, cat: '문학', sub: '현대시', title: '현대시 — 봄', author: '', typeId: 'R01', subTypes: [], nature: '', answer: 2, points: 2, gkey: 'b' }, { num: 3, cat: '매체', sub: '매체', title: '(가) 방송', typeId: '', subTypes: [], nature: '', answer: 1, points: 2, gkey: 'c' }]);
  check('점검: 소분류 조합·제목·유형 빈칸·다른 대분류 유형·정답·배점을 잡아냄', ['조합이 LMS 카테고리에 없음', '제목이 비어 있음', '질문 유형은 필수', '문학 문항에 쓸 수 없음', '정답이 없음', '배점 없음'].every(m => bad.errors.some(e => e.includes(m))) && bad.warns.some(w => /접두어/.test(w)), bad.errors.join(' / '));
  check('LMS 파일 이름은 ASCII', KX.lmsFileName('2027학년도 9월 모의평가', '화법과 작문', true) === '2027_09_mock_korean_speech_writing_exam_template_fallback.xlsx' && KX.lmsFileName('2025학년도 수능', '언어와 매체', false) === '2025_csat_korean_language_media_exam_template.xlsx'
    && /^[\x20-\x7E]+$/.test(KX.lmsFileName('바탕 5회', '', false)) && KX.ascii('2026 바탕 5회 국어') === '2026_5');

  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
