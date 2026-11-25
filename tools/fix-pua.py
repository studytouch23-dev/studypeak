#!/usr/bin/env python3
"""국어 랩 소스 안의 사용자 영역 글자(U+E000~, 줄 이음 표시 등)를 눈에 보이는 이스케이프로 바꾼다.
편집 도구가 이스케이프를 보이지 않는 실제 글자로 바꿔 저장하는 일이 있어, 커밋 전에 한 번 돌린다: python3 tools/fix-pua.py"""
import glob, sys
BS = chr(92)
import re
PUA = re.compile('[' + chr(0xE000) + '-' + chr(0xF8FF) + chr(0xD7FF) + chr(0xFFFD) + ']')
esc = lambda m: BS + 'u%04X' % ord(m.group(0))
changed = 0
for f in glob.glob('korlab/js/*.js') + glob.glob('shared/*.js') + [f for f in glob.glob('tests/smoke*.js') if int(''.join(c for c in f if c.isdigit()) or 0) >= 78] + glob.glob('tests/kor-*.js'):
    s = open(f, encoding='utf8').read()
    t = PUA.sub(esc, s)
    if t != s:
        open(f, 'w', encoding='utf8').write(t)
        changed += 1
        print('fixed', f)
print('done', changed)
