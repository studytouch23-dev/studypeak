/* 스터디피크 공용 부품 — 작은 xlsx 쓰개 (JSZip 필요). 값만 쓴다(수식 없음).
 * SPX.blob([{ name, hidden, widths:{A:22}, rows:[[cell|null …] | null …] }]) → Blob
 *   cell: 문자열·숫자 그대로, 또는 { v, st } — st: 'text'(표시형식 @) · 'h1'·'hg'·'hi'(굵게+채우기) · 'b'(굵게)
 *   '' (빈 문자열) 은 "빈 문자열 셀"(inlineStr)로 쓴다 — LMS가 자기닫힘 빈 셀을 건너뛰어 열이 밀리는 것을 막는다. null 은 셀을 만들지 않는다. */
(function(root, factory){ const o = factory(); if(typeof module === 'object' && module.exports) module.exports = o; else root.SPX = o; })(typeof self !== 'undefined' ? self : this, function(){
  'use strict';
  const xe = s=>String(s).replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = i=>{ let s = ''; for(i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const XF = { text: 1, h1: 2, hg: 3, hi: 4, b: 5 };
  function parts(sheets){
    const sst = [], sIdx = new Map();
    const si = v=>{ if(!sIdx.has(v)){ sIdx.set(v, sst.length); sst.push(v); } return sIdx.get(v); };
    const sheetXml = sh=>{
      let maxC = 0;
      const body = sh.rows.map((row, ri)=>{
        if(!row) return '';
        const cells = row.map((c, ci)=>{
          if(c == null) return '';
          const o = typeof c === 'object' ? c : { v: c };
          if(o.v == null) return '';
          maxC = Math.max(maxC, ci + 1);
          const ref = col(ci) + (ri + 1), sa = XF[o.st] ? ` s="${XF[o.st]}"` : '';
          if(o.v === '') return `<c r="${ref}"${sa} t="inlineStr"><is><t></t></is></c>`;
          if(typeof o.v === 'number') return `<c r="${ref}"${sa}><v>${o.v}</v></c>`;
          return `<c r="${ref}"${sa} t="s"><v>${si(String(o.v))}</v></c>`;
        }).join('');
        return cells ? `<row r="${ri + 1}">${cells}</row>` : '';
      }).join('');
      const cols = Object.entries(sh.widths || {}).map(([L, w])=>{ let n = 0; for(const ch of L) n = n * 26 + ch.charCodeAt(0) - 64; return `<col min="${n}" max="${n}" width="${w}" customWidth="1"/>`; }).join('');
      return `${XML}<worksheet xmlns="${NS}"><dimension ref="A1:${col(Math.max(0, maxC - 1))}${Math.max(1, sh.rows.length)}"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${body}</sheetData></worksheet>`;
    };
    const n = sheets.length, files = {};
    sheets.forEach((sh, k)=>{ files[`xl/worksheets/sheet${k + 1}.xml`] = sheetXml(sh); });
    files['[Content_Types].xml'] = XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + sheets.map((_, k)=>`<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>';
    files['_rels/.rels'] = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    files['xl/workbook.xml'] = `${XML}<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh, k)=>`<sheet name="${xe(sh.name)}" sheetId="${k + 1}"${sh.hidden ? ' state="hidden"' : ''} r:id="rId${k + 1}"/>`).join('')}</sheets></workbook>`;
    files['xl/_rels/workbook.xml.rels'] = XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, k)=>`<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
    const fill = rgb=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
    files['xl/styles.xml'] = XML + `<styleSheet xmlns="${NS}">`
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + `<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill('E8EEF5')}${fill('D9E1F2')}${fill('FCE4D6')}</fills>`
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
      + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    files['xl/sharedStrings.xml'] = `${XML}<sst xmlns="${NS}" count="${sst.length}" uniqueCount="${sst.length}">${sst.map(x=>`<si><t xml:space="preserve">${xe(x)}</t></si>`).join('')}</sst>`;
    return files;
  }
  function blob(sheets, JSZipLib, type){                     // Node 에서는 blob(sheets, require('jszip'), 'nodebuffer')
    const Z = JSZipLib || (typeof JSZip !== 'undefined' ? JSZip : null);
    if(!Z) throw new Error('엑셀 구성요소(JSZip)가 아직 로딩 중입니다. 잠시 후 다시 눌러 주세요.');
    const zip = new Z(), files = parts(sheets);
    for(const k in files) zip.file(k, files[k]);
    return zip.generateAsync({ type: type || 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
  }
  return { parts, blob, col, xe };
});
