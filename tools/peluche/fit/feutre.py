"""La matiere des patins : le feutre de la generation approuvee (`tools/peluche/feutre/`).

Deux decoupes d'une meme image Higgsfield (GPT Image 2.5 Sunburst), celle que l'utilisateur
a donnee en modele : `gelule.png`, une gelule de feutre blanc sur fond noir, et `carre.png`,
l'interieur d'un carre de feutre orange. Rien n'est genere ici, tout est releve sur elles.

Ce que le patin en recoit, sans rien perdre de sa forme, de sa couleur ni de son ombre :
- son BORD, celui de la gelule : la couverture (une frange de fibres) et le grain, lus le long
  du contour de la gelule, a la meme distance du bord et au meme pas le long du bord. Un
  point du patin a `d` unites du bord, a l'abscisse `s` le long de son contour, prend ce qui
  est a `d` du bord de la gelule, a l'abscisse correspondante. Le contour est parcouru en
  aller-retour sur une moitie de son perimetre : le raccord ou il se referme est continu ;
- son PROFIL de clarte, celui de la gelule selon la distance au bord : un liseré a peine plus
  clair sous la frange, un coeur a peine plus sombre. C'est ce qui fait le feutre mat, la ou
  le dome de `relief.py` faisait une perle ;
- son GRAIN au coeur, celui du carre (la gelule est trop petite pour un gros patin), ramene au
  contraste du blanc : le feutre orange a les memes fibres, plus contrastees par sa couleur.
  Entre `bord0` et `bord1` px de la reference du bord, le grain du bord passe a celui du coeur.

Le dome approuve n'est pas jete : sa lumiere (en haut a gauche, comme le corps) est gardee a
`mat` de son contraste. Le patin est mesure en unites du viewBox, `ech` pixels de la reference
par unite ; toutes les profondeurs (`bord0`, `bord1`, `dehors`) sont en px de la reference.
`matiere.py` choisit `ech` pour que la gelule de reference (205 px de large) vaille le petit cote
du patin : chaque patin a la frange de la reference, en proportion.

`champ` fait la lecture (ou, sur la reference, chaque pixel prend son feutre), `feutre` le rendu :
entre les deux, `matiere.py` allonge le champ du patin rond, pour que ses deux gelules aient
exactement le meme patin rond.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ICI = os.path.dirname(os.path.abspath(__file__))
FEUTRE = os.path.join(ICI, '..', 'feutre')
# le fond noir de la generation, et le grain mesure a cette echelle (px de la reference)
FOND = 0.0745
GRAIN = 12
# CHOISI, juges sur Nexo, Fred et Cloe a 4x et a 360 px a cote de la generation ; profondeurs en px de la reference
D = dict(ech=10.0, mat=0.5, bord0=30.0, bord1=50.0, dehors=30.0)


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def contour(coeur, sy, sx):
    """le contour d'une forme convexe : un polygone par angle, et son abscisse curviligne"""
    b = coeur & ~ndimage.binary_erosion(coeur)
    yy, xx = np.nonzero(b)
    Y, X = yy * sy, xx * sx
    cy, cx = Y.mean(), X.mean()
    th = np.arctan2(Y - cy, X - cx)
    nb = 1440
    k = ((th + np.pi) / (2 * np.pi) * nb).astype(int) % nb
    r = np.zeros(nb)
    np.maximum.at(r, k, np.hypot(Y - cy, X - cx))
    plein = np.nonzero(r)[0]
    r = np.interp(np.arange(nb), plein, r[plein], period=nb)
    r = ndimage.uniform_filter1d(r, 5, mode='wrap')
    a = (np.arange(nb) + 0.5) / nb * 2 * np.pi - np.pi
    py, px = cy + r * np.sin(a), cx + r * np.cos(a)
    seg = np.hypot(np.diff(np.r_[py, py[0]]), np.diff(np.r_[px, px[0]]))
    return dict(b=b, cy=cy, cx=cx, a=a, s=np.r_[0, np.cumsum(seg)[:-1]], L=seg.sum(), py=py, px=px)


