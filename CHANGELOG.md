# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.4] — 2026-11-03

### Fixed

- The plush bodies no longer show a dark outline on a light background. The bodies were cut
  out on a dark background, so the fibres at the edge stayed dark and nearly opaque. The six
  character bodies, the grey shapes and the ball now have that edge lightened toward the
  colour of the nearest fur (`tools/peluche/fit/lisiere.py`). Alpha, the silhouettes and the
  eye pads are unchanged, and the bodies look the same on a dark background.

## [0.6.3] — 2026-11-03

### Fixed

- A `PlushBot` with a `shape` and a `color` no longer shows its eyes, dots or z's alone while
  its tinted body loads. The tint is asynchronous in the browser and never runs in a server
  render, so the first paint and the server HTML had the eyes with no body. The whole plush
  now stays hidden until its first body is ready.

## [0.6.2] — 2026-11-03

### Fixed

- A `PlushBot` or `BloubBot` that blinks, ends a pad fade, or loses its notification ball
  inside a pending Solid transition no longer throws `TypeError: Cannot read properties of
  null`. Solid keeps the old `Show` child alive until the transition commits; its effects read
  the narrowed accessor, which is already `null`. The error halted all reactivity on the page.
  These children now keep their last value.

## [0.6.1] — 2026-11-02

### Fixed

- A tinted plush body (a grey shape, the thinking dots, the notification ball) is a `data:`
  URL, no longer an object URL. A page whose Content Security Policy allows `data:` but not
  `blob:` images showed the plush with no body. The encoding stays asynchronous.

## [0.6.0] — 2026-11-02

### Added

- `PlushBot` states `asleep` and `failed`. `asleep` closes the eyes into stitched arcs,
  stops blinking and lets three z's rise from the head; `failed` lowers the gaze, tilts the
  eyes like `triste` and shakes them once, a "no" of the head. The body stays still in both.
- `PlushBot` `eyeScale`: grows the face (eyes and their spacing) from its outer edge, for
  avatars of 24 to 40 px whose eyes read too small. 1 by default, rendering unchanged.
- `BloubBot` and `PlushBot` `paused`: stops the loop on the pose on screen once it is at
  rest, plays any change made meanwhile to its end, and resumes from that same pose. An
  avatar that animates only on hover keeps one instance instead of swapping a frozen bot
  for a live one, which jumped from one pose to another.
- `BotEngine.quiet(t)`: no morph, fade or forced blink is running at `t`. `BotLayerContext`
  gains `hold(seconds)`, for a layer to keep a paused bot drawing until its own transition
  ends.
- `Look.blink` (engine): scales the blinks, 0 stops them. Absent or 1, the frame is
  byte-identical to before.

### Changed

- The plush eye pads are matte felt with a soft fibrous edge, the material of a white felt
  generation, where they were smooth domes with a sharp edge. Their shape, light, colour and
  shadow are the approved ones; the felt is scaled to each pad, so all characters match.
- A plush eye pad keeps its capsule shape on every expression and is never stretched. It
  was stretched in x and y apart to the expression's eye, which made a slab of an upright
  pad laid flat (`heureux`, `blase`) and would turn felt into streaks. Each pad is now baked
  as a felt capsule lying down and one standing up (`*-oeil<i>-x.webp`, `-y.webp`, replacing
  `*-oeil<i>.webp`), and rebuilt from pieces of one of them at one scale. The 24 images
  weigh 1.0 MB against 323 kB; a bot fetches its own four.
- A plush blink closes fur lids over the pad, which keeps its open shape, instead of
  squashing its photo into a stick. The opening is the eye's capsule, posed like the pad and
  squashed vertically on screen as the engine's measured blink squashes the eye, down to
  nothing when closed; it has a soft edge, and the mask exists only during the blink. An eye half
  closed at rest (`somnolent`) is a shorter felt capsule instead, rather than lids cutting the
  pad into a square. `RenderedEye.open` (engine) exposes the blink's squash, already composed
  in `matrix`, and `RenderedEye.rest` the expression's squash at rest.

### Fixed

- A plush eye no longer flickers mid-way through an expression change. Where it turns from
  lying to standing it swaps images, and the two had different fibres; both now carry the
  same round pad. `PlushBot` also preloads both images of each pad, so the first swap no
  longer shows an empty eye while the other loads.
