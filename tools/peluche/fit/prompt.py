"""Prompt Higgsfield d'un corps gris : image 1 = l'entree de `formes.ts`, image 2 = un corps approuve (le style).

    python3 -I prompt.py <forme>

Le meme texte pour toutes les formes, seul le nom change : c'est ce qui garde la matiere,
la lumiere et le gris d'une generation a l'autre. Voir le README pour le reste du protocole.
"""
import sys

NOMS = {
    'cercle': 'circle',
    'galet': 'pebble-shaped blob',
    'squircle': 'rounded square',
    'capsule': 'horizontal capsule',
    'triangle': 'rounded triangle',
    'hexagone': 'rounded hexagon',
    'nuage': 'cloud shape',
    'goutte': 'teardrop',
    'carre': 'rounded square',
    'losange': 'rounded diamond',
    'pentagone': 'rounded pentagon',
}

n = NOMS[sys.argv[1]]
print(
    "Turn the flat shapes in image 1 into soft felt plush objects, in exactly the same material and lighting as the plush in image 2. "
    f"LEFT: the grey {n} becomes a soft fluffy neutral mid-grey plush cushion: dense soft wool fur with fine fibres running mostly downward, a thin fuzzy halo of loose fibres all around the edge, soft pillowy rounded volume. "
    "Pure neutral grey, NO colour tint at all, mid grey like #8c8c8c. It has NO eyes, NO face, NO features, nothing on its surface: a completely blank cushion. "
    "RIGHT: the small grey circle becomes a small round neutral mid-grey felt ball, same wool and fuzz, separate object, not touching the cushion. "
    "Keep the EXACT silhouettes, sizes and positions of all shapes in image 1. Perfectly front-facing, no tilt, no perspective, no rotation. "
    "Same soft studio light from the top left on everything (lighter top-left edges, darker bottom). "
    "Plain flat background, solid #141414, no vignette, no floor, no cast shadows, no text. Same 3:2 frame as image 1."
)
