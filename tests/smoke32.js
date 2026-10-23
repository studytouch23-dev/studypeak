// smoke32: AI 일괄 작업 ⏹ 중지 — 변환 중단·부분 결과 유지·이어서 재개
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').join(__dirname, '..');
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!path.resolve(p).startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end('forbidden'); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(fs.readFileSync(p));
});

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

(async () => {
  await new Promise(r => server.listen(9141, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto('http://127.0.0.1:9141/lab/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // 시드: 이미지만 있는 드래프트 4개 + fetch 스텁(2번째 응답 직후 ⏹ 중지)
  await page.evaluate(() => {
    localStorage.setItem('sp-lab-apikey','sk-ant-test');
    const cv = document.createElement('canvas'); cv.width=30; cv.height=30;
    const cx = cv.getContext('2d'); cx.fillStyle='#000'; cx.fillRect(5,5,20,20);
    const IMG = cv.toDataURL('image/png');
    state.bulkDrafts = [1,2,3,4].map(n=>({ text:'', num:String(n), sol:'', ans:'', choices:[], img:IMG }));
    go('add'); setAddMode('bulk');
    document.querySelector('#bulk-preview-card').style.display='block';
    rerenderBulk();
    window.__n = 0;
    window.fetch = async (url, opts) => {
      // 단원 분류(텍스트만 묶음 호출)는 전사 호출 수에서 제외
      if(!JSON.parse(opts.body).messages[0].content.some(c=>c.type==='image'))
        return new Response(JSON.stringify({content:[{type:'text',text:'{"items":[]}'}]}), {status:200});
      window.__n++;
      if(window.__n===2) aiBatchCancel();                 // 2번째 문항 변환 "중"에 중지 버튼 누른 상황
      await new Promise(r=>setTimeout(r, 60));
      const r = { question:'변환된 문제 $x_'+window.__n+'$?', choices:[], answer:'', hasFigure:true, figureBox:null,
        subject:'', chapter:'', section:'', difficulty:3 };
      return new Response(JSON.stringify({content:[{type:'text',text:JSON.stringify(r)}]}), {status:200});
    };
  });

  // ── 1) 실행 → 2개 변환 후 중지 ──
  await page.evaluate(() => aiTranscribeDrafts());
  await page.waitForTimeout(1200);
  const r1 = await page.evaluate(() => ({
    calls: window.__n,
    done: state.bulkDrafts.filter(d=>(d.text||'').trim()).length,
    status: document.querySelector('#bulk-status').textContent,
    barHidden: document.querySelector('#ai-stopbar').style.display==='none',
    running: AI_BATCH.running
  }));
  check('중지 요청 후 다음 문항부터 멈춤(2/4만 호출)', r1.calls===2, r1.calls);
  check('변환된 2개는 유지', r1.done===2, r1.done);
  check('중지 안내 표시', r1.status.includes('중지됨'), r1.status.slice(0,60));
  check('중지 바 사라짐 + 상태 해제', r1.barHidden && !r1.running);

  // ── 2) 다시 실행하면 남은 2개만 이어서 변환 + 실행 중에는 중지 바가 보여야 함 ──
  await page.evaluate(() => { window.__p = aiTranscribeDrafts(); });
  await page.waitForTimeout(40);
  const during = await page.evaluate(() => {
    const b = document.querySelector('#ai-stopbar');
    return { shown: b.style.display==='flex', visible: b.offsetParent!==null || b.getBoundingClientRect().height>0,
      btn: !!b.querySelector('button[onclick="aiBatchCancel()"]') };
  });
  check('실행 중 하단에 ⏹ 중지 바 표시', during.shown && during.visible && during.btn, JSON.stringify(during));
  await page.waitForTimeout(1000);
  const r2 = await page.evaluate(() => ({
    calls: window.__n,
    done: state.bulkDrafts.filter(d=>(d.text||'').trim()).length,
    barHidden: document.querySelector('#ai-stopbar').style.display==='none'
  }));
  check('재실행 시 남은 2개만 이어서(총 4호출)', r2.calls===4 && r2.done===4, r2.calls+'회, '+r2.done+'개');
  check('완료 후 중지 바 숨김', r2.barHidden);

  check('페이지 JS 에러 없음', errors.length===0, errors.join(' | ').slice(0,200));
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  await browser.close(); server.close();
  process.exit(fails?1:0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
