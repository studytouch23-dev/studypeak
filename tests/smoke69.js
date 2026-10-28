// smoke69: 클라우드 로그인 — 이메일 + 비밀번호로 바로 로그인(메일 필요 없음), 메일 속 숫자 코드 로그인,
//          'email rate limit exceeded' 등 영어 오류를 쉬운 우리말로, 링크는 누른 기기만 로그인된다는 안내
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  const r = await page.evaluate(async () => {
    go('data');
    const out = { hint: $('#sb-status').textContent, hasPw: !!$('#sb-pw-login') };
    // 메일 보내기: 메일 한도 초과 오류 → 우리말
    const c = await sbLoad();
    c.auth.signInWithOtp = async () => ({ error: { message: 'email rate limit exceeded' } });
    $('#sb-email').value = 'studytouch23@gmail.com';
    await sbSendLink(); out.rate = $('#sb-status').textContent;
    // 메일 보내기 성공 → 숫자 코드 칸
    c.auth.signInWithOtp = async () => ({ error: null });
    await sbSendLink(); out.sent = $('#sb-status').textContent; out.codeRow = $('#sb-code-row').style.display;
    // 틀린 비밀번호
    const realPw = c.auth.signInWithPassword;
    c.auth.signInWithPassword = async () => ({ error: { message: 'Invalid login credentials' } });
    $('#sb-pw-login').value = 'wrong-pass'; await sbPwLogin(); out.bad = $('#sb-status').textContent;
    // 맞는 비밀번호 → 로그인
    c.auth.signInWithPassword = realPw;
    $('#sb-pw-login').value = 'good-pass-123'; await sbPwLogin();
    await new Promise(r => setTimeout(r, 300));
    out.loggedIn = $('#cloud-on').style.display !== 'none' && $('#cloud-login').style.display === 'none';
    out.pwCleared = $('#sb-pw-login').value === '';
    out.pwBox = document.querySelector('#cloud-on details').open && /다른 기기에서 메일 없이 로그인/.test(document.querySelector('#cloud-on details summary').textContent);
    // 숫자 코드
    let got = null; c.auth.verifyOtp = async a => { got = a; return { error: null }; };
    $('#sb-code').value = '123 456'; await sbVerifyCode(); out.otp = got;
    c.auth.verifyOtp = async () => ({ error: { message: 'Token has expired or is invalid' } });
    $('#sb-code').value = '000000'; await sbVerifyCode(); out.otpBad = $('#sb-status').textContent;
    return out;
  });
  check('안내: 링크는 누른 기기만 로그인, 비밀번호 설정하면 어디서나', /그 링크를 누른 기기/.test(r.hint) && /이메일 \+ 비밀번호/.test(r.hint) && r.hasPw, r.hint.slice(0, 80));
  check("'email rate limit exceeded' → 쉬운 우리말 + 해결 방법", /여러 번 요청해서 잠시 막혔습니다/.test(r.rate) && /1시간 뒤/.test(r.rate) && /비밀번호로 로그인/.test(r.rate), r.rate.slice(0, 80));
  check('메일 보낸 뒤: 이 기기에서 열라는 안내 + 숫자 코드 칸', /지금 로그인하려는 이 기기에서/.test(r.sent) && r.codeRow === 'flex', r.sent.slice(0, 60));
  check('틀린 비밀번호 → 아직 안 만들었으면 먼저 설정하라는 안내', /맞지 않습니다/.test(r.bad) && /비밀번호 설정/.test(r.bad), r.bad.slice(0, 80));
  check('이메일 + 비밀번호로 로그인 (메일 없이)', r.loggedIn && r.pwCleared);
  check('로그인 후 [🔑 비밀번호 설정] 펼쳐 보임', r.pwBox);
  check('메일 속 숫자 코드로 로그인 (띄어쓰기 무시)', r.otp && r.otp.token === '123456' && r.otp.type === 'email' && r.otp.email === 'studytouch23@gmail.com', JSON.stringify(r.otp));
  check('코드 오류도 우리말', /숫자 코드가 맞지 않거나/.test(r.otpBad), r.otpBad);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
