// smoke34: tools/ingest.js (PDF 자동 등록 스크립트) — 생성 PDF로 전 구간(업로드→영역→AI변환→저장→클라우드) 검증
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let fails = 0;
const check = (n, ok, x) => { console.log((ok?'PASS':'FAIL'), n, x!==undefined?('— '+x):''); if(!ok) fails++; };

// 최소 PDF 생성기 (Helvetica 텍스트, xref 오프셋 계산)
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

const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sp-ingest-'));
const pdfPath = path.join(tmpDir, 'sample.pdf');
fs.writeFileSync(pdfPath, makePdf([
  { x:50, y:700, size:14, text:'1.' },
  { x:70, y:700, size:12, text:'What is 2 plus 2?' },
  { x:50, y:650, size:12, text:'Choose the right answer below.' },
  { x:50, y:380, size:14, text:'2.' },
  { x:70, y:380, size:12, text:'What is 3 plus 3?' },
  { x:50, y:330, size:12, text:'Write your answer.' }
]));

let out = '', code = 0;
try{
  out = execFileSync(process.execPath, [path.join(__dirname,'..','tools','ingest.js'), '--stub', pdfPath],
    { encoding:'utf8', timeout: 180000, env: { ...process.env } });
}catch(e){
  code = e.status == null ? 2 : e.status;
  out = (e.stdout||'') + (e.stderr||'');
}
console.log(out.split('\n').map(l=>'  | '+l).join('\n'));

check('정상 종료(코드 0)', code === 0, code);
check('클라우드 로그인', out.includes('✅ 클라우드 로그인됨'));
check('영역 2개 인식(두 문항)', /영역 2개 인식/.test(out), (out.match(/영역 \d+개 인식/)||[])[0]);
check('문항 등록·동기화 완료', /✅ 2문항 등록·클라우드 동기화 완료/.test(out));
check('클라우드 업로드 행 2', /\[stub\] 클라우드 업로드 행: 2/.test(out));
check('실패 0', /실패 0\)/.test(out));

fs.rmSync(tmpDir, { recursive:true, force:true });
console.log(fails ? `\n${fails}개 실패` : '\n전체 통과');
process.exit(fails ? 1 : 0);
