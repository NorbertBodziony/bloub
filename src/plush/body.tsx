import { Show, createEffect, createSignal, createUniqueId, onCleanup, type Accessor } from 'solid-js'
import { DEMI_VIEWBOX } from '../bot/repere.js'
import { rayonsWarp, type PlushTransition, type Rendu } from './transition.js'
import { COTE_VIEWBOX, creeWarp } from './warp.js'

/** un corps de passage : l'image (deja teinte) et le contour que le moteur lui donne */
export interface PlushBodyView {
  url: string | null
  radii: readonly number[]
}

/** un changement de corps, date sur l'horloge du bot */
export interface PlushPassage {
  avant: PlushBodyView
  apres: PlushBodyView
  debut: number
}

export interface PlushBodyProps {
  passage: PlushPassage
  transition: PlushTransition
  rendu: Accessor<Rendu>
  /** l'instant du bot, pour les rayons du `warp` */
  clock: () => number
  /** cote du bot en px, pour la resolution du canvas du `warp` */
  size?: number
}

const image = (url: string | null, masque?: string) => (
  <Show when={url}>
    {(href) => (
      <image
        href={href()}
        x={-DEMI_VIEWBOX}
        y={-DEMI_VIEWBOX}
        width={COTE_VIEWBOX}
        height={COTE_VIEWBOX}
        mask={masque ? `url(#${masque})` : undefined}
      />
    )}
  </Show>
)

/**
 * Le corps de la peluche, au repos ou en transition. Au repos, une seule `<image>` ; le
 * canvas du `warp` et les filtres du `dissolve` ne sont montes que pendant le passage,
 * pour qu'une peluche immobile ne coute rien de plus qu'avant.
 */
export default function PlushBody(props: PlushBodyProps) {
  const enCours = () => props.rendu().corps === 'deux'
  // le `warp` dessine sur son canvas des que les textures sont la ; avant, l'image du nouveau corps
  const [warpPret, setWarpPret] = createSignal(false)
  const warp = () => props.transition === 'warp' && enCours()
  const dissolve = () => props.transition === 'dissolve' && enCours()

  return (
    <>
      <Show when={warp()}>
        <WarpCanvas {...props} onPret={setWarpPret} />
      </Show>
      <Show when={dissolve()}>
        <Dissolve passage={props.passage} melange={() => props.rendu().melange} />
      </Show>
      <Show when={!(warp() && warpPret()) && !dissolve()}>
        {image(props.rendu().corps === 'avant' ? props.passage.avant.url : props.passage.apres.url)}
      </Show>
    </>
  )
}

function WarpCanvas(props: PlushBodyProps & { onPret: (pret: boolean) => void }) {
  const [pret, setPret] = createSignal(false)
  const cote = Math.round((props.size ?? COTE_VIEWBOX) * (globalThis.devicePixelRatio || 1))
  let canvas: HTMLCanvasElement | undefined
  const warp = () => (canvas ? creeWarp(canvas) : null)
  let gl: ReturnType<typeof creeWarp> = null
  onCleanup(() => {
    gl?.detruit()
    props.onPret(false)
  })

  createEffect(
    () => props.passage,
    (p) => {
      gl ??= warp()
      const { avant, apres } = p
      if (!gl || !avant.url || !apres.url) return
      setPret(false)
      props.onPret(false)
      void gl.corps(avant.url, apres.url).then(() => {
        setPret(true)
        props.onPret(true)
      })
    }
  )
  // tout se lit dans le calcul (suivi) ; l'effet ne fait que dessiner
  createEffect(
    () => {
      if (!pret()) return null
      const p = props.passage
      return { p, s: props.clock() - p.debut, melange: props.rendu().melange }
    },
    (etape) => {
      if (!etape || !gl) return
      const { p, s, melange } = etape
      gl.dessine(p.avant.radii, p.apres.radii, rayonsWarp(p.avant.radii, p.apres.radii, s), melange)
    }
  )

  return (
    <foreignObject
      x={-DEMI_VIEWBOX}
      y={-DEMI_VIEWBOX}
      width={COTE_VIEWBOX}
      height={COTE_VIEWBOX}
      style={{ display: pret() ? 'inline' : 'none' }}
    >
      <canvas ref={canvas} width={cote} height={cote} style={{ width: '100%', height: '100%', display: 'block' }} />
    </foreignObject>
  )
}

/* --- dissolve : un bruit fixe, seuille par le melange --- */
// bande douce du seuil, en fraction du bruit normalise
const BANDE = 0.12

function Dissolve(props: { passage: PlushPassage; melange: () => number }) {
  const uid = createUniqueId()
  const seuil = (inverse: boolean) => {
    const k = props.melange()
    // bruit fractal ~ [0.3, 0.7] ramene a [0, 1] : m = n / 0.4 - 0.75
    const pente = -1 / (0.4 * BANDE)
    const origine = (k * (1 + BANDE) + 0.75) / BANDE
    return inverse ? { pente: -pente, origine: 1 - origine } : { pente, origine }
  }
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
    <>
      <defs>
        {filtre(`${uid}-fa`, true)}
        {filtre(`${uid}-fb`, false)}
        {masque(`${uid}-ma`, `${uid}-fa`)}
        {masque(`${uid}-mb`, `${uid}-fb`)}
      </defs>
      {image(props.passage.avant.url, `${uid}-ma`)}
      {image(props.passage.apres.url, `${uid}-mb`)}
    </>
  )
}
