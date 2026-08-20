# bloub

[Live demo](https://bloub-app.pages.dev) ·
[![CI](https://github.com/NorbertBodziony/bloub/actions/workflows/ci.yml/badge.svg)](https://github.com/NorbertBodziony/bloub/actions/workflows/ci.yml)

An SVG recreation of the x.ai bot avatar: **one filled black shape** that morphs
between 14 states, **two white shapes** for the eyes that morph independently, on
a plain background. No animation library.

![The avatar going through idle, wink, orbit and burst](docs/demo.gif)

## Running it

```bash
bun install
bun run dev
```

Then open http://localhost:5190.

```bash
bun run test     # Vitest
bun run build    # strict type check, demo build, and package build
```

SolidJS, Vite, TypeScript, Tailwind 4, and Bun. No ESLint and no Prettier:
strict TypeScript is the source gate, so run `bun run build` before you call
something done.

## What's in it

The rail on the left switches between three views. **Customise** offers 8 body
shapes, 12 colours and 16 rest expressions, kept between visits. **Animations** is
a small editor: arrange states into a timeline, set how long each is held, save the
result. **Settings** holds the language (French, English or Chinese) and the
credits.

Anything on screen can be exported: the avatar as SVG, PNG or an animated GIF, and
a whole timeline as GIF or MP4. The still formats need no library at all, and the
video encoder is only fetched the first time you ask for one.

Two URLs are worth knowing:

- `#planche`: the 14 states side by side, frozen. Quick visual check.
- `#etat=orbit&stop`: opens one state directly, playback paused.

![The 14 states, frozen side by side](docs/states.png)

## Why the numbers look arbitrary

They're measured, not chosen. The reference video was cut at 10 fps and each
state measured off the frames: silhouettes by sub-pixel ray casting, eyes by
capsule fitting, colours and stroke widths by direct sampling.

So the constants in the code are **measurements**, and rounding them to friendlier
values breaks the resemblance, which is the only thing this project is trying to
get right. A few are counter-intuitive enough to be worth knowing before you
correct anything:

| What you'd assume | What the video shows |
|---|---|
| The eyes lean `//` | They lean `\\`, around 26° off vertical |
| The body is a squircle | It's a perfect circle, radial deviation under 0.7% |
| Transitions are springs | Exponential ease-outs; the body never overshoots |
| The comet crosses the screen | The dot stays put, the trail orbits it |
| The avatar floats at rest | It doesn't. The life is gaze drift and blinking |

[docs/measurements.md](docs/measurements.md) has the rest, including how to
regenerate the extracted profiles.

## How it's put together

`src/bot/` is framework-free and clock-free: `engine.sample(t)` is a pure
function of time. Pausing, resuming, jumping to an arbitrary date and running
tests all produce the same image, which is what makes the frozen state board and
the DOM-less test suite possible.

| | |
|---|---|
| [docs/architecture.md](docs/architecture.md) | The engine, radial-profile morphing, eyes as mask holes |
| [docs/measurements.md](docs/measurements.md) | What was measured, and regenerating `profiles.ts` |
| [docs/intro.md](docs/intro.md) | The arrival sequence, and why it only plays one state |
| [docs/interface.md](docs/interface.md) | Layout, the three-column scene, CSS traps |
| [docs/export.md](docs/export.md) | Exporting to SVG, PNG, GIF and MP4 |
| [docs/i18n.md](docs/i18n.md) | The hand-rolled translation layer |

## Using the package

```bash
npm install @norbert_bodziony/bloub solid-js@2.0.0-rc.0 @solidjs/web@2.0.0-rc.0
# or: bun add @norbert_bodziony/bloub solid-js@2.0.0-rc.0 @solidjs/web@2.0.0-rc.0
```

```tsx
import { createSignal } from 'solid-js'
import { BloubBot, defaultCycle, type BloubBotRef } from '@norbert_bodziony/bloub'

const [playing, setPlaying] = createSignal(false)
let bot: BloubBotRef | undefined

<BloubBot
  ref={(value) => (bot = value)}
  cycle={defaultCycle().blocks}
  playing={playing()}
  onPlayingChange={setPlaying}
/>
```

`block` is the playback cursor. A montage can play the same state twice, so the
index identifies the current item. `state` follows it as an output. Pass
`frozenAt` to render one exact frame with no animation loop. The component also
exports a ref with `svg`, `seek(index, offset?)`, and `renderAt(seconds)`.

The package contains the complete avatar engine, all measured state transitions,
shapes, colours, expressions, cycles, and gaze helpers. It does not contain the
editor, Tailwind, export dialogs, video encoder, or application translations.
`solid-js` and `@solidjs/web` stay peer dependencies, so an application keeps one
Solid runtime. The package supports SolidJS 2, starting with `2.0.0-rc.0`.

Props: `size`, `shape`, `color`, `expression`, `paper`, `frozenAt`, `cycle`,
`follow`, `gaze`, `ariaLabel`, `block`, `state`, `playing`, and `elapsed`. Each
playback value has a matching `on...Change` callback. See
[BloubBot.tsx](src/components/BloubBot.tsx) for the details.

## Changes

[CHANGELOG.md](CHANGELOG.md), one entry per release — which is how you tell whether the
copy you have carries a given fix.

## License

MIT. See [LICENSE](LICENSE).

Not affiliated with, endorsed by or connected to x.ai. It recreates the visual
behaviour of their bot avatar as an exercise; "Grok" and "x.ai" belong to their
owners. The MIT licence covers the code in this repository, not the design it
imitates.
