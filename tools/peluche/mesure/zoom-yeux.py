"""Zoom des yeux : reference | nous, une rangee par bot, depuis la planche cote-shot."""
import sys
from PIL import Image
im = Image.open(sys.argv[1]); C = 300
rows = []
for i in range(int(sys.argv[3])):
    y = i * (C + 10)
    a = im.crop((60, y + 85, 240, y + 175)); b = im.crop((C + 10 + 60, y + 85, C + 10 + 240, y + 175))
    o = Image.new('RGB', (370, 90)); o.paste(a, (0, 0)); o.paste(b, (190, 0)); rows.append(o)
out = Image.new('RGB', (370, 95 * len(rows)))
for i, r in enumerate(rows): out.paste(r, (0, i * 95))
out.resize((out.width * 2, out.height * 2), Image.LANCZOS).save(sys.argv[2])
