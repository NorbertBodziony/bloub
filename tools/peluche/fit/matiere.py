"""Les patins en feutre : deux gelules par oeil, couchee et debout.

usage : matiere.py <dossier-entree> <dossier-sortie> [cle=valeur ...]

L'entree, ce sont les patins tels que `relief.py` les a laisses (ceux de la 0.5.0 :
`git show 517df3c:src/plush/assets/<perso>-oeil<i>.webp`) : leur forme, leur dome, leur
couleur et leur ombre sont ceux qui ont ete approuves. Ne pas relancer sur sa propre sortie.

Ce que fait le script, dans le repere du sprite, mais mesure en unites du viewBox
(l'echelle de chaque patin est lue dans `PATINS` de `src/plush/catalogue.ts`) :
1. il separe le patin (`ap`, sa couverture) de son ombre portee (`om`) : le sprite est
   `alpha = ap + om (1 - ap)` et sa couleur premultipliee `c . ap`, `c` etant la couleur du
   coeur prolongee vers l'exterieur ;
2. il retire la partie droite de la gelule ajustee : il reste le patin rond, ses deux bouts
   raccordes en fondu sur `couture` du petit cote. La couleur est lissee (`lisse`) ;
3. il le reechantillonne : un patin est agrandi sur d'autres expressions (`slices.ts`),
   jusqu'a ce que son petit cote soit celui de l'oeil le plus grand (`grand`, `surpris`).
   Sa densite est celle qui laisse `densite` px par unite a cet agrandissement, sans depasser
   `plafond` ;
4. il lit le feutre du patin rond (`feutre.py`, `champ`) : la frange, le grain et le profil de
   la generation de reference. Le feutre est a l'echelle du petit cote : la gelule de
   reference (`gelule` px de large) vaut toujours ce petit cote, donc tous les patins ont la
   meme frange au meme agrandissement ;
5. il allonge ce patin, le long de chaque axe, d'une partie droite de `2 barre` petits cotes :
   sa coupe du milieu pour la forme, la lumiere et l'ombre ; pour le feutre, la lecture
   continue le long du bord, aller et retour (`allonge_champ`). Les deux bouts sont le patin
   rond tel quel, la partie droite est symetrique : `slices.ts` la lit dans les deux sens, et
   la gelule couchee et la gelule debout montrent le MEME patin rond. Un oeil qui passe de
   couche a debout (une expression) change d'image sans que rien ne change a l'ecran.

Les deux gelules sont `<perso>-oeil<i>-x.webp` et `-y.webp`. `slices.ts` en montre des
morceaux, jamais etires : etiree, une matiere fait de chaque fibre une raie.
"""
import os, re, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ICI = os.path.dirname(os.path.abspath(__file__))
# `-I` ne met pas le dossier du script dans le chemin : le module voisin y est mis a la main
sys.path.insert(0, ICI)
from feutre import Reference, champ, feutre  # noqa: E402

RACINE = os.path.join(ICI, '../../..')
src, dst = sys.argv[1:3]
# CHOISI, juges a 4x (`felt.html#atelier`) sur Nexo, Cloe, Vita, Fred et le patin generique,
# `heureux`, `effraye`, `somnolent` et le clin d'oeil. `barre` est `BARRE` de `slices.ts`.
R = dict(densite=6, grand=0.45, plafond=12, couture=0.3, lisse=0.03, barre=0.5, qualite=85, gelule=205)
for a in sys.argv[3:]:
    k, v = a.split('='); R[k] = float(v)

