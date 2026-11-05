# tools/peluche

What made the images in `src/plush/assets/`. Nothing here runs at build time: the
package ships the finished `.webp` files, and `src/plush/assets.ts` is generated from
the folder's listing.

Two families, two pipelines:

| | Characters (nexo, vita, cloe, malu, yoshi, fred) | Grey shapes (`forme-*.webp`, `boule.webp`) |
|---|---|---|
| Body | baked, in the character's colour | neutral grey, tinted at runtime (`src/plush/tint.ts`) |
| Eyes | two felt pads per character, each lying and standing (`*-oeil<i>-x/y.webp`) | the generic pad (`patin-x/y.webp`), and a sprite per eye for six expressions (`oeil-<expr>-<i>.webp`) |
| Fitted against | a capture of the app (`PELUCHE_REF`) | nothing: the engine's outline only |
| Script | `fit/bot.sh`, `fit/relief.py`, then `fit/matiere.py` | `fit/biblioteka.py` (the 0.7 library), or `fit/recolte.sh` (`fit/forme.py`) for one shape |

## Working folder

The scripts read and write outside the repo: `PELUCHE_TRAVAIL` (default `/tmp/peluche`,
`/tmp/peluche/gris` for `recolte.sh`). `PELUCHE_PY` is an interpreter with numpy, scipy
and pillow (default `$PELUCHE_TRAVAIL/venv/bin/python`). The generations are downloaded
files, so every script runs Python with `-I`, from `/tmp`, and each download lands in a
new folder of its own.

## Inputs

```bash
bun tools/peluche/export-bots.ts > /tmp/peluche/bots.json        # the six characters
bun tools/peluche/formes.ts /tmp/peluche/gris/entrees               # one 3:2 SVG per shape + formes.json
for f in /tmp/peluche/gris/entrees/*.svg; do rsvg-convert "$f" -o "${f%.svg}.png"; done
```

Both read the engine: outline and eye matrices at the instant the eyes are most open.
Nothing is redrawn. The frame is 1536 x 1024, body centred at (512, 512), 318 px per
unit of radius, the small ball on the right.

## Generating on Higgsfield

Model **GPT Image 2.5 Sunburst**, never GPT Image 2. Two attachments, in this order:

1. the shape's input PNG (`entrees/<forme>.png`, 3:2);
2. an approved grey body as the style reference (the hexagon tile).

The prompt is `python3 tools/peluche/fit/prompt.py <forme>`: the same text for every
shape, only the name changes. That is what keeps the material, the light and the grey
consistent from one generation to the next.

**Before every Generate, check all four, and stop if one fails:**

- the model reads GPT Image 2.5 Sunburst;
- the Unlimited switch (`[role=switch]`) is `aria-checked="true"`;
- Quality is Medium;
- the generate button reads **UNLIMITED**, not a credit count.

Nothing in this pipeline is worth spending credits on. A generation takes several
minutes on Unlimited; when one misses (a face drawn on the body, a tint, the ball
touching the body), regenerate rather than retouch.

## The 0.7 library

The current shapes, the generic pad and the sprite eyes all come from one generated library
(`biblioteka-bloub`: `body/`, eleven eyeless coloured bodies; `oczy/`, sixteen white felt eye
pairs, one per expression). They are PNGs with a real alpha, so nothing is cut out of a dark
background.

```bash
bun tools/peluche/formes.ts /tmp/peluche/gris/entrees            # formes.json: the engine outlines
$PELUCHE_PY -I tools/peluche/fit/biblioteka.py /tmp/peluche/gris/entrees/formes.json <biblioteka-bloub> /tmp/peluche/biblioteka
/bin/cp -f /tmp/peluche/biblioteka/*.webp src/plush/assets/
bun tools/peluche/assets.ts
```

It writes:

- `forme-<forme>.webp`: the body fitted box to box on the engine outline, then normalised
  like `forme.py`. Its original colour (the interior median) is written to
  `biblioteka.json` and becomes `SHAPE_INKS` in `catalogue.ts`.
- `patin-x/y.webp`: the generic pad in `slices.ts`'s format. The round pad is one eye of
  `03-zdziwione`. The straight part is felt from the straight part of `02-uwazne`, read
  over `BARRE` and mirrored, and blended into the round pad over `COUTURE`.
