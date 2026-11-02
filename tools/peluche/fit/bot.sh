#!/bin/sh
# bot.sh <Nom> <generation.png> : etalonnage, yeux, export des sprites
#   PELUCHE_TRAVAIL  dossier de travail (defaut /tmp/peluche), contient bots.json
#   PELUCHE_PY       interpreteur avec numpy/scipy/pillow (defaut $PELUCHE_TRAVAIL/venv/bin/python)
#   O, S             sorties : compositions, sprites
set -e
ICI=$(cd "$(dirname "$0")" && pwd)
T=${PELUCHE_TRAVAIL:-/tmp/peluche}
N=$1; G=$(cd "$(dirname "$2")" && pwd)/$(basename "$2"); n=$(echo $N | tr A-Z a-z)
O=${O:-$T/hf/out}; S=${S:-$T/hf/sprites}; mkdir -p $O $S
PY="${PELUCHE_PY:-$T/venv/bin/python} -I"
# -I : les generations sont des fichiers telecharges, on ne lance rien depuis leur dossier
cd /tmp
[ -f $O/$n-1.json ] || $PY $ICI/compose2.py $N $G - $O/$n-1.png --ajuste | tail -1
$PY $ICI/ajuste-yeux.py $N $G $O/$n-1.json $O/$n-2.png | tail -2
$PY $ICI/compose2.py $N $G $O/$n-2.json $O/$n.png --exporte $S | tail -1
