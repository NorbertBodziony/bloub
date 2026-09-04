// @vitest-environment happy-dom
import { render } from '@solidjs/web'
import { describe, expect, it, vi } from 'vitest'
import BloubBot, { type BloubBotRef } from './BloubBot'
import { defaultCycle } from '@/bot/cycles'

/**
 * Le composant ne connait du temps que `requestAnimationFrame` : la remplacer
 * donne une horloge qu'on avance a la main, seule facon de mesurer une cadence
 * sans attendre une duree reelle. Rend aussi la boucle observable — savoir si
 * une image est en attente, c'est savoir si le bot dessine encore.
 */
function horlogeManuelle() {
  let attendue: FrameRequestCallback | null = null
  vi.stubGlobal('requestAnimationFrame', (rappel: FrameRequestCallback) => {
    attendue = rappel
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    attendue = null
  })
  return {
    get tourne() {
      return attendue !== null
    },
    avance(ms: number) {
      const rappel = attendue
      attendue = null
      rappel?.(ms)
    }
  }
}

describe('BloubBot Solid', () => {
  it('rend une image figee et expose son controleur', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    let bot: BloubBotRef | undefined
    const dispose = render(
      () => <BloubBot frozenAt={0} ref={(value) => { bot = value }} />,
      host
    )

    await Promise.resolve()
    expect(host.querySelector('svg')).toBe(bot?.svg)
    expect(host.querySelector('mask path')?.getAttribute('d')).toBeTruthy()

    dispose()
    host.remove()
  })

  it('notifie les changements controles et rend une date exacte', async () => {
    const host = document.createElement('div')
    const onBlockChange = vi.fn()
    const onStateChange = vi.fn()
    let bot: BloubBotRef | undefined
    const dispose = render(
      () => (
        <BloubBot
          frozenAt={0}
          cycle={defaultCycle().blocks}
          onBlockChange={onBlockChange}
          onStateChange={onStateChange}
          ref={(value) => { bot = value }}
        />
      ),
      host
    )

    await Promise.resolve()
    bot!.seek(1)
    expect(onBlockChange).toHaveBeenCalledWith(1)
    bot!.renderAt(3)
    expect(onStateChange).toHaveBeenCalled()

    dispose()
  })

  it('la bride fps dessine moins souvent que la cadence de l\'ecran', async () => {
    const horloge = horlogeManuelle()
    const host = document.createElement('div')
    const onElapsedChange = vi.fn()
    const dispose = render(
      () => (
        <BloubBot
          cycle={defaultCycle().blocks}
          playing
          fps={30}
          onElapsedChange={onElapsedChange}
        />
      ),
      host
    )
    await Promise.resolve()

    // Neuf images d'un ecran a 60 Hz : a 30 par seconde, une sur deux suffit.
    for (let image = 1; image <= 9; image += 1) horloge.avance(image * 16)

    expect(onElapsedChange.mock.calls.length).toBeLessThan(6)
    expect(onElapsedChange).toHaveBeenCalled()

    dispose()
    vi.unstubAllGlobals()
  })

  it('suspend la boucle quand le bot sort de l\'ecran, et la reprend', async () => {
    const horloge = horlogeManuelle()
    let regarde: ((entrees: { isIntersecting: boolean }[]) => void) | undefined
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(rappel: (entrees: { isIntersecting: boolean }[]) => void) {
          regarde = rappel
        }
        observe() {}
        disconnect() {}
      }
    )
    const host = document.createElement('div')
    const dispose = render(() => <BloubBot cycle={defaultCycle().blocks} playing />, host)
    await Promise.resolve()
    expect(horloge.tourne).toBe(true)

    regarde?.([{ isIntersecting: false }])
    await Promise.resolve()
    expect(horloge.tourne).toBe(false)

    regarde?.([{ isIntersecting: true }])
    await Promise.resolve()
    expect(horloge.tourne).toBe(true)

    dispose()
    vi.unstubAllGlobals()
  })
})