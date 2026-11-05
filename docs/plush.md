# The plush bot

`@norbert_bodziony/bloub/plush` draws the bot as a felt plush: a photographic body and
two felt eye pads, driven by the same engine as the flat bot. It is a separate entry so
that neither its code nor its images reach those who only use `BloubBot`.

```tsx
import { PlushBot } from '@norbert_bodziony/bloub/plush'

<PlushBot character="nexo" state="thinking" />
<PlushBot shape="losange" color="#3b93f0" expression="heureux" size={96} />
```

## Two sources, like the flat bot

- **Six characters** (`nexo`, `vita`, `cloe`, `malu`, `yoshi`, `fred`): body, colour and
  eye pads baked into images. Their face is a real `BotExpression`, fitted on a capture
  of the reference avatars, so it is not in the expression catalogue.
- **Eleven grey shapes**, one per customiser shape: a neutral grey body, tinted at
  runtime to any colour (`color` takes a customiser id or `#rrggbb`). Without `color`, a
  shape takes the colour its body was generated in (`SHAPE_INKS`), not `encre`. The eyes
  carry the generic pad, or a felt sprite on the six expressions a capsule cannot draw
  (below).

Since 0.7.0 the shapes, the generic pad and the sprites all come from one generated
library (`biblioteka-bloub`): eleven eyeless coloured bodies and sixteen white felt eye
pairs, one per expression. `tools/peluche/fit/biblioteka.py` turns it into the assets.

How those images were made, and how to make a new one, is in
[tools/peluche/README.md](../tools/peluche/README.md).

## The body does not move

The body is a still image: it does not breathe, squash, or morph (except while it changes,
below). Only the eyes move,
placed by the engine's eye matrices: gaze drift, blinks, expressions. This is the plush
that was approved, "the one that only moves its eyes". It is also why only the states
whose body is the rest body (`baseBody`) exist here:

| `state` | engine state | |
|---|---|---|
| `idle` | `idle` | the rest face, or the `expression` prop |
| `wink` | `wink` | measured face |
| `wide` | `wide` | measured face |
| `notify` | `notify` | measured face, plus a felt pastille |
| `thinking` | `idle` | gaze up and right, three felt dots |
| `asleep` | `idle` | eyes closed into stitched arcs, no blinks, rising z's |
| `failed` | `idle` | gaze down, eyes tilted like `triste`, a shake ("no") |

The engine's `thinking` turns the body into a dot and hides the eyes, which a still image
can't do. So the plush keeps the engine on `idle`, aims the gaze at the dots through a
gaze script, and draws the dots itself, pulsed by the state's own function
(`dotPulse`, 1.5 s, 0.3 s emergence).

`asleep` and `failed` are not in the video: they are CHOSEN, for the hosts' moods, and
both keep the engine on `idle`. `asleep` is not the engine's `sleep` (a bouncing dot); it
arrives over `sleep`'s `morph`, imposes a face whose eyes are two dashes, sets
`Look.blink` to 0 (closed eyes do not blink) and nearly stops the drift.
The layer fades the pads out and draws a dark stitched arc in each eye's frame instead,
on the same `DotsTrack` as the z's, so entering and leaving are continuous.

`failed` does not take `triste` as it is: each pad is the photo of one eye, fitted to its
character's capsule, and `triste`'s capsules stretched them (Yoshi's squinting pad rose to
nearly five times its height). `failedFace` keeps the plush's own capsule and takes from
`triste` only what deforms nothing: the head pose (gaze down) and the mirrored tilt. Two
CHOSEN rules, checked on all seventeen plushes:

- the face is symmetric, built from the more open eye, whose pad goes to both eyes. Vita's
  and Malu's two different eyes, each tilted, leaned the same way and read as a sidelong
  look;
