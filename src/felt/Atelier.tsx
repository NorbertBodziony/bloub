import type { JSX } from '@solidjs/web'
import { For, Show, createEffect, createSignal } from 'solid-js'
import { EXPRESSIONS, type ExpressionId } from '@/bot/expressions'
import { COLORS } from '@/bot/skins'
import { t } from '@/i18n'
import {
  DEFAULT_TRANSITION,
  PLUSH_CHARACTERS,
  PLUSH_SHAPES,
  PLUSH_STATES,
  PLUSH_TRANSITIONS,
  PlushBot,
  type PlushCharacterId,
  type PlushShapeId,
  type PlushState,
  type PlushTransition
} from '@/plush'

/*
 * L'atelier : le personnaliseur de l'app, pour la peluche. Page de dev (`felt.html#atelier`),
 * hors du build. Les vignettes sont figees, comme celles de `Customizer.tsx` ; l'apercu vit.
 * Sous l'apercu, une barre laterale factice aux tailles d'openbot (24 a 40 px) : chaque
 * avatar y est en pause (`paused`), sauf quand on survole sa ligne — c'est le survol de
 * l'app, sur une seule instance, celui qui ne doit pas sauter.
 */

/** l'etat que montre une vignette fige : un instant ou le visage, les points et les « z » sont poses */
const instant = (s: PlushState) => (s === 'thinking' || s === 'asleep' || s === 'failed' ? 4.3 : 1.6)
const VIGNETTE = 60
const APERCU = 360
const TAILLES_APP = [24, 32, 40]
const NOMS = ['Research agent', 'Code reviewer', 'Release bot']

/** les etats de la peluche que le moteur ne connait pas n'ont pas de libelle dans l'app */
const etiquette = (s: PlushState) =>
  s === 'asleep' ? 'Asleep' : s === 'failed' ? 'Failed' : t(`states.${s}`)
const majuscule = (s: string) => s[0]!.toUpperCase() + s.slice(1)
/** `expression` ne compte que la ou l'etat ne pose pas son propre visage */
const VISAGE_LIBRE: readonly PlushState[] = ['idle', 'thinking']

