#!/bin/sh
# recolte.sh <forme> <url> [--boule] : telecharge une generation, la recale, ecrit un apercu
#   PELUCHE_TRAVAIL  dossier de travail (defaut /tmp/peluche/gris), contient entrees/formes.json
#   PELUCHE_PY       interpreteur avec numpy/scipy/pillow (defaut /tmp/peluche/venv/bin/python)
# Le resultat est $PELUCHE_TRAVAIL/sortie/<forme>/<forme>.webp, a copier a la main dans
# src/plush/assets/forme-<forme>.webp APRES avoir regarde l'apercu.
set -e
ICI=$(cd "$(dirname "$0")" && pwd)
T=${PELUCHE_TRAVAIL:-/tmp/peluche/gris}
PY="${PELUCHE_PY:-/tmp/peluche/venv/bin/python} -I"
F=$1; U=$2
# un dossier neuf par telechargement : c'est un fichier venu d'ailleurs
D=$T/dl/$F; S=$T/sortie/$F
mkdir -p $D $S
curl -sS -o $D/gen.png "$U"
cd /tmp
$PY $ICI/forme.py $T/entrees/formes.json $F $D/gen.png $S $3
$PY -c "
import sys
from PIL import Image
d, s, f, t = sys.argv[1:]
g = Image.open(d + '/gen.png').convert('RGB'); g.thumbnail((520, 520))
a = Image.open(s + '/' + f + '.webp').convert('RGBA')
bg = Image.new('RGBA', (768, 768), (40, 60, 90, 255)); bg.alpha_composite(a)
c = Image.new('RGB', (g.width + 400, max(g.height, 384)), (0, 0, 0))
c.paste(g, (0, 0)); c.paste(bg.convert('RGB').resize((384, 384)), (g.width + 8, 0))
c.save(t + '/' + f + '-check.png')
" $D $S $F $T
