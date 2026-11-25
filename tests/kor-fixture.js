// 국어 랩 테스트용 시험지 PDF 만들기 — 실제 시험지는 저작권이 있어 저장소에 넣지 않고, 같은 짜임(2단, [N~M] 세트, 단을 넘는 지문,
// 밑줄·상자·<보기>, 시, 단독 문항, 되풀이되는 머리말)을 지어낸 글로 만든다. 크로미움의 PDF 저장으로 글자 층이 있는 PDF가 나온다.
const CSS = `
  @page{size:A4;margin:14mm 12mm}
  body{font-family:"Noto Serif CJK KR","Noto Sans CJK KR","NanumMyeongjo",serif;font-size:10.5pt;line-height:1.75;margin:0}
  .hd{display:flex;justify-content:space-between;border-bottom:1.5px solid #000;padding-bottom:4px;margin-bottom:8px;font-weight:bold}
  .cols{display:flex;gap:18px}.col{width:50%}
  .set{font-weight:bold;font-family:"Noto Sans CJK KR",sans-serif;margin-bottom:6px}
  .box{border:1px solid #000;padding:6px 8px}.p{text-indent:1em;margin:0;text-align:justify}
  .q{margin:12px 0 4px;padding-left:1.4em;text-indent:-1.4em}.c{margin:1px 0 1px 1em;padding-left:1.2em;text-indent:-1.2em}
  .bogi{border:1px solid #000;margin:6px 0;padding:6px 8px}.bogi .t{text-align:center}
  .poem div{margin:0}.pg{break-after:page}`;
