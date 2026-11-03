import { For, Show, createEffect, createMemo } from 'solid-js'
import type { BotLayerContext } from '../components/BloubBot.js'
import { RAYON } from '../bot/repere.js'
import PlushBody, { type PlushPassage } from './body.js'
import type { PlushPad } from './catalogue.js'
import { padExtent, padPieces, type PadPiece } from './slices.js'
import { dotsVisibility, faceGrowth, lidMask, matrixOf, restCapsule, unsquash, padFadeLevel, sleepZs, thinkingDots, type DotsTrack, type PadFade } from './motion.js'
import { REPOS_APRES, rendu, type PlushTransition, type Rendu } from './transition.js'
import { held } from '../solid-compat.js'

/** la boule occupe 80 % de son image (`forme.py --boule`) */
const BOULE = 0.8
/** epaisseur du trait d'un « z », en fraction de son cote */
const Z_TRAIT = 0.24
const r1 = (v: number) => Math.round(v * 10) / 10
/** la couture d'un oeil ferme : fil sombre, creux et epaisseur en fraction de la largeur de l'oeil */
const COUTURE = '#1c1a1d'
const COUTURE_CREUX = 0.42
const COUTURE_TRAIT = 0.2
const PLUS = 'mix-blend-mode:plus-lighter'
const ISOLE = 'isolation:isolate'

export interface PlushLayerProps {
  context: BotLayerContext
  /** le corps, ou le passage d'un corps a l'autre ; une image nulle n'est pas encore prete */
  passage: PlushPassage
  transition: PlushTransition
  /** un bot fige n'a pas d'horloge qui avance : il montre le nouveau corps, au repos */
  frozen?: boolean
  /** l'etape de la transition, a chaque changement : le moteur suit `bascule` */
  onStep?: (step: Pick<Rendu, 'bascule' | 'fini'>) => void
  size?: number
  pads: readonly [PlushPad, PlushPad]
  /** l'echelle des yeux, dans le repere de l'oeil (cf. `eyeScale` de `PlushBot`) */
  eyeScale?: number
  /** les patins d'avant, en fondu sous les courants (entree et sortie de `failed`) */
  padFade?: PadFade
  padHref: (file: string) => string
  /** la boule teinte a la couleur du bot (points de reflexion) et au bleu de la pastille */
  dot: string | null
  notif: string | null
  dots: DotsTrack
  /** les « z » de `asleep` */
  zs: DotsTrack
}

/**
 * Le rendu peluche, branche dans `BloubBot` par `layer`. Le corps est une image FIXE :
 * il ne respire pas, ne se deforme pas. Seuls les yeux bougent, poses par les matrices
 * du moteur — c'est la peluche qui a ete validee, celle « qui ne bouge que des yeux ».
 * La seule exception est le changement de corps (`transition.ts`), qui emporte les yeux
 * avec lui.
 */
