#!/usr/bin/env node
/* 스터디피크 수학 랩 — 쌍둥이·유사 변형 문제 일괄 생성 (맥/PC에서, Claude Code = Max 구독, API 과금 없음)
 *
 * 내 DB(클라우드)의 원본 문제들로 쌍둥이(숫자만 바꿈)·유사 변형 문제를 정답·해설·그림 설계도까지 만들고,
 * 정답을 모르는 별도 호출로 독립 검산(#검산불일치)한 뒤 원본과 연결해 새 '등록 묶음'으로 저장·동기화한다.
 * 랩의 makeTwins 를 그대로 쓴다(웹의 [👯 쌍둥이·변형] 과 같은 결과) — AI 호출만 이 컴퓨터의 Claude Code.
 *
 * 사용법:
 *   node twins.js --src "10월 모의고사"                 # 출처에 이 글자가 든 문항 전부, 원본당 쌍둥이 1·변형 1
 *   node twins.js --src "10월" --nos 1-10,15 --twin 2 --variant 1 --diff harder
 *   node twins.js --ids id1,id2                         # 문항 ID 로 (웹 문제 상세의 ID)
 * 옵션: --twin N(기본 1, 최대 10) · --variant N(기본 1, 최대 10) · --diff same|easier|harder · --no-verify · --no-fill(원본 정답·해설 채우지 않기) · --timeout 분(기본 10)
 *       --parallel N(동시에 처리할 원본 수, 기본 2, 최대 4 — 빨라지지만 Max 사용량이 빨리 참)
 * 환경변수: SP_EMAIL, SP_PASSWORD(랩의 자동화용 비밀번호), CLAUDE_BIN(기본 'claude')
 * 다 만든 뒤 웹: 문제 검색 → [등록 묶음]에서 "… 쌍둥이·변형" → [📚 원본 + 쌍둥이·변형으로 교재 만들기]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openLab, loginCloud, waitSynced, runClaude } = require('./_common.js');

const argv = process.argv.slice(2);
function opt(name, def){ const i = argv.indexOf('--'+name); return i >= 0 ? argv[i+1] : def; }
const STUB = argv.includes('--stub');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const SRC = opt('src', ''), IDS = (opt('ids', '') || '').split(',').map(s=>s.trim()).filter(Boolean);
const NOS = opt('nos', '');
const TWIN = Math.max(0, Math.min(10, +opt('twin', 1) || 0)), VARIANT = Math.max(0, Math.min(10, +opt('variant', 1) || 0));   // 원본당 최대 10개씩
const DIFF = ['same','easier','harder'].includes(opt('diff')) ? opt('diff') : 'same';
const VERIFY = !argv.includes('--no-verify');
const FILL = !argv.includes('--no-fill');                         // 원본에 정답·해설이 없으면 먼저 채움
const TIMEOUT_MIN = +opt('timeout', 10) || 10;
const PARALLEL = Math.max(1, Math.min(4, +opt('parallel', 2) || 2));
const EMAIL = process.env.SP_EMAIL, PASSWORD = process.env.SP_PASSWORD;

function parseNos(s){ // "1-10,15" → Set
  const out = new Set();
  String(s||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(x=>{
    const m = x.match(/^(\d+)\s*-\s*(\d+)$/);
    if(m){ for(let i=+m[1]; i<=+m[2]; i++) out.add(String(i)); } else if(/^\d+$/.test(x)) out.add(String(+x));
  });
  return out;
}

if(!STUB && (!EMAIL || !PASSWORD)){
  console.error('환경변수 SP_EMAIL / SP_PASSWORD 를 설정하세요 (랩의 [🔑 자동화용 비밀번호 설정]).');
  process.exit(2);
}
if(!SRC && !IDS.length){ console.error('--src "출처 일부" 또는 --ids 문항ID,... 를 지정하세요.'); process.exit(2); }
if(!TWIN && !VARIANT){ console.error('--twin 또는 --variant 를 1 이상으로.'); process.exit(2); }

(async () => {
  const lab = await openLab({ stub: STUB });
  const page = lab.page;
  page.on('dialog', d => d.accept());
  page.on('console', m => { const t = m.text(); if(t.startsWith('TWIN-PROGRESS ')) console.log(`  👯 ${t.slice(14)}`); });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-twin-'));
  let k = 0;
  // 랩 코드의 AI 질문 → 이 컴퓨터의 Claude Code (그림은 파일로 넘겨 Read 로 보게)
  await page.exposeFunction('__maxAsk', (text, img) => {
    let f = null;
    if(img){ const m = String(img).match(/^data:image\/(\w+);base64,(.+)$/); if(m){ f = path.join(tmp, `src${k++}.${m[1]==='jpeg'?'jpg':m[1]}`); fs.writeFileSync(f, Buffer.from(m[2], 'base64')); } }
    return runClaude(CLAUDE_BIN, text, { img: f, timeoutMs: TIMEOUT_MIN*60000 });
  });
  await loginCloud(page, EMAIL||'stub@test', PASSWORD||'stub');
  if(STUB && process.env.SP_STUB_SEED){                          // 테스트 전용: 원본 문항 넣기
    const seed = JSON.parse(fs.readFileSync(process.env.SP_STUB_SEED, 'utf8'));
    await page.evaluate(async seed => { for(const p of seed){ await saveProblem(p); state.problems.push(lightenProblem(p)); } }, seed);
  } else {
    await page.waitForTimeout(1500);
    await page.evaluate(async () => { try{ await sbPull(true); }catch(e){} });
  }
  const sources = await page.evaluate(({SRC, IDS, nos}) => {
    const want = new Set(nos);
    return state.problems.filter(p => (IDS.length ? IDS.includes(p.id) : String(p.srcName||'').includes(SRC))
        && !p.twinOf && (!want.size || want.has(String(parseInt(String(p.origNo||'').replace(/\D/g,''),10))))
        && ((p.question||'').trim()))
      .sort((a,b)=>(origNoKey(a)-origNoKey(b)) || ((a.createdAt||0)-(b.createdAt||0))).map(p => p.id);
  }, { SRC, IDS, nos: [...parseNos(NOS)] });
  if(!sources.length){ console.error('원본 문항을 찾지 못했습니다 (본문이 있는 문항만, 이미 만든 쌍둥이는 제외).'); await lab.close(); process.exit(2); }
  console.log(`📄 원본 ${sources.length}문항 · 원본당 쌍둥이 ${TWIN} · 변형 ${VARIANT} · 난이도 ${DIFF}${VERIFY?' · 독립 검산':''} · 동시 ${PARALLEL}개 — Claude Code(Max)로 생성`);

  const res = await page.evaluate(async ({ids, opts}) => {
    const srcs = ids.map(id => state.problems.find(p => p.id === id));
    const r = await makeTwins(srcs, opts, (t, max, imgs) => window.__maxAsk(t, (imgs||[])[0] || null),
      e => { // 실황: 원본 시작·후보 생성·검산 결과를 한 줄씩
        const s = srcs[e.i] || {}, no = `${s.origNo||e.i+1}번`;
        if(e.type === 'src') console.log(`TWIN-PROGRESS ▶ 원본 ${no} 시작 (${e.i+1}/${srcs.length})`);
        else if(e.type === 'fill' && e.state === 'run') console.log(`TWIN-PROGRESS   ${no} 📝 원본 ${e.needAns?'정답·해설':'해설'} 채우는 중`);
        else if(e.type === 'fill') console.log(`TWIN-PROGRESS   ${no} 📝 ${{ done:'원본 채움'+(e.answer?' · 정답 '+e.answer:''), check:'원본 채움 · ⚠ 정답 확인 필요(#검산불일치)', incomplete:'원본 본문이 잘림 · 확인 필요(#본문확인)', fail:'원본 채우기 실패 '+(e.why||'') }[e.state]}`);
        else if(e.type === 'gen') console.log(`TWIN-PROGRESS   ${no} 후보 만드는 중 (${e.done}/${e.total} 완료)`);
        else if(e.type === 'item' && e.state === 'saved') console.log(`TWIN-PROGRESS   ${no} ✅ ${e.kind} 저장${e.repaired?' (바로잡음)':''}`);
        else if(e.type === 'item' && e.state === 'rejected') console.log(`TWIN-PROGRESS   ${no} ✖ ${e.kind} 버림 — ${e.why||''}`);
        else if(e.type === 'srcDone') console.log(`TWIN-PROGRESS ■ 원본 ${no} 끝${e.short?` (못 만든 것 ${e.short}개)`:''}${e.error?' — 오류: '+e.error:''}`);
      });
    return { ...r, saved: r.saved.length };
  }, { ids: sources, opts: { twin: TWIN, variant: VARIANT, diff: DIFF, verify: VERIFY, concurrency: PARALLEL, fillSrc: FILL } });
  await waitSynced(page);
  const why = Object.entries(res.reasons || {}).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`\n✅ 검산 통과 ${res.saved}문항 저장·동기화 — 묶음 "${res.batchName}"`
    + (res.repaired ? ` · 바로잡아 통과 ${res.repaired}개` : '') + (res.rejected ? ` · 버리고 다시 만든 것 ${res.rejected}개(${why})` : '')
    + (res.filled ? ` · 📝 원본 정답·해설 채움 ${res.filled}개${res.fillCheck ? `(정답 확인 필요 ${res.fillCheck})` : ''}` : '') + (res.incomplete ? ` · ⚠ 본문이 잘린 원본 ${res.incomplete}개(#본문확인)` : '')
    + (res.short ? ` · ⚠ 끝내 못 만든 것 ${res.short}개` : '') + (res.warn ? ` · 수식 확인 ${res.warn}개(#검수주의)` : '')
    + (res.fail ? ` · 실패 ${res.fail}개 (${res.lastErr})` : ''));
  console.log('   웹: 문제 검색 → [등록 묶음] → [📚 원본 + 쌍둥이·변형으로 교재 만들기]');
  if(STUB){
    console.log(`[stub] 업로드: ${await page.evaluate(() => JSON.stringify([...window.__rows.problems.values()].filter(r => r.data && r.data.twinOf).map(r => [r.data.twinKind, r.data.origNo, (r.data.tags||[]).join('+'), (r.data.figSpecs||[]).length])))}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  await lab.close();
  process.exit(0);
})().catch(e => { console.error('실행 실패:', e.message||e); process.exit(2); });
