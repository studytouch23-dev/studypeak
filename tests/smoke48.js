// smoke48: 맥(Claude Code·Max)용 그림 도구 — tools/graph.js(설계도 → SVG·PNG, 점검)와
//          tools/generate.js 의 그래프 문항(생성 결과의 [그림설계] → 그림 자동 생성·설계도 동기화, 유사 생성에 원본 설계도 전달)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };
const TOOLS = path.join(__dirname, '..', 'tools');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-graph-'));

function run(script, args, opts){
  let out = '', code = 0;
  try{
    out = execFileSync(process.execPath, [path.join(TOOLS, script), ...args],
      { encoding:'utf8', timeout: 180000, ...(opts||{}), env: { ...process.env, ...((opts&&opts.env)||{}) } });
  }catch(e){ code = e.status == null ? 2 : e.status; out = (e.stdout||'') + (e.stderr||''); }
  console.log(out.trim().split('\n').map(l=>'  | '+l).join('\n'));
  return { out, code };
}

// ── 1) graph.js render: SVG + PNG ──
const spec = { kind:'geometry', points:{ A:[0,3], B:[0,0], C:[4,0] }, polygons:[{ p:['A','B','C'] }],
  segments:[{ p:['B','C'], label:'4' }, { p:['A','B'], label:'3' }], angles:[{ p:['A','B','C'], right:true }] };
const specFile = path.join(tmp, 'tri.json');
fs.writeFileSync(specFile, JSON.stringify(spec));
let r = run('graph.js', ['render', specFile]);
const svgF = path.join(tmp, 'tri.svg'), pngF = path.join(tmp, 'tri.png');
check('render: 정상 종료', r.code === 0, r.code);
check('render: SVG 파일(벡터, 라벨 포함)', fs.existsSync(svgF) && /^<svg[\s\S]*>4<\/text>[\s\S]*<\/svg>$/.test(fs.readFileSync(svgF, 'utf8')));
const png = fs.existsSync(pngF) ? fs.readFileSync(pngF) : Buffer.alloc(0);
check('render: PNG 파일(진짜 PNG, 폭 800)', png.slice(1,4).toString() === 'PNG' && png.readUInt32BE(16) === 800, png.length && png.readUInt32BE(16));

r = run('graph.js', ['render', specFile, '-o', path.join(tmp, 'big.png'), '--scale', '2']);
const big = fs.existsSync(path.join(tmp, 'big.png')) ? fs.readFileSync(path.join(tmp, 'big.png')) : Buffer.alloc(0);
check('render -o --scale 2: 두 배 해상도 PNG 하나만', r.code === 0 && big.length > 0 && big.readUInt32BE(16) === 1600 && !r.out.includes('big.svg'), big.length && big.readUInt32BE(16));

// ── 2) 표준입력 + check ──
r = run('graph.js', ['check', '-'], { input: JSON.stringify({ kind:'graph', x:[-2,2], y:[-1,4], curves:[{ f:'x^2' }] }) });
check('check(표준입력): 정상 설계도', r.code === 0 && r.out.includes('✓ 설계도 정상'), r.code);
const bad = path.join(tmp, 'bad.json');
fs.writeFileSync(bad, JSON.stringify({ kind:'geometry', points:{ A:[0,0] }, segments:[{ p:['A','Q'] }] }));
r = run('graph.js', ['check', bad]);
check('check: 없는 점을 알려 주고 실패 코드', r.code === 1 && r.out.includes('없는 점 "Q"'), r.code);
fs.writeFileSync(bad, '{"kind":"graph", "x":[');
r = run('graph.js', ['render', bad]);
check('render: JSON 오류는 파일을 만들지 않고 안내', r.code === 1 && r.out.includes('JSON 형식 오류'), r.code);
r = run('graph.js', ['pull']);
check('pull: 클라우드 계정 없으면 안내', r.code === 2 && r.out.includes('SP_EMAIL'), r.code);

// ── 3) generate.js: 그래프 문항 → 그림 자동 + 설계도 동기화 ──
const fakeClaude = path.join(tmp, 'fake-claude.js');
const gsp = JSON.stringify({ kind:'graph', x:[-1,4], y:[-2,5], curves:[{ f:'x^2-3*x', label:'y=x²−3x' }] });
const genText = [
  '1. 곡선 $y=x^{2}-3x$ 와 $x$ 축으로 둘러싸인 부분의 넓이는?',
  '[그림설계]'+gsp+'[/그림설계]',
  '① $\\dfrac{7}{2}$ ② $4$ ③ $\\dfrac{9}{2}$ ④ $5$ ⑤ $\\dfrac{11}{2}$',
  '[답] ③',
  '[해설] $\\int_{0}^{3}(3x-x^{2})dx=\\dfrac{9}{2}$'
].join('\n');
// 생성 프롬프트는 그대로 저장(원본 설계도 전달 확인용), 검산 프롬프트엔 그림 내용(설계도)이 들어갔는지에 따라 답
fs.writeFileSync(fakeClaude, '#!/usr/bin/env node\n'
  + 'const fs = require("fs");\n'
  + 'const p = process.argv[process.argv.indexOf("-p")+1] || "";\n'
  + 'let out = '+JSON.stringify(genText)+';\n'
  + 'if(p.includes("정답은 일부러 알려주지 않습니다")) out = JSON.stringify({answer: p.includes("[그림 내용(설계도)]") ? "③" : "①", work:"", wellPosed:true});\n'
  + 'else fs.writeFileSync('+JSON.stringify(path.join(tmp, 'gen-prompt.txt'))+', p);\n'
  + 'console.log(JSON.stringify({ result: out }));\n');
fs.chmodSync(fakeClaude, 0o755);
r = run('generate.js', ['--stub', '--subject','수학Ⅱ', '--count','1'], { env: { CLAUDE_BIN: fakeClaude } });
check('generate: 정상 종료', r.code === 0, r.code);
check('generate: 설계도로 그림 1개 그림', r.out.includes('📐 설계도로 그림 1개'), (r.out.match(/📐[^\n]*/)||[])[0]);
check('generate: 클라우드에 설계도 함께 동기화', /\[stub\] 설계도: \[\["graph"\]\]/.test(r.out), (r.out.match(/\[stub\] 설계도: [^\n]*/)||[])[0]);
check('generate: 검산 AI도 그림 내용(설계도)을 받아 일치', /검산 — 일치 1 · 불일치 0/.test(r.out), (r.out.match(/검산 — [^\n]*/)||[])[0]);
const gp = fs.existsSync(path.join(tmp, 'gen-prompt.txt')) ? fs.readFileSync(path.join(tmp, 'gen-prompt.txt'), 'utf8') : '';
check('generate: 생성 프롬프트에 [그림설계] 형식 안내', gp.includes('[그림설계]') && gp.includes('"kind":"geometry"'));

fs.rmSync(tmp, { recursive:true, force:true });
console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
process.exit(fails ? 1 : 0);
