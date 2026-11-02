import { Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, untrack } from 'solid-js'
import BloubBot, { type BotLayerContext } from '@/components/BloubBot'
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID, type BotExpression } from '@/bot/expressions'
import { DEMI_VIEWBOX } from '@/bot/repere'
import { COLOR_BY_ID, SHAPE_BY_ID } from '@/bot/skins'
import type { Block } from '@/bot/cycles'
import { ASSET_URLS } from '@/plush/assets'
import {
  GENERIC_PAD,
  PLUSH_CHARACTER_BY_ID,
  shapeBody,
  type PlushCharacterId,
  type PlushPad,
  type PlushShapeId
} from '@/plush/catalogue'
import PlushLayer from '@/plush/layer'
import { NO_DOTS } from '@/plush/motion'
import { tinted } from '@/plush/tint'
import { rayonsWarp, rendu, type Technique } from './techniques'
import { COTE_VIEWBOX, creeWarp, type Warp } from './warp'

/** ce que la galerie demande : une forme grise dans une couleur, ou un personnage */
export type Cible = { forme: PlushShapeId; couleur: string } | { perso: PlushCharacterId }

/** une cible resolue : ce qu'il faut au moteur et au rendu */
interface Corps {
  url: string
  shape: string
  radii: readonly number[]
  pads: readonly [PlushPad, PlushPad]
  face: BotExpression
}

const NEUTRE = EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION)!
const CYCLE: Block[] = [{ state: 'idle', duration: 2.4 }]

async function resous(cible: Cible): Promise<Corps> {
  if ('perso' in cible) {
    const c = PLUSH_CHARACTER_BY_ID.get(cible.perso)!
    return { url: ASSET_URLS[c.body]!, shape: c.shape, radii: SHAPE_BY_ID.get(c.shape)!.radii, pads: c.pads, face: c.face }
  }
  const hex = COLOR_BY_ID.get(cible.couleur)?.hex ?? cible.couleur
  return {
    url: await tinted(ASSET_URLS[shapeBody(cible.forme)]!, hex),
    shape: cible.forme,
    radii: SHAPE_BY_ID.get(cible.forme)!.radii,
    pads: [GENERIC_PAD, GENERIC_PAD],
    face: NEUTRE
  }
}

interface Passage {
  avant: Corps
  apres: Corps
  /** horloge du bot au changement */
  debut: number
}

/**
 * Une peluche de galerie qui change de forme avec une des techniques de `techniques.ts`.
 * Elle compose les pieces du paquet (`BloubBot`, `PlushLayer` pour les yeux, `tinted`)
 * sans y toucher : le corps est dessine ici, les yeux par la couche du paquet.
 */
export default function MorphBot(props: { technique: Technique; cible: Cible; size: number; initialPhase?: number }) {
  const [passage, setPassage] = createSignal<Passage | null>(null)
  /** cote du passage que le moteur montre : il y place les yeux et le visage */
  const [bascule, setBascule] = createSignal(true)
  let horloge: (() => number) | null = null
  let vivant = true
  onCleanup(() => {
    vivant = false
  })

  // une nouvelle cible : on attend son corps (la teinte est asynchrone), puis on date le passage
  let jeton = 0
  createEffect(
    () => props.cible,
    (cible) => {
      const n = ++jeton
      void resous(cible).then((apres) => {
        if (!vivant || n !== jeton) return
        const avant = untrack(passage)?.apres ?? apres
        const debut = horloge ? horloge() : -Infinity
        setPassage({ avant, apres, debut })
        setBascule(rendu(untrack(() => props.technique), 0).bascule)
      })
    }
  )

  const moteur = () => {
    const p = passage()
    return p ? (bascule() ? p.apres : p.avant) : null
  }

  return (
    <Show when={moteur()}>
      {(m) => (
        <BloubBot
          size={props.size}
          shape={m().shape}
          expression={m().face}
          state="idle"
          cycle={CYCLE}
          initialPhase={props.initialPhase}
          ariaLabel="peluche (essai de transition)"
          layer={(ctx) => {
            horloge = ctx.clock
            return (
              <Couche
                ctx={ctx}
                technique={props.technique}
                passage={passage()!}
                pads={m().pads}
                size={props.size}
                onBascule={setBascule}
              />
            )
          }}
        />
      )}
    </Show>
  )
}