- `oeil-<expr>-<i>.webp`: the six expressions a capsule cannot draw, one image per eye,
  with the felt centred in it. Their proportions (`biblioteka.json`, `sprites`) go into
  `SPRITES` in `catalogue.ts` **as they are**.

The script prints each body's scale and anisotropy (x scale over y scale). It fits box to
box, so a body that was generated with different proportions from the engine outline gets
squashed. Check the print, and regenerate any body whose anisotropy is far from 1. In the
0.7 library, `losange` (1.48) and, less so, `capsule` (0.82) are like that. `galet` and
`goutte` don't match the outline well either. Their inputs for a new generation are the
`formes.ts` SVGs.

## Grey shapes

```bash
tools/peluche/fit/recolte.sh <forme> <url-of-the-png> [--boule]
# look at $PELUCHE_TRAVAIL/<forme>-check.png, then:
cp $PELUCHE_TRAVAIL/sortie/<forme>/<forme>.webp src/plush/assets/forme-<forme>.webp
bun tools/peluche/assets.ts
```

`forme.py` fits the body box to box on the engine's outline, then **normalises it**:
luminance only, the median of the interior brought to `GRIS_CIBLE` (0.55). That median
is `GRIS` in `tint.ts`, so a given colour gives the same body whichever generation it
came from. `--boule` also exports the small ball (`boule.webp`): the thinking dots and the
notification pastille, tinted the same way.

## Characters

```bash
tools/peluche/fit/bot.sh <Nom> <generation.png>
python3 -I tools/peluche/fit/relief.py <sprites> <out> <nom> haut=0.4 amb=0.72 dif=0.42 ombre=0.42 lz=0.7 clair=0.9
```

`bot.sh` runs `compose2.py --ajuste` (body calibration against the capture: gains,
gamma, gradients), then `ajuste-yeux.py` (eye centre and size, three passes), then
exports the sprites. `relief.py` turns each flat pad into a felt dome lit from the top
left with its shadow down right. The light is fixed on screen while the pad lives in
the eye's local frame, so the script works through the eye's matrix and back.

The five first characters used the arguments above; **Fred** used the same plus
`ech=1.08`. These were judged by eye against the reference, side by side
(`mesure/cote-shot.py`, `mesure/zoom-yeux.py`), and approved: they are not to be tidied.

### Pad material

```bash
mkdir -p /tmp/patins && for f in cloe fred malu nexo vita yoshi; do for i in 0 1; do
  git show 517df3c:src/plush/assets/$f-oeil$i.webp > /tmp/patins/$f-oeil$i.webp; done; done
python3 -I tools/peluche/fit/matiere.py /tmp/patins src/plush/assets
```

`matiere.py` takes the pads as `relief.py` left them (those of 0.5.0, commit `517df3c`;
**never its own output**) and turns each into felt, in five steps:

1. it splits the pad's coverage from its drop shadow;
2. it removes the straight part of the fitted capsule, which leaves the **round** pad, its two
   ends joined with a cross-fade (`couture`, 0.3 of the short side); its colour is smoothed
   (`lisse`, 0.03);
3. it resamples it: a pad is shown enlarged on other expressions (`src/plush/slices.ts`), up
   to the biggest eye's short side (`grand`, 0.45, `surpris`), so a small pad gets more
   pixels, `densite` (6) px per unit at that enlargement, capped at `plafond` (12);
4. it reads the felt on that round pad once (`champ` in `fit/feutre.py`);
5. along each axis it lengthens the pad and that reading by a straight part of `2 barre`
   short sides (`allonge`, `allonge_champ`), then renders the felt (`feutre`). That gives
   `<perso>-oeil<i>-x.webp` (lying) and `-y.webp` (standing), whose two ends are the same
   round pad, so a swap between them at a round eye changes nothing on screen. `barre` (0.5)
   is `BARRE` in `slices.ts`: keep them in step.

