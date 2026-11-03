"""Lisiere : les fibres du bord prennent la couleur de la fourrure voisine.

    python3 -I lisiere.py <dossier-source> <dossier-sortie>

Les generations sont detourees sur un fond sombre uni (`detoure`, `compose.py`). Les
fibres que la generation a dessinees sombres au bord restent donc sombres et presque
opaques : invisibles sur un fond sombre, elles font un contour sale sur un fond clair.
Ce script eclaircit cette lisiere vers la couleur de la fourrure la plus proche, sans
toucher a l'alpha : la silhouette et le halo de fibres sont les memes.

Il traite les corps des personnages (`*-corps.webp`), les corps gris (`forme-*.webp`) et
la boule (`boule.webp`). Pas les patins : leur ombre portee sombre est voulue.

La source est celle de 0.6.3 (`git show v0.6.3:src/plush/assets/<f>`), **jamais sa propre
sortie** : une seconde passe eclaircirait encore la lisiere.
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

# CHOISIS, juges a l'oeil sur fond clair (#f5f5f6) et sombre (#1a1a1a), de 240 a 480 px.
# La lisiere, en fraction du cote de l'image : au-dela, la fourrure ne change pas.
BANDE = 0.02
# La part de la couleur voisine dans la lisiere, au bord meme.
FORCE = 0.85
# La part du relief propre de chaque fibre gardee (sa luminance relative a la voisine).
RELIEF = 0.35
# La couleur voisine est lissee sur ce rayon (fraction du cote) : le grain du coeur n'y passe pas.
LISSE = 0.008

LUM = np.array([0.2126, 0.7152, 0.0722], np.float32)


def lisiere(a):
    """a : RGBA flottant 0..255. Rend le meme tableau, la lisiere eclaircie."""
    rgb, al = a[..., :3], a[..., 3] / 255
    cote = max(al.shape)
    bande = BANDE * cote
    corps = al > 0.5
    profondeur = ndimage.distance_transform_edt(corps)
    coeur = profondeur >= bande
    # la couleur du coeur la plus proche, lissee : elle garde la lumiere haut-gauche
    lisse = ndimage.gaussian_filter(rgb * coeur[..., None], (LISSE * cote, LISSE * cote, 0))
    poids = ndimage.gaussian_filter(coeur.astype(np.float32), LISSE * cote)
    lisse = lisse / np.maximum(poids, 1e-6)[..., None]
    _, (iy, ix) = ndimage.distance_transform_edt(~coeur, return_indices=True)
    voisine = lisse[iy, ix]
    # le relief de la fibre, compresse : une fibre plus sombre reste un peu plus sombre
    relatif = (rgb @ LUM) / np.maximum(voisine @ LUM, 1)
    eclaircie = voisine * np.clip(1 - RELIEF + RELIEF * relatif, 0.5, 1.15)[..., None]
    x = np.clip(profondeur / bande, 0, 1)
    t = (1 - x * x * (3 - 2 * x)) * FORCE
    out = rgb * (1 - t[..., None]) + eclaircie * t[..., None]
    return np.concatenate([out, a[..., 3:]], -1)


def main(source, sortie):
    os.makedirs(sortie, exist_ok=True)
    noms = sorted(f for f in os.listdir(source)
                  if f.endswith('-corps.webp') or f.startswith('forme-') or f == 'boule.webp')
    for nom in noms:
        a = np.asarray(Image.open(os.path.join(source, nom)).convert('RGBA')).astype(np.float32)
        out = lisiere(a).clip(0, 255).round().astype(np.uint8)
        image = Image.fromarray(out, 'RGBA')
        # les memes reglages que l'export de chaque famille (`compose2.py`, `forme.py`)
        if nom.endswith('-corps.webp'):
            image.save(os.path.join(sortie, nom), quality=92)
        else:
            image.save(os.path.join(sortie, nom), quality=90, method=6)
        print(nom)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
