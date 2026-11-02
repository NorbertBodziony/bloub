// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createComponent, createSignal, flush } from 'solid-js'
import { render } from '@solidjs/web'
import PlushBot from './PlushBot'
import { PLUSH_STATES, type PlushState } from './catalogue'
import type { ExpressionId } from '../bot/expressions'

/**
 * Le corps d'une peluche est une image FIXE (`docs/plush.md`) : ni respiration, ni morph,
 * ni etat qui le deplace. Ce test monte le vrai composant, le fait passer par chaque etat,
 * plusieurs visages et plusieurs instants, et releve l'image du corps et son groupe.
 * Seuls les yeux, les points et la pastille ont le droit de changer.
 */
function corps(hote: HTMLElement) {
  const image = hote.querySelector('svg image')
  expect(image, 'image du corps').toBeTruthy()
  const attrs = ['href', 'x', 'y', 'width', 'height', 'transform', 'opacity'].map((a) => image!.getAttribute(a))
  const groupe = image!.parentElement!
  return JSON.stringify([attrs, groupe.getAttribute('opacity'), groupe.getAttribute('transform')])
}

describe('corps de la peluche', () => {
  it('ne bouge pas, quels que soient l etat, le visage et l instant', () => {
    const hote = document.createElement('div')
    document.body.appendChild(hote)
    const [state, setState] = createSignal<PlushState>('idle')
    const [expression, setExpression] = createSignal<ExpressionId | undefined>(undefined)
    const [t, setT] = createSignal(0)
    const dispose = render(
      () =>
        createComponent(PlushBot, {
          character: 'nexo',
          size: 96,
          get state() {
            return state()
          },
          get expression() {
            return expression()
          },
          get frozenAt() {
            return t()
          }
        }),
      hote
    )
    try {
      flush()
      const reference = corps(hote)
      const releves: string[] = []
      // garde-fou : le rendu suit bien l'instant, puisque les yeux, eux, bougent
      // (un patin est pose par son groupe, l'oeil : son `<image>` est le sprite entier, 1 x 1)
      const yeux = () =>
        [...hote.querySelectorAll('svg image')]
          .slice(1)
          .map((i) => i.closest('g[transform]')?.outerHTML ?? i.outerHTML)
          .join()
      const yeuxVus = new Set<string>()
      for (const e of [undefined, 'heureux', 'blase'] as const) {
        setExpression(e)
        for (const s of PLUSH_STATES) {
          setState(s)
          for (const instant of [0.05, 0.2, 0.7, 1.9, 3.3]) {
            setT(instant)
            flush()
            releves.push(`${e} ${s} ${instant} ${corps(hote)}`)
            yeuxVus.add(yeux())
          }
        }
      }
      expect(yeuxVus.size).toBeGreaterThan(10)
      for (const r of releves) expect(r.slice(r.indexOf(' [') + 1), r.slice(0, r.indexOf(' ['))).toBe(reference)
    } finally {
      dispose()
      hote.remove()
    }
  })
})
