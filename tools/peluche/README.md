# tools/peluche

What made the images in `src/plush/assets/`. Nothing here runs at build time: the
package ships the finished `.webp` files, and `src/plush/assets.ts` is generated from
the folder's listing.

Two families, two pipelines:

| | Characters (nexo, vita, cloe, malu, yoshi, fred) | Grey shapes (`forme-*.webp`, `boule.webp`) |
|---|---|---|
| Body | baked, in the character's colour | neutral grey, tinted at runtime (`src/plush/tint.ts`) |
| Eyes | two felt pads per character, each lying and standing (`*-oeil<i>-x/y.webp`) | none: the generic pad of the layer |
| Fitted against | a capture of the app (`PELUCHE_REF`) | nothing: the engine's outline only |
| Script | `fit/bot.sh`, `fit/relief.py`, then `fit/matiere.py` | `fit/recolte.sh` (`fit/forme.py`) |

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
