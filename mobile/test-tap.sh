#!/bin/sh
# Taps the first thing on screen whose text (or description) contains $1.
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1
b=$(python3 - "$1" <<'PY'
import re,sys
x=open("ui.xml",encoding="utf-8").read()
for m in re.finditer(r'<node [^>]*>', x):
    n=m.group(0)
    t=(re.search(r' text="([^"]*)"',n) or [None,""])[1]+(re.search(r'content-desc="([^"]*)"',n) or [None,""])[1]
    if sys.argv[1] in t:
        a,b,c,d=map(int,re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',n).groups()); print((a+c)//2,(b+d)//2); break
PY
)
echo "tap '$1' at $b"
if [ -n "$b" ]; then adb shell input tap $b; fi
exit 0