const ch = arr => arr.map((t, i) => `<div class="c">${'①②③④⑤'[i]} ${t}</div>`).join('');
const EXAM = `<style>${CSS}</style>
<div class="pg"><div class="hd"><span>2099학년도 지어낸 모의 시험 문제지</span><span>국어 영역</span></div>
<div class="cols"><div class="col">
  <div class="set">[1~3] 다음 글을 읽고 물음에 답하시오.</div>
  <div class="box"><p class="p">도시의 기온이 주변 교외보다 높게 나타나는 현상을 열섬 현상이라고 한다. 낮 동안 아스팔트와 콘크리트는 태양 에너지를 흡수해 저장했다가 밤에 천천히 내보낸다. 그래서 열섬은 ㉠ <u>한낮보다 해가 진 뒤에 더 뚜렷하다.</u></p>
  <p class="p">건물이 빽빽한 곳에서는 바람길이 막혀 열이 빠져나가기 어렵고, 냉방기와 자동차가 내보내는 열도 더해진다. 나무와 물은 증발 과정에서 열을 빼앗아 기온을 낮춘다.</p></div>
</div><div class="col">
  <div class="box"><p class="p">따라서 녹지와 수면이 줄어든 곳일수록 열섬의 세기가 커진다. 도시를 설계할 때 바람이 지나는 길을 남겨 두어야 하는 까닭이 여기에 있다.</p></div>
  <div class="q">1. 윗글의 내용과 일치하지 <u>않는</u> 것은?</div>
  ${ch(['열섬은 도시가 교외보다 더운 현상이다.', '포장된 땅은 낮에 모은 열을 밤에 내보낸다.', '녹지가 줄면 열섬이 약해진다.', '빽빽한 건물은 열이 빠져나가는 것을 막는다.', '냉방기의 열도 열섬에 영향을 준다.'])}
  <div class="q">2. &lt;보기&gt;를 바탕으로 ㉠을 이해한 내용으로 가장 적절한 것은? [3점]</div>
  <div class="bogi"><div class="t">&lt;보 기&gt;</div>밤이 되어도 식지 않는 도심의 온도를 재어 보면 교외와의 차이는 새벽에 가장 크다.</div>
  ${ch(['낮에 저장된 열이 밤에 나오기 때문이다.', '밤에는 바람이 더 세게 불기 때문이다.', '교외의 기온이 밤에 오르기 때문이다.', '냉방기를 밤에만 켜기 때문이다.', '나무가 밤에 열을 내기 때문이다.'])}
</div></div></div>
<div><div class="hd"><span>2099학년도 지어낸 모의 시험 문제지</span><span>국어 영역</span></div>
<div class="cols"><div class="col">
  <div class="q">3. 윗글을 읽고 나눈 대화로 적절한 것은?</div>
  ${ch(['바람길을 막아야 시원해지겠군.', '녹지를 늘리면 도움이 되겠군.', '열섬은 낮에만 생기겠군.', '교외가 도시보다 덥겠군.', '수면은 기온과 관계가 없겠군.'])}
  <div class="set">[4~5] 다음 시를 읽고 물음에 답하시오.</div>
  <div class="box poem"><div>봄은 골목 끝에서 온다</div><div>젖은 담장을 넘어</div><div>ⓐ <u>아직 덜 마른 빨래</u> 사이로</div><div>누군가의 이름을 부르며</div><div>- 지어낸 시, 「봄」 -</div></div>
  <div class="q">4. 윗글에 대한 설명으로 가장 적절한 것은?</div>
  ${ch(['공간의 이동에 따라 시상을 전개하고 있다.', '의문형 문장을 되풀이하고 있다.', '색채어를 나란히 늘어놓고 있다.', '과거와 현재를 견주고 있다.', '명령형 어미로 끝맺고 있다.'])}
</div><div class="col">
  <div class="q">5. ⓐ에 대한 이해로 적절하지 <u>않은</u> 것은?</div>
  ${ch(['일상의 사물이다.', '봄이 지나는 길목에 놓여 있다.', '겨울이 끝났음을 알리는 소리다.', '덜 마른 상태로 그려진다.', '골목의 풍경을 이룬다.'])}
  <div class="q">6. 밑줄 친 말의 쓰임이 바르지 <u>않은</u> 것은?</div>
  ${ch(['부장님께 서류 <u>결재</u>를 받았다.', '카드로 물건값을 <u>결제</u>했다.', '두 낱말의 뜻을 <u>혼돈</u>하여 잘못 썼다.', '갈등을 <u>지양</u>하고 협력을 지향한다.', '새 제품을 <u>개발</u>했다.'])}
</div></div></div>`;
const SOLUTION = `<style>body{font-family:"Noto Sans CJK KR",sans-serif;font-size:11pt;line-height:1.7} p{margin:0}</style>
<p>■ [공통: 독서·문학]</p><p>01. ③  02. ①  03. ②  04. ①  05. ③  06. ③</p><br>
<p>[1~3] 독서</p><p>[1-3] 과학, ‘도시 열섬 현상’</p><p>지문해설 : 이 글은 도시가 교외보다 더운 열섬 현상의 원인을 설명하고 있다.</p><p>[주제] 열섬 현상의 원인과 대책</p><br>
<p>1. 세부 내용 파악</p><p>정답해설 : 2문단에서 녹지가 줄어든 곳일수록 열섬의 세기가 커진다고 하였다.</p><p>정답 ③</p><p>[오답피하기] ① 1문단에서 확인할 수 있다. ② 1문단에서 확인할 수 있다.</p><br>
<p>2. 구체적 사례 적용</p><p>정답해설 : 낮에 저장된 열이 밤에 나오므로 밤에 차이가 커진다.</p><p>정답 ①</p><br>
<p>3. 반응의 적절성 평가</p><p>정답해설 : 녹지는 증발 과정에서 열을 빼앗는다.</p><p>정답 ②</p><br>
<p>[4~5] 문학</p><p>[4-5] 현대시, ‘봄’</p><p>4. 표현상의 특징 파악</p><p>정답해설 : 골목 끝에서 담장으로 공간이 옮겨 간다.</p><p>정답 ①</p><br>
<p>5. 시어의 의미 파악</p><p>정답해설 : 빨래는 소리가 아니다.</p><p>정답 ③</p><br><p>6. 어휘의 쓰임</p><p>정답해설 : ‘혼동’이 바르다.</p><p>정답 ③</p>`;
async function makePdf(browser, html){
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8">' + html, { waitUntil: 'load' });
  const buf = await page.pdf({ format: 'A4', printBackground: true });
  await page.close();
  return buf;
}
module.exports = { EXAM, SOLUTION, makePdf };
