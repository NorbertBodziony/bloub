"""Patins en relief : dome de feutre eclaire du haut-gauche, ombre portee bas-droite.

usage : relief.py <dossier-orig> <dossier-sortie> <nom> [cle=valeur ...]
Le patin vit dans le repere LOCAL de son oeil (le composant le pose avec la matrice de
l'oeil, inclinaison comprise). La lumiere, elle, est fixe a l'ecran : on passe donc le
masque du patin a l'ecran (jacobien = matrice de l'oeil x pixels du sprite), on y calcule
dome, eclairage et ombre, puis on revient au repere du sprite.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, dst, nom = sys.argv[1:4]
R = dict(ech=1.2, flou=0.12, haut=0.75, amb=0.62, dif=0.5, spec=0.06, ombre=0.5, odx=0.22, ody=0.42, osig=0.38,
         ao=0.25, grain=0.5, clair=0.88, lx=-0.55, ly=-0.75, lz=0.95)
for a in sys.argv[4:]:
    k, v = a.split('='); R[k] = float(v)
bots = {b['nom'].lower(): b for b in json.load(open(os.path.join(os.environ.get('PELUCHE_TRAVAIL', '/tmp/peluche'), 'bots.json')))}
meta = json.load(open(f'{src}/{nom}.json'))
L = np.array([R['lx'], R['ly'], R['lz']]); L /= np.linalg.norm(L)


def vers_rc(M):
    """matrice (x,y) -> matrice (ligne,colonne) pour ndimage"""
    return M[::-1, ::-1]


for io, p in enumerate(meta['patins']):
    im = np.asarray(Image.open(f"{src}/{p['fichier']}").convert('RGBA')).astype(float) / 255
    H, W = im.shape[:2]
    rgb, al = im[..., :3], im[..., 3]
    lum = rgb.mean(2)
    m = ndimage.binary_opening((al > 0.7) & (lum > 0.35), iterations=2)
    lab, n = ndimage.label(m)
    if n > 1:
        m = lab == (1 + int(np.argmax(ndimage.sum(m, lab, range(1, n + 1)))))
    a_, b_, c_, d_ = bots[nom]['yeux'][io]['m'][:4]
    J = np.array([[a_, c_], [b_, d_]]) @ np.diag([p['w'] / W, p['h'] / H])  # px sprite -> ecran
    J /= np.sqrt(abs(np.linalg.det(J)))  # meme surface : 1 px ecran ~ 1 px sprite
    # marge du sprite de sortie, pour l'ombre et le grossissement
    ys, xs = np.nonzero(m)
    ep_px = 2 * ndimage.distance_transform_edt(m).max()
    marge = int(1.3 * ep_px)
    Hs, Ws = H + 2 * marge, W + 2 * marge
    mp = np.pad(m.astype(float), marge)
    rgbp = np.pad(rgb, ((marge, marge), (marge, marge), (0, 0)), mode='edge')
    # boite ecran
    coins = np.array([[0, 0], [Ws, 0], [0, Hs], [Ws, Hs]], float) @ J.T
    o0 = coins.min(0); taille = np.ceil(coins.max(0) - o0).astype(int)
    Ji = np.linalg.inv(J)
    # ecran -> sprite : x_s = Ji @ (x_e + o0)
    me = ndimage.affine_transform(mp, vers_rc(Ji), offset=(Ji @ o0)[::-1], output_shape=tuple(taille[::-1]), order=1)
    me = me > 0.5
    d = ndimage.distance_transform_edt(me)
    r = d.max()
    t = np.clip(d / r, 0, 1)
    h = R['haut'] * r * np.sqrt(1 - (1 - t) ** 2)
    h = ndimage.gaussian_filter(h, 0.08 * r)
    gy, gx = np.gradient(h)
    nrm = np.dstack([-gx, -gy, np.ones_like(h)]); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    nl = np.clip(nrm @ L, 0, 1)
    plat = L[2]
    ombrage = (R['amb'] + R['dif'] * nl) / (R['amb'] + R['dif'] * plat)
    Hh = (L + np.array([0, 0, 1])); Hh /= np.linalg.norm(Hh)
    brille = R['spec'] * np.clip(nrm @ Hh, 0, 1) ** 12
    # alpha doux du patin, ombre portee decalee bas-droite, occlusion autour
    ap = ndimage.gaussian_filter(me.astype(float), R['flou'] * r)
    ap = np.clip((ap - 0.5) * 1.3 + 0.5, 0, 1)
    om = ndimage.shift(me.astype(float), (R['ody'] * r, R['odx'] * r), order=1)
    om = ndimage.gaussian_filter(om, R['osig'] * r) * R['ombre'] + ndimage.gaussian_filter(me.astype(float), 0.25 * r) * R['ao']
    om = np.clip(om, 0, 1)
    # retour au repere du sprite : x_e = J @ x_s - o0
    def retour(x):
        return ndimage.affine_transform(x, vers_rc(J), offset=(-o0)[::-1], output_shape=(Hs, Ws), order=1)
    ombrage_s, brille_s, ap_s, om_s = [retour(x) for x in (ombrage, brille, ap, om)]
    # couleur : creme de l'interieur, grain fin du sprite d'origine
    inter = ndimage.binary_erosion(mp > 0.5, iterations=max(1, int(0.2 * ep_px)))
    creme = rgbp[inter].mean(0)
    creme = creme * (R['clair'] / creme.mean())  # creme plus blanc, meme teinte
    lp = rgbp.mean(2)
    grain = (lp - ndimage.gaussian_filter(lp, 0.12 * ep_px)) * inter
    c = creme[None, None, :] * ombrage_s[..., None] + grain[..., None] * R['grain'] + brille_s[..., None]
    alpha = ap_s + om_s * (1 - ap_s)
    col = c * (ap_s / np.maximum(alpha, 1e-4))[..., None]
    out = np.dstack([np.clip(col, 0, 1), np.clip(alpha, 0, 1)])
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(f"{dst}/{p['fichier']}", quality=90, method=6)
    p['w'] *= R['ech'] * Ws / W; p['h'] *= R['ech'] * Hs / H
json.dump(meta, open(f'{dst}/{nom}.json', 'w'), indent=1)
print(nom, 'ok', [(round(p['w'], 3), round(p['h'], 3)) for p in meta['patins']])
