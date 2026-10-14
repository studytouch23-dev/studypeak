// 수학 랩 회귀 테스트 전체 실행: node run-all.js
// 크로미움 경로가 다르면 PW_CHROMIUM=/path/to/chromium node run-all.js
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const tests = fs.readdirSync(__dirname).filter(f=>/^smoke\d+\.js$/.test(f)).sort((a,b)=>+(a.match(/\d+/))- +(b.match(/\d+/)));
let failed = [];
for(const t of tests){
  console.log(`\n══════ ${t} ══════`);
  const r = spawnSync('node', [path.join(__dirname,t)], { stdio:'inherit', timeout: 300000 });
  if(r.status !== 0) failed.push(t);
}
console.log('\n════════════════════');
if(failed.length){ console.log('❌ 실패:', failed.join(', ')); process.exit(1); }
console.log(`✅ ${tests.length}개 테스트 전체 통과`);