class Reference:
    def __init__(self):
        L = np.asarray(Image.open(os.path.join(FEUTRE, 'gelule.png')).convert('RGB')).astype(float).mean(2) / 255
        coeur = ndimage.gaussian_filter(L, 3) > 0.45
        lab, _ = ndimage.label(coeur)
        coeur = ndimage.binary_fill_holes(lab == np.argmax(np.bincount(lab.ravel())[1:]) + 1)
        sd = np.where(coeur, ndimage.distance_transform_edt(coeur), -ndimage.distance_transform_edt(~coeur))
        # la couverture : la clarte au-dessus du fond, rapportee a celle du feutre le plus proche
        plein = sd >= 6
        iy, ix = ndimage.distance_transform_edt(~plein, return_distances=False, return_indices=True)
        local = ndimage.gaussian_filter(L, 4)[iy, ix]
        al = np.where(plein, 1, np.clip((L - FOND) / (local - FOND), 0, 1))
        col = (L - FOND * (1 - al)) / np.maximum(al, 1e-3)
        # le profil : la clarte mediane a chaque distance du bord, le plus clair a 1
        dmax = int(sd.max())
        prof = np.full(dmax + 1, np.nan)
        for d in range(dmax + 1):
            m = (np.abs(sd - d) < 1) & (al > 0.5)
            if m.any():
                prof[d] = np.median(col[m])
        ok = ~np.isnan(prof)
        prof = ndimage.uniform_filter1d(np.interp(np.arange(dmax + 1), np.nonzero(ok)[0], prof[ok]), 7, mode='nearest')
        self.prof = prof / prof.max()
        # le grain seul : la clarte sur sa moyenne locale DANS le feutre (convolution normalisee),
        # sans quoi la lumiere de la generation (venue de la gauche) serait transportee avec lui
        m = (al > 0.5).astype(float)
        moy = ndimage.gaussian_filter(col * m, GRAIN) / np.maximum(ndimage.gaussian_filter(m, GRAIN), 1e-3)
        self.alpha = al
        self.grain = np.where(al > 0.02, col / np.maximum(moy, 1e-3), 1)
        c = contour(coeur, 1, 1)
        gy, gx = np.gradient(ndimage.gaussian_filter(sd, 4))
        ny = ndimage.map_coordinates(gy, [c['py'], c['px']], order=1)
        nx = ndimage.map_coordinates(gx, [c['py'], c['px']], order=1)
        n = np.hypot(ny, nx)
        self.ny, self.nx, self.c = ny / n, nx / n, c
        # le coeur : le grain du carre, au contraste de celui de la gelule
        Lo = np.asarray(Image.open(os.path.join(FEUTRE, 'carre.png')).convert('RGB')).astype(float).mean(2) / 255
        To = Lo / ndimage.gaussian_filter(Lo, GRAIN)
        self.tuile = 1 + (To - 1) * self.grain[sd > 30].std() / To.std()

    def profil(self, d):
        return np.interp(np.clip(d, 0, len(self.prof) - 1), np.arange(len(self.prof)), self.prof)

    def bord(self, s, d):
        """couverture et grain a `d` px du bord (positif dedans), a l'abscisse `s` du contour"""
        c = self.c
        lit = lambda v: np.interp(s, c['s'], v, period=c['L'])
        Y, X = lit(c['py']) + d * lit(self.ny), lit(c['px']) + d * lit(self.nx)
        return (ndimage.map_coordinates(self.alpha, [Y, X], order=1, mode='nearest'),
                ndimage.map_coordinates(self.grain, [Y, X], order=1, mode='nearest'))

    def interieur(self, Y, X):
        t = self.tuile
        H, W = t.shape
        miroir = lambda v, n: np.where(np.mod(v, 2 * (n - 1)) > n - 1, 2 * (n - 1) - np.mod(v, 2 * (n - 1)), np.mod(v, 2 * (n - 1)))
        return ndimage.map_coordinates(t, [miroir(Y + H / 2, H), miroir(X + W / 2, W)], order=1)


def champ(ref, ap, ux, uy, decalage=0.0, **k):
    """ce que le feutre lit en chaque pixel du patin `ap` : sa distance signee au bord `sd`
    (unites), son abscisse `s` sur le contour de la reference et sa place `Y`, `X` dans la tuile
    du coeur (px de la reference). `ux`, `uy` : px du sprite par unite ; `decalage` : ou
    commencer sur le contour (px de la reference)."""
    p = {**D, **k}
    H, W = ap.shape
    coeur = ap > 0.5
    sy, sx = 1 / uy, 1 / ux
    sd = np.where(coeur, ndimage.distance_transform_edt(coeur, sampling=(sy, sx)),
                  -ndimage.distance_transform_edt(~coeur, sampling=(sy, sx)))
    ct = contour(coeur, sy, sx)
    _, (iy, ix) = ndimage.distance_transform_edt(~ct['b'], sampling=(sy, sx), return_indices=True)
    s = np.interp(np.arctan2(iy * sy - ct['cy'], ix * sx - ct['cx']), ct['a'], ct['s'], period=2 * np.pi)
    # aller-retour : continu la ou le contour se referme
    s = np.where(s < ct['L'] / 2, s, ct['L'] - s) * p['ech'] + decalage
    yy, xx = np.mgrid[0:H, 0:W]
    # le grain du coeur, centre sur le patin : le miroir de la tuile tombe hors de lui
    return dict(sd=sd, s=s, Y=(yy * sy - ct['cy']) * p['ech'], X=(xx * sx - ct['cx']) * p['ech'])


def feutre(ref, ch, om, c, moy, **k):
    """le patin en feutre, en RGBA, d'apres son `champ` `ch` (eventuellement allonge) : `om` son
    ombre portee, `c` sa couleur, `moy` la couleur moyenne autour de laquelle sa lumiere est
    ramenee a `mat`"""
    p = {**D, **k}
    sd = ch['sd']
    H, W = sd.shape
    # les profondeurs sont celles de la reference (px), ramenees aux unites du patin
    b0, b1 = p['bord0'] / p['ech'], p['bord1'] / p['ech']
    a_b, g_b = ref.bord(ch['s'].ravel(), np.clip(sd.ravel() * p['ech'], -p['dehors'], p['bord1'] + p['ech']))
    a_b, g_b = a_b.reshape(H, W), g_b.reshape(H, W)
    g_i = ref.interieur(ch['Y'], ch['X'])
    w = smooth((sd - b0) / (b1 - b0))
    al = np.where(sd > b1, 1, a_b)
    grain = g_b * (1 - w) + g_i * w
    col = np.clip((moy + (c - moy) * p['mat']) * (grain * ref.profil(sd * p['ech']))[..., None], 0, 1)
    alpha = al + om * (1 - al)
    col = col * (al / np.maximum(alpha, 1e-4))[..., None]
    return np.dstack([np.clip(col, 0, 1), np.clip(alpha, 0, 1)])
