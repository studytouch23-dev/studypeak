// smoke70: ☁️ 설정도 계정에 — 한 기기에서 AI 키·워크스페이스·구글 클라이언트 ID·태그 그룹을 저장하면 계정(__settings 행)에 올라가고,
//          새 기기에서는 로그인만 하면 그대로 들어옴(화면 칸까지), 끄기·계정에서 지우기, 시작할 때 자동으로 쓰는 값은 올리지 않음
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

// 두 '기기'가 함께 쓰는 가짜 클라우드 (worksheets 표)
const cloud = new Map();
async function device(){
  const lab = await openLab({ stub: true });
  const page = lab.page;
  page.on('dialog', d => d.accept());
  await page.exposeFunction('__cloudGet', () => JSON.stringify([...cloud.values()]));
  await page.exposeFunction('__cloudPut', rows => { JSON.parse(rows).forEach(r => cloud.set(r.id, r)); });
  await page.evaluate(async () => {
    const c = await sbLoad();
    c.from = table => ({
      upsert: async rows => { if(table === 'worksheets') await window.__cloudPut(JSON.stringify(rows)); return { error:null }; },
      select: () => { const run = async () => ({ data: table === 'worksheets' ? JSON.parse(await window.__cloudGet()) : [], error:null });
        const ch = { gt: () => ch, order: () => ch, eq: () => ch, range: run, then: f => run().then(f) }; return ch; }
    });
  });
  return lab;
}

(async () => {
  // ── 기기 A: 로그인 → 설정 저장 ──
  const A = await device();
  const errsA = []; A.page.on('pageerror', e => errsA.push(e.message));
  const a = await A.page.evaluate(async () => {
    go('data'); $('#sb-email').value = 't@t.kr'; $('#sb-pw-login').value = 'pw123456'; await sbPwLogin();
    await new Promise(r => setTimeout(r, 400));
    $('#ai-key').value = 'sk-ant-AAA'; $('#ai-wsid').value = 'wrkspc_1'; saveAiSettings(true);
    $('#gd-cid').value = '123.apps.googleusercontent.com'; $('#gd-cid').dispatchEvent(new Event('change'));
    localStorage.setItem('sp-lab-gcid', '123.apps.googleusercontent.com');
    saveTagGroups([{ name:'문항형식', mode:'multi', required:false, items:['객관식','서술형'] }]);
    await new Promise(r => setTimeout(r, 2000));
    return { box: !!$('#sb-syncset') && $('#sb-syncset').checked };
  });
  const row = cloud.get('__settings');
  check('기기 A: 설정이 계정(__settings)에 올라감', row && row.data.kv['sp-lab-apikey'] === 'sk-ant-AAA' && row.data.kv['sp-lab-wsid'] === 'wrkspc_1' && row.data.kv['sp-lab-gcid'] === '123.apps.googleusercontent.com' && /문항형식/.test(row.data.kv['sp-lab-taggroups']), JSON.stringify(row && Object.keys(row.data.kv)));
  check('로그인 화면에 [☁️ 설정도 계정에 저장] 켜짐', a.box);
  check('기기 A 오류 없음', errsA.length === 0, errsA.join(' / '));

  // ── 기기 B: 처음 열고 로그인만 ──
  const B = await device();
  const errsB = []; B.page.on('pageerror', e => errsB.push(e.message));
  const b = await B.page.evaluate(async () => {
    const before = { key: aiSettings().key, at: localStorage.getItem('sp-lab-settings-at') };
    go('data'); $('#sb-email').value = 't@t.kr'; $('#sb-pw-login').value = 'pw123456'; await sbPwLogin();
    await new Promise(r => setTimeout(r, 800));
    return { before, key: aiSettings().key, wsid: aiSettings().wsid, keyBox: $('#ai-key').value, gcid: $('#gd-cid').value, groups: tagGroups().map(g => g.name), status: $('#ai-status').textContent };
  });
  check('새 기기: 시작할 때는 비어 있음(자동 저장으로 계정 덮어쓰지 않음)', !b.before.key && !b.before.at, JSON.stringify(b.before));
  check('새 기기: 로그인만 하면 AI 키·워크스페이스·구글 ID·태그 그룹이 그대로 (입력 칸까지)', b.key === 'sk-ant-AAA' && b.wsid === 'wrkspc_1' && b.keyBox === 'sk-ant-AAA' && b.gcid === '123.apps.googleusercontent.com' && b.groups.join() === '문항형식', JSON.stringify(b));
  check('키 상태에 "계정에 저장됨" 안내', /계정에 저장됨/.test(b.status), b.status);

  // 기기 B에서 모델만 바꿈 → 계정 키는 유지된 채 합쳐짐
  await B.page.evaluate(async () => { $('#ai-figmodel').value = 'claude-opus-5-5'; saveAiSettings(true); await new Promise(r => setTimeout(r, 2000)); });
  const row2 = cloud.get('__settings');
  check('다른 기기에서 바꾼 설정도 합쳐서 올라감 (키는 유지)', row2.data.kv['sp-lab-figmodel'] === 'claude-opus-5-5' && row2.data.kv['sp-lab-apikey'] === 'sk-ant-AAA', JSON.stringify(row2.data.kv['sp-lab-figmodel']));

  // 끄기 → 올리지 않음, 계정에서 지우기
  const off = await B.page.evaluate(async () => { setSettingsSync(false); const at0 = Date.now(); localStorage.setItem('sp-lab-aimodel', 'claude-haiku-5-5'); await new Promise(r => setTimeout(r, 1900)); return at0; });
  const row3 = cloud.get('__settings');
  check('끄면 이 기기 변경을 계정에 올리지 않음', row3.data.kv['sp-lab-aimodel'] !== 'claude-haiku-5-5' || row3.updated_at < off, row3.data.kv['sp-lab-aimodel']);
  await B.page.evaluate(async () => { await sbDeleteSettings(); });
  check('계정에서 설정 지우기', cloud.get('__settings').deleted === true);
  check('기기 B 오류 없음', errsB.length === 0, errsB.join(' / '));

  // ── 기기 C: 예전부터 키가 저장돼 있던 컴퓨터 (계정엔 아직 없음) → 로그인하면 그 키가 계정으로 ──
  cloud.clear();
  const C = await device();
  await C.page.evaluate(async () => {
    Storage.prototype.setItem.call(localStorage, 'sp-lab-apikey', 'sk-ant-OLD');   // 예전 버전에서 저장된 키(시각 기록 없음)
    go('data'); $('#sb-email').value = 't@t.kr'; $('#sb-pw-login').value = 'pw123456'; await sbPwLogin();
    await new Promise(r => setTimeout(r, 1200));
  });
  const rowC = cloud.get('__settings');
  check('예전부터 키가 있던 기기: 로그인하면 그 키가 계정에 올라감', rowC && rowC.data.kv['sp-lab-apikey'] === 'sk-ant-OLD', JSON.stringify(rowC && rowC.data.kv));
  await A.close(); await B.close(); await C.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
