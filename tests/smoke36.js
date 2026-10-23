// smoke36: tools/generate.js (Claude Code(Max) 유사/신규 문제 생성 스크립트) — 가짜 claude 명령으로 전 구간 검증
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sp-gen-'));
const fakeClaude = path.join(tmpDir, 'fake-claude.js');
// 랩의 생성 형식(번호. / ①~⑤ / [답] / [해설])대로 2문항을 내놓는 가짜 claude
const genText = [
  '1. 첫째항이 $2$, 공차가 $3$인 등차수열의 제 $5$ 항은?',
  '① 11 ② 12 ③ 13 ④ 14 ⑤ 15',
  '[답] ④',
  '[해설] $a_{5} = 2 + 4 \\times 3 = 14$ 이다.',
  '',
  '2. 등차수열 $\\{a_{n}\\}$ 에서 $a_{1}=5$, $a_{3}=11$ 일 때 공차는?',
  '① 1 ② 2 ③ 3 ④ 4 ⑤ 5',
  '[답] ③',
  '[해설] $a_{3}-a_{1}=2d=6$ 이므로 $d=3$.'
].join('\n');
// 검산 프롬프트("정답은 일부러 알려주지 않습니다")엔 재풀이 답을: 1번은 맞게(④), 2번은 다르게(②, 생성 정답 ③)
fs.writeFileSync(fakeClaude, '#!/usr/bin/env node\n'
  + 'const p = process.argv[process.argv.indexOf("-p")+1] || "";\n'
  + 'let out = '+JSON.stringify(genText)+';\n'
  + 'if(p.includes("정답은 일부러 알려주지 않습니다")) out = JSON.stringify(p.includes("첫째항이 $2$") ? {answer:"④",work:"a5=14",wellPosed:true} : {answer:"②",work:"d=2",wellPosed:true});\n'
  + 'console.log(JSON.stringify({ result: out }));\n');
fs.chmodSync(fakeClaude, 0o755);

function runGen(args){
  let out = '', code = 0;
  try{
    out = execFileSync(process.execPath, [path.join(__dirname,'..','tools','generate.js'), ...args],
      { encoding:'utf8', timeout: 180000, env: { ...process.env, CLAUDE_BIN: fakeClaude } });
  }catch(e){
    code = e.status == null ? 2 : e.status;
    out = (e.stdout||'') + (e.stderr||'');
  }
  console.log(out.split('\n').map(l=>'  | '+l).join('\n'));
  return { out, code };
}

// ── 정상 생성: 과목·단원 지정 → 2문항 분할·저장·동기화 ──
let { out, code } = runGen(['--stub', '--subject','수학Ⅰ', '--chapter','수열', '--section','등차수열', '--count','2']);
check('정상 종료(코드 0)', code === 0, code);
check('Claude Code 생성 모드', out.includes('생성: Claude Code(Max)'));
check('범위 표시', out.includes('수학Ⅰ > 수열 > 등차수열'));
check('2문항 분할', /✂ 2문항으로 분할됨/.test(out));
check('등록·동기화 완료', /✅ 2문항 등록·클라우드 동기화 완료/.test(out));
check('클라우드 업로드 행 2', /\[stub\] 클라우드 업로드 행: 2/.test(out));
check('독립 검산: 일치 1 · 불일치 1', /검산 — 일치 1 · 불일치 1/.test(out), (out.match(/검산 — [^\n]+/)||[])[0]);
const tags = JSON.parse((out.match(/\[stub\] 태그: (.+)/)||[,'[]'])[1]);
check('불일치 문항만 #검산불일치', tags.filter(t=>t.includes('검산불일치')).length === 1, JSON.stringify(tags));

// ── --no-verify: 검산 생략 ──
({ out, code } = runGen(['--stub', '--no-verify', '--subject','수학Ⅰ', '--chapter','수열', '--count','2']));
check('--no-verify 정상 종료', code === 0, code);
check('--no-verify 면 검산 없음', !/독립 검산|검산 —/.test(out));

// ── 잘못된 과목 → 안내 후 종료 코드 2 ──
({ out, code } = runGen(['--stub', '--subject','없는과목', '--count','1']));
check('없는 과목 거부(코드 2)', code === 2, code);
check('가능 과목 안내', out.includes('과목 없음: 없는과목'));

fs.rmSync(tmpDir, { recursive:true, force:true });
console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
process.exit(fails ? 1 : 0);
