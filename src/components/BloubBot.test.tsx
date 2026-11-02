// @vitest-environment happy-dom
import { createSignal } from 'solid-js'
import { render } from '@solidjs/web'
import { describe, expect, it, vi } from 'vitest'
import BloubBot, { type BloubBotRef } from './BloubBot'
import { blockAt, defaultCycle } from '@/bot/cycles'
import { BotEngine } from '@/bot/engine'
import { DEFAULT_EXPRESSION, EXPRESSION_BY_ID } from '@/bot/expressions'
import { RAYON } from '@/bot/repere'
import { DEFAULT_SHAPE, SHAPE_BY_ID } from '@/bot/skins'

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

  it('initialPhase fait partir le bot de cette date du montage', async () => {
    horlogeManuelle()
    const blocs = defaultCycle().blocks
    const phase = blocs[0]!.duration + 0.4
    const { index, elapsed } = blockAt(blocs, phase)
    const onBlockChange = vi.fn()
    const host = document.createElement('div')
    const dispose = render(
      () => <BloubBot cycle={blocs} playing initialPhase={phase} onBlockChange={onBlockChange} />,
      host
    )
    await Promise.resolve()

    // Le moteur de reference : l'etat du bloc, commence `elapsed` secondes avant la date.
    const reference = new BotEngine(
      RAYON,
      blocs[index]!.state,
      SHAPE_BY_ID.get(DEFAULT_SHAPE)!.radii,
      EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION)!
    )
    reference.reset(blocs[index]!.state, phase - elapsed)
    expect(index).toBeGreaterThan(0)
    expect(host.querySelector('mask path')?.getAttribute('d')).toBe(reference.sample(phase).bodyPath)
    expect(onBlockChange).not.toHaveBeenCalled()

    dispose()
    vi.unstubAllGlobals()
  })

  it('paused arrete le bot au repos, sans saut, et joue jusqu\'au bout un changement', async () => {
    const horloge = horlogeManuelle()
    const [paused, setPaused] = createSignal(false)
    const [visage, setVisage] = createSignal<string>(DEFAULT_EXPRESSION)
    const host = document.createElement('div')
    const dispose = render(
      () => <BloubBot cycle={[{ state: 'idle', duration: 100 }]} paused={paused()} expression={visage()} />,
      host
    )
    await Promise.resolve()
    let ms = 1000
    // Solid ecrit le DOM au vidage des micro-taches : on le laisse passer a chaque image
    const images = async (n: number) => {
      for (let i = 0; i < n && horloge.tourne; i++) {
        horloge.avance((ms += 16))
        await Promise.resolve()
      }
    }
    await images(30)
    expect(horloge.tourne).toBe(true)

    // la pause attend le repos, puis la boucle s'eteint : l'image reste celle de l'arret
    setPaused(true)
    await Promise.resolve()
    const debut = ms
    while (horloge.tourne && ms - debut < 5000) {
      horloge.avance((ms += 16))
      await Promise.resolve()
    }
    expect(horloge.tourne).toBe(false)
    const arret = host.innerHTML

    // la reprise repart de la meme pose : la premiere image a un `dt` nul
    setPaused(false)
    await Promise.resolve()
    expect(horloge.tourne).toBe(true)
    horloge.avance((ms += 5000))
    await Promise.resolve()
    expect(host.innerHTML).toBe(arret)
    await images(10)
    expect(host.innerHTML).not.toBe(arret)

    // un changement pendant la pause rallume la boucle le temps du morph, puis l'eteint
    setPaused(true)
    await Promise.resolve()
    while (horloge.tourne) {
      horloge.avance((ms += 16))
      await Promise.resolve()
    }
    setVisage('surpris')
    await Promise.resolve()
    expect(horloge.tourne).toBe(true)
    let dessine = 0
    while (horloge.tourne && dessine < 400) {
      horloge.avance((ms += 16))
      dessine++
      await Promise.resolve()
    }
    expect(horloge.tourne).toBe(false)
    // le morph est fini : au moins sa duree, a 16 ms par image (la premiere a un `dt` nul)
    expect((dessine - 1) * 0.016).toBeGreaterThanOrEqual(BotEngine.SHAPE_MORPH)

    dispose()
    vi.unstubAllGlobals()
  })
})