export default function PlushLayer(props: PlushLayerProps) {
  const frame = () => props.context.frame()

  // l'etape de la transition, relue a chaque image du bot
  const etape = createMemo<Rendu>(() => {
    frame()
    if (props.frozen) return REPOS_APRES
    return rendu(props.transition, props.context.clock() - props.passage.debut)
  })
  createEffect(
    () => {
      const { bascule, fini } = etape()
      return `${bascule}|${fini}`
    },
    (clef) => {
      const [bascule, fini] = clef.split('|')
      props.onStep?.({ bascule: bascule === 'true', fini: fini === 'true' })
    }
  )
  // au repos, pas d'attribut : une chaine identique a chaque image ne coute rien, mais aucune non plus
  const echelle = () => {
    const { sx, sy } = etape()
    return sx === 1 && sy === 1 ? undefined : `scale(${sx},${sy})`
  }

  const dots = createMemo(() => {
    frame()
    return thinkingDots(props.dots, props.context.time())
  })
  const zs = createMemo(() => {
    frame()
    return sleepZs(props.zs, props.context.time())
  })
  const fondu = createMemo(() => {
    frame()
    return props.padFade ? padFadeLevel(props.padFade, props.context.clock()) : 1
  })
  // le sommeil : les patins s'effacent, les coutures des yeux fermes apparaissent
  const sommeil = createMemo(() => {
    frame()
    return dotsVisibility(props.zs, props.context.time())
  })

  // agrandi, le visage grandit depuis son bord exterieur (`faceGrowth`) : le deplacement de chaque oeil
  const recul = createMemo(() => {
    const k = props.eyeScale ?? 1
    if (k === 1) return null
    return faceGrowth(
      frame().eyes.map((eye, i) => {
        const pad = props.pads[i] ?? props.pads[0]
        const m = matrixOf(eye.matrix)
        m[4] = (m[4] ?? 0) + pad.dx * RAYON
        m[5] = (m[5] ?? 0) + pad.dy * RAYON
        return { m, w: eye.w, h: eye.h }
      }),
      k
    )
  })
  // a 1, rien : la chaine de la matrice reste celle d'avant
  const echelleOeil = () => (props.eyeScale && props.eyeScale !== 1 ? ` scale(${props.eyeScale})` : '')

  /*
   * Le corps teint arrive apres coup (`tinted` : chargement, toile, encodage), et jamais dans un
   * rendu serveur. Tant qu'aucun corps n'est pret, la peluche entiere reste cachee : des yeux,
   * des points ou des « z » seuls sur le fond ne sont pas un avatar. Une transition ne part que
   * d'un corps pret, donc seul le tout premier corps peut manquer.
   */
  const sansCorps = () => props.passage.apres.url === null

  return (
    <g visibility={sansCorps() ? 'hidden' : undefined}>
      <g opacity={frame().bodyAlpha} transform={echelle()}>
        <PlushBody
          passage={props.passage}
          transition={props.transition}
          rendu={etape}
          clock={props.context.clock}
          size={props.size}
        />
        {/*
         * Le patin suit la gelule : des morceaux d'une gelule de feutre, a l'echelle de son
         * petit cote (`slices.ts`), jamais etiree. Il est pose dans le repere de l'oeil (inclinaison,
         * raccourci), comme le trou du masque en plat ; un clignement ne l'ecrase pas, des
         * paupieres de fourrure se ferment dessus (`lidMask`). Mi-clos au repos (`somnolent`), il
         * est une gelule plus courte (`restCapsule`).
         */}
        <For each={frame().eyes} keyed={false}>
          {(eye, i) => {
            const pad = () => props.pads[i] ?? props.pads[0]
            // le patin d'avant, tant qu'il est un autre et que le fondu court
            const ancien = () => {
              const from = props.padFade?.from
              const p = from?.[i] ?? from?.[0]
              return p && p.file !== pad().file && fondu() < 1 ? p : null
            }
            const m = createMemo(() => matrixOf(eye().matrix))
            // la gelule dessinee : celle de l'oeil, raccourcie sur une expression mi-close (`somnolent`)
            const taille = createMemo(() => restCapsule(m(), eye().open, eye().rest, eye().w, eye().h))
            const morceaux = createMemo(() => padPieces(pad(), taille().w, taille().h))
            const correction = createMemo(() => unsquash(m(), eye().open))
            // les paupieres : seulement pendant un clignement
            const paupiere = createMemo(() => {
              const gelule = { x: taille().w / 2, y: taille().h / 2 }
              return lidMask(m(), eye().open, eye().rest, gelule, padExtent(morceaux()))
            })
            const id = `${props.context.uid}-paupiere-${i}`
            // le centre de l'oeil dans le groupe : le decalage du patin et le recul du visage agrandi
            const ox = () => pad().dx * RAYON + (recul()?.[i]?.x ?? 0)
            const oy = () => pad().dy * RAYON + (recul()?.[i]?.y ?? 0)
            // des accesseurs : les noeuds restent les memes d'une image a l'autre, seuls leurs attributs suivent
            const patin = (p: () => PlushPad, pieces: () => PadPiece[], opacite: () => number) => {
              // plusieurs morceaux, bord a bord : ils s'ADDITIONNENT (`plus-lighter`) dans un groupe
              // isole, leurs couvertures antialiasees se completent a 1. « Par-dessus », ils
              // laissaient un liseré du corps a chaque coupe.
              const coupe = () => pieces().length > 1
              return (
                <g
                  opacity={opacite() < 1 ? opacite() : undefined}
                  transform={correction()}
                  style={coupe() ? ISOLE : undefined}
                >
                  <For each={pieces()} keyed={false}>
                    {(m) => (
                      <svg
                        x={m().x}
                        y={m().y}
                        width={m().w}
                        height={m().h}
                        viewBox={m().viewBox}
                        preserveAspectRatio="none"
                        style={coupe() ? PLUS : undefined}
                      >
                        <image href={props.padHref(p().images[m().src])} width="1" height="1" preserveAspectRatio="none" />
                      </svg>
                    )}
                  </For>
                </g>
              )
            }
            const transform = () => `translate(${ox()},${oy()}) ${eye().matrix}${echelleOeil()}`
            return (
              <>
                <Show when={sommeil() < 1}>
                  <g mask={paupiere() ? `url(#${id})` : undefined}>
                    {/*
                     * l'ouverture entre les paupieres : la gelule, posee comme le patin, puis ecrasee
                     * verticalement a l'ecran autour du centre de l'oeil. Un `scale(1,0)` ne peint rien.
                     */}
                    <Show when={paupiere()}>
                      {(paupiereVisible) => {
                        const l = held(paupiereVisible)
                        const cx = () => ox() + l().x
                        const cy = () => oy() + l().y
                        return (
                          <mask id={id}>
                            <g transform={`translate(${cx()},${cy()}) scale(1,${l().s}) translate(${-cx()},${-cy()})`}>
                              <g transform={transform()}>
                                <g transform={correction()}>
                                  <For each={l().bands} keyed={false}>
                                    {(b) => (
                                      <rect
                                        x={-b().w}
                                        y={-b().h}
                                        width={2 * b().w}
                                        height={2 * b().h}
                                        rx={b().r}
                                        fill="#fff"
                                        fill-opacity={b().alpha}
                                      />
                                    )}
                                  </For>
                                </g>
                              </g>
                            </g>
                          </mask>
                        )
                      }}
                    </Show>
                    <g transform={transform()} opacity={eye().alpha}>
                      <Show when={ancien()}>
                        {(ancienVisible) => {
                          const p = held(ancienVisible)
                          const pieces = createMemo(() => padPieces(p(), taille().w, taille().h))
                          return patin(p, pieces, () => (1 - sommeil()) * (1 - fondu()))
                        }}
                      </Show>
                      {patin(pad, morceaux, () => (1 - sommeil()) * (ancien() ? fondu() : 1))}
                    </g>
                  </g>
                </Show>
                {/* l'oeil ferme : une couture en arc, creux vers le bas, dans le repere de l'oeil */}
                <Show when={sommeil() > 0}>
                  <g transform={transform()} opacity={eye().alpha}>
                    <path
                      d={`M${r1(-eye().w / 2)},0Q0,${r1(eye().w * COUTURE_CREUX)} ${r1(eye().w / 2)},0`}
                      fill="none"
                      stroke={COUTURE}
                      stroke-width={r1(eye().w * COUTURE_TRAIT)}
                      stroke-linecap="round"
                      opacity={sommeil()}
                    />
                  </g>
                </Show>
              </>
            )
          }}
        </For>
      </g>

      <Show when={props.dot}>
        {(href) => (
          <For each={dots()} keyed={false}>
            {(dot) => (
              <image
                href={href()}
                x={(dot().x - dot().r / BOULE) * RAYON}
                y={(dot().y - dot().r / BOULE) * RAYON}
                width={((2 * dot().r) / BOULE) * RAYON}
                height={((2 * dot().r) / BOULE) * RAYON}
                opacity={dot().opacity}
              />
            )}
          </For>
        )}
      </Show>

      {/* un trait d'encre a bouts ronds, comme une couture ; en unites du viewBox */}
      <For each={zs()} keyed={false}>
        {(z) => {
          const d = () => {
            const { x, y, size } = z()
            const h = (size * RAYON) / 2
            const cx = x * RAYON
            const cy = y * RAYON
            return `M${r1(cx - h)},${r1(cy - h)}H${r1(cx + h)}L${r1(cx - h)},${r1(cy + h)}H${r1(cx + h)}`
          }
          return (
            <path
              d={d()}
              fill="none"
              stroke={props.context.ink()}
              stroke-width={r1(z().size * RAYON * Z_TRAIT)}
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity={z().opacity}
            />
          )
        }}
      </For>

      <Show when={props.notif ? frame().notif : null}>
        {(notifVisible) => {
          const notif = held(notifVisible)
          return (
            <image
              href={props.notif!}
              x={notif().x - notif().r / BOULE}
              y={notif().y - notif().r / BOULE}
              width={(2 * notif().r) / BOULE}
              height={(2 * notif().r) / BOULE}
            />
          )
        }}
      </Show>
    </g>
  )
}
