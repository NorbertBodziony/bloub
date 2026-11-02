import { createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js'
import type { JSX } from '@solidjs/web'
import BloubBot, { type BotLayerContext } from '../components/BloubBot.js'
import type { Look } from '../bot/engine.js'
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID, type BotExpression, type ExpressionId } from '../bot/expressions.js'
import { NOTIF_BLUE } from '../bot/decor.js'
import { COLOR_BY_ID, SHAPE_BY_ID } from '../bot/skins.js'
import type { Block } from '../bot/cycles.js'
import type { GazeScript } from '../ui/gaze.js'
import { ASSET_URLS } from './assets.js'
import {
  BALL,
  GENERIC_PAD,
  PLUSH_CHARACTER_BY_ID,
  shapeBody,
  type PlushCharacterId,
  type PlushPad,
  type PlushShapeId,
  type PlushState
} from './catalogue.js'
import type { PlushPassage } from './body.js'
import PlushLayer from './layer.js'
import { NO_DOTS, REST_LOOK, THINK_LOOK, dotsToggle, engineState, glide, morphOf, type DotsTrack } from './motion.js'
import { tinted } from './tint.js'
import { DEFAULT_TRANSITION, rendu as etapeA, type PlushTransition } from './transition.js'

export interface PlushBotProps {
  /** un des six personnages : corps, couleur, yeux et visage cuits. Prioritaire sur `shape`. */
  character?: PlushCharacterId
  /** une forme grise, teinte en `color` */
  shape?: PlushShapeId
  /** un id du personnaliseur ou `#rrggbb` ; ignore pour un personnage */
  color?: string
  state?: PlushState
  /**
   * Le visage au repos : un id du catalogue ou une expression complete. Sans lui, un
   * personnage garde le sien et une forme prend `neutre`. Il glisse vers le nouveau
   * visage avec la duree des morphs du moteur.
   */
  expression?: ExpressionId | BotExpression
  /**
   * Comment le corps change (forme, personnage ou couleur) : `flip` par defaut, `pop`,
   * `warp`, `dissolve` ou `cut`. Les yeux suivent le corps. Cf. `transition.ts`.
   */
  transition?: PlushTransition
  size?: number
  fps?: number
  autoPause?: boolean
  frozenAt?: number
  follow?: boolean
  initialPhase?: number
  /**
   * Ou trouver les images si le bundler ne les a pas emises avec le paquet (un CDN, un
   * dossier `public/`). Un prefixe d'URL : `${assetBase}${fichier}`.
   */
  assetBase?: string
  ariaLabel?: string
  class?: string
  style?: JSX.CSSProperties | string
}

/** le cycle d'un seul bloc : la peluche ne joue pas de montage, elle suit `state` */
const BLOC = 2.4

/**
 * Une peluche : `BloubBot` avec le rendu de feutre branche dans `layer`. Le moteur, les
 * yeux, le clignement et les transitions sont les siens ; cette enveloppe ne fait que
 * traduire les props et dater l'entree dans `thinking`.
 */
