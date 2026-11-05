import { For, createSignal, onCleanup } from 'solid-js'
import { EXPRESSIONS, type ExpressionId } from '@/bot/expressions'
import { COLORS } from '@/bot/skins'
import { PLUSH_CHARACTERS, PLUSH_SHAPES, PLUSH_STATES, PlushBot, type PlushState } from '@/plush'

/** le visage propre au bot : celui du personnage, `neutre` pour une forme */
const PROPRE = 'propre'
/** pas de `color` : chaque forme prend celle de son feutre (`SHAPE_INKS`) */
const FEUTRE = 'feutre'
// 24 a 40 : les tailles des avatars d'openbot
const TAILLES = [24, 32, 40, 46, 96, 200]

/*
 * Le parcours : une suite d'etats et de visages, pour regarder les transitions sans
 * toucher aux menus. Changements rapproches (0,25 s) compris, pour voir les fondus
 * interrompus.
 */
const PARCOURS: [PlushState, string, number][] = [
  ['idle', PROPRE, 1.6],
  ['wink', PROPRE, 1.2],
  ['idle', 'heureux', 1.4],
  ['wide', 'heureux', 1.2],
  ['idle', 'triste', 0.25],
  ['idle', 'surpris', 1.4],
  ['thinking', 'surpris', 2.4],
  ['notify', PROPRE, 1.8],
  ['thinking', PROPRE, 0.25],
  ['idle', PROPRE, 1.6]
]