- A blink on a tilted plush eye (`curieux`, `fier`) no longer cuts the pad into a blurry
  slanted rectangle. The lids cut a horizontal band on screen, which crossed a tilted pad at
  an angle; it read as a glitch on expression changes between tilted eyes.

## [0.5.0] — 2026-11-02

### Added

- `@norbert_bodziony/bloub/plush`: `PlushBot`, a felt plush bot with a still body and
  moving eyes. Six baked characters, and 11 grey shapes tinted at runtime to any colour.
  States `idle`, `wink`, `wide`, `thinking` and `notify`, with the 16 rest expressions.
  The images ship as separate files, referenced so that a consumer's bundler emits them.
- `PlushBot` `transition`: how the body changes when its shape, character or colour does.
  `flip` (default) turns it like a coin and swaps edge-on; `pop`, `warp`, `dissolve` and
  `cut` are the alternatives. The eyes travel with the body.
- Three customiser shapes: `carre`, `losange` and `pentagone`.
- `BloubBot` takes a `layer` render slot in place of the flat body and eyes, and
  `expression` accepts a full `BotExpression` as well as a catalogue id.

### Fixed

- An expression change during an expression morph blends from the face on screen. It
  restarted from the previous target and the eyes jumped up to 20 px.
- On a customiser shape, a state change during a fade blends the eye offset from its
  value on screen. It restarted from the full offset of the state being left, a jump of
  up to 7 px.

## [0.4.1] — 2026-09-26

The `v0.4.0` tag was not published: its release check failed with npm 12. 0.4.1
has the same changes, listed below.

### Fixed

- The package tarball check reads the `npm pack --json` output of npm 11 (an
  array) and of npm 12 (an object keyed by package name).

## [0.4.0] — 2026-09-26 (not published)

### Added

- `initialPhase`, the time of the cycle where the bot starts, in seconds. The
  component reads it once, on mount: the clock, the block and the pose start at
  that time. Bots mounted together with different values do not animate in step.
  A frozen bot (`frozenAt`) ignores it.
- `BotEngine.setState` takes an optional `posePhase`. It moves the pose of the new
  state forward on its own clock, and keeps the transition timing. With `0`, the
  default, the output does not change.

## [0.3.0] — 2026-09-04

### Added

- `fps`, a maximum render rate. Without it the bot draws at the screen's rate, so
  the same animation costs twice as much on a 120 Hz panel as on a 60 Hz one. The
  rendered rate falls on the largest divisor of the screen's rate that does not
  exceed `fps`, which keeps the interval even.
- `autoPause` (on by default): the loop stops when nobody can see the bot — tab in
  the background, element scrolled out of the viewport, `display: none` ancestor —
  and the clock stops with it, so the animation resumes on the pose it held
  instead of jumping. Set it to `false` if something other than `renderAt` reads
  the SVG off screen.

### Fixed

- A visible bot no longer rebuilds its SVG nodes on every frame. The engine
  returns a fresh array each frame, and the lists were matched by object
  identity, so every dot, eye, arc and gradient was destroyed and recreated once
  per frame. The lists are matched by position now, so the nodes live and only
  their attributes move. Measured on two 46 px avatars at 60 Hz: the live node
  count of the document drops from about 1300 to about 15, which is allocation
  and garbage collection that no longer happens. Frame cost itself is unchanged —
  a bot still recalculates style and lays out once per drawn frame either way,
  which is what `fps` and `autoPause` are for.

## [0.2.1] — 2026-08-20

### Changed

- The package now targets SolidJS 2, starting with `solid-js@2.0.0-rc.0` and
  `@solidjs/web@2.0.0-rc.0`.
- The application and package builds use the SolidJS 2 Vite plugin.

## [0.2.0] — 2026-08-20

### Added

- A public `@norbert_bodziony/bloub` npm package with the SolidJS avatar, complete animation engine,
  measured state transitions, cycles, catalogues, gaze helpers and TypeScript types.
- Isolated package tests for browser builds, SSR imports and the final npm tarball.

### Changed

- The application and public component now use SolidJS and Bun. The framework-free
  geometry and animation engine keeps its measured timing and paths.
- The npm archive contains only minified ESM, declarations, the README and the licence.
  The editor, video encoder, application translations, build tools and source maps stay
  outside the package.

### Fixed