function Couche(props: {
  ctx: BotLayerContext
  technique: Technique
  passage: Passage
  pads: readonly [PlushPad, PlushPad]
  size: number
  onBascule: (b: boolean) => void
}) {
  const uid = createUniqueId()
  // l'image courante : relue a chaque image du bot (le signal `frame`)
  const r = createMemo(() => {
    props.ctx.frame()
    return rendu(props.technique, props.ctx.clock() - props.passage.debut)
  })
  createEffect(
    () => r().bascule,
    (b) => {
      props.onBascule(b)
    }
  )

  /* --- warp : un canvas WebGL, dessine seulement pendant le morph --- */
  let canvas: HTMLCanvasElement | undefined
  let warp: Warp | null = null
  const [pret, setPret] = createSignal(false)
  onCleanup(() => warp?.detruit())
  const veutWarp = () => props.technique === 'warp' && r().corps === 'deux'
  createEffect(
    () => (props.technique === 'warp' ? props.passage : null),
    (p) => {
      if (!p || !canvas) return
      warp ??= creeWarp(canvas)
      if (!warp) return
      setPret(false)
      void warp.corps(p.avant.url, p.apres.url).then(() => setPret(true))
    }
  )
  // tout se lit dans le calcul (suivi) ; l'effet ne fait que dessiner
  createEffect(
    () => {
      if (!veutWarp() || !pret()) return null
      const p = props.passage
      const s = props.ctx.clock() - p.debut
      return { p, s, melange: r().melange }
    },
    (image) => {
      if (!image || !warp) return
      const { p, s, melange } = image
      warp.dessine(p.avant.radii, p.apres.radii, rayonsWarp(p.avant.radii, p.apres.radii, s), melange)
    }
  )

  /* --- dissolve : un bruit fixe, seuille par le melange --- */
  // bande douce du seuil, en fraction du bruit normalise
  const BANDE = 0.12
  const seuil = (inverse: boolean) => {
    const k = r().melange
    // bruit fractal ~ [0.3, 0.7] ramene a [0, 1] : m = n / 0.4 - 0.75
    const pente = -1 / (0.4 * BANDE)
    const origine = (k * (1 + BANDE) + 0.75) / BANDE
    return inverse ? { pente: -pente, origine: 1 - origine } : { pente, origine }
  }

  const image = (url: string, masque?: string) => (
    <image
      href={url}
      x={-DEMI_VIEWBOX}
      y={-DEMI_VIEWBOX}
      width={COTE_VIEWBOX}
      height={COTE_VIEWBOX}
      mask={masque ? `url(#${masque})` : undefined}
    />
  )
  const filtre = (id: string, inverse: boolean) => (
    <filter
      id={id}
      filterUnits="userSpaceOnUse"
      primitiveUnits="userSpaceOnUse"
      x={-DEMI_VIEWBOX}
      y={-DEMI_VIEWBOX}
      width={COTE_VIEWBOX}
      height={COTE_VIEWBOX}
      color-interpolation-filters="sRGB"
    >
      <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves={4} seed={7} />
      <feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" />
      <feComponentTransfer>
        <feFuncR type="linear" slope={seuil(inverse).pente} intercept={seuil(inverse).origine} />
        <feFuncG type="linear" slope={seuil(inverse).pente} intercept={seuil(inverse).origine} />
        <feFuncB type="linear" slope={seuil(inverse).pente} intercept={seuil(inverse).origine} />
      </feComponentTransfer>
    </filter>
  )
  const masque = (id: string, filtreId: string) => (
    <mask id={id} maskUnits="userSpaceOnUse" x={-DEMI_VIEWBOX} y={-DEMI_VIEWBOX} width={COTE_VIEWBOX} height={COTE_VIEWBOX}>
      <rect x={-DEMI_VIEWBOX} y={-DEMI_VIEWBOX} width={COTE_VIEWBOX} height={COTE_VIEWBOX} filter={`url(#${filtreId})`} />
    </mask>
  )

  return (
    <g transform={`scale(${r().sx},${r().sy})`}>
      {/* warp : le canvas, cache hors du morph (et tant que les textures chargent) */}
      <Show when={props.technique === 'warp'}>
        <foreignObject
          x={-DEMI_VIEWBOX}
          y={-DEMI_VIEWBOX}
          width={COTE_VIEWBOX}
          height={COTE_VIEWBOX}
          style={{ display: veutWarp() && pret() ? 'inline' : 'none' }}
        >
          <canvas
            ref={canvas}
            width={Math.round(props.size * (globalThis.devicePixelRatio || 1))}
            height={Math.round(props.size * (globalThis.devicePixelRatio || 1))}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </foreignObject>
      </Show>

      <Show when={!(veutWarp() && pret())}>
        <Show
          when={r().corps === 'deux' && props.technique === 'dissolve'}
          fallback={image(r().corps === 'avant' ? props.passage.avant.url : props.passage.apres.url)}
        >
          <defs>
            {filtre(`${uid}-fa`, true)}
            {filtre(`${uid}-fb`, false)}
            {masque(`${uid}-ma`, `${uid}-fa`)}
            {masque(`${uid}-mb`, `${uid}-fb`)}
          </defs>
          {image(props.passage.avant.url, `${uid}-ma`)}
          {image(props.passage.apres.url, `${uid}-mb`)}
        </Show>
      </Show>

      <PlushLayer
        context={props.ctx}
        body={null}
        pads={props.pads}
        padHref={(f) => ASSET_URLS[f] ?? ''}
        dot={null}
        notif={null}
        dots={NO_DOTS}
      />
    </g>
  )
}