export default function Sandbox() {
  const params = new URLSearchParams(location.hash.slice(1))
  const [taille, setTaille] = createSignal(Number(params.get('taille')) || 96)
  const [etat, setEtat] = createSignal<PlushState>((params.get('etat') as PlushState | null) ?? 'idle')
  const [expression, setExpression] = createSignal(params.get('expression') ?? PROPRE)
  const [couleur, setCouleur] = createSignal(params.get('couleur') ?? FEUTRE)
  const [fige, setFige] = createSignal(params.has('fige'))
  // `#yeux=1.25` : l'echelle des yeux d'un avatar petit ; `#pause` : arrete au repos, comme au survol
  const [yeux, setYeux] = createSignal(Number(params.get('yeux')) || 1)
  const [pause, setPause] = createSignal(params.has('pause'))
  /*
   * `#survol` : comme dans openbot, chaque bot est en pause sauf sous la souris. Sans `follow` :
   * celui de `BloubBot` est le regard de la vue des reglages (un tour complet, la tete tournee
   * vers le panneau), pas un survol d'avatar.
   */
  const [survol, setSurvol] = createSignal(params.has('survol'))
  const [sous, setSous] = createSignal<string | null>(null)
  const enPause = (id: string) => (survol() ? sous() !== id : pause())
  // Instant fige : `#fige&t=2.5`, ou pas a pas depuis l'outil d'enregistrement (`__instant`)
  const [instant, setInstant] = createSignal(Number(params.get('t')) || 1)
  const fenetre = window as unknown as {
    __instant: (t: number) => void
    __etat: (s: PlushState, e?: string) => void
    __pause: (on: boolean) => void
  }
  fenetre.__instant = setInstant
  fenetre.__pause = setPause
  fenetre.__etat = (s, e) => {
    setEtat(s)
    if (e) setExpression(e)
  }
  /*
   * Un appel, pas un ternaire dans le JSX : Solid enveloppe un ternaire de prop dans un
   * memo cree a la lecture, et BloubBot lit `frozenAt` depuis un effet ou c'est interdit.
   */
  const figeA = () => (fige() ? instant() : undefined)
  const visage = () => (expression() === PROPRE ? undefined : (expression() as ExpressionId))

  const [parcours, setParcours] = createSignal(params.has('parcours'))
  let minuterie: ReturnType<typeof setTimeout> | undefined
  const etape = (i: number) => {
    if (!parcours()) return
    const [s, e, duree] = PARCOURS[i % PARCOURS.length]!
    setEtat(s)
    setExpression(e)
    minuterie = setTimeout(() => etape(i + 1), duree * 1000)
  }
  const basculeParcours = (on: boolean) => {
    clearTimeout(minuterie)
    setParcours(on)
    if (on) etape(0)
  }
  if (parcours()) etape(0)
  onCleanup(() => clearTimeout(minuterie))

  const choix = (label: string, valeurs: readonly (string | number)[], actuelle: () => string | number, pose: (v: string) => void) => (
    <label style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
      {label}
      <select value={String(actuelle())} onChange={(e) => pose(e.currentTarget.value)}>
        <For each={valeurs}>{(v) => <option value={String(v)}>{String(v)}</option>}</For>
      </select>
    </label>
  )
  const case_ = (label: string, actuelle: () => boolean, pose: (v: boolean) => void) => (
    <label style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
      <input type="checkbox" checked={actuelle()} onChange={(e) => pose(e.currentTarget.checked)} />
      {label}
    </label>
  )
  const grille = () => ({
    display: 'grid',
    'grid-template-columns': `repeat(auto-fill, ${Math.max(taille(), 60) + 24}px)`,
    gap: '12px',
    'align-items': 'end',
    'margin-bottom': '32px'
  })
  const legende = { color: '#8e8e93', 'font-size': '12px', 'text-align': 'center' } as const

  return (
    <main style={{ padding: '24px' }}>
      <div style={{ display: 'flex', gap: '20px', 'flex-wrap': 'wrap', 'margin-bottom': '24px' }}>
        {choix('taille', TAILLES, taille, (v) => setTaille(Number(v)))}
        {choix('etat', PLUSH_STATES, etat, (v) => setEtat(v as PlushState))}
        {choix('expression', [PROPRE, ...EXPRESSIONS.map((e) => e.id)], expression, setExpression)}
        <label style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
          couleur
          <select value={couleur()} onChange={(e) => setCouleur(e.currentTarget.value)}>
            <option value={FEUTRE}>{FEUTRE}</option>
            <For each={COLORS}>{(c) => <option value={c.id}>{c.id}</option>}</For>
          </select>
          <input
            type="color"
            value={COLORS.find((c) => c.id === couleur())?.hex ?? couleur()}
            onInput={(e) => setCouleur(e.currentTarget.value)}
          />
        </label>
        {case_('parcours', parcours, basculeParcours)}
        {case_('figer', fige, setFige)}
        {case_('pause', pause, setPause)}
        {case_('survol', survol, setSurvol)}
        <label style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
          yeux
          <input
            type="range"
            min="1"
            max="1.6"
            step="0.05"
            value={yeux()}
            onInput={(e) => setYeux(Number(e.currentTarget.value))}
          />
          <span style={{ 'font-variant-numeric': 'tabular-nums', width: '3ch' }}>{yeux().toFixed(2)}</span>
        </label>
      </div>

      <div style={grille()}>
        <For each={PLUSH_CHARACTERS}>
          {(c, i) => (
            <figure style={{ margin: 0 }} onMouseEnter={() => setSous(c.id)} onMouseLeave={() => setSous(null)}>
              <PlushBot
                character={c.id}
                size={taille()}
                state={etat()}
                expression={visage()}
                initialPhase={i() * 0.73}
                frozenAt={figeA()}
                paused={enPause(c.id)}
                eyeScale={yeux()}
              />
              <figcaption style={legende}>{c.id}</figcaption>
            </figure>
          )}
        </For>
      </div>

      <div style={grille()}>
        <For each={PLUSH_SHAPES}>
          {(forme, i) => (
            <figure style={{ margin: 0 }} onMouseEnter={() => setSous(forme)} onMouseLeave={() => setSous(null)}>
              <PlushBot
                shape={forme}
                color={couleur() === FEUTRE ? undefined : couleur()}
                size={taille()}
                state={etat()}
                expression={visage()}
                initialPhase={i() * 0.61}
                frozenAt={figeA()}
                paused={enPause(forme)}
                eyeScale={yeux()}
              />
              <figcaption style={legende}>{forme}</figcaption>
            </figure>
          )}
        </For>
      </div>
    </main>
  )
}