export default function Atelier() {
  const params = new URLSearchParams(location.hash.slice(1))
  const [personnage, setPersonnage] = createSignal<PlushCharacterId | null>(
    (params.get('personnage') as PlushCharacterId | null) ?? (params.has('forme') ? null : 'nexo')
  )
  const [forme, setForme] = createSignal<PlushShapeId>((params.get('forme') as PlushShapeId | null) ?? 'cercle')
  const [couleur, setCouleur] = createSignal(params.get('couleur') ?? 'rouge')
  const [expression, setExpression] = createSignal<ExpressionId | null>(
    (params.get('expression') as ExpressionId | null) ?? null
  )
  const [etat, setEtat] = createSignal<PlushState>((params.get('etat') as PlushState | null) ?? 'idle')
  const [transition, setTransition] = createSignal<PlushTransition>(
    (params.get('transition') as PlushTransition | null) ?? DEFAULT_TRANSITION
  )
  const [yeux, setYeux] = createSignal(Number(params.get('yeux')) || 1.3)
  const [survolee, setSurvolee] = createSignal<number | null>(null)
  const [toujours, setToujours] = createSignal(false)

  // l'URL suit les choix : un lien redonne la meme peluche. Un effet, pas une ecriture apres
  // chaque `set` : Solid applique les ecritures au flush, une lecture juste apres rend l'ancienne valeur
  createEffect(
    () => {
      const p = new URLSearchParams()
      const c = personnage()
      if (c) p.set('personnage', c)
      else {
        p.set('forme', forme())
        p.set('couleur', couleur())
      }
      const e = expression()
      if (e) p.set('expression', e)
      p.set('etat', etat())
      p.set('transition', transition())
      p.set('yeux', String(yeux()))
      return `#atelier&${p.toString()}`
    },
    (hash) => history.replaceState(null, '', hash)
  )

  // une vignette figee du corps choisi
  const Vignette = (v: { state?: PlushState; expression?: ExpressionId }) => (
    <PlushBot
      character={personnage() ?? undefined}
      shape={forme()}
      color={couleur()}
      state={v.state}
      expression={v.expression}
      eyeScale={yeux()}
      size={VIGNETTE}
      frozenAt={instant(v.state ?? 'idle')}
    />
  )

  const tuile = (label: () => string, choisie: () => boolean, clic: () => void, bot: () => JSX.Element) => (
    <button type="button" class="tuile" aria-pressed={choisie() ? 'true' : 'false'} onClick={clic}>
      {bot()}
      <span>{label()}</span>
    </button>
  )

  return (
    <div class="atelier">
      <style>{CSS}</style>

      <section class="scene">
        <div class="apercu">
          <PlushBot
            character={personnage() ?? undefined}
            shape={forme()}
            color={couleur()}
            state={etat()}
            expression={expression() ?? undefined}
            transition={transition()}
            eyeScale={yeux()}
            size={APERCU}
            ariaLabel="plush preview"
          />
        </div>

        <div class="app">
          <div class="app-tete">
            <span>In the app — hover a row</span>
            <label>
              <input type="checkbox" checked={toujours()} onChange={(e) => setToujours(e.currentTarget.checked)} />
              always animate
            </label>
          </div>
          <For each={TAILLES_APP}>
            {(taille, i) => (
              <div class="ligne" onMouseEnter={() => setSurvolee(i())} onMouseLeave={() => setSurvolee(null)}>
                <span class="avatar">
                  <PlushBot
                    character={personnage() ?? undefined}
                    shape={forme()}
                    color={couleur()}
                    state={etat()}
                    expression={expression() ?? undefined}
                    transition={transition()}
                    eyeScale={yeux()}
                    size={taille}
                    fps={30}
                    initialPhase={i() * 0.73}
                    paused={!toujours() && survolee() !== i()}
                  />
                </span>
                <span class="nom">{NOMS[i()]}</span>
                <span class="taille">{taille} px</span>
              </div>
            )}
          </For>
        </div>
      </section>

      <aside class="panneau-atelier">
        <h2>Character</h2>
        <div class="grille g4">
          <For each={PLUSH_CHARACTERS}>
            {(c) =>
              tuile(
                () => majuscule(c.id),
                () => personnage() === c.id,
                () => setPersonnage(c.id),
                () => <PlushBot character={c.id} eyeScale={yeux()} size={VIGNETTE} frozenAt={instant('idle')} />
              )
            }
          </For>
        </div>

        <h2>{t('panel.shape')}</h2>
        <div class="grille g4">
          <For each={PLUSH_SHAPES}>
            {(s) =>
              tuile(
                () => t(`shapes.${s}`),
                () => !personnage() && forme() === s,
                () => {
                  setPersonnage(null)
                  setForme(s)
                },
                () => (
                  <PlushBot shape={s} color={couleur()} eyeScale={yeux()} size={VIGNETTE} frozenAt={instant('idle')} />
                )
              )
            }
          </For>
        </div>

        <h2>{t('panel.expression')}</h2>
        <Show when={!VISAGE_LIBRE.includes(etat())}>
          <p class="note">{etiquette(etat())} sets its own face: the expression shows in Idle and Thinking.</p>
        </Show>
        <div class="grille g4">
          {tuile(
            () => (personnage() ? 'Own face' : t('expressions.neutre')),
            () => expression() === null,
            () => setExpression(null),
            () => <Vignette />
          )}
          <For each={EXPRESSIONS.filter((e) => personnage() || e.id !== 'neutre')}>
            {(e) =>
              tuile(
                () => t(`expressions.${e.id}`),
                () => expression() === e.id,
                () => setExpression(e.id),
                () => <Vignette expression={e.id} />
              )
            }
          </For>
        </div>

        <h2>{t('panel.color')}</h2>
        <Show when={personnage()}>
          <p class="note">A character keeps its own colour; pick a shape to tint it.</p>
        </Show>
        <div class={`grille g6${personnage() ? ' eteint' : ''}`}>
          <For each={COLORS}>
            {(c) => (
              <button
                type="button"
                class="pastille"
                aria-label={t(`colors.${c.id}`)}
                aria-pressed={!personnage() && couleur() === c.id ? 'true' : 'false'}
                onClick={() => {
                  setPersonnage(null)
                  setCouleur(c.id)
                }}
              >
                <span style={{ background: c.hex }} />
              </button>
            )}
          </For>
        </div>

        <h2>State</h2>
        <div class="grille g4">
          <For each={PLUSH_STATES}>
            {(s) =>
              tuile(
                () => etiquette(s),
                () => etat() === s,
                () => setEtat(s),
                () => <Vignette state={s} />
              )
            }
          </For>
        </div>

        <h2>Body transition</h2>
        <div class="segments">
          <For each={PLUSH_TRANSITIONS}>
            {(tr) => (
              <button type="button" aria-pressed={transition() === tr ? 'true' : 'false'} onClick={() => setTransition(tr)}>
                {tr}
              </button>
            )}
          </For>
        </div>

        <h2>Eye size</h2>
        <div class="curseur">
          <input
            type="range"
            min="1"
            max="1.6"
            step="0.05"
            value={yeux()}
            onInput={(e) => setYeux(Number(e.currentTarget.value))}
          />
          <span>{yeux().toFixed(2)}</span>
        </div>
      </aside>
    </div>
  )
}

