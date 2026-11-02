import { For, Show, createMemo } from 'solid-js'
import type { BotLayerContext } from '../components/BloubBot.js'
import { DEMI_VIEWBOX, RAYON } from '../bot/repere.js'
import type { PlushPad } from './catalogue.js'
import { thinkingDots, type DotsTrack } from './motion.js'

/** la boule occupe 80 % de son image (`forme.py --boule`) */
const BOULE = 0.8

export interface PlushLayerProps {
  context: BotLayerContext
  /** l'image du corps, deja teinte ; rien tant qu'elle n'est pas prete */
  body: string | null
  pads: readonly [PlushPad, PlushPad]
  padHref: (file: string) => string
  /** la boule teinte a la couleur du bot (points de reflexion) et au bleu de la pastille */
  dot: string | null
  notif: string | null
  dots: DotsTrack
}

/**
 * Le rendu peluche, branche dans `BloubBot` par `layer`. Le corps est une image FIXE :
 * il ne respire pas, ne se deforme pas. Seuls les yeux bougent, poses par les matrices
 * du moteur — c'est la peluche qui a ete validee, celle « qui ne bouge que des yeux ».
 */
export default function PlushLayer(props: PlushLayerProps) {
  const frame = () => props.context.frame()

  const dots = createMemo(() => {
    frame()
    return thinkingDots(props.dots, props.context.time())
  })

  return (
    <>
      <g opacity={frame().bodyAlpha}>
        <Show when={props.body}>
          {(href) => (
            <image
              href={href()}
              x={-DEMI_VIEWBOX}
              y={-DEMI_VIEWBOX}
              width={DEMI_VIEWBOX * 2}
              height={DEMI_VIEWBOX * 2}
            />
          )}
        </Show>
        {/*
         * Le patin suit la gelule : sa taille est celle de l'oeil courant fois le rapport
         * releve sur le visage de reference. Il est pose dans le repere de l'oeil
         * (inclinaison, raccourci, clignement compris), comme le trou du masque en plat.
         */}
        <For each={frame().eyes} keyed={false}>
          {(eye, i) => {
            const pad = () => props.pads[i] ?? props.pads[0]
            return (
              <g
                transform={`translate(${pad().dx * RAYON},${pad().dy * RAYON}) ${eye().matrix}`}
                opacity={eye().alpha}
              >
                <image
                  href={props.padHref(pad().file)}
                  x={(-pad().kw * eye().w) / 2}
                  y={(-pad().kh * eye().h) / 2}
                  width={pad().kw * eye().w}
                  height={pad().kh * eye().h}
                  preserveAspectRatio="none"
                />
              </g>
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

      <Show when={props.notif ? frame().notif : null}>
        {(notif) => (
          <image
            href={props.notif!}
            x={notif().x - notif().r / BOULE}
            y={notif().y - notif().r / BOULE}
            width={(2 * notif().r) / BOULE}
            height={(2 * notif().r) / BOULE}
          />
        )}
      </Show>
    </>
  )
}
