#!/usr/bin/env node
/* 스터디피크 수학 랩 — PDF 자동 등록 스크립트 (맥/PC에서 실행)
 *
 * 랩의 실제 파이프라인(영역 인식 → AI 변환·소단원 태깅 → 저장 → Supabase 동기화)을
 * 화면 없는 브라우저로 그대로 돌린다. 등록분은 미검수로 들어가므로 웹의 [🔎 AI 검수]로 마무리.
 *
 * 사용법:
 *   node ingest.js 문제.pdf [해설.pdf ...]        # 지정한 PDF들을 한 세션으로 (문제+해설 번호 매칭)
 *   node ingest.js --each 폴더경로                # 폴더 안 PDF를 한 개씩 차례로
 *
 * AI 변환 방식 (둘 중 하나):
 *   · 기본: ANTHROPIC_KEY 환경변수의 API 키 (문항당 과금)
 *   · --max: 이 컴퓨터의 Claude Code(Max 구독)가 변환 — API 과금 없음, 'claude' 명령 필요
 *
 * 환경변수: SP_EMAIL, SP_PASSWORD(랩의 자동화용 비밀번호), ANTHROPIC_KEY(API 방식일 때만)
 * 옵션: --timeout <분> 세션당 제한(기본 30) · --stub 테스트용(개발 전용)
 */
const fs = require('fs');
const path = require('path');
const { openLab, loginCloud, waitSynced, runClaude } = require('./_common.js');

const argv = process.argv.slice(2);
const STUB = argv.includes('--stub');
const MAX = argv.includes('--max');
const EACH = argv.includes('--each');
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const tIdx = argv.indexOf('--timeout');
const TIMEOUT_MIN = tIdx >= 0 ? +argv[tIdx+1] || 30 : 30;
const files = argv.filter((a,i)=>!a.startsWith('--') && (tIdx<0 || i!==tIdx+1));

const EMAIL = process.env.SP_EMAIL, PASSWORD = process.env.SP_PASSWORD;
const AIKEY = process.env.ANTHROPIC_KEY || process.env.SP_ANTHROPIC_KEY;
if(!STUB && (!EMAIL || !PASSWORD || (!AIKEY && !MAX))){
  console.error('환경변수 SP_EMAIL / SP_PASSWORD'+(MAX?'':' / ANTHROPIC_KEY')+' 를 설정하세요.');
  console.error('예) SP_EMAIL=me@x.com SP_PASSWORD=비밀번호 node ingest.js --max 문제.pdf');
  process.exit(2);
}
if(!files.length){ console.error('등록할 PDF 파일(또는 --each 폴더)을 지정하세요.'); process.exit(2); }

let groups = [];
if(EACH){
  const dir = files[0];
  const pdfs = fs.readdirSync(dir).filter(f=>f.toLowerCase().endsWith('.pdf')).sort().map(f=>path.join(dir, f));
  if(!pdfs.length){ console.error('폴더에 PDF가 없습니다: '+dir); process.exit(2); }
  groups = pdfs.map(p=>[p]);
}else{
  for(const f of files) if(!fs.existsSync(f)){ console.error('파일 없음: '+f); process.exit(2); }
  groups = [files];
}