- a nearly round eye (Fred) is flattened to `FAILED_ASPECT` (1.8) before the tilt, or the
  tilt would not show (`expressions.test.ts`'s rule). An eye that is already long is left
  alone.

The pads cross-fade over `SHAPE_MORPH` with the engine's face morph on entry and exit
(`padFade`): a photo can't morph into another. On entry `failed` also adds a
half-sine-enveloped yaw (`SHAKE_YAW` 12°, `SHAKE` 0.8 s) to `spin`: it shakes the pose's
gaze, not a target, and starts and ends at zero. Both states override the `expression`
prop and turn `follow` off.

## Changing body

The body still changes when the shape, the character or the colour does. A photo can't
morph, so `transition` decides how one photo becomes the other (`transition.ts`):

| `transition` | | duration |
|---|---|---|
| `flip` (default) | turns around the vertical axis, swaps edge-on | 2 × `SHAPE_MORPH` |
| `pop` | shrinks to nothing, comes back with `notify`'s pastille pop | `SHAPE_MORPH` / 2 + the pop |
| `warp` | the felt follows the engine's own shape morph (WebGL) | `SHAPE_MORPH` |
| `dissolve` | a fixed noise, thresholded, uncovers the new body | `SHAPE_MORPH` |
| `cut` | swaps in one frame; only the eyes glide | none |

- **The eyes go with the body.** The engine only learns the new shape when the body changes
  on screen (`bascule`): at the edge-on instant for `flip`, at the bottom of the shrink for
  `pop`, at once for the others. A `flip` or `pop` scales body and eyes together.
- **`flip` turns around the vertical axis on purpose.** The light is baked into the photo,
  top left; spinning in the plane would carry it round. A coin turn leaves it in place.
- **`warp` follows the engine exactly.** Its radii are `shapeAtTime`'s formula, and a test
  compares them to a real engine, so the felt stays under the eyes. It falls back to a plain
  swap without WebGL 2. Between two characters of different colours the halfway blend is
  muddy; that is why it isn't the default.
- **A change during a transition waits for it to finish**, and the last one wins. Restarting
  from the middle would make the scale jump. `cut` never waits.
- **Nothing extra at rest.** The canvas and the filters exist only during a transition; the
  WebGL context is created per `warp` and released after, because a browser keeps only
  about sixteen alive. A frozen bot (`frozenAt`) has no clock to run one on and shows the
  new body directly; so does the first body, and the server render.

`felt.html#transitions` shows all five side by side.

## No new timings

Every transition takes a duration the engine already has:

- a state change takes that state's `morph` (`wink` 0.3 s, `wide` 0.55 s…);
- an expression change takes `SHAPE_MORPH` (0.45 s), easeOutQuint;
- the `thinking` gaze glides over `thinking`'s own `morph`, with the same curve;
- a body change takes `SHAPE_MORPH`, or `notify`'s pop curve (see above);
- `asleep` arrives over `sleep`'s `morph`, `failed` over `idle`'s.

The two exceptions are the decorations of the chosen states, which the video has no
equivalent for: the shake of `failed` (0.8 s) and the life of a z (3 s).

Changes can land at any time, including inside a fade. The engine blends from what is on
screen in every case; that took two fixes in the engine, described in
[architecture.md](architecture.md). `plush.test.ts` plays random sequences, half the
changes inside a fade, at 240 frames a second, and checks that no step is faster than the
steepest spaced change on the same shape.

`PlushBot` never passes a null face to the engine: from a null face the engine jumps
instead of blending, so a shape starts on `neutre`.

## Rendering

`BloubBot` has a `layer` slot: a function of the frame and the clock that returns the
body and the eyes. The plush renders through it (`layer.tsx`), and `BloubBot` itself knows
nothing about felt. What the slot replaces is the flat body and the mask eyes; the engine,
the render loop, `fps`, `autoPause` and `frozenAt` are unchanged.

Each pad is drawn in its eye's frame, `translate(dx, dy) ${eye.matrix}`.

### Felt

The pads are matte felt, not the smooth domes of 0.5.0: the material of a generation the
user picked (Higgsfield, GPT Image 2.5 Sunburst), a white felt capsule with a fuzzy fringe.
Two crops of it live in `tools/peluche/feutre/`, and `fit/feutre.py` transfers them onto each
pad offline: the fringe and the grain read along the reference capsule's outline at the same
depth, its brightness profile by depth (a slightly lighter rim, a slightly darker core), and
the grain of a felt square in the middle. The approved dome's light is kept at half its
contrast, and the pad's shape, colour and shadow are the approved ones. The felt is scaled
to each pad's short side, so every pad has the reference's fringe in proportion, Fred's big
pads as much as Cloe's slits.

### Never stretched

A pad is not stretched to another expression's eye. Stretching x and y apart made a slab of
an upright pad laid flat (Nexo on `heureux`), and stretching the felt along one axis turns
every fibre into a streak. So each pad is baked twice by `fit/matiere.py`, as a capsule
lying down (`*-oeil<i>-x.webp`) and one standing up (`-y`):

- the capsule it was fitted on, minus its straight part, is the **round** pad; the two ends
  are joined with a cross-fade over 30 % of the short side, and its colour is smoothed;
- the felt is read once, on that round pad (`feutre.py`, `champ`): for each pixel, its depth
  from the edge, its arc length along the outline and its place in the core's grain tile;
- the round pad is lengthened along the axis by a straight part of one short side (its middle
  cross-section), and so is that reading: in the straight part the arc length and the tile
  position run on to its middle and come back (`allonge_champ`). The two ends are the round
  pad as it is, the straight part is symmetric, and **both capsules show the same round pad**.

`slices.ts` (`padPieces`) rebuilds any capsule from it at the short side's scale. On a
capsule `2e` longer than wide, each half shows its end and `e` of straight part: one piece
up to half a short side (`BARRE`), then sections of `BARRE` read up to the image's middle
and on past it, which is the mirror of what came before, up to `BARRES` (3) per side. Beyond
that the sections stretch; no eye in the catalogue goes that far (Vita, the longest, needs
three). The two halves meet at the centre on
two symmetric columns of the image, so the felt is the same on both sides of every cut; the
straight part has one light all along. Lying or standing is chosen by the eye's current
long axis. At a round eye, where they swap, nothing changes on screen: the two images carry
the same round pad (they differ by under 1 % on average, the resampling). When the felt was laid
on each capsule separately, each had its own fibres and the swap showed as a flicker in
the middle of an expression change. `PlushBot` also preloads both images of each pad, so the
first swap never shows an empty eye while the other one arrives.

The pieces are nested `<svg>` viewports, all cuts parallel. Laid edge to edge with ordinary
"over" blending, their antialiased edges left a line of body at every cut; they are
**added** (`mix-blend-mode: plus-lighter`) in an isolated group instead, where the two
coverages sum to one. No cut ever falls on an image's own edge: there, the image's
antialiasing doubled the cut's and left a line too, which is why the straight part is not a
separate image.

### Sprite eyes

A capsule can't draw an arc (`heureux`, `fier`), a chevron (`hilare`), a corner (`colere`),
a half oval (`blase`) or a U-shaped stroke (`somnolent`). On a grey shape, those six
expressions show the library's own eye for that expression instead (`SPRITE_PADS`,
`oeil-<expr>-<i>.webp`): one image per eye, in a single piece, never stretched. The other ten
expressions keep the generic pad. The characters are unaffected: their face is their own.

