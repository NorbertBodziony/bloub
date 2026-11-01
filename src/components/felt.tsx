import { DEMI_VIEWBOX, RAYON } from '../bot/repere.js'

/**
 * Matiere « feutrine » : un essai, pas une mesure. Rien ici ne vient de la video
 * de reference — c'est une couche de rendu posee sur le corps, que le moteur
 * ignore. `material="flat"` (le defaut) ne rend rien de ce fichier.
 *
 * Deux variantes, pour comparer d'ou viennent les fibres :
 * - `felt` : un bruit `feTurbulence` dans la carte de relief ;
 * - `felt-texture` : une tuile de fibres peinte une fois sur un canvas, posee en
 *   motif sur l'encre. Le bord, le bombe, la lumiere et l'ombre sont communs.
 *
 * Tout est regle en PIXELS D'ECRAN puis converti en unites du viewBox : un avatar
 * de 46 px garde un bord duveteux d'un pixel, au lieu d'un dixieme invisible.
 */
/** `felt-gl` est dessinee par `feltgl.ts`, pas par ce filtre. */
export type Material = 'flat' | 'felt' | 'felt-texture' | 'felt-gl'
export type FiltreFeutre = 'felt' | 'felt-texture'

/** Cote de la tuile de fibres, en pixels d'ecran. */
const TUILE_PX = 96
/** Resolution du canvas : deux pixels par pixel d'ecran, pour les ecrans denses. */
const TUILE_DENSITE = 2

export interface FeltDefsProps {
  id: string
  size: number
  kind: FiltreFeutre
}

/** Unites du viewBox par pixel d'ecran. */
export const unitesParPixel = (size: number) => (DEMI_VIEWBOX * 2) / Math.max(1, size)

export function FeltDefs(props: FeltDefsProps) {
  const k = () => unitesParPixel(props.size)
  /*
   * La lumiere calcule ses normales par pixel du filtre : une meme pente en unites
   * du viewBox donne un relief deux fois plus plat a deux fois la taille. D'ou un
   * `surfaceScale` en 1/k, et une amplitude de fibres en k pour que leur relief a
   * l'ecran ne depende pas de la taille.
   */
  const relief = () => 70 / k()
  const fibres = () => (props.kind === 'felt' ? 0.012 * k() : 0)
  // grain de couleur : la laine est mouchetee plus que bosselee
  const moucheture = () => (props.kind === 'felt' ? 0.45 : 0)

  return (
    <filter
      id={props.id}
      x="-20%"
      y="-20%"
      width="140%"
      height="140%"
      color-interpolation-filters="sRGB"
    >
      {/* 1. bord duveteux : le contour deplace par un bruit fin */}
      <feTurbulence type="fractalNoise" baseFrequency={1 / (1.1 * k())} numOctaves={2} seed={2} result="duvet" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="duvet"
        scale={2.4 * k()}
        xChannelSelector="R"
        yChannelSelector="G"
        result="flou"
      />

      {/* 2. bombe : l'alpha tres floute sert de carte de hauteur, sans plateau au centre */}
      <feGaussianBlur in="SourceAlpha" stdDeviation={0.45 * RAYON} result="dome" />

      {/* 3. fibres dans le relief et dans la couleur (variante filtre seulement) */}
      <feTurbulence type="fractalNoise" baseFrequency={1 / (0.7 * k())} numOctaves={3} seed={7} result="grain" />
      <feComposite in="dome" in2="grain" operator="arithmetic" k1={0} k2={1} k3={fibres()} k4={0} result="hauteur" />
      <feColorMatrix
        in="grain"
        type="matrix"
        values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"
        result="grainGris"
      />
      <feComposite
        in="flou"
        in2="grainGris"
        operator="arithmetic"
        k1={moucheture()}
        k2={1 - moucheture() / 2}
        k3={0}
        k4={0}
        result="mouchete"
      />

      {/* 4. lumiere : diffuse multipliee sur la couleur, plus un lustre tres large */}
      <feDiffuseLighting in="hauteur" surfaceScale={relief()} diffuseConstant={1} lighting-color="#fff" result="lumiere">
        <feDistantLight azimuth={225} elevation={50} />
      </feDiffuseLighting>
      <feComposite in="mouchete" in2="lumiere" operator="arithmetic" k1={1.15} k2={0} k3={0} k4={0} result="eclaire" />

      {/* le pourtour s'assombrit, comme une boule de laine */}
      <feColorMatrix
        in="dome"
        type="matrix"
        values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1"
        result="domeGris"
      />
      <feComposite in="eclaire" in2="domeGris" operator="arithmetic" k1={0.5} k2={0.6} k3={0} k4={0} result="ombre" />

      <feSpecularLighting
        in="hauteur"
        surfaceScale={String(relief())}
        specularConstant="0.12"
        specularExponent="5"
        lighting-color="#fff"
        result="reflet"
      >
        <feDistantLight azimuth={225} elevation={60} />
      </feSpecularLighting>
      <feComposite in="ombre" in2="reflet" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} result="matiere" />
      <feComposite in="matiere" in2="flou" operator="in" result="corps" />

      {/* 5. frange : des poils isoles qui depassent du contour, dans la couleur du bord */}
      <feGaussianBlur in="ombre" stdDeviation={1.4 * k()} result="halo" />
      <feTurbulence type="fractalNoise" baseFrequency={1 / (0.55 * k())} numOctaves={2} seed={11} result="poils" />
      <feColorMatrix
        in="poils"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  5 0 0 0 -2.2"
        result="poilsMasque"
      />
      <feComposite in="halo" in2="poilsMasque" operator="in" result="frange" />

      {/* 6. ombre portee douce sous le corps */}
      <feGaussianBlur in="flou" stdDeviation={0.1 * RAYON} result="tache" />
      <feOffset in="tache" dx={0} dy={0.08 * RAYON} result="tacheBas" />
      <feFlood flood-color="#000" flood-opacity={0.45} />
      <feComposite in2="tacheBas" operator="in" result="portee" />

      <feMerge>
        <feMergeNode in="portee" />
        <feMergeNode in="frange" />
        <feMergeNode in="corps" />
      </feMerge>
    </filter>
  )
}

