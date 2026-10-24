#!/usr/bin/env node
/* 스터디피크 수학 랩 — 그림 설계도(JSON) → 정확한 그래프·도형 그림 (맥/PC에서 실행)
 *
 * 그림을 손이나 AI 이미지로 "베끼지" 않고, 식·좌표로 된 설계도를 랩의 그림 엔진이 그린다.
 * 랩(lab/index.html)의 figSpecToSvg 를 헤드리스 브라우저로 그대로 쓰므로 웹과 결과가 같다.
 * 설계도 형식: .claude/skills/math-graph/SKILL.md
 *
 * 사용법:
 *   node graph.js render 설계도.json              # 설계도.svg + 설계도.png 생성
 *   node graph.js render 설계도.json -o 그림.png   # 출력 파일 지정(.svg 또는 .png)
 *   node graph.js check 설계도.json               # 형식 점검만
 *   node graph.js pull --id <문항ID> [--out 폴더]  # 문항의 그림·본문·설계도를 파일로 (원본 보고 설계도 쓰기용)
 *   node graph.js attach --id <문항ID> 설계도.json [--index 0|new]   # 그림을 문항에 넣고 클라우드 동기화
 *   설계도 파일 대신 - 를 쓰면 표준입력에서 읽는다. .svg 파일(직접 계산해 그린 SVG)도 그대로 쓸 수 있다.
 *   --id 대신 --src "출처 일부" --no 26 으로 문항을 찾을 수 있다 (예: --src 3월 --no 26).
 *
 * pull·attach 는 클라우드 로그인이 필요: 환경변수 SP_EMAIL, SP_PASSWORD(랩의 자동화용 비밀번호)
 * 옵션: --scale 2 (PNG 해상도 배율) · --stub 테스트용(개발 전용)
 */
const fs = require('fs');
const path = require('path');
const { openLab, loginCloud, waitSynced } = require('./_common.js');

const argv = process.argv.slice(2);
const cmd = argv[0];
function opt(name, def){ const i = argv.indexOf('--'+name); return i >= 0 ? argv[i+1] : def; }
const STUB = argv.includes('--stub');
const OUT = opt('o', null) || (argv.includes('-o') ? argv[argv.indexOf('-o')+1] : null);
const SCALE = Math.max(0.5, Math.min(4, +opt('scale', 1) || 1));
const flagVals = new Set(['-o','--o','--id','--out','--index','--scale','--src','--no'].flatMap(f => argv.indexOf(f) >= 0 ? [argv[argv.indexOf(f)+1]] : []));
const files = argv.slice(1).filter(a => !a.startsWith('--') && a !== '-o' && !flagVals.has(a));

function usage(){
  console.error('사용법: node graph.js render|check 설계도.json [-o 출력.svg|.png]');
  console.error('        node graph.js pull --id <문항ID> [--out 폴더]');
  console.error('        node graph.js attach --id <문항ID> 설계도.json [--index 0|new]');
  process.exit(2);
}
function readSpec(f){
  if(!f) usage();
  const raw = f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(f, 'utf8');
  if(/\.svg$/i.test(f) || /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(raw))           // 직접 그린 SVG
    return { kind:'svg', svg: raw.replace(/^\s*<\?xml[^>]*>\s*/i, '').replace(/<!DOCTYPE[^>]*>\s*/i, '').trim() };
  try{ return JSON.parse(raw); }
  catch(e){ console.error('⚠ 설계도 JSON 형식 오류: '+e.message); process.exit(1); }
}
function writeDataUrl(file, dataUrl){
  const m = String(dataUrl).match(/^data:[^;]+;base64,(.+)$/);
  fs.writeFileSync(file, m ? Buffer.from(m[1], 'base64') : Buffer.from(decodeURIComponent(String(dataUrl).replace(/^data:[^,]+,/, '')), 'utf8'));
}