# l'echelle des patins : largeur et hauteur du sprite en unites de rayon (RAYON = 100)
cat = open(os.path.join(RACINE, 'src/plush/catalogue.ts')).read()
bloc = cat[cat.index('const PATINS'):cat.index('const pad =')]
PATINS = {m.group(1): eval(m.group(2)) for m in re.finditer(r'(\w+): (\[\[.*?\]\]),?\n', bloc)}
RAYON = 100
# la gelule de chaque oeil, celle sur laquelle le patin a ete ajuste (unites de rayon)
OEIL = {m.group(1): [(float(m.group(2)), float(m.group(3))), (float(m.group(4)), float(m.group(5)))]
        for m in re.finditer(r"personnage\('(\w+)'.*?oeil\(([\d.]+), ([\d.]+)[^)]*\), oeil\(([\d.]+), ([\d.]+)", cat)}


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def densite(court, plafond):
    return min(plafond, R['densite'] * max(1, R['grand'] / court))


def ecrit(out, w, h, court, nom, plafond):
    """le cadre du sprite (unites de rayon) ne change pas, seulement son nombre de pixels"""
    img = Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')
    dens = densite(court, plafond)
    taille = (round(w * RAYON * dens), round(h * RAYON * dens))
    img = img.resize(taille, Image.LANCZOS, reducing_gap=3.0)
    img.save(os.path.join(dst, nom), quality=int(R['qualite']), method=6)
    print(nom, f'-> {dens:.1f} px/u', taille)


def arrondi(x, r0, beta, axis):
    """le patin sans sa partie droite le long de `axis` : les deux bouts, raccordes en fondu"""
    x = np.moveaxis(x, axis, 1)
    W = x.shape[1]
    # un nombre entier de pixels, mais le cadre exact (`w - 2 r0`) : le catalogue le recalcule
    n = int(round(W - 2 * r0))
    xp = (np.arange(n) + 0.5) * (W - 2 * r0) / n
    g = ndimage.map_coordinates
    # chaque moitie se prolonge dans la partie droite : a gauche on lit x', a droite x' + 2 r0
    def echantillonne(pos):
        rows = np.arange(x.shape[0])[:, None] * np.ones((1, n))
        cols = (pos - 0.5)[None, :] * np.ones((x.shape[0], 1))
        if x.ndim == 2:
            return g(x, [rows, cols], order=1, mode='nearest')
        return np.stack([g(x[..., i], [rows, cols], order=1, mode='nearest') for i in range(x.shape[2])], -1)
    gauche, droite = echantillonne(xp), echantillonne(xp + 2 * r0)
    t = smooth((xp - (W - 2 * r0) / 2) / (2 * beta) + 0.5)
    t = t[None, :, None] if x.ndim == 3 else t[None, :]
    return np.moveaxis(gauche * (1 - t) + droite * t, 1, axis)


def allonge_champ(ch, axis, n, du, ech):
    """le champ du feutre (`feutre.champ`) allonge comme `allonge` : la distance au bord est la coupe
    du milieu ; l'abscisse sur le contour et la place dans la tuile avancent dans la partie droite,
    jusqu'a son milieu, et reviennent : chaque bout retrouve la lecture du patin rond, et la partie
    droite est symetrique. `du` : unites par px le long de `axis` ; `ech` : px de la reference par unite."""
    m = np.minimum(np.arange(n) + 0.5, n - np.arange(n) - 0.5) * du * ech
    forme = [1, 1]
    forme[axis] = n
    m = m.reshape(forme)
    out = {k: allonge(v, axis, n) for k, v in ch.items()}
    W = ch['sd'].shape[axis]
    h = W // 2
    milieu = (slice(None),) * axis + (slice(h, h + n),)
    out['s'][milieu] += m
    out['X' if axis == 1 else 'Y'][milieu] += m
    return out


def allonge(v, axis, n):
    """le patin rond, coupe par le milieu le long de `axis` et ses moities ecartees de `n` px,
    remplis de sa coupe du milieu"""
    W = v.shape[axis]
    m = (W - 1) / 2
    a, b = int(np.floor(m)), int(np.ceil(m))
    coupe = (np.take(v, [a], axis) + np.take(v, [b], axis)) / 2
    h = W // 2
    return np.concatenate([np.take(v, range(h), axis), np.repeat(coupe, n, axis), np.take(v, range(W - h, W), axis)], axis)