**The felt** comes from one Higgsfield generation the user chose as the model (GPT Image
2.5 Sunburst), cropped into `feutre/gelule.png`, a white felt capsule on black, and
`feutre/carre.png`, the inside of an orange felt square. Nothing is generated by the script;
everything is read off them. A pad pixel at depth `d` from the edge, at arc length `s` along
its outline, takes the capsule's coverage (a fringe of fibres) and grain at the same depth
and arc length; deeper in, it takes the square's grain, brought to the white felt's contrast;
and its brightness follows the capsule's profile by depth. The dome of `relief.py` is kept at
`mat` (0.5) of its contrast; shape, colour and shadow are untouched. The felt is scaled to the
pad: the reference capsule (`gelule`, 205 px wide) always spans the pad's short side, so Fred's
big pads and Cloe's slits have the same fringe in proportion. Depths are in reference px:
the edge grain gives way to the core's between `bord0` (30) and `bord1` (50), and the fringe
reaches `dehors` (30) outside. In the straight part the arc length and the core's tile
position run on to its middle and come back, so the straight part is symmetric and
`slices.ts` can read it either way without a seam.

The 24 weigh 1.0 MB (323 kB of smooth pads in 0.5.0); a bot fetches only its own four,
about 170 kB. `densite`, `plafond`, `qualite` (85), `gelule` and the `feutre.py` depths are
CHOSEN, judged at 4x in `felt.html#atelier` on Nexo, Cloe, Vita, Fred and the generic pad,
on `heureux`, `effraye`, `somnolent` and a wink, and beside the generation at 360 px.

Rejected on the way: the body's fibres refined (crumpled paper), the wool of a generated felt
pad (foam, pumice), the body's own fur; a fixed edge width for every pad (sharp on the big
ones); a round twin faded in where the pad had to become round; the straight part as a
separate image (a line at each cut, where the image's own edge antialiased); the felt laid on
each capsule separately (two different round pads, a flicker where an expression swaps them);
and stretching
the pad to the eye, which turned the fibres into streaks. The scale of each pad is read from
`PATINS` in `src/plush/catalogue.ts`, so it follows a refit.

`fit/ph.json` is the starting point of `compose2.py` when no parameters are given.

## Rim

Every body is cut out of a generation on a dark background, so the fibres that the generation
drew dark at the edge stay dark and nearly opaque. On a dark page nobody sees them; on a light
page they draw a dirty outline. `fit/lisiere.py` is the last step for both families: it
lightens a band at the edge (2 % of the image side) toward the colour of the nearest fur. It
does not change alpha, so the silhouette and the fibre halo stay the same. It does not touch
the pads: their dark drop shadow is intended.

```bash
depot=$(git rev-parse --show-toplevel)
mkdir -p /tmp/peluche/lisiere/v063
for f in $(git ls-tree --name-only v0.6.3 src/plush/assets/ | grep -E '(-corps|/forme-|/boule)\.webp$'); do
  git show "v0.6.3:$f" > "/tmp/peluche/lisiere/v063/$(basename "$f")"
done
cd /tmp && "$PELUCHE_PY" -I "$depot/tools/peluche/fit/lisiere.py" /tmp/peluche/lisiere/v063 "$depot/src/plush/assets"
```

Run it on the v0.6.3 images, or on the new output of a refit, **never on its own output**: a
second pass lightens the rim again.

## Measuring

- `mesure/cote-shot.py`: reference | sandbox capture, same framing (the body's box).
- `mesure/zoom-yeux.py`: the eyes of that sheet, enlarged, one row per bot.
- `mesure/anim-ref.py`: the reference beside an animated column of captured frames.
- `mesure/yeux.py`: bright blobs (the eyes) measured in a capture, shared with
  `ajuste-yeux.py`.

- `mesure/teinte.py nexo:squircle:#e45206 malu:cercle:#9a55ef yoshi:capsule:#e94741 vita:hexagone:#22c377 fred:hexagone:#efb428`:
  fits `TINT` (`src/plush/tint.ts`) by tinting each grey shape with its character's ink
  and comparing quantiles with the baked body. `EXPOS` can also search an exposure
  factor; it stays at 1 (see `docs/plush.md`, Tint). Cloe waits for no grey shape: she
  is a triangle like the grey one, add her when refitting.
- `mesure/planche-teinte.py "<perso:forme:#hex ...>" "<gamma,sheen,expo;...>" <out.png>`:
  baked body beside each candidate curve, one row per character.

Captures come from `felt.html` (`bun run dev`), stepped with `window.__instant(t)`.
