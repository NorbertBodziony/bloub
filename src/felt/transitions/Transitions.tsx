import { For, createSignal, onCleanup } from 'solid-js'
import type { PlushCharacterId, PlushShapeId } from '@/plush/catalogue'
import MorphBot, { type Cible } from './MorphBot'
import { TECHNIQUES } from './techniques'

/*
 * `felt.html#transitions` : les essais de changement de forme, une ligne par technique,
 * memes changements au meme instant sur toutes les lignes. `__suivant()` avance d'un pas
 * pour les enregistrements ; `#transitions&auto` enchaine toutes les 1,6 s.
 */
const FORMES: PlushShapeId[] = ['cercle', 'losange', 'nuage', 'capsule', 'goutte', 'pentagone']
const PERSOS: PlushCharacterId[] = ['nexo', 'vita', 'cloe', 'malu']
const AUTO = 1600

export default function Transitions() {
  const params = new URLSearchParams(location.hash.slice(1))
  const taille = Number(params.get('taille')) || 160
  const couleur = params.get('couleur') ?? 'bleu'
  const seconde = params.get('couleur2') ?? 'rose'
  const [pas, setPas] = createSignal(0)
  const suivant = () => setPas((n) => n + 1)
  ;(window as unknown as { __suivant: () => void }).__suivant = suivant

  const [auto, setAuto] = createSignal(params.has('auto'))
  let minuterie: ReturnType<typeof setInterval> | undefined
  const bascule = (on: boolean) => {
    clearInterval(minuterie)
    setAuto(on)
    if (on) minuterie = setInterval(suivant, AUTO)
  }
  if (auto()) bascule(true)
  onCleanup(() => clearInterval(minuterie))

  const colonnes: { nom: string; cible: (n: number) => Cible }[] = [
    { nom: `formes, ${couleur}`, cible: (n) => ({ forme: FORMES[n % FORMES.length]!, couleur }) },
    { nom: `formes, ${seconde}`, cible: (n) => ({ forme: FORMES[(n + 3) % FORMES.length]!, couleur: seconde }) },
    { nom: 'personnages', cible: (n) => ({ perso: PERSOS[n % PERSOS.length]! }) }
  ]
  const legende = { color: '#8e8e93', 'font-size': '12px' } as const

  return (
    <main style={{ padding: '24px' }}>
      <div style={{ display: 'flex', gap: '20px', 'align-items': 'center', 'margin-bottom': '16px' }}>
        <button onClick={suivant}>suivant</button>
        <label style={{ display: 'flex', gap: '6px', 'align-items': 'center' }}>
          <input type="checkbox" checked={auto()} onChange={(e) => bascule(e.currentTarget.checked)} />
          auto
        </label>
        <span style={legende}>pas {pas()}</span>
      </div>
      <div
        style={{
          display: 'grid',
          'grid-template-columns': `90px repeat(${colonnes.length}, ${taille + 16}px)`,
          gap: '4px 12px',
          'align-items': 'center'
        }}
      >
        <span />
        <For each={colonnes}>{(c) => <span style={legende}>{c.nom}</span>}</For>
        <For each={TECHNIQUES}>
          {(t, ligne) => (
            <>
              <span style={{ 'font-size': '15px' }}>{t}</span>
              <For each={colonnes}>
                {(c, col) => (
                  <MorphBot technique={t} cible={c.cible(pas())} size={taille} initialPhase={ligne() * 0.37 + col() * 0.53} />
                )}
              </For>
            </>
          )}
        </For>
      </div>
    </main>
  )
}