os.makedirs(dst, exist_ok=True)
REF = Reference()
for perso, patins in PATINS.items():
    for io, (w, h, _dx, _dy) in enumerate(patins):
        nom = f'{perso}-oeil{io}'
        im = np.asarray(Image.open(os.path.join(src, nom + '.webp')).convert('RGBA')).astype(float) / 255
        H, W = im.shape[:2]
        ux, uy = W / (w * RAYON), H / (h * RAYON)
        rgb, al = im[..., :3], im[..., 3]
        # 1. couverture du patin et ombre portee
        coeur = al > 0.985
        iy, ix = ndimage.distance_transform_edt(~coeur, return_distances=False, return_indices=True)
        c = rgb[iy, ix]
        ap = np.clip((rgb * al[..., None]).mean(2) / np.maximum(c.mean(2), 1e-3), 0, 1)
        om = np.clip((al - ap) / np.maximum(1 - ap, 1e-3), 0, 1)
        ew, eh = OEIL[perso][io]
        court = min(ew, eh)
        # 2. le patin rond : la partie droite retiree, les deux bouts raccordes en fondu
        axis = 1 if ew > eh else 0
        u = ux if axis == 1 else uy
        r0 = (max(ew, eh) - court) / 2 * RAYON * u
        if r0 > 0.5:
            beta = R['couture'] * court * RAYON * u
            ap, om, c = (arrondi(v, r0, min(beta, r0), axis) for v in (ap, om, c))
        else:
            r0 = 0
        # la couleur lissee : le dome de `relief.py`, sans son grain
        sig = R['lisse'] * court * RAYON * u
        c = np.stack([ndimage.gaussian_filter(c[..., i], sig) for i in range(3)], -1)
        wr, hr = (w - 2 * r0 / u / RAYON, h) if axis == 1 else (w, h - 2 * r0 / u / RAYON)
        # 3. la densite : un petit patin est vu agrandi (jusqu'a `grand` / court). Le feutre est
        # pose sur la forme reechantillonnee, pas agrandi avec elle.
        dens = densite(court, R['plafond'])
        f = dens / min(ux, uy)
        z = lambda v, o: ndimage.zoom(v, (f, f) + (1,) * (v.ndim - 2), order=o, mode='nearest')
        ap, om, c = np.clip(z(ap, 3), 0, 1), np.clip(z(om, 1), 0, 1), np.clip(z(c, 1), 0, 1)
        Hr, Wr = ap.shape
        ux, uy = Wr / (wr * RAYON), Hr / (hr * RAYON)
        # chaque patin commence ailleurs sur le contour de la reference : deux yeux, deux franges
        decalage = 97.0 * (sum(map(ord, perso)) % 7) + 211.0 * io
        # 4. le feutre du patin rond, lu une fois pour les deux gelules
        ech = R['gelule'] / (court * RAYON)
        ch = champ(REF, ap, ux, uy, decalage, ech=ech)
        moy = c[ap > 0.5].mean(0)
        # 5. une gelule par axe : le patin rond allonge de `2 barre` petits cotes. Couchee (`x`) ou
        # debout (`y`), `slices.ts` en montre les deux bouts et autant de partie droite qu'il faut.
        for a, cote in ((1, 'x'), (0, 'y')):
            uu = ux if a == 1 else uy
            n = round(2 * R['barre'] * court * RAYON * uu)
            chg = allonge_champ(ch, a, n, 1 / uu, ech)
            img = feutre(REF, chg, allonge(om, a, n), allonge(c, a, n), moy, ech=ech)
            long = 2 * R['barre'] * court
            bw, bh = (wr + long, hr) if a == 1 else (wr, hr + long)
            ecrit(img, bw, bh, court, f'{nom}-{cote}.webp', R['plafond'])
