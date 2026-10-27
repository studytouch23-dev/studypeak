// smoke58: tools/twins.js — 맥의 Claude Code(Max)로 쌍둥이·변형 일괄 생성 (가짜 claude): 출처·번호로 원본 고르기,
//          그림 원본은 이미지 파일로 넘김, 독립 검산, 저장·클라우드 동기화, 옵션 오류
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-twins-'));
const log = path.join(tmp, 'calls.log');

// 가짜 claude: 생성 요청엔 문항 JSON, 검산 요청엔 정답 / 받은 프롬프트 종류·이미지 경로를 기록
const fake = path.join(tmp, 'fake-claude.js');
fs.writeFileSync(fake, '#!/usr/bin/env node\n'
  + 'const fs = require("fs");\n'
  + 'const p = process.argv[process.argv.indexOf("-p")+1] || "";\n'
  + 'const img = (p.match(/분석할 이미지 파일: (\\S+)/)||[])[1] || "";\n'
  + 'let out;\n'
  + 'if(p.includes("[원본 문제]")){\n'
  + '  const kw = (p.split("[원본 문제]").pop().match(/KW\\d+/)||[""])[0];\n'
  + '  fs.appendFileSync(' + JSON.stringify(log) + ', "gen " + kw + " " + (img && fs.existsSync(img) ? "img" : "-") + "\\n");\n'
  + '  out = { items: [ { kind:"쌍둥이", question: kw+" 쌍둥이 $x+1$ 은?", choices:[], answer:"3", solution:"풀이", figure: kw==="KW2" ? { kind:"graph", x:[-1,3], y:[-1,3], curves:[{ f:"x" }] } : null },\n'
  + '                   { kind:"변형", question: kw+" 변형 $x+2$ 은?", choices:[], answer:"4", solution:"풀이", figure: kw==="KW2" ? { kind:"graph", x:[-1,3], y:[-1,4], curves:[{ f:"x+1" }] } : null } ] };\n'
  + '} else if(p.includes("정답은 일부러 알려주지 않습니다")){\n'
  + '  fs.appendFileSync(' + JSON.stringify(log) + ', "verify\\n");\n'
  + '  out = { answer: p.includes("변형") ? "4" : "3", wellPosed:true, figureOk:true };\n'
  + '} else out = {};\n'
  + 'console.log(JSON.stringify({ result: JSON.stringify(out) }));\n');
fs.chmodSync(fake, 0o755);

// 원본(시드): 10월 모의고사 1·2·3번(2번은 그림만 있음), 다른 출처 1개
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const base = { choices:[], answer:'1', solution:'', subject:'수학Ⅱ', chapter:'', section:'', grade:'고3', srcType:'기출', difficulty:3, tags:[], reviewed:false, createdAt:1, updatedAt:1 };
const seed = [
  { ...base, id:'o1', origNo:'1', srcName:'10월 모의고사', question:'KW1 문제', images:[] },
  { ...base, id:'o2', origNo:'2', srcName:'10월 모의고사', question:'KW2 그래프 문제\n[그림]', images:[png] },
  { ...base, id:'o3', origNo:'3', srcName:'10월 모의고사', question:'KW3 문제', images:[] },
  { ...base, id:'x9', origNo:'1', srcName:'다른 교재', question:'KW9 문제', images:[] },
];
const seedFile = path.join(tmp, 'seed.json'); fs.writeFileSync(seedFile, JSON.stringify(seed));

function run(args){
  let out = '', code = 0;
  try{ out = execFileSync(process.execPath, [path.join(__dirname,'..','tools','twins.js'), ...args],
    { encoding:'utf8', timeout: 240000, env: { ...process.env, CLAUDE_BIN: fake, SP_STUB_SEED: seedFile } }); }
  catch(e){ code = e.status == null ? 2 : e.status; out = (e.stdout||'') + (e.stderr||''); }
  console.log(out.trim().split('\n').map(l => '  | ' + l).join('\n'));
  return { out, code };
}

let r = run(['--stub', '--src', '10월 모의', '--nos', '1-2']);
const calls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
check('정상 종료', r.code === 0, r.code);
check('출처·번호로 원본 2개(1·2번)만, 다른 출처 제외', /원본 2문항/.test(r.out) && calls.filter(c => c.startsWith('gen')).map(c => c.split(' ')[1]).join(',') === 'KW1,KW2', calls.join(' | '));
check('그림 있는 원본은 이미지 파일로 넘김 (Claude Code가 Read)', calls.includes('gen KW2 img') && calls.includes('gen KW1 -'), calls.join(' | '));
check('독립 검산: 새 문제 4개 각 1번', calls.filter(c => c === 'verify').length === 4);
check('검산 통과 4문항 저장·동기화 (버린 것 없음)', /✅ 검산 통과 4문항 저장·동기화/.test(r.out) && !/버리고/.test(r.out), (r.out.match(/✅[^\n]*/)||[])[0]);
const up = JSON.parse((r.out.match(/\[stub\] 업로드: (.+)/)||[,'[]'])[1]);
check('클라우드: 쌍둥이·변형, 원래 번호, 그림 원본엔 새 그림 설계도', up.length === 4 && up.filter(x => x[1] === '2' && x[3] === 1).length === 2 && up.filter(x => x[0] === '변형').length === 2, JSON.stringify(up));
r = run(['--stub', '--src', '없는 출처']);
check('원본이 없으면 안내하고 종료 코드 2', r.code === 2 && r.out.includes('원본 문항을 찾지 못했습니다'), r.code);
r = run(['--stub', '--src', '10월', '--twin', '0', '--variant', '0']);
check('개수 0이면 안내', r.code === 2 && r.out.includes('1 이상'), r.code);

fs.rmSync(tmp, { recursive:true, force:true });
console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
process.exit(fails ? 1 : 0);
