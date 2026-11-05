"""La bibliotheque de feutre 0.7 : corps gris, patin generique et sprites d'yeux.

    python3 -I biblioteka.py <formes.json> <biblioteka-bloub> <dossier-sortie>

`<biblioteka-bloub>` est le dossier de la bibliotheque generee (`body/`, `oczy/`) : onze corps
de couleur sans yeux, un par forme du personnaliseur, et seize paires d'yeux de feutre blanc,
une par expression du catalogue. Des PNG au vrai alpha : pas de detourage sur fond sombre.

Ecrit dans `<dossier-sortie>` :

- `forme-<forme>.webp` : le corps recale boite a boite sur le contour du moteur, puis
  normalise comme ceux de `forme.py` (luminance seule, mediane de l'interieur a GRIS_CIBLE),
  que `tint.ts` teint. Sa couleur d'origine, la mediane de l'interieur, est ecrite dans
  `biblioteka.json` : c'est la couleur par defaut de la forme (`SHAPE_INKS`).
- `patin-x.webp`, `patin-y.webp` : le patin generique, couche et debout, au format de
  `slices.ts`. Le patin ROND est un oeil de `03-zdziwione` (deux cercles) ; la partie droite,
  `2 BARRE` petits cotes, est le feutre de la partie droite d'une gelule de `02-uwazne`, lu
  sur `BARRE` et reflete (symetrique, comme le veut `slices.ts`). Ses premieres rangees se
  fondent dans la rangee du milieu du patin rond (`COUTURE`) : bout et partie droite se
  rejoignent sans couture. Les deux images montrent le MEME patin rond.
- `oeil-<expression>-<i>.webp` : les yeux des expressions qu'une gelule ne fait pas (arcs,
  chevrons, coins, demi-ovales), un par oeil, le feutre centre dans l'image. Leurs
  proportions (`biblioteka.json`) vont dans `SPRITES` (`catalogue.ts`).

`barre` (0,5) est `BARRE` de `slices.ts` : les garder au meme pas.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compose import boite  # noqa: E402
from forme import masque, normalise, T  # noqa: E402

BARRE = 0.5
# le petit cote du patin generique, en px, et la marge autour (frange, lissage)
D = 240
MARGE = 0.15
# le fondu du bout dans la partie droite, en petits cotes (CHOISI, comme `couture` de `matiere.py`)
COUTURE = 0.3
# un oeil-sprite : son plus grand cote en px, et la marge autour, en fraction de ce cote
SPRITE = 320
SPRITE_MARGE = 0.12

CORPS = {
    'kwadrat': 'carre', 'kula': 'cercle', 'szesciokat': 'hexagone', 'kapsula': 'capsule',
    'chmurka': 'nuage', 'kamyk': 'galet', 'squircle': 'squircle', 'trojkat': 'triangle',
    'kropla': 'goutte', 'romb': 'losange', 'pieciokat': 'pentagone',
}
# les expressions qu'une gelule ne sait pas faire : arcs (heureux, fier), chevrons (hilare),
# coins (colere), demi-ovales (blase), traits en U (somnolent)
SPRITES = {
    '05-wesole': 'heureux', '06-smiejace': 'hilare', '07-zle': 'colere',
    '13-dumne': 'fier', '15-znudzone': 'blase', '16-senne': 'somnolent',
}


def rgba(chemin):
    return np.asarray(Image.open(chemin).convert('RGBA')).astype(np.float32)


def corps(formes, source, sortie):
    """Les onze corps gris, et la couleur d'origine de chacun."""
    encres = {}
    for nom in sorted(os.listdir(source)):
        forme = CORPS[nom.split('-')[1]]
        a = rgba(os.path.join(source, nom))
        x0, y0, x1, y1 = boite(a[..., 3] / 255)
        marge = 60
        im = Image.fromarray(a.astype(np.uint8), 'RGBA').crop((x0 - marge, y0 - marge, x1 + marge, y1 + marge))
        bn = boite(masque(formes[forme]['contour'], T))
        sx, sy = (bn[2] - bn[0]) / (x1 - x0), (bn[3] - bn[1]) / (y1 - y0)
        out = im.transform((T, T), Image.AFFINE, (1 / sx, 0, marge - bn[0] / sx, 0, 1 / sy, marge - bn[1] / sy), resample=Image.BICUBIC)
        normalise(out).save(os.path.join(sortie, f'forme-{forme}.webp'), quality=90, method=6)
        plein = a[..., 3] > 250
        encres[forme] = '#' + ''.join(f'{round(float(np.median(a[..., k][plein]))):02x}' for k in range(3))
        print(forme, 'echelle', round(sx, 3), round(sy, 3), 'anisotropie', round(sx / sy, 3), encres[forme])
    return encres


def yeux(chemin):
    """Les deux yeux d'une paire, de gauche a droite : (image RGBA, boite du feutre)."""
    a = rgba(chemin)
    lab, n = ndimage.label(a[..., 3] > 128)
    tailles = ndimage.sum(np.ones(lab.shape), lab, range(1, n + 1))
    deux = sorted(np.argsort(tailles)[-2:] + 1, key=lambda k: np.nonzero(lab == k)[1].mean())
    out = []
    for k in deux:
        # l'oeil et son halo de fibres, sans l'autre oeil
        zone = ndimage.binary_dilation(lab == k, iterations=12)
        b = a.copy()
        b[~zone, 3] = 0
        out.append((b, boite(lab == k)))
    return out


