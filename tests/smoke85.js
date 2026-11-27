// smoke85: 🔑 학원 팀 키 — 팀원 계정은 로그인만 하면 학원 API 키로 AI 가 동작한다(각자 키 불필요)
//   팀원: team_config 가 읽힘 → 요청의 x-api-key 가 팀 키, 내 키는 그대로 두되 쓰지 않음, 설정 화면에 안내 띠·키 칸 잠금
//   새지 않음: 팀 키는 localStorage 에도, 계정 설정(__settings)에도, 화면의 키 칸에도 들어가지 않는다([저장]·[연결 테스트]를 눌러도)
//   비팀원·표 없음·관리용 키: 내 키 그대로. 로그아웃하면 팀 키가 사라진다. 로그인 직후의 AI 호출은 팀 키를 받을 때까지 기다린다
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };
const TEAM_KEY = 'sk-ant-api03-TEAMKEY-zzz', OWN_KEY = 'sk-ant-api03-OWNKEY-aaa';

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  const r = await page.evaluate(async ({ TEAM_KEY, OWN_KEY }) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    // 가짜 Supabase 에 team_config 읽기를 얹는다: window.__team = 돌려줄 줄들(팀원이 아니면 []), __teamErr = 표가 없을 때의 오류, __teamDelay = 느린 응답
    window.__team = []; window.__teamErr = null; window.__teamDelay = 0; window.__teamReads = 0;
    const orig = window.supabase.createClient;
    window.supabase.createClient = (...a) => { const c = orig(...a), from = c.from;
      c.from = t => t !== 'team_config' ? from(t) : { select: () => ({ eq: async () => { window.__teamReads++; if(window.__teamDelay) await sleep(window.__teamDelay); return window.__teamErr ? { data: null, error: window.__teamErr } : { data: window.__team, error: null }; } }) };
      return c; };
    // AI 호출 가로채기: 어떤 키로 불렀는지 기록
    const calls = []; let failCredit = false;
    window.fetch = async (url, opts) => { calls.push({ key: opts.headers['x-api-key'], ws: opts.headers['anthropic-workspace-id'] || '' });
      if(failCredit) return new Response(JSON.stringify({ error: { message: 'Your credit balance is too low to access the Anthropic API.' } }), { status: 400 });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"ok":true}' }] }), { status: 200 }); };
    const login = async email => { $('#sb-email').value = email; $('#sb-pw-login').value = 'pw-12345678'; await sbPwLogin(); if(TEAM.pending) await TEAM.pending; };
    const leaks = () => { const hits = []; for(let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if(String(localStorage.getItem(k)).includes('TEAMKEY')) hits.push(k); }
      const row = window.__rows.worksheets.get('__settings'); if(row && JSON.stringify(row).includes('TEAMKEY')) hits.push('cloud:__settings'); return hits.join(); };

    // 0) 로그인 전: 내 키
    localStorage.setItem('sp-lab-apikey', OWN_KEY); localStorage.setItem('sp-lab-wsid', 'wrkspc_own');
    go('data'); fillSettingsUI();
    out.before = { key: aiSettings().key, team: aiSettings().team, band: $('#ai-team').style.display, disabled: $('#ai-key').disabled };

    // 1) 팀원 로그인: 팀 키로 고정(내 워크스페이스 ID 도 안 보냄)
    window.__team = [{ api_key: ' ' + TEAM_KEY + ' ', workspace_id: '' }];
    await login('teacher@example.com');
    await aiJsonCall([{ type: 'text', text: 'x' }], 100);
    const s1 = aiSettings();
    out.member = { key: s1.key, team: s1.team, own: s1.ownKey, sent: calls[calls.length - 1].key, ws: calls[calls.length - 1].ws, band: $('#ai-team').style.display, disabled: $('#ai-key').disabled && $('#ai-wsid').disabled,
      input: $('#ai-key').value, lsOwn: localStorage.getItem('sp-lab-apikey') };
    // [저장]·[연결 테스트]를 눌러도 팀 키가 저장·동기화되지 않는다
    saveAiSettings(); await testAiConnection(); await sleep(1600); try{ await sbPushSettings(); }catch(e){}
    out.member.status = $('#ai-status').textContent; out.member.testKey = calls[calls.length - 1].key; out.member.lsOwn2 = localStorage.getItem('sp-lab-apikey'); out.member.leaks = leaks();
    // 크레딧이 떨어졌을 때: 직원에게는 "대표에게 알려 달라"
    failCredit = true; try{ await aiJsonCall([{ type: 'text', text: 'x' }], 100); out.member.creditMsg = 'no error'; }catch(e){ out.member.creditMsg = e.message; }
    await testAiConnection(); out.member.creditTest = $('#ai-status').textContent; failCredit = false;

    // 2) 로그아웃: 팀 키가 사라지고 내 키로
    await sbLogout();
    out.logout = { key: aiSettings().key, team: aiSettings().team, band: $('#ai-team').style.display, disabled: $('#ai-key').disabled };

    // 3) 로그인 직후 바로 AI 를 불러도 팀 키를 받을 때까지 기다린다(느린 응답)
    window.__teamDelay = 250; const n0 = calls.length;
    $('#sb-email').value = 'teacher@example.com'; $('#sb-pw-login').value = 'pw-12345678';
    const pLogin = sbPwLogin(); await sleep(60);
    out.race = { pendingAtCall: !!TEAM.pending };
    await aiJsonCall([{ type: 'text', text: 'x' }], 100); await pLogin;
    out.race.sent = calls[n0].key; window.__teamDelay = 0;
    await sbLogout();

    // 4) 팀원이 아닌 계정(0줄): 내 키 그대로, 워크스페이스 ID 도 내 것
    window.__team = [];
    await login('other@example.com');
    await aiJsonCall([{ type: 'text', text: 'x' }], 100);
    out.other = { key: aiSettings().key, team: aiSettings().team, sent: calls[calls.length - 1].key, ws: calls[calls.length - 1].ws, band: $('#ai-team').style.display, reads: window.__teamReads };
    await sbLogout();

    // 5) 표가 아직 없음(오류) · 관리용 키가 들어 있음 → 팀 키로 쓰지 않는다
    window.__teamErr = { message: 'relation "public.team_config" does not exist' };
    await login('teacher@example.com'); out.noTable = { key: aiSettings().key, team: aiSettings().team }; await sbLogout();
    window.__teamErr = null; window.__team = [{ api_key: 'sk-ant-admin01-xxx', workspace_id: '' }];
    await login('teacher@example.com'); out.admin = { key: aiSettings().key, team: aiSettings().team }; await sbLogout();

    // 6) 팀 키에 워크스페이스 ID 가 함께 있으면 그것을 보낸다. 직원이 따로 키를 넣지 않아도 AI 단추가 열린다
    localStorage.removeItem('sp-lab-apikey'); localStorage.removeItem('sp-lab-wsid');
    window.__team = [{ api_key: TEAM_KEY, workspace_id: 'wrkspc_team' }];
    await login('teacher@example.com');
    await aiJsonCall([{ type: 'text', text: 'x' }], 100);
    out.ws = { sent: calls[calls.length - 1].key, ws: calls[calls.length - 1].ws, hasKey: !!aiSettings().key, input: $('#ai-key').value, leaks: leaks() };
    return out;
  }, { TEAM_KEY, OWN_KEY });

  check('로그인 전: 내 키, 안내 띠 없음', r.before.key === OWN_KEY && !r.before.team && r.before.band === 'none' && !r.before.disabled, JSON.stringify(r.before));
  check('팀원 로그인: AI 요청이 학원 팀 키로 나감(내 워크스페이스 ID 는 안 보냄)', r.member.key === TEAM_KEY && r.member.team && r.member.sent === TEAM_KEY && r.member.ws === '', r.member.sent + ' ws=' + r.member.ws);
  check('내 키는 지우지 않고 그대로 둠(쓰지만 않음), 화면 키 칸에는 팀 키가 들어가지 않음', r.member.own === OWN_KEY && r.member.lsOwn === OWN_KEY && r.member.input === OWN_KEY, r.member.input);
  check('설정 화면: 안내 띠가 보이고 키·워크스페이스 칸이 잠김', r.member.band === 'block' && r.member.disabled);
  check('[저장]·[연결 테스트]를 눌러도 팀 키로 테스트하되, localStorage·계정 설정으로 새지 않음', r.member.testKey === TEAM_KEY && /연결 성공.*학원 팀 키/.test(r.member.status) && r.member.lsOwn2 === OWN_KEY && r.member.leaks === '', r.member.status + ' leaks=' + r.member.leaks);
  check('크레딧 부족 안내: 직원에게는 대표에게 알리라고', /대표 선생님께 알려/.test(r.member.creditMsg) && /대표 선생님께 알려/.test(r.member.creditTest) && !/Billing에서 크레딧을 충전/.test(r.member.creditTest), r.member.creditMsg.slice(-60));
  check('로그아웃: 팀 키가 사라지고 내 키로, 칸 잠금 풀림', r.logout.key === OWN_KEY && !r.logout.team && r.logout.band === 'none' && !r.logout.disabled, JSON.stringify(r.logout));
  check('로그인 직후의 AI 호출은 팀 키를 받을 때까지 기다림', r.race.pendingAtCall && r.race.sent === TEAM_KEY, JSON.stringify(r.race));
  check('팀원이 아닌 계정: 내 키와 내 워크스페이스 ID 그대로', r.other.key === OWN_KEY && !r.other.team && r.other.sent === OWN_KEY && r.other.ws === 'wrkspc_own' && r.other.band === 'none' && r.other.reads >= 3, JSON.stringify(r.other));
  check('표가 없거나(오류) 관리용 키가 들어 있으면 팀 키로 쓰지 않음', r.noTable.key === OWN_KEY && !r.noTable.team && r.admin.key === OWN_KEY && !r.admin.team, JSON.stringify(r.noTable) + JSON.stringify(r.admin));
  check('직원이 키를 넣지 않아도 동작, 팀 워크스페이스 ID 전송, 어디에도 저장되지 않음', r.ws.sent === TEAM_KEY && r.ws.ws === 'wrkspc_team' && r.ws.hasKey && !/TEAMKEY/.test(r.ws.input) && r.ws.leaks === '', JSON.stringify(r.ws));
  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