(async () => {
  const lab = await openLab({ stub: STUB });
  const page = lab.page;
  // --max면 페이지의 API 변환 제안만 거절하고 나머지 확인창은 수락
  page.on('dialog', d => (MAX && d.message().includes('AI로 텍스트·수식 변환할까요')) ? d.dismiss() : d.accept());

  if(STUB && !MAX){ // API 스텁 (Max 스텁은 CLAUDE_BIN 가짜 명령으로) — 문항마다 다른 본문(중복 제거에 안 걸리게)
    await page.evaluate(() => {
      let n = 0;
      window.fetch = async () => { n++; return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify({
        question:`스텁 변환 문제 ${n}번 $x+${n}$?`, choices:['① 1','② 2','③ 3','④ 4','⑤ 5'], answer:'①',
        solution:'', hasFigure:false, figureBox:null, subject:'수학Ⅰ', chapter:'수열', section:'등차수열', difficulty:3
      }) }] }), { status:200 }); };
    });
  }
  if(AIKEY) await page.evaluate(k => localStorage.setItem('sp-lab-apikey', k), AIKEY);
  else if(STUB && !MAX) await page.evaluate(() => localStorage.setItem('sp-lab-apikey', 'sk-ant-stub'));
  await loginCloud(page, EMAIL||'stub@test', PASSWORD||'stub');
  console.log('✅ 클라우드 로그인됨'+(MAX?' · AI 변환: Claude Code(Max)':' · AI 변환: API'));

  let totalAdded = 0, failed = [];
  for(let gi = 0; gi < groups.length; gi++){
    const group = groups[gi].map(f => path.resolve(f));
    const label = group.map(f => path.basename(f)).join(' + ');
    console.log(`\n[${gi+1}/${groups.length}] ${label}`);
    try{
      const before = await page.evaluate(() => state.problems.length);
      await page.evaluate(() => go('add'));
      await page.setInputFiles('#bulk-files', group);
      await page.waitForSelector('#pdfed-bg.show', { timeout: 120000 });
      await page.waitForTimeout(800);
      await page.click('button[onclick="pdfedToRegions()"]');
      await page.waitForFunction(() => PDFED.regions.length > 0, null, { timeout: 300000 });
      console.log(`  영역 ${await page.evaluate(() => PDFED.regions.length)}개 인식`);
      await page.click('#pdfed-finish');
      await page.waitForFunction(() => state.bulkDrafts.length > 0, null, { timeout: 120000 });

      if(MAX){
        // Max 모드: 크롭 이미지를 파일로 내보내 이 컴퓨터의 Claude Code가 변환 (API 과금 없음)
        const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sp-max-'));
        const metas = await page.evaluate(() => state.bulkDrafts.map((d,i)=>({
          i, num:d.num, needQ: !!d.img && !(d.text||'').trim(), needS: !!d.solImg && !(d.sol||'').trim() })));
        let mOk = 0, mFail = 0, mRetry = 0;
        // 읽기 → 렌더 검증(페이지의 transcriptionIssues) → 문제 있으면 같은 이미지로 1회 재판독, 나은 쪽 채택
        const readChecked = async (promptFn, issuesFn, i, f) => {
          let r = runClaude(CLAUDE_BIN, await page.evaluate(promptFn, [i, null]), { img: f, timeoutMs: 300000 });
          let iss = await page.evaluate(issuesFn, r);
          if(iss.length){
            mRetry++;
            try{
              const r2 = runClaude(CLAUDE_BIN, await page.evaluate(promptFn, [i, iss]), { img: f, timeoutMs: 300000 });
              const i2 = await page.evaluate(issuesFn, r2);
              if(i2.length < iss.length){ r = r2; iss = i2; }
            }catch(e){ /* 재판독 실패 — 첫 결과 유지 */ }
          }
          return { r, iss };
        };
        for(const m of metas){
          try{
            if(m.needQ){
              const b64 = await page.evaluate(i => state.bulkDrafts[i].img.split(',')[1], m.i);
              const f = path.join(tmp, `q${m.i}.png`);
              fs.writeFileSync(f, Buffer.from(b64, 'base64'));
              process.stdout.write(`  🤖 Max 변환 중… 문항 ${m.num || m.i+1}   \r`);
              const { r, iss } = await readChecked(([i, iss]) => aiPrompt(state.bulkDrafts[i].pdfText, iss),   // PDF 글자층 힌트 포함
                r => transcriptionIssues(r), m.i, f);
              await page.evaluate(async ([i, r, iss]) => { const d = state.bulkDrafts[i]; await applyAiDraftResult(d, r); d.aiIssues = iss; rerenderBulk(); }, [m.i, r, iss]);
            }
            if(m.needS){
              const b64 = await page.evaluate(i => state.bulkDrafts[i].solImg.split(',')[1], m.i);
              const f = path.join(tmp, `s${m.i}.png`);
              fs.writeFileSync(f, Buffer.from(b64, 'base64'));
              const { r, iss } = await readChecked(([i, iss]) => aiSolImgPrompt(state.bulkDrafts[i].solText, iss),
                r => solutionIssues(r), m.i, f);
              await page.evaluate(([i, r, iss]) => { const d = state.bulkDrafts[i]; applyAiSolResult(d, r); d.solIssues = iss; rerenderBulk(); }, [m.i, r, iss]);
            }
            mOk++;
          }catch(e){ mFail++; console.error(`\n  ⚠ 문항 ${m.num || m.i+1} 변환 실패: `+(e.message||e).split('\n')[0]); }
        }
        fs.rmSync(tmp, { recursive: true, force: true });
        // 단원 분류: 텍스트만 8문항씩 묶어 따로 (전사와 분리 — 각 호출이 한 가지 일만)
        const cls = await page.evaluate(() => state.bulkDrafts.map((d,i)=>({ i, text: classifyTextOf(d.text, d.choices), ok: d.aiDone && !d.aiSect && !!(d.text||'').trim() }))
          .filter(x=>x.ok).map(({i,text})=>({i,text})));
        let cOk = 0;
        for(let k = 0; k < cls.length; k += 8){
          const chunk = cls.slice(k, k+8);
          try{
            const r = runClaude(CLAUDE_BIN, await page.evaluate(ch => aiClassifyPrompt(ch), chunk), { timeoutMs: 300000 });
            cOk += await page.evaluate(([chunk, items]) => {
              let n = 0;
              for(const c of (Array.isArray(items) ? items : []))
                if(chunk.some(t=>t.i === +c.i) && applyAiClassifyResult(state.bulkDrafts[+c.i], c)) n++;
              rerenderBulk(); return n;
            }, [chunk, r.items]);
          }catch(e){ console.error('  ⚠ 단원 분류 실패: '+(e.message||e).split('\n')[0]); }
        }
        const warn = await page.evaluate(() => state.bulkDrafts.filter(d=>(d.aiIssues&&d.aiIssues.length)||(d.solIssues&&d.solIssues.length)).length);
        console.log(`\n  Max 변환 — 성공 ${mOk} · 실패 ${mFail} · 재판독 ${mRetry} · 단원 분류 ${cOk}/${cls.length}`
          + (warn ? ` · ⚠ 수식 확인 필요 ${warn}개(#검수주의로 저장)` : ''));
      }else{
        await page.waitForFunction(() => !state._aiBusy, null, { timeout: TIMEOUT_MIN*60000 });
        console.log('  '+(await page.evaluate(() => document.querySelector('#bulk-status').textContent)).split('.')[0].trim());
      }

      await page.evaluate(() => { go('add'); setAddMode('bulk'); });
      await page.click('button[onclick="saveBulk()"]');
      await page.waitForFunction(() => state.bulkDrafts.length === 0, null, { timeout: 120000 });
      await waitSynced(page);
      const after = await page.evaluate(() => state.problems.length);
      totalAdded += after - before;
      console.log(`  ✅ ${after-before}문항 등록·클라우드 동기화 완료`);
    }catch(e){
      failed.push(label);
      console.error('  ⚠ 실패: '+(e.message||e).split('\n')[0]);
      await page.evaluate(() => { try{ closePdfEditor(); }catch(e){} state.bulkDrafts=[]; }).catch(()=>{});
    }
  }

  console.log(`\n════ 완료 ════`);
  console.log(`총 ${totalAdded}문항 등록 (${groups.length}세션 중 실패 ${failed.length})`);
  if(failed.length) console.log('실패 목록:\n  - '+failed.join('\n  - '));
  console.log('웹 랩에서 문항을 선택해 [🔎 AI 검수]로 마무리하는 것을 권장합니다.');
  if(STUB) console.log(`[stub] 클라우드 업로드 행: ${await page.evaluate(() => window.__rows.problems.size)}`);
  await lab.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('실행 실패:', e.message||e); process.exit(2); });
