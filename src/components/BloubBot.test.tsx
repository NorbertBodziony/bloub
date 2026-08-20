// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { describe, expect, it, vi } from 'vitest'
import BloubBot, { type BloubBotRef } from './BloubBot'
import { defaultCycle } from '@/bot/cycles'

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
})