- **Size** (`spriteFelt`): the drawing already has its tilt, so it is drawn upright
  (`layer.tsx` cancels the eye matrix's rotation with `rotate(-tilt)`, which is why
  `RenderedEye` carries `tilt`). It takes the width the tilted capsule covers on screen,
  `w·cos t + h·sin t`, and keeps its own proportions (`SPRITES`, measured by
  `biblioteka.py`). If a drawing is taller than it is wide (`hilare`), that width becomes its
  height instead; otherwise the chevrons went past the face. This rule was CHOSEN by
  looking at all eleven shapes.
- **Lids**: the lid mask is cut on the sprite's felt box, not on the capsule's.
- **Change**: going from the pad to a sprite, or from one sprite to another, is the same
  cross-fade as `failed` (`padFadeToggle`, over `SHAPE_MORPH`). The new eye fades in while
  the expression morphs under it. All twelve sprites are preloaded with the bot.

### Blinks

The engine blinks by squashing the eye vertically on screen (`blinkScale`, measured),
composed after the tilt. For the mask hole that is the measurement; for a felt pad it made a
stick, and thinning the capsule instead (the 0.5.0 approach) made another, thinner capsule
rather than an eye closing. So the pad keeps its open shape and **lids close over it**:
`lidMask` returns an opening in a `<mask>` that is the eye's own **capsule**, posed like the pad
(tilt, foreshortening, `eyeScale`), then squashed vertically on screen around the eye's centre,
the way the engine squashes the hole. The squash is `l`, the blink's opening (`RenderedEye.open`)
mapped from the closed eye (`blinkScale(0)`, 0) to the eye at rest (`RenderedEye.rest`, 1); at 0,
`scale(1,0)` paints nothing, so a closed eye is fur only. A felt slit left at the close read as
an open eye.

The first version cut a horizontal band on screen through the pad, with a vertical gradient.
On an upright pad that is the same thing; on a tilted one (`curieux`, `fier`) the band crossed
the pad at an angle and left a blurry parallelogram mid-blink, which is what read as a glitch on
an expression change, the morph itself being continuous. A capsule squashed on screen keeps
the pad's curved ends at every tilt.

The capsule is the pad grown by the felt's fringe, `LID_FRANGE` (30/205, `feutre.py`'s `dehors`
over its reference capsule), so the lids sit beyond the fibres and never shave them. At rest
the opening must also cover the rest of the pad's image, its shadow; that extra is added back
as `l^LID_MARGE` (8, CHOSEN), so nothing jumps when a blink starts but the lids bite as soon as
the eye closes a little. At 4 Fred's round pad closed as a square. What shows above and below is
the body's own fur.

The lid edge is soft over `LID_SOFT` (0.1, CHOSEN) of the capsule's short side, in `LID_BANDS`
(4, CHOSEN) nested rounded rectangles whose alphas add up to a linear ramp. At 0.25 the edge
was a translucent halo around the pad. The mask exists only during a blink (`open < rest`).