(async () => {
  if(!['render','check','pull','attach'].includes(cmd)) usage();
  const needCloud = cmd === 'pull' || cmd === 'attach';
  const EMAIL = process.env.SP_EMAIL, PASSWORD = process.env.SP_PASSWORD;
  if(needCloud && !STUB && (!EMAIL || !PASSWORD)){
    console.error('환경변수 SP_EMAIL / SP_PASSWORD 를 설정하세요 (랩의 [🔑 자동화용 비밀번호 설정]).');
    process.exit(2);
  }
  const spec = (cmd === 'render' || cmd === 'check' || cmd === 'attach') ? readSpec(files[0]) : null;
  const lab = await openLab({ stub: STUB || !needCloud });
  const page = lab.page;
  page.on('dialog', d => d.accept());
  let code = 0;
  try{
    if(cmd === 'check' || cmd === 'render'){
      const r = await page.evaluate(({spec, scale}) => {
        const issues = figSpecIssues(spec);
        let out = null, err = '';
        try{ out = figSpecToSvg(spec); }catch(e){ err = e.message || String(e); }
        return { issues, err, svg: out && out.svg, w: out && out.w, h: out && out.h, scale };
      }, { spec, scale: SCALE });
      if(r.err){ console.error('⚠ 그릴 수 없음: '+r.err); code = 1; }
      r.issues.forEach(x => console.log('  ⚠ '+x));
      if(cmd === 'check'){
        if(!r.err && !r.issues.length) console.log(`✓ 설계도 정상 (${spec.kind||'graph'}, ${r.w}×${r.h})`);
        if(r.issues.length) code = 1;
      } else if(!r.err){
        const base = files[0] === '-' ? 'figure' : files[0].replace(/\.json$/i, '');
        const outs = OUT ? [OUT] : [base+'.svg', base+'.png'];
        for(const o of outs){
          if(/\.svg$/i.test(o)) fs.writeFileSync(o, r.svg, 'utf8');
          else writeDataUrl(o, await page.evaluate(({svg, w, h, k}) => svgToPng(svg, w, h, k), { svg: r.svg, w: r.w, h: r.h, k: SCALE }));
          console.log('🖼 '+path.resolve(o));
        }
      }
    } else {
      let ID = opt('id');
      const SRC = opt('src'), NO = opt('no');
      if(!ID && !(SRC || NO)){ console.error('--id <문항ID> 또는 --src "출처" --no 번호 를 지정하세요.'); process.exit(2); }
      await loginCloud(page, EMAIL||'stub@test', PASSWORD||'stub');
      if(!ID){                                                   // 출처·원번호로 찾기 (동기화된 내 문항에서)
        await page.waitForTimeout(1500);
        const hits = await page.evaluate(async ({SRC, NO}) => {
          try{ await sbPull(true); }catch(e){}
          return state.problems.filter(p => (!SRC || String(p.srcName||'').includes(SRC)) && (!NO || String(p.origNo||'') === String(NO)))
            .map(p => ({ id:p.id, src:p.srcName, no:p.origNo, q:String(p.question||'').replace(/\s+/g,' ').slice(0,40) }));
        }, { SRC, NO });
        if(hits.length !== 1){
          console.error(hits.length ? `문항이 ${hits.length}개 찾아졌습니다 — --id 로 하나를 고르세요:` : '조건에 맞는 문항이 없습니다.');
          hits.slice(0, 20).forEach(h => console.error(`  ${h.id}  [${h.src||''} ${h.no||''}번] ${h.q}`));
          await lab.close(); process.exit(2);
        }
        ID = hits[0].id; console.log(`📄 ${hits[0].src||''} ${hits[0].no||''}번 → ${ID}`);
      }
      const rec = await page.evaluate(async id => {
        try{
          const c = await sbLoad();
          const { data } = await c.from('problems').select('data').eq('id', id);
          if(data && data[0] && data[0].data) return data[0].data;
        }catch(e){}
        return await DB.get('problems', id).catch(() => null);
      }, ID);
      if(!rec){ console.error('문항을 찾지 못했습니다: '+ID); code = 2; }
      else if(cmd === 'pull'){
        const dir = opt('out', '.');
        fs.mkdirSync(dir, { recursive: true });
        (rec.images || []).forEach((d, k) => {
          const ext = /^data:image\/png/.test(d) ? 'png' : 'jpg';
          const f = path.join(dir, `${ID}-${k}.${ext}`); writeDataUrl(f, d); console.log('🖼 '+path.resolve(f));
        });
        const info = { id: ID, question: rec.question, choices: rec.choices, answer: rec.answer,
          subject: rec.subject, chapter: rec.chapter, figSpecs: rec.figSpecs || [] };
        const f = path.join(dir, `${ID}.json`); fs.writeFileSync(f, JSON.stringify(info, null, 2), 'utf8');
        console.log('📄 '+path.resolve(f));
      } else {
        const idx = opt('index', (rec.images || []).length ? '0' : 'new');
        const r = await page.evaluate(({rec, spec, idx}) => attachFigSpec(rec, spec, idx), { rec, spec, idx });
        await waitSynced(page);
        console.log(`✅ 문항 ${ID} 의 그림 ${r.index+1}번에 설계도 그림을 넣고 동기화했습니다 (그림 ${r.images}개)`);
      }
    }
  }catch(e){ console.error('실행 실패:', e.message||e); code = 2; }
  await lab.close();
  process.exit(code);
})();
