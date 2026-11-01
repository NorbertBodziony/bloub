import { For, createSignal } from 'solid-js'
import BloubBot from '@/components/BloubBot'
import type { Material } from '@/components/felt'
import { makeBlock } from '@/bot/cycles'
import { EXPRESSIONS, EXPRESSION_BY_ID, type BotExpression, type ExpressionId } from '@/bot/expressions'
import type { ColorId, ShapeId } from '@/bot/skins'
import type { EyeCfg, StateId } from '@/bot/states'
import type { GazeScript } from '@/ui/gaze'

const oeil = (w: number, h: number, tilt = 0): EyeCfg => ({ w, h, tilt, open: 1 })

/**
 * Les six avatars des captures de reference. `encre` est la couleur relevee sur la
 * capture de l'app (mediane du haut du corps, hors yeux). Les yeux aussi y sont
 * releves, rapportes au rayon du corps : taille (`w`, `h`), demi-ecart en degres sur
 * la sphere (`split`), et ou le visage se pose (`yaw`, `pitch`). Yoshi et Fred sont
 * encore plats dans l'app : leur encre est celle de leur aplat.
 */
const BOTS: {
  nom: string
  shape: ShapeId
  color: ColorId
  encre: string
  split: number
  yeux: [EyeCfg, EyeCfg]
  yaw: number
  pitch: number
}[] = [
  { nom: 'Nexo', shape: 'squircle', color: 'orange', encre: '#e45206', split: 19, yeux: [oeil(0.24, 0.6, -28), oeil(0.24, 0.6, 28)], yaw: 0, pitch: -6 },
  { nom: 'Vita', shape: 'hexagone', color: 'vert', encre: '#22c377', split: 15, yeux: [oeil(0.2, 0.48), oeil(0.44, 0.14)], yaw: 0, pitch: 0 },
  { nom: 'Cloe', shape: 'triangle', color: 'rose', encre: '#df2986', split: 17, yeux: [oeil(0.32, 0.12, 30), oeil(0.32, 0.12, -30)], yaw: 0, pitch: -2 },
  { nom: 'Malu', shape: 'cercle', color: 'violet', encre: '#9a55ef', split: 18, yeux: [oeil(0.18, 0.42), oeil(0.18, 0.18)], yaw: 7, pitch: 7 },
  { nom: 'Yoshi', shape: 'capsule', color: 'rouge', encre: '#e94741', split: 16, yeux: [oeil(0.3, 0.12), oeil(0.3, 0.12)], yaw: 0, pitch: 0 },
  { nom: 'Fred', shape: 'hexagone', color: 'ambre', encre: '#efb428', split: 16, yeux: [oeil(0.36, 0.36), oeil(0.36, 0.36)], yaw: 0, pitch: 0 }
]

/*
 * Bricolage du bac a sable : chaque visage est inscrit dans la table des expressions
 * sous un id a lui, pour que le composant le trouve. Le catalogue (et ses libelles)
 * n'en sait rien. Le garder si l'essai aboutit voudrait de vraies entrees.
 */
const visage = (nom: string) => `peluche-${nom.toLowerCase()}`
for (const bot of BOTS) {
  const expression: BotExpression = {
    id: visage(bot.nom) as ExpressionId,
    gaze: { yaw: bot.yaw, pitch: bot.pitch, roll: 0 },
    split: bot.split,
    eyes: bot.yeux
  }
  EXPRESSION_BY_ID.set(expression.id, expression)
}

/** Le visage pose ou il est sur la capture, avec un peu de derive pour rester vivant. */
const regard = (bot: { yaw: number; pitch: number }): GazeScript => () => ({
  yaw: bot.yaw,
  pitch: bot.pitch,
  mix: 1,
  spin: 0,
  wander: 0.4
})
const REFERENCE = 'reference'

const MATIERES: Material[] = ['flat', 'felt', 'felt-texture', 'felt-gl']
const TAILLES = [46, 96, 200]
const ETATS: StateId[] = ['idle', 'wink', 'thinking', 'orbit']
const CREME = '#f1efe9'

export default function Sandbox() {
  const params = new URLSearchParams(location.hash.slice(1))
  const [taille, setTaille] = createSignal(Number(params.get('taille')) || 96)
  const [etat, setEtat] = createSignal<StateId>((params.get('etat') as StateId | null) ?? 'idle')
  const [expression, setExpression] = createSignal(params.get('expression') ?? REFERENCE)
  const [fige, setFige] = createSignal(params.has('fige'))

  const choix = (label: string, valeurs: readonly (string | number)[], actuelle: () => string | number, pose: (v: string) => void) => (
    <label style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
      {label}
      <select value={String(actuelle())} onChange={(e) => pose(e.currentTarget.value)}>
        <For each={valeurs}>{(v) => <option value={String(v)}>{String(v)}</option>}</For>
      </select>
    </label>
  )

  return (
    <main style={{ padding: '24px' }}>
      <div style={{ display: 'flex', gap: '20px', 'flex-wrap': 'wrap', 'margin-bottom': '24px' }}>
        {choix('taille', TAILLES, taille, (v) => setTaille(Number(v)))}
        {choix('etat', ETATS, etat, (v) => setEtat(v as StateId))}
        {choix('expression', [REFERENCE, ...EXPRESSIONS.map((e) => e.id)], expression, setExpression)}
        <label style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
          <input type="checkbox" checked={fige()} onChange={(e) => setFige(e.currentTarget.checked)} />
          figer
        </label>
      </div>

      <div
        style={{
          display: 'grid',
          'grid-template-columns': `80px repeat(${MATIERES.length}, ${Math.max(taille(), 60) + 24}px)`,
          gap: '12px',
          'align-items': 'center'
        }}
      >
        <span />
        <For each={MATIERES}>{(m) => <span style={{ color: '#8e8e93' }}>{m}</span>}</For>
        <For each={BOTS}>
          {(bot, i) => (
            <>
              <span>{bot.nom}</span>
              <For each={MATIERES}>
                {(m) => (
                  <BloubBot
                    size={taille()}
                    shape={bot.shape}
                    color={expression() === REFERENCE ? bot.encre : bot.color}
                    paper={CREME}
                    expression={expression() === REFERENCE ? visage(bot.nom) : expression()}
                    gaze={expression() === REFERENCE ? regard(bot) : null}
                    state={etat()}
                    cycle={[makeBlock(etat())]}
                    material={m}
                    initialPhase={i() * 0.73}
                    frozenAt={fige() ? 1 : undefined}
                  />
                )}
              </For>
            </>
          )}
        </For>
      </div>
    </main>
  )
}
