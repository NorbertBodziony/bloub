"""Chemins partages par les scripts de `tools/peluche/`.

Rien de ce que les scripts lisent ou ecrivent n'est dans le depot, sauf les sprites
finaux : le travail vit dans PELUCHE_TRAVAIL (defaut /tmp/peluche), la capture de
reference de l'app dans PELUCHE_REF (defaut $PELUCHE_TRAVAIL/reference.png).
"""
import os

ICI = os.path.dirname(os.path.abspath(__file__))
TRAVAIL = os.environ.get('PELUCHE_TRAVAIL', '/tmp/peluche')
REF_PNG = os.environ.get('PELUCHE_REF', os.path.join(TRAVAIL, 'reference.png'))
BOTS_JSON = os.path.join(TRAVAIL, 'bots.json')