- **The Settings and Animations views were unusable below 64rem.** Everything stacks
  there, but three pieces were still placed as if the three-column desktop grid were
  around them. Measured at 375 × 812: the navigation rail floated over the middle of the
  content (over the animations panel's heading, over the avatar in Settings); the
  montage bar had no background, so the palette scrolled through the track and its
  labels landed on top of the zoom slider; and the wordmark sat 812 px down the
  *document* rather than at the foot of the page, covering the credits and then drifting
  into mid-screen once scrolled.
- **The montage bar took 29 % of a phone screen** and its toolbar overflowed a 327 px
  row. It is 200 px below 64rem — still the ruler plus a card at full thumbnail size —
  the two counters flanking the play button give way to the identical pair already in
  the toolbar, and the export button keeps its icon, its label staying as the accessible
  name.

### Changed

- Below 64rem the navigation rail is a horizontal bar at the top rather than a floating
  column on the left, and the wordmark sits in the flow at the foot of the page,
  centred and cropped at the baseline. Above 64rem nothing moves.

## [0.1.1] — 2026-08-17

First batch of post-launch fixes. Every entry was reproduced and measured before being
fixed, and the measurement is in the commit that fixes it.

### Fixed

- **Playback could never get past a repeated animation.** Writing `#etat=` fired a
  `hashchange` the listener read as an incoming navigation, and the lookup returns a
  state's *first* occurrence — so a montage holding the same animation twice looped
  forever on the first one. One click in the palette was enough to trigger it.
- **Three image defects in the montage export**, none visible short of stepping through
  an MP4 frame by frame: one corrupt frame at every block joint (the eye trajectory
  jumped up to 53.4 units, now 0.6 max), the GIF opening on an eyeless ball, and a
  montage not starting on the resting animation fading in from it anyway.
- **The eyes left the silhouette on non-circular shapes.** The eye is placed by a
  pro-rata of the local body radius, which divides its margin at the edge by the same
  factor — so the capsule, triangle, cloud and teardrop pushed it through the mask.
  Five state × shape pairs let an eye out of the body, up to 14.5 units on a ball of
  radius 100; now none do.
- **A failed montage export said nothing.** The failure went to a component only
  rendered in another view, so the progress bar vanished and nothing explained why.
- **MP4 stayed selected on browsers that cannot encode it.** The option was hidden but
  the value still won, and the export failed on the spot.
- **`versMp4` leaked its encoder on failure.** Chrome caps simultaneous hardware
  encoders, so after a few failures later exports died at startup for an unrelated
  reason.
- **A forbidden `localStorage` made the page blank.** Reading the property throws a
  `SecurityError` when access is denied — blocked cookies, third-party iframe,
  enterprise policy — and that propagated out of setup. Persistence is now optional;
  the application never is.
- **A hand-edited montage could freeze the tab.** 4.65 MB of JSON, inside the storage
  budget, produced 1.5 million tick objects and a track 29 700 000 px wide.
- **A state change landing inside a fade jumped.** The blend restarted from the full
  pose of the state being left instead of the frame actually on screen: 26 to 43 px
  against the 10 to 14 px a spaced change produces.
- **Modals still slid under `prefers-reduced-motion`**, and the setting was read once at
  startup rather than followed.
- **Three popups declared `role="menu"` without the keyboard contract it promises**, so
  the Tab order did not match what was announced.

### Added

- **Continuous integration.** There was none, so a pull request checked nothing.
- **Cancelling a montage export.** Escape used to close the box while the export ran to
  completion and downloaded a file nobody was waiting for.
- **Reordering a block by keyboard** (`Alt` + arrows), the one editing gesture that had
  no keyboard route, plus arrow keys to move the playhead.
- **33 tests** (178 → 211), including the first that mounts the component to check the
  off-screen render — the export defects above were invisible to everything else.

### Changed

- `RAYON` and `DEMI_VIEWBOX` moved to `src/bot/repere.ts`. They define what the engine
  returns, so they could not stay in a `<script setup>` that exports nothing.
- `MIN_BLOCK` is derived from the longest fade in the catalogue instead of written by
  hand — it only worked because the two happened to match.

### Removed

- `StateDef.hint`: 15 hardcoded French strings nothing read, inside a type meant to
  become public.

[unreleased]: https://github.com/NorbertBodziony/bloub/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/NorbertBodziony/bloub/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/NorbertBodziony/bloub/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/NorbertBodziony/bloub/releases/tag/v0.1.1