def recadre(a, bt, cote, marge):
    """Le feutre de boite `bt` centre dans une image, son plus grand cote a `cote` px."""
    x0, y0, x1, y1 = bt
    m = marge * max(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = (x1 - x0) / 2 + m, (y1 - y0) / 2 + m
    im = Image.fromarray(a.astype(np.uint8), 'RGBA').crop((round(cx - w), round(cy - h), round(cx + w), round(cy + h)))
    k = cote / max(x1 - x0, y1 - y0)
    return im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)


def lisse01(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def patin(oczy, sortie):
    """Le patin generique, couche et debout (cf. `slices.ts`)."""
    m = round(MARGE * D)
    N = D + 2 * m
    # le patin rond : un cercle, son diametre a D, centre dans N x N
    a, (x0, y0, x1, y1) = yeux(os.path.join(oczy, '03-zdziwione.png'))[0]
    k = D / ((x1 - x0 + y1 - y0) / 2)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rond = Image.fromarray(a.astype(np.uint8), 'RGBA').transform(
        (N, N), Image.AFFINE, (1 / k, 0, cx - N / 2 / k, 0, 1 / k, cy - N / 2 / k), resample=Image.BICUBIC)
    rond = np.asarray(rond).astype(np.float32)
    # la partie droite : une gelule debout, sa largeur a D, lue sous son bout du haut
    b, (x0, y0, x1, y1) = yeux(os.path.join(oczy, '02-uwazne.png'))[0]
    k = D / (x1 - x0)
    cx = (x0 + x1) / 2
    L = round(BARRE * D)
    debut = y0 + 0.6 * (x1 - x0)  # passe le bout arrondi
    assert debut + L / k < y1 - 0.6 * (x1 - x0), 'la gelule de 02-uwazne est trop courte'
    droite = Image.fromarray(b.astype(np.uint8), 'RGBA').transform(
        (N, L), Image.AFFINE, (1 / k, 0, cx - N / 2 / k, 0, 1 / k, debut), resample=Image.BICUBIC)
    droite = np.asarray(droite).astype(np.float32)

    def allonge(demi, troncon):
        """
        Le troncon (L rangees de N), rendu symetrique. `demi` est la moitie du patin rond qui le
        precede, rangees vers le troncon. Pres de la jointure, le grain est celui de `demi`
        REFLETE (une rangee repetee faisait des raies), et l'alpha celui de sa derniere rangee :
        les cotes droits de la gelule. Le grain du troncon prend le relais sur `COUTURE`.
        """
        r = np.arange(L, dtype=np.float32)[:, None]
        f = 1 - lisse01(r / (COUTURE * D))
        reflet = demi[::-1][:L]
        g = (f * reflet[..., 3] / 255)[..., None]
        # au bord, ou le troncon est transparent, sa couleur n'est rien : celle du milieu du patin rond
        a = troncon[..., 3:] / 255
        base = troncon[..., :3] * a + demi[-1, :, :3][None] * (1 - a)
        rgb = base * (1 - g) + reflet[..., :3] * g
        al = troncon[..., 3] * (1 - f) + demi[-1, :, 3][None] * f
        t = np.concatenate([rgb, al[..., None]], -1)
        return np.concatenate([t, t[::-1]], 0)

    # debout : le haut du patin rond, la partie droite, le bas
    y = np.concatenate([rond[: N // 2], allonge(rond[: N // 2], droite), rond[N // 2:]], 0)
    # couche : la meme partie droite tournee d'un quart de tour (son profil en travers devient
    # vertical), apres la moitie gauche du patin rond
    gauche = np.transpose(rond[:, : N // 2], (1, 0, 2))
    x_mid = np.transpose(allonge(gauche, droite), (1, 0, 2))
    x = np.concatenate([rond[:, : N // 2], x_mid, rond[:, N // 2:]], 1)
    for nom, img in (('patin-x', x), ('patin-y', y)):
        Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8), 'RGBA').save(
            os.path.join(sortie, f'{nom}.webp'), quality=90, method=6)
    print('patin', N, D, 'k', N / D)
    return {'kw': N / D, 'kh': N / D}


def sprites(oczy, sortie):
    out = {}
    for nom, expr in SPRITES.items():
        paire = []
        for i, (a, bt) in enumerate(yeux(os.path.join(oczy, f'{nom}.png'))):
            im = recadre(a, bt, SPRITE, SPRITE_MARGE)
            im.save(os.path.join(sortie, f'oeil-{expr}-{i}.webp'), quality=90, method=6)
            fw, fh = bt[2] - bt[0], bt[3] - bt[1]
            # le feutre en fraction de l'image, et son rapport hauteur / largeur
            paire.append({'w': fw / max(fw, fh) * SPRITE / im.width, 'h': fh / max(fw, fh) * SPRITE / im.height, 'aspect': fh / fw})
        out[expr] = paire
        print(expr, [{k: round(v, 4) for k, v in p.items()} for p in paire])
    return out


def main():
    fjson, bib, sortie = sys.argv[1:4]
    os.makedirs(sortie, exist_ok=True)
    formes = {f['nom']: f for f in json.load(open(fjson))}
    info = {
        'encres': corps(formes, os.path.join(bib, 'body'), sortie),
        'patin': patin(os.path.join(bib, 'oczy'), sortie),
        'sprites': sprites(os.path.join(bib, 'oczy'), sortie),
    }
    json.dump(info, open(os.path.join(sortie, 'biblioteka.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