// le theme d'openbot (`@openbot/brand/tokens.css`, palette sombre), recopie : la ou la peluche vit vraiment
const CSS = `
.atelier {
  --canvas: #1a1a1a; --surface: #212121; --control: #242424; --control-active: #2a2a2a;
  --text: #ffffff; --text-2: #dcdcdc; --muted: #979797; --line: rgba(255, 255, 255, 0.06); --accent: #007cf7;
  color-scheme: dark; accent-color: var(--accent);
  position: fixed; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) 380px;
  background: var(--canvas); color: var(--text); font: 14px/1.4 'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.atelier .scene { display: flex; flex-direction: column; align-items: safe center; justify-content: safe center; gap: 40px; padding: 24px; overflow: auto; }
.atelier .app { width: 320px; background: var(--canvas); border: 1px solid var(--line); border-radius: 14px; padding: 8px; }
.atelier .app-tete { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px 8px; color: var(--muted); font-size: 12px; }
.atelier .app-tete label { display: flex; gap: 4px; align-items: center; cursor: pointer; }
.atelier .ligne { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 10px; cursor: default; }
.atelier .ligne:hover { background: var(--surface); }
.atelier .ligne .avatar { display: flex; width: 40px; justify-content: center; }
.atelier .ligne .nom { flex: 1; font-weight: 500; }
.atelier .ligne .taille { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.atelier .panneau-atelier { overflow: auto; padding: 28px 24px 40px; background: var(--canvas); border-left: 1px solid var(--line); }
.atelier h2 { margin: 22px 0 8px; font-size: 14px; font-weight: 600; color: var(--text-2); }
.atelier h2:first-child { margin-top: 0; }
.atelier .note { margin: -2px 0 8px; color: var(--muted); font-size: 12px; }
.atelier .grille { display: grid; gap: 6px; }
.atelier .g4 { grid-template-columns: repeat(4, 1fr); }
.atelier .g6 { grid-template-columns: repeat(6, 1fr); }
.atelier .eteint { opacity: 0.35; }
.atelier .tuile { display: flex; flex-direction: column; align-items: center; padding: 4px; border: 2px solid transparent; border-radius: 12px; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; transition: background-color 0.15s, border-color 0.15s; }
.atelier .tuile:hover { background: var(--surface); }
.atelier .tuile[aria-pressed='true'] { background: var(--surface); border-color: var(--text-2); color: var(--text); }
.atelier .pastille { display: flex; aspect-ratio: 1; align-items: center; justify-content: center; border: 2px solid transparent; border-radius: 50%; background: none; cursor: pointer; padding: 0; }
.atelier .pastille:hover { border-color: var(--control-active); }
.atelier .pastille[aria-pressed='true'] { border-color: var(--text-2); }
.atelier .pastille span { display: block; width: 78%; height: 78%; border-radius: 50%; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.08); }
.atelier .segments { display: flex; gap: 4px; flex-wrap: wrap; }
.atelier .segments button { padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--text-2); font: inherit; cursor: pointer; }
.atelier .segments button:hover { background: var(--control); }
.atelier .segments button[aria-pressed='true'] { background: var(--text); border-color: var(--text); color: var(--canvas); }
.atelier .curseur { display: flex; gap: 10px; align-items: center; }
.atelier .curseur input { flex: 1; }
.atelier .curseur span { font-variant-numeric: tabular-nums; width: 4ch; color: var(--text-2); }
.atelier :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
/* fenetre etroite : le panneau passe sous la scene, et la page defile */
@media (max-width: 960px) {
  .atelier { position: static; display: block; min-height: 100vh; }
  .atelier .panneau-atelier { border-left: 0; border-top: 1px solid var(--line); }
}
`
