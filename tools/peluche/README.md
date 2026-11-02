# tools/peluche

What made the images in `src/plush/assets/`. Nothing here runs at build time: the
package ships the finished `.webp` files, and `src/plush/assets.ts` is generated from
the folder's listing.

Two families, two pipelines:

| | Characters (nexo, vita, cloe, malu, yoshi, fred) | Grey shapes (`forme-*.webp`, `boule.webp`) |
|---|---|---|
| Body | baked, in the character's colour | neutral grey, tinted at runtime (`src/plush/tint.ts`) |
| Eyes | two baked pads per character (`*-oeil0/1.webp`) | none: the generic pad of the layer |
| Fitted against | a capture of the app (`PELUCHE_REF`) | nothing: the engine's outline only |
| Script | `fit/bot.sh`, then `fit/relief.py` | `fit/recolte.sh` (`fit/forme.py`) |

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
