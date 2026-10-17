#!/usr/bin/env node
/* 스터디피크 수학 랩 — 유사/신규 문제 자동 생성 스크립트 (맥/PC에서 실행)
 *
 * 랩의 생성 브리지(buildGenPrompt → 분할 등록)를 그대로 쓰되, claude.ai에 붙여넣는 대신
 * 이 컴퓨터의 Claude Code(Max 구독)가 문제를 만들어 자동 등록·클라우드 동기화한다.
 * API 과금 없음 — 'claude' 명령(Claude Code 로그인 상태)만 있으면 된다.
 *
 * 사용법:
 *   node generate.js --subject 수학Ⅰ --chapter 수열 --section 등차수열 --count 5
 *   node generate.js --like-id <문항ID> --count 3        # 내 DB의 특정 문항과 유사한 문제
 *
 * 옵션: --grade 고2 · --diff 1~5|혼합 · --type "객관식(5지선다)"|단답형|혼합
 *       --extra "추가 요청" · --timeout <분>(기본 10) · --stub 테스트용(개발 전용)
 * 환경변수: SP_EMAIL, SP_PASSWORD(랩의 자동화용 비밀번호), CLAUDE_BIN(기본 'claude')
 */
const { openLab, loginCloud, waitSynced, runClaude } = require('./_common.js');

const argv = process.argv.slice(2);
function opt(name, def){ const i = argv.indexOf('--'+name); return i >= 0 ? argv[i+1] : def; }
const STUB = argv.includes('--stub');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const SUBJECT = opt('subject'), CHAPTER = opt('chapter'), SECTION = opt('section');
const LIKE_ID = opt('like-id');
const COUNT = Math.max(1, Math.min(30, +opt('count', 5) || 5));
const GRADE = opt('grade', '고2'), DIFF = opt('diff', '혼합'), TYPE = opt('type', '혼합');
const EXTRA = opt('extra', '');
const TIMEOUT_MIN = +opt('timeout', 10) || 10;

const EMAIL = process.env.SP_EMAIL, PASSWORD = process.env.SP_PASSWORD;
if(!STUB && (!EMAIL || !PASSWORD)){
  console.error('환경변수 SP_EMAIL / SP_PASSWORD 를 설정하세요.');
  console.error('예) SP_EMAIL=me@x.com SP_PASSWORD=비밀번호 node generate.js --subject 수학Ⅰ --chapter 수열 --count 5');
  process.exit(2);
}
if(!SUBJECT && !LIKE_ID){
  console.error('--subject (과목) 또는 --like-id (유사 문제의 원본 문항 ID)를 지정하세요.');
  process.exit(2);
}

(async () => {
  const lab = await openLab({ stub: STUB });
  const page = lab.page;
  page.on('dialog', d => d.accept());
  await loginCloud(page, EMAIL||'stub@test', PASSWORD||'stub');
  console.log('✅ 클라우드 로그인됨 · 생성: Claude Code(Max)');

  // --like-id: 원본 문항을 클라우드(내 행만, RLS)에서 가져와 유사 생성 조건으로 삼는다
  let base = null;
  if(LIKE_ID){
    base = await page.evaluate(async id => {
      try{
        const c = await sbLoad();
        const { data } = await c.from('problems').select('data').eq('id', id);
        if(data && data[0] && data[0].data) return data[0].data;
      }catch(e){}
      return state.problems.find(p => p.id === id) || null;  // 동기화 직후 로컬 폴백
    }, LIKE_ID);
    if(!base){ console.error('문항을 찾지 못했습니다: '+LIKE_ID); await lab.close(); process.exit(2); }
    console.log(`📄 원본 문항: ${(base.question||'').replace(/\s+/g,' ').slice(0,60)}…`);
  }

  // 생성 조건을 랩의 생성 화면 필드에 그대로 입력 (단원 → 자동 태깅까지 이어진다)
  const setup = await page.evaluate(({SUBJECT, CHAPTER, SECTION, GRADE, DIFF, TYPE, COUNT, EXTRA, base}) => {
    const subj = SUBJECT || (base && base.subject) || '';
    const chap = CHAPTER || (base && base.chapter) || '';
    const sect = SECTION || (base && base.section) || '';
    if(subj && !CURRICULUM[subj]) return { err: '과목 없음: '+subj+' (가능: '+Object.keys(CURRICULUM).join(', ')+')' };
    const g = $('#g-subject'); g.value = subj; g.dispatchEvent(new Event('change'));
    if(chap && CURRICULUM[subj] && CURRICULUM[subj][chap]){
      const c = $('#g-chapter'); c.value = chap; c.dispatchEvent(new Event('change'));
      if(sect && CURRICULUM[subj][chap].includes(sect)) $('#g-section').value = sect;
    }
    $('#g-grade').value = GRADES.includes(GRADE) ? GRADE : ((base && base.grade) || '고2');
    $('#g-diff').value = DIFF;
    $('#g-count').value = COUNT;
    $('#g-type').value = TYPE;
    let extra = EXTRA;
    if(base){
      const bodyParts = [base.question || ''];
      if(Array.isArray(base.choices) && base.choices.length) bodyParts.push(base.choices.join('  '));
      extra = (extra ? extra+' / ' : '')
        + '아래 [원본 문제]와 같은 개념·같은 풀이 구조를 쓰되 숫자·상황을 바꾼 유사 문제로 만들 것.\n[원본 문제]\n'
        + bodyParts.join('\n');
    }
    $('#g-extra').value = extra;
    return { subj, chap, sect };
  }, {SUBJECT, CHAPTER, SECTION, GRADE, DIFF, TYPE, COUNT, EXTRA, base});
  if(setup.err){ console.error('⚠ '+setup.err); await lab.close(); process.exit(2); }
  console.log(`🧮 범위: ${[setup.subj, setup.chap, setup.sect].filter(Boolean).join(' > ')||'(미지정)'} · ${COUNT}문항 · 난이도 ${DIFF} · ${TYPE}`);

  const prompt = await page.evaluate(() => buildGenPrompt());
  console.log('🤖 Claude Code(Max)로 생성 중… (문항 수에 따라 수십 초~수 분)');
  const text = runClaude(CLAUDE_BIN, prompt, { expectJson: false, timeoutMs: TIMEOUT_MIN*60000 });

  // 생성 결과 → 랩의 분할 파서(genResultToBulk)로 — 단원 자동 태깅 포함
  await page.evaluate(t => { $('#g-result').value = t; genResultToBulk(); }, text);
  const n = await page.evaluate(() => state.bulkDrafts.length);
  if(!n){
    console.error('⚠ 생성 결과를 문항으로 나누지 못했습니다. 응답 앞부분:');
    console.error(text.slice(0, 400));
    await lab.close(); process.exit(1);
  }
  console.log(`✂ ${n}문항으로 분할됨 — 저장 중…`);
  await page.click('button[onclick="saveBulk()"]');
  await page.waitForFunction(() => state.bulkDrafts.length === 0, null, { timeout: 120000 });
  await waitSynced(page);

  console.log(`✅ ${n}문항 등록·클라우드 동기화 완료 (미검수 — 웹의 [🔎 AI 검수]로 마무리 권장)`);
  if(STUB) console.log(`[stub] 클라우드 업로드 행: ${await page.evaluate(() => window.__rows.problems.size)}`);
  await lab.close();
  process.exit(0);
})().catch(e => { console.error('실행 실패:', e.message||e); process.exit(2); });
