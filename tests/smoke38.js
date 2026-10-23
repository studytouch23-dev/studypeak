// smoke38: OCR 강화 ① PDF 글자층 힌트 — 크롭 영역 안의 PDF 텍스트를 문항별로 모아 AI 변환 프롬프트에 함께 전달
//          (영역별로 정확히 나뉘는지, 글꼴 깨진 PDF·스캔 PDF는 힌트를 빼는지)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openLab } = require('../tools/_common.js');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

function makePdf(lines){
  const content = lines.map(l=>`BT /F1 ${l.size} Tf ${l.x} ${l.y} Td (${l.text}) Tj ET`).join('\n');
  const objs = [];
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`;
  objs[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  objs[5] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  let out = '%PDF-1.4\n'; const offs = [0];
  for(let i=1;i<=5;i++){ offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 6\n0000000000 65535 f \n` + offs.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-hint-'));
  const pdfPath = path.join(tmp, 'hint.pdf');
  fs.writeFileSync(pdfPath, makePdf([
    { x:50, y:700, size:14, text:'1.' },
    { x:70, y:700, size:12, text:'What is 2 plus 2?' },
    { x:50, y:680, size:12, text:'Choose the right answer below.' },
    { x:50, y:380, size:14, text:'2.' },
    { x:70, y:380, size:12, text:'What is 3 plus 3?' },
    { x:50, y:360, size:12, text:'Write your answer.' }
  ]));

  const lab = await openLab({ stub: true });
  const page = lab.page;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());

  // AI 호출 스텁: 요청 본문을 모두 기록
  await page.evaluate(() => {
    localStorage.setItem('sp-lab-apikey', 'sk-ant-test');
    window.__reqs = []; let n = 0;
    window.fetch = async (url, opts) => {
      window.__reqs.push(JSON.parse(opts.body)); n++;
      return new Response(JSON.stringify({ content:[{ type:'text', text: JSON.stringify({
        question:`변환 ${n} $x+${n}$?`, choices:[], answer:'', hasFigure:false, figureBox:null,
        subject:'수학Ⅰ', chapter:'수열', section:'등차수열', difficulty:2 }) }] }), { status:200 });
    };
  });

  // ── 1) 실제 흐름: 업로드 → 영역 인식 → 완료(→ AI 변환) ──
  await page.evaluate(() => go('add'));
  await page.setInputFiles('#bulk-files', pdfPath);
  await page.waitForSelector('#pdfed-bg.show', { timeout: 60000 });
  await page.waitForTimeout(600);
  await page.click('button[onclick="pdfedToRegions()"]');
  await page.waitForFunction(() => PDFED.regions.length > 0, null, { timeout: 60000 });
  await page.click('#pdfed-finish');
  await page.waitForFunction(() => state.bulkDrafts.length === 2 && state.bulkDrafts.every(d=>d.aiDone) && !state._aiBusy, null, { timeout: 60000 });

  const r = await page.evaluate(() => ({
    hints: state.bulkDrafts.map(d => d.pdfText || ''),
    prompts: window.__reqs.map(b => (b.messages[0].content.find(c=>c.type==='text')||{}).text || ''),
  }));
  check('문항 1 힌트 = 1번 영역 글자', r.hints[0].includes('What is 2 plus 2?') && r.hints[0].includes('Choose the right answer'), JSON.stringify(r.hints[0]));
  check('문항 1 힌트에 2번 글자 섞이지 않음', !r.hints[0].includes('3 plus 3'));
  check('문항 2 힌트 = 2번 영역 글자', r.hints[1].includes('What is 3 plus 3?') && !r.hints[1].includes('2 plus 2'), JSON.stringify(r.hints[1]));
  check('줄 순서 유지(번호줄 → 다음 줄)', /What is 2 plus 2\?[\s\S]*\nChoose/.test(r.hints[0]));
  const p1 = r.prompts.find(t => t.includes('2 plus 2')) || '';
  check('AI 프롬프트에 [참고 텍스트] 블록 포함', p1.includes('[참고 텍스트]') && p1.includes('이미지를 따르세요'), p1.slice(-200).replace(/\n/g,'⏎'));
  check('각 문항 프롬프트는 자기 힌트만', r.prompts.filter(t=>t.includes('2 plus 2') && t.includes('3 plus 3')).length === 0);

  // ── 2) 힌트를 빼야 하는 경우 ──
  const u = await page.evaluate(() => {
    const fakeVp = { convertToViewportPoint: (x,y) => [x, 792 - y] };
    const mk = items => ({ page: { getViewport: () => fakeVp }, items });
    const garbled = mk([{ str:' 2', x:50, y:700, w:120, h:12 }]);
    const korean = mk([{ str:'함수 f(x)=x²+1 의 최솟값을 구하시오.', x:50, y:700, w:200, h:12 }]);
    return {
      garbled: pdfTextInRect(garbled, 0, 0, 612, 792),
      korean: pdfTextInRect(korean, 0, 0, 612, 792),
      outside: pdfTextInRect(korean, 0, 400, 612, 392),
      noPage: pdfTextInRect({ items: [] }, 0, 0, 10, 10),
      noHintPrompt: aiPrompt().includes('[참고 텍스트]'),
      solPrompt: aiSolImgPrompt('해설 힌트 텍스트입니다 12345').includes('해설 힌트 텍스트입니다'),
    };
  });
  check('글꼴 깨진 PDF(사설 영역 문자) → 힌트 없음', u.garbled === '', JSON.stringify(u.garbled));
  check('정상 한글 → 힌트 있음', u.korean.includes('최솟값을 구하시오'), JSON.stringify(u.korean));
  check('영역 밖 글자는 제외', u.outside === '', JSON.stringify(u.outside));
  check('텍스트 없는(스캔) 페이지 → 힌트 없음', u.noPage === '');
  check('힌트 없으면 프롬프트에 블록 없음', u.noHintPrompt === false);
  check('해설 프롬프트도 힌트 지원', u.solPrompt);

  check('페이지 오류 없음', errors.length === 0, errors.join(' / '));
  fs.rmSync(tmp, { recursive:true, force:true });
  await lab.close();
  console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
