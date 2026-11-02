"""Compose Nexo depuis une generation (corps sans yeux + patin) : detourage, recalage, yeux du moteur."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from commun import BOTS_JSON  # noqa: E402
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

DEMI = 1.58
FOND = 19.0


def detoure(a):
    """Matting sur fond uni sombre : alpha = projection sur (couleur du coeur - fond)."""
    d = a - FOND
    coeur = np.abs(d).sum(-1) > 120
    coeur = ndimage.binary_erosion(coeur, iterations=3)
    _, (iy, ix) = ndimage.distance_transform_edt(~coeur, return_indices=True)
    F = ndimage.gaussian_filter(a, (6, 6, 0))[iy, ix]  # couleur du coeur la plus proche
    v = F - FOND
    al = np.clip((d * v).sum(-1) / np.maximum((v * v).sum(-1), 1), 0, 1)
    al[coeur] = 1
    rgb = np.where(al[..., None] > 0.08, np.clip(FOND + d / np.maximum(al, 1e-3)[..., None], 0, 255), F)
    return np.concatenate([rgb, al[..., None] * 255], -1)


def masque_nexo(T):
    b = [x for x in json.load(open(BOTS_JSON)) if x['nom'] == 'Nexo'][0]
    c = np.array(b['contour'], float)
    c = np.stack([ndimage.gaussian_filter1d(c[:, i], 2, mode='wrap') for i in range(2)], 1)
    ss = 4
    im = Image.new('L', (T * ss, T * ss), 0)
    ImageDraw.Draw(im).polygon([tuple((p + DEMI) * T / (2 * DEMI) * ss) for p in c], fill=255)
    return np.asarray(im.resize((T, T), Image.LANCZOS)) / 255, b


def boite(m):
    ys, xs = np.nonzero(m > 0.5)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def gradue(out, P, bn):
    """Etalonnage du corps : gains, gamma, degrade vertical et diagonal (lumiere haut-gauche)."""
    g = P.get('grade')
    if not g:
        return out
    o = np.asarray(out).astype(np.float32) / 255
    T = o.shape[0]
    yy = (np.arange(T)[:, None] - bn[1]) / (bn[3] - bn[1]) - 0.5
    xx = (np.arange(T)[None, :] - bn[0]) / (bn[2] - bn[0]) - 0.5
    f = 1 - g['vertical'] * yy - g['diag'] * (xx + yy) / 2
    rgb = np.clip(o[..., :3], 0, 1) ** g['gamma'] * np.array(g['gains']) * f[..., None]
    o[..., :3] = np.clip(rgb, 0, 1)
    return Image.fromarray((o * 255).astype(np.uint8), 'RGBA')


def main(src, P, sortie, T=1024):
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    rgba = detoure(a)
    al = rgba[..., 3] / 255
    lab, n = ndimage.label(al > 0.5)
    tailles = ndimage.sum(np.ones_like(al), lab, range(1, n + 1))
    grands = np.argsort(tailles)[::-1][:2] + 1
    # corps = le plus a gauche des deux grands blobs
    cx = [np.nonzero(lab == k)[1].mean() for k in grands]
    k_corps, k_oeil = (grands[0], grands[1]) if cx[0] < cx[1] else (grands[1], grands[0])
    zone = lambda k, m: ndimage.binary_dilation(lab == k, iterations=m)
    def sprite(k):
        z = zone(k, 60)
        s = rgba.copy(); s[~z, 3] = 0
        x0, y0, x1, y1 = boite(lab == k)
        return Image.fromarray(s.clip(0, 255).astype(np.uint8), 'RGBA'), (x0, y0, x1, y1)
    corps, bc = sprite(k_corps)
    patin, bp = sprite(k_oeil)

    # recalage du corps sur le contour du moteur : echelle x/y + translation, boite a boite
    M, bot = masque_nexo(T)
    bn = boite(M)
    sx = (bn[2] - bn[0]) / (bc[2] - bc[0])
    sy = (bn[3] - bn[1]) / (bc[3] - bc[1])
    # transformation inverse sortie -> source pour Image.AFFINE
    aff = (1 / sx, 0, bc[0] - bn[0] / sx, 0, 1 / sy, bc[1] - bn[1] / sy)
    out = corps.transform((T, T), Image.AFFINE, aff, resample=Image.BICUBIC)
    m_gen = np.asarray(out)[..., 3] / 255
    inter = np.minimum(m_gen > 0.5, M > 0.5).sum(); union = np.maximum(m_gen > 0.5, M > 0.5).sum()
    print(f'echelles {sx:.3f} {sy:.3f}  IoU silhouette {inter / union:.4f}')

    out = gradue(out, P, bn)
    # patin : decoupe serree, debout
    pc = patin.crop((bp[0] - 40, bp[1] - 40, bp[2] + 40, bp[3] + 40))
    pw, ph = bp[2] - bp[0], bp[3] - bp[1]
    k = T / (2 * DEMI)
    largeur = bn[2] - bn[0]
    for io, oeil in enumerate(bot['yeux']):
        a_, b_, c_, d_, e, f = oeil['m']
        dxy = P.get('oeil_d', [[0, 0], [0, 0]])[io]
        e, f = e + dxy[0], f + dxy[1]
        w, hh = oeil['w'], oeil['h']
        Mi = np.linalg.inv(np.array([[a_, c_], [b_, d_]]))
        s = np.diag([pw / (w * P['oeil_marge']), ph / (hh * P['oeil_marge'])])
        A = s @ Mi / k
        off = np.array([pc.width / 2, pc.height / 2]) - s @ Mi @ np.array([e, f]) - A @ np.zeros(2)
        # pixel ecran X -> unites X/k - DEMI
        off = off - A @ np.array([DEMI * k, DEMI * k]) + A @ np.array([DEMI * k, DEMI * k]) - s @ Mi @ np.array([DEMI, DEMI]) + s @ Mi @ np.array([DEMI, DEMI])
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
    if sortie is None:
        return out
    out.save(sortie)
    corps.save(sortie.replace('.png', '-corps-src.png'))
    pc.save(sortie.replace('.png', '-patin.png'))


if __name__ == '__main__':
    P = json.load(open(sys.argv[2]))
    main(sys.argv[1], P, sys.argv[3])