export interface FeltPatternProps {
  id: string
  size: number
  href: string
}

/** Le motif de fibres de la variante `felt-texture`, en coordonnees du viewBox. */
export function FeltPattern(props: FeltPatternProps) {
  const cote = () => TUILE_PX * unitesParPixel(props.size)
  return (
    <pattern id={props.id} patternUnits="userSpaceOnUse" width={cote()} height={cote()}>
      <image href={props.href} width={cote()} height={cote()} preserveAspectRatio="none" />
    </pattern>
  )
}

let tuile: string | null = null

/**
 * Une tuile de fibres raccordable : des milliers de traits courts et courbes, clairs
 * et sombres, semi-transparents. Peints avec `source-over` sur un fond vide, ils
 * eclaircissent et assombrissent l'encre sans mode de fusion. Chaque trait est
 * repete aux huit decalages voisins, ce qui rend la tuile raccordable.
 * Peinte une seule fois par page ; chaine vide hors navigateur.
 */
export function feltTexture(): string {
  if (tuile !== null) return tuile
  if (typeof document === 'undefined') return ''
  const cote = TUILE_PX * TUILE_DENSITE
  const canvas = document.createElement('canvas')
  canvas.width = cote
  canvas.height = cote
  const ctx = canvas.getContext('2d')
  if (!ctx) return (tuile = '')

  // generateur deterministe : la meme tuile a chaque chargement
  let graine = 0x2f6e2b1
  const hasard = () => {
    graine = (graine * 1664525 + 1013904223) >>> 0
    return graine / 0x100000000
  }

  ctx.lineCap = 'round'
  for (let i = 0; i < 5200; i++) {
    const x = hasard() * cote
    const y = hasard() * cote
    const angle = hasard() * Math.PI * 2
    const longueur = (3 + hasard() * 9) * TUILE_DENSITE * 0.5
    const courbe = (hasard() - 0.5) * longueur * 0.9
    const clair = hasard() < 0.5
    const alpha = 0.06 + hasard() * 0.16
    ctx.strokeStyle = clair ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`
    ctx.lineWidth = (0.35 + hasard() * 0.5) * TUILE_DENSITE
    const dx = Math.cos(angle) * longueur
    const dy = Math.sin(angle) * longueur
    const cx = x + dx / 2 - Math.sin(angle) * courbe
    const cy = y + dy / 2 + Math.cos(angle) * courbe
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        ctx.beginPath()
        ctx.moveTo(x + ox * cote, y + oy * cote)
        ctx.quadraticCurveTo(cx + ox * cote, cy + oy * cote, x + dx + ox * cote, y + dy + oy * cote)
        ctx.stroke()
      }
    }
  }
  return (tuile = canvas.toDataURL('image/png'))
}
