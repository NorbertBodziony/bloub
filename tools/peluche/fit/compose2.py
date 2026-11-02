"""Compose n'importe quel bot depuis une generation Higgsfield (corps a gauche, patins a droite).

    python3 compose2.py <Nom> <generation.png> <params.json|-> <sortie.png> [--ajuste]

Corps recale boite a boite sur le contour du moteur (bots.json), patins places par
l'inverse des matrices d'yeux du moteur ; chaque oeil prend le patin dont l'allongement
est le plus proche du sien (Vita et Malu ont deux yeux differents). --ajuste cherche
l'etalonnage du corps (gains, gamma, degrades) contre la capture, grille 10x10 x 3 quantiles.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from commun import ICI, REF_PNG, BOTS_JSON  # noqa: E402
from compose import detoure, boite, gradue, DEMI  # noqa: E402

REF = Image.open(REF_PNG).convert('RGB')
ZONES = {'nexo': (60, 410, 215, 565), 'vita': (30, 815, 165, 965), 'cloe': (30, 1095, 165, 1240),
         'malu': (30, 1280, 165, 1430), 'yoshi': (40, 1490, 150, 1590), 'fred': (40, 1665, 150, 1785)}
BG = np.array([20, 20, 20])
W, N = 200, 10
BOTS = {b['nom']: b for b in json.load(open(BOTS_JSON))}


def masque(bot, T):
    c = np.array(bot['contour'], float)
    c = np.stack([ndimage.gaussian_filter1d(c[:, i], 2, mode='wrap') for i in range(2)], 1)
    ss = 4
    im = Image.new('L', (T * ss, T * ss), 0)
    ImageDraw.Draw(im).polygon([tuple((p + DEMI) * T / (2 * DEMI) * ss) for p in c], fill=255)
    return np.asarray(im.resize((T, T), Image.LANCZOS)) / 255


def decoupe(src):
    """Corps (blob le plus a gauche parmi les grands) et patins (les autres grands blobs)."""
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    rgba = detoure(a)
    al = rgba[..., 3] / 255
    lab, n = ndimage.label(al > 0.5)
    tailles = ndimage.sum(np.ones_like(al), lab, range(1, n + 1))
    grands = [k + 1 for k in np.argsort(tailles)[::-1] if tailles[k] > 0.004 * al.size][:4]
    cx = {k: np.nonzero(lab == k)[1].mean() for k in grands}
    k_corps = max(grands, key=lambda k: tailles[k - 1] * (cx[k] < a.shape[1] * 0.55))
    def sprite(k, marge):
        z = ndimage.binary_dilation(lab == k, iterations=60)
        s = rgba.copy(); s[~z, 3] = 0
        x0, y0, x1, y1 = boite(lab == k)
        im = Image.fromarray(s.clip(0, 255).astype(np.uint8), 'RGBA')
        return im.crop((x0 - marge, y0 - marge, x1 + marge, y1 + marge)), (x1 - x0, y1 - y0)
    corps = sprite(k_corps, 60)
    patins = [sprite(k, 40) for k in grands if k != k_corps]
    return corps, patins


def exporte(nom, gen, P, dossier, T=768):
    """Sprites pour le composant : corps seul (sans yeux) sur [-DEMI, DEMI], un patin par oeil.

    Le corps garde la boite du contour du moteur a l'instant exporte (`boite`, en unites
    de rayon) : le composant la recale sur la boite du contour courant (respiration).
    Chaque patin est dans le repere LOCAL de son oeil (unites de rayon), centre en 0 :
    le composant le pose avec la matrice de l'oeil, comme la gelule du masque.
    L'ombre portee du patin est cuite dans son sprite (noir translucide = multiplication).
    """
    import os
    bot = BOTS[nom]
    (corps, (cw, ch)), patins = gen
    M = masque(bot, T)
    bn = boite(M)
    sx, sy = (bn[2] - bn[0]) / cw, (bn[3] - bn[1]) / ch
    out = corps.transform((T, T), Image.AFFINE, (1 / sx, 0, 60 - bn[0] / sx, 0, 1 / sy, 60 - bn[1] / sy), resample=Image.BICUBIC)
    out = gradue(out, P, bn)
    base = nom.lower()
    out.save(os.path.join(dossier, f'{base}-corps.webp'), quality=92)
    c = np.array(bot['contour'])
    k = T / (2 * DEMI)
    largeur = bn[2] - bn[0]
    meta = {'boite': [c[:, 0].min(), c[:, 1].min(), c[:, 0].max(), c[:, 1].max()], 'patins': []}
    for io, oeil in enumerate(bot['yeux']):
        w, hh = oeil['w'], oeil['h']
        pc, (pw, ph) = min(patins, key=lambda p: abs(np.log((p[1][0] / p[1][1]) / (w / hh))))
        ech = P.get('oeil_ech', [[1, 1], [1, 1]])[io]
        ux, uy = pw / (w * P['oeil_marge'] * ech[0]), ph / (hh * P['oeil_marge'] * ech[1])  # px source / unite locale
        a = np.asarray(pc).astype(np.float32) / 255
        if P.get('oeil_ombre', 0):
            # memes ombre et decalage que compose(), passes des px de sortie aux px source
            px_u = k  # px de sortie par unite de rayon
            dec = int(round(0.025 * largeur / px_u * uy))
            sh = ndimage.gaussian_filter(np.roll(a[..., 3], dec, 0), 0.02 * largeur / px_u * uy) * P['oeil_ombre']
            al = a[..., 3] + sh * (1 - a[..., 3])
            rgb = a[..., :3] * (a[..., 3] / np.maximum(al, 1e-6))[..., None]
            a = np.concatenate([rgb, al[..., None]], -1)
        nom_p = f'{base}-oeil{io}.webp'
        Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'RGBA').save(os.path.join(dossier, nom_p), quality=92)
        d = P.get('oeil_d', [[0, 0], [0, 0]])[io]
        meta['patins'].append({'fichier': nom_p, 'w': pc.width / ux, 'h': pc.height / uy, 'dx': d[0], 'dy': d[1]})
    json.dump(meta, open(os.path.join(dossier, f'{base}.json'), 'w'), indent=1)
    return meta


def compose(nom, gen, P, T=1024):
    bot = BOTS[nom]
    (corps, (cw, ch)), patins = gen
    M = masque(bot, T)
    bn = boite(M)
    # boite a boite (alpha > 0.5), le halo de fibres deborde avec la meme echelle
    sx, sy = (bn[2] - bn[0]) / cw, (bn[3] - bn[1]) / ch
    aff = (1 / sx, 0, 60 - bn[0] / sx, 0, 1 / sy, 60 - bn[1] / sy)
    out = corps.transform((T, T), Image.AFFINE, aff, resample=Image.BICUBIC)
    out = gradue(out, P, bn)
    k = T / (2 * DEMI)
    largeur = bn[2] - bn[0]
    for io, oeil in enumerate(bot['yeux']):
        a_, b_, c_, d_, e, f = oeil['m']
        dxy = P.get('oeil_d', [[0, 0], [0, 0]])[io]
        e, f = e + dxy[0], f + dxy[1]
        w, hh = oeil['w'], oeil['h']
        pc, (pw, ph) = min(patins, key=lambda p: abs(np.log((p[1][0] / p[1][1]) / (w / hh))))
        Mi = np.linalg.inv(np.array([[a_, c_], [b_, d_]]))
        ech = P.get('oeil_ech', [[1, 1], [1, 1]])[io]
        s = np.diag([pw / (w * P['oeil_marge'] * ech[0]), ph / (hh * P['oeil_marge'] * ech[1])])
        A = s @ Mi / k
        off = np.array([pc.width / 2, pc.height / 2]) - s @ Mi @ (np.array([e, f]) + DEMI)
        cible = pc.transform((T, T), Image.AFFINE, (A[0, 0], A[0, 1], off[0], A[1, 0], A[1, 1], off[1]), resample=Image.BICUBIC)
        arr = np.asarray(cible).astype(np.float32) / 255
        if P.get('oeil_ombre', 0):
            o_ = np.asarray(out).astype(np.float32) / 255
            dec = int(round(0.025 * largeur))
            sh = ndimage.gaussian_filter(np.roll(arr[..., 3], dec, 0), 0.02 * largeur)
            o_[..., :3] *= (1 - P['oeil_ombre'] * sh)[..., None]
            out = Image.fromarray((np.clip(o_, 0, 1) * 255).astype(np.uint8), 'RGBA')
        out.alpha_composite(cible)
    return out


# --- score : meme grille que pour Nexo, sur la zone du bot dans la capture ---
def bbox(a, seuil=200):
    m = np.abs(a.astype(int) - BG).sum(-1) > seuil
    ys, xs = np.nonzero(m)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def carre(im, bb, marge=0.12):
    x0, y0, x1, y1 = bb
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    c = max(x1 - x0, y1 - y0) * (1 + 2 * marge) / 2
    return np.asarray(im.crop((int(cx - c), int(cy - c), int(cx + c), int(cy + c))).resize((W, W), Image.LANCZOS)).astype(np.float32)


def grille(a):
    s = W // N
    out = []
    for j in range(N):
        for i in range(N):
            b = a[j * s + 2:(j + 1) * s - 2, i * s + 2:(i + 1) * s - 2].reshape(-1, 3)
            o = np.argsort(b.sum(1))
            out.append(b[o[[int(q * (len(o) - 1)) for q in (0.15, 0.5, 0.85)]]])
    return np.array(out)


def cible(nom):
    ref = REF.crop(ZONES[nom.lower()])
    rbb = bbox(np.asarray(ref))
    return grille(carre(ref, rbb)), rbb[2] - rbb[0]


def score(o, C, lref):
    f = Image.new('RGBA', o.size, tuple(int(v) for v in BG) + (255,))
    f.alpha_composite(o)
    o = f.convert('RGB')
    bb = bbox(np.asarray(o))
    k = lref / (bb[2] - bb[0])
    p = o.resize((round(o.width * k), round(o.height * k)), Image.LANCZOS)
    return float(np.abs(grille(carre(p, tuple(v * k for v in bb))) - C).mean())


def nelder_mead(f, x0, pas, iterations):
    n = len(x0)
    S = [list(x0)] + [[v + (pas[i] if i == j else 0) for j, v in enumerate(x0)] for i in range(n)]
    V = [f(p) for p in S]
    for _ in range(iterations):
        o = sorted(range(n + 1), key=lambda i: V[i]); S = [S[i] for i in o]; V = [V[i] for i in o]
        c = [sum(p[j] for p in S[:n]) / n for j in range(n)]
        vers = lambda t: [ci + t * (w - ci) for ci, w in zip(c, S[n])]
        r = vers(-1); fr = f(r)
        if fr < V[0]:
            e = vers(-2); fe = f(e)
            S[n], V[n] = (e, fe) if fe < fr else (r, fr)
        elif fr < V[n - 1]:
            S[n], V[n] = r, fr
        else:
            cc = vers(0.5); fc = f(cc)
            if fc < V[n]:
                S[n], V[n] = cc, fc
            else:
                S = [S[0]] + [[b + 0.5 * (v - b) for v, b in zip(p, S[0])] for p in S[1:]]
                V = [V[0]] + [f(p) for p in S[1:]]
    i = min(range(n + 1), key=lambda i: V[i])
    return S[i], V[i]


def main():
    nom, src, pfile, sortie = sys.argv[1:5]
    P = json.load(open(pfile if pfile != '-' else os.path.join(ICI, 'ph.json')))
    if pfile == '-':
        P.pop('oeil_d', None); P.pop('grade', None)
    gen = decoupe(src)
    print(nom, 'patins', [p[1] for p in gen[1]])
    C, lref = cible(nom)
    if '--ajuste' in sys.argv:
        g = P.get('grade') or {'gains': [1, 1, 1], 'gamma': 1.0, 'vertical': 0.0, 'diag': 0.0}
        def Q(x):
            q = dict(P); q['grade'] = {'gains': x[:3], 'gamma': max(0.3, x[3]), 'vertical': x[4], 'diag': x[5]}
            return q
        x, v = nelder_mead(lambda x: score(compose(nom, gen, Q(x), 384), C, lref),
                           [*g['gains'], g['gamma'], g['vertical'], g['diag']], [0.08, 0.08, 0.08, 0.15, 0.2, 0.2], 120)
        P = Q(x)
        json.dump(P, open(sortie.replace('.png', '.json'), 'w'), indent=1)
    out = compose(nom, gen, P)
    out.save(sortie)
    if '--exporte' in sys.argv:
        print(exporte(nom, gen, P, sys.argv[sys.argv.index('--exporte') + 1]))
    print(nom, 'score', round(score(compose(nom, gen, P, 384), C, lref), 3))


if __name__ == '__main__':
    main()
