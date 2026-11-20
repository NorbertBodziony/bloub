import { describe, expect, it } from 'vitest'
import type { RenderedEye } from '@/bot/engine'
import { yeuxStables } from './sous-pixel'

const oeil = (e: number, f: number, b = -0.17): RenderedEye => ({
  d: 'M0,0',
  matrix: `matrix(0.98,${b},0.19,0.92,${e},${f})`,
  alpha: 1,
  w: 20,
  h: 30,
  open: 1,
  rest: 1
})

describe('yeuxStables', () => {
  it("garde les yeux d'avant tant que la derive reste sous la tolerance, puis la publie", () => {
    let publies = [oeil(3.68, -35.23)]
    const premiers = publies
    const sorties: number[] = []
    for (let i = 1; i <= 40; i++) {
      const suivants = [oeil(3.68 - i * 0.01, -35.23)]
      publies = yeuxStables(publies, suivants, 0.15)
      if (publies === suivants) sorties.push(i)
    }
    expect(sorties).toEqual([16, 32])
    expect(publies).not.toBe(premiers)
  })

  it('publie tout changement de forme, de matrice lineaire ou de liste', () => {
    const avant = [oeil(1, 1)]
    expect(yeuxStables(avant, [{ ...oeil(1, 1), alpha: 0.9 }], 1)).not.toBe(avant)
    expect(yeuxStables(avant, [oeil(1, 1, -0.1)], 1)).not.toBe(avant)
    expect(yeuxStables(avant, [oeil(1, 1), oeil(2, 2)], 1)).not.toBe(avant)
    expect(yeuxStables(avant, [oeil(1.001, 1)], 0)).not.toBe(avant)
    expect(yeuxStables(avant, [oeil(1.001, 1)], 1)).toBe(avant)
  })
})