An eye that is half closed AT REST is not a blink. `somnolent` (`open` 0.42, "half-dropped
lids" in `expressions.ts`) used to keep its lids half closed, and they cut the round pad into
a square, straight-sided and blurred top and bottom. Now `RenderedEye.rest` gives the
expression's own squash, and `restCapsule` draws a shorter capsule instead: each axis of the
eye shortened by what that squash takes off its image on screen, rebuilt from pieces like any
expression's, never a squashed photo. A blink on `somnolent` closes the lids from that eye
down.

## Small avatars: `eyeScale` and `paused`

At 24 to 40 px the fitted eyes read too small. `eyeScale` (CHOSEN, 1 by default) grows
the face for that, and only in the layer: the engine is not touched. Three ways were tried:

- each eye scaled about its own centre: the outer eye went through the rim of narrow
  shapes (`squircle`, `carre`, `capsule`);
- each eye pulled inwards on its own: the two eyes merged;
- **the whole face scaled about its outermost point** along the body centre → face
  direction (`faceGrowth`): sizes AND spacing grow by `k`, and the edge nearest the rim
  stays where it was. That is the one kept.

`faceGrowth` reads the eye matrices every frame, but it is not a solver: it is a maximum of
continuous functions of the pose, so it moves as smoothly as the eyes do — none of the
trembling `eyefit.ts` was built to avoid. The extent of an eye comes from the engine's `w`,
`h`, not from the pad, whose image carries large transparent margins. `wide` already
overflows the short bodies (Yoshi, Cloe, Vita) at 1, and more so above it. About 1.3 suits
a sidebar avatar.

`paused` is for an avatar that animates only on hover. Swapping a `frozenAt` bot for a live
one jumps: the frozen instant and the live clock show two different poses. With `paused`
the instance stays, its loop stops once the engine is `quiet` and no layer `hold` is pending,
and it resumes with a `dt` of zero, from the pose it held. A change made while paused (a
state, a face, a body transition) plays to its end and then stops. `PlushBot` holds for its
own decorations: the body transition, the shake of `failed`, the emergence of dots and z's.

## Tint

A grey body is luminance only, its interior median brought to `GRIS` (0.55) when it was
fitted. `tintRamp(hex)` maps each grey level to a colour, in linear light: the requested
colour scaled by the level's distance from the median (`gamma`), and a little white above
it for the lit fibres (`sheen`). The curve was fitted on the baked characters (Nexo,
Malu, Yoshi, Vita, Fred), each grey shape tinted with its character's ink and compared quantile by
quantile with the baked body. The median stays the requested colour: an exposure factor
fitted a little better, but only because Malu's baked body is darker than its ink, which
is a property of that one generation (Yoshi's is lighter than its own).

The ramp is applied **once per (image, colour)** on a canvas and kept as a `data:` URL.
Nothing runs in the render loop, which already costs a layout and a paint per frame.
It is a `data:` URL and not an object URL because a Content Security Policy that allows
`img-src 'self' data:` blocks `blob:`, and the body then stays empty. The encoding still
goes through the asynchronous `toBlob` (then a `FileReader`): `toDataURL` would encode
on the main thread.
That is browser-only: on the server, a grey shape renders without a body until the client
tints it.

The default colour of each shape (`SHAPE_INKS`) is the median of its generated body's
interior, before it was normalised to grey (`biblioteka.json`). Tinting a shape with its own
ink gives back roughly the generated body.

## Images

Each image is its own file, referenced by a literal
`new URL('./assets/x.webp', import.meta.url)` in `src/plush/assets.ts` (generated by
`tools/peluche/assets.ts`). A consumer's bundler emits them with the package and only the
bots in use are fetched. `assetBase` overrides the location (a CDN, `public/`).

Vite's library mode would inline every image as base64 (1.7 MB in `plush.js`), so the
URLs carry `@vite-ignore` in the source; `vite.lib.config.ts` strips that comment from
the output, otherwise the consumer's bundler would ignore the URLs too, and copies the
images to `dist/package/assets/`. `bun run pack:check` builds a consumer that imports the
plush and checks the images it emits, and checks that the main entry carries none of it.

The eye pads are lit by `tools/peluche/fit/relief.py`; `fit/matiere.py` turns them into
felt capsules, two per eye, 1.0 MB for the 24 (`tools/peluche/README.md`). A bot fetches
its own four, about 170 kB. A grey shape fetches its body, the two generic pads and the
twelve sprites.

## The gallery

`/felt.html` under `bun run dev` shows every character and every shape, with switchers for
state, expression and colour (`feutre`, the default, is the shape's own ink). `#parcours` plays a sequence that includes changes 0.25 s
apart, to watch interrupted fades; `#fige&t=2.5` freezes one instant, and
`window.__instant(t)` steps it for frame captures.