export default function PlushBot(props: PlushBotProps) {
  const character = createMemo(() => (props.character ? (PLUSH_CHARACTER_BY_ID.get(props.character) ?? null) : null))
  const href = (file: string) => (props.assetBase ? `${props.assetBase}${file}` : (ASSET_URLS[file] ?? ''))

  const ink = createMemo(() => {
    const c = character()
    if (c) return c.ink
    const color = props.color ?? 'encre'
    return COLOR_BY_ID.get(color)?.hex ?? (/^#[0-9a-f]{6}$/i.test(color) ? color : '#0a0a0c')
  })
  const shape = createMemo(() => character()?.shape ?? props.shape ?? 'cercle')
  /*
   * Jamais `null` : le moteur passe d'un visage nul a un visage sans fondu (il n'a rien
   * depuis quoi glisser), la premiere expression demandee a une forme sauterait.
   */
  const neutre = EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION)!
  const state = () => props.state ?? 'idle'
  const transition = () => props.transition ?? DEFAULT_TRANSITION

  /*
   * Le corps demande : son image, la forme que le moteur lui donne, les patins et le
   * visage propre. Il ne va au moteur qu'a travers un PASSAGE (`body.tsx`) : pendant un
   * `flip` ou un `pop`, le moteur garde l'ancienne forme jusqu'a ce que le corps change a
   * l'ecran, et les yeux restent sur le corps qu'on voit.
   */
  interface Corps {
    clef: string
    url: string | null
    shape: string
    pads: readonly [PlushPad, PlushPad]
    face: BotExpression | null
  }
  const demande = createMemo(() => {
    const c = character()
    const source = c ? { url: href(c.body), hex: null } : { url: href(shapeBody(shape() as PlushShapeId)), hex: ink() }
    return {
      clef: `${source.hex ?? ''}|${source.url}`,
      source,
      shape: shape(),
      pads: c?.pads ?? ([GENERIC_PAD, GENERIC_PAD] as const),
      face: c?.face ?? null
    }
  })
  const vers = (c: Corps) => ({ url: c.url, radii: SHAPE_BY_ID.get(c.shape)?.radii ?? [] })

  const premier: Corps = untrack(() => {
    const { source, ...d } = demande()
    return { ...d, url: null }
  })
  const [passage, setPassage] = createSignal({ avant: premier, apres: premier, debut: -Infinity })
  /** le cote du passage que le moteur montre */
  const [bascule, setBascule] = createSignal(true)
  /** un corps arrive pendant une transition : il attend qu'elle finisse, le dernier gagne */
  let attente: Corps | null = null
  let enCours = false
  let context: BotLayerContext | null = null

  function arrive(corps: Corps) {
    const p = untrack(passage)
    if (p.apres.clef === corps.clef) {
      // le meme corps, dont l'image vient d'etre prete : pas de transition
      attente = null
      setPassage({ avant: p.avant.clef === corps.clef ? corps : p.avant, apres: corps, debut: p.debut })
      return
    }
    if (enCours && untrack(transition) !== 'cut') {
      attente = corps
      return
    }
    attente = null
    const instant =
      !context || untrack(() => props.frozenAt) !== undefined || p.apres.url === null || untrack(transition) === 'cut'
    if (instant) {
      setPassage({ avant: corps, apres: corps, debut: -Infinity })
      setBascule(true)
      return
    }
    enCours = true
    setPassage({ avant: p.apres, apres: corps, debut: context!.clock() })
    setBascule(etapeA(untrack(transition), 0).bascule)
  }
  function etape(step: { bascule: boolean; fini: boolean }) {
    setBascule(step.bascule)
    if (!step.fini) return
    enCours = false
    if (attente) arrive(attente)
  }

  const cote = () => {
    const p = passage()
    return bascule() ? p.apres : p.avant
  }
  const expression = createMemo<BotExpression>(() => {
    const value = props.expression
    if (value === undefined) return cote().face ?? neutre
    return typeof value === 'string' ? (EXPRESSION_BY_ID.get(value) ?? neutre) : value
  })
  const vue = createMemo<PlushPassage>(() => {
    const p = passage()
    return { avant: vers(p.avant), apres: vers(p.apres), debut: p.debut }
  })

  /*
   * Images : le corps d'un personnage tel quel ; une forme grise et la boule teintes une
   * fois, en tache de fond. Une reponse en retard (la couleur a change entre-temps) est
   * ignoree : seul le dernier jeton ecrit.
   */
  const [dot, setDot] = createSignal<string | null>(null)
  const [notif, setNotif] = createSignal<string | null>(null)
  let vivant = true
  onCleanup(() => {
    vivant = false
  })
  function teinture(source: () => { url: string; hex: string | null }, set: (v: string | null) => void) {
    let jeton = 0
    createEffect(
      () => {
        const { url, hex } = source()
        return `${hex ?? ''}|${url}`
      },
      (clef) => {
        const [hex, url] = clef.split('|') as [string, string]
        const n = ++jeton
        if (!hex) return void set(url)
        if (typeof document === 'undefined') return
        tinted(url, hex).then(
          (v) => vivant && n === jeton && set(v),
          () => vivant && n === jeton && set(null)
        )
      }
    )
  }
  // le corps : la clef porte la source, le reste de la demande est lu a l'arrivee
  teinture(
    () => demande().source,
    (url) => {
      const { source, ...d } = untrack(demande)
      arrive({ ...d, url })
    }
  )
  teinture(() => ({ url: href(BALL), hex: ink() }), setDot)
  teinture(() => ({ url: href(BALL), hex: NOTIF_BLUE }), setNotif)

  /*
   * Le regard. Toujours un script (jamais `null`) : chaque changement repart du DERNIER
   * regard rendu et glisse vers le suivant avec le morph de l'etat d'arrivee, donc il ne
   * saute pas, meme en plein fondu.
   */
  const depart = untrack(state) === 'thinking' ? THINK_LOOK : REST_LOOK
  let rendu: Look = depart
  // dans un objet : un signal qui recoit une fonction la prendrait pour un calcul
  const trace = (script: GazeScript) => ({ run: (t: number) => (rendu = script(t)) })
  const [gaze, setGaze] = createSignal(trace(() => depart))
  createEffect(state, (s, previous) => {
    if (previous === undefined) return
    const to = s === 'thinking' ? THINK_LOOK : REST_LOOK
    setGaze(trace(glide(rendu, to, morphOf(s))))
  })

  /* Les points de `thinking`, dates sur l'horloge du bot (`context.clock`). */
  // un bot monte en `thinking` a deja ses points : pleins, pulsation datee de 0
  const [dots, setDots] = createSignal<DotsTrack>(
    untrack(state) === 'thinking' ? { ...NO_DOTS, from: 1, on: true } : NO_DOTS
  )
  createEffect(state, (s) => {
    if (!context) return
    setDots((track) => dotsToggle(track, s === 'thinking', context!.clock(), s))
  })

  const cycle: Block[] = untrack(() => [{ state: engineState(state()), duration: BLOC }])

  return (
    <BloubBot
      size={props.size}
      shape={cote().shape}
      color={ink()}
      expression={expression()}
      state={engineState(state())}
      cycle={cycle}
      fps={props.fps}
      autoPause={props.autoPause}
      frozenAt={props.frozenAt}
      follow={props.follow && state() !== 'thinking'}
      gaze={gaze().run}
      initialPhase={props.initialPhase}
      ariaLabel={props.ariaLabel ?? 'Animated plush Bloub avatar'}
      class={props.class}
      style={props.style}
      layer={(ctx) => {
        context = ctx
        return (
          <PlushLayer
            context={ctx}
            passage={vue()}
            transition={transition()}
            frozen={props.frozenAt !== undefined}
            onStep={etape}
            size={props.size}
            pads={cote().pads}
            padHref={href}
            dot={dot()}
            notif={notif()}
            dots={dots()}
          />
        )
      }}
    />
  )
}
