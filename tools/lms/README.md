# 스터디피크 LMS 업로드 엑셀 — 규격·검증기

claude.ai 프로젝트 "[수학 전용]스터디피크 문제 생성"(→ 클로드 코드 이전 패키지 `studypeak-math-lab`)에서 가져온 것.
랩의 **[📊 스터디피크 LMS 엑셀]**(학습지 화면, `lab/index.html` 의 `lmsOpen`·`lmsSheetRows`·`xlsxBlob`)이 이 규격을 따른다.

| 파일 | 내용 |
|---|---|
| `exam_template_v3_spec.md` | 시험 양식 v3 (그룹 9열 / 문항 14열, 숨김 `_Lookup`) — 랩이 만드는 양식 |
| `textbook_template_spec.md` | 교과서 양식 (그룹 7열 / 문항 13열) — 랩에는 아직 없음 |
| `validate_lms_upload.py` | 빌드 후 검증기 (시험 v3 전용). ERROR 0건이어야 업로드 |
| `master_lookup.py` | 마스터 유형표 xlsx 로딩·대분류 역조회 |

```bash
pip install openpyxl
python3 tools/lms/validate_lms_upload.py 받은파일.xlsx --master 스터디피크_수학_고등_유형.xlsx --expect-sec 6000 --expect-score 100
```

미검증(첫 업로드 후 기록): 답안개수·정답선택지 문자열 vs 숫자 — 랩 기본은 템플릿 샘플대로 **문자열**, 오류 나면 창에서 [숫자]로.
