import { describe, expect, it } from 'vitest'
import { BotEngine } from '@/bot/engine'
import { RAYON } from '@/bot/repere'
import { SHAPE_BY_ID } from '@/bot/skins'
import { DUREE, POP, RETRAIT, TECHNIQUES, popCourbe, rayonsWarp, rendu } from './techniques'

const PAS = 1 / 240
/*
 * « De profil » : la piece passe le profil a sa vitesse maximale (easeInOutCubic), une
 * dizaine de largeurs par seconde ; a 240 images/s, l'image du basculement montre au plus
 * une tranche de 4 % de large. Au-dela de 5 %, l'echange se verrait.
 */
const PROFIL = 0.05

describe('transitions de forme (galerie)', () => {
  it('partent de l ancien corps et finissent sur le nouveau, a l echelle 1', () => {
    for (const t of TECHNIQUES) {
      const avant = rendu(t, -PAS)
      expect([avant.corps, avant.sx, avant.sy, avant.bascule], t).toEqual(['avant', 1, 1, false])
      const fin = rendu(t, DUREE[t])
      expect([fin.corps, fin.melange, fin.sx, fin.sy, fin.bascule, fin.fini], t).toEqual(['apres', 1, 1, 1, true, true])
      if (t === 'cut') continue
      // au premier instant, rien n'a encore bouge
      const debut = rendu(t, 0)
      expect(debut.sx, t).toBeCloseTo(1, 6)
      expect(debut.corps === 'apres' ? 1 : debut.melange, t).toBeCloseTo(0, 6)
    }
  })

  it('ne sautent pas', () => {
    for (const t of TECHNIQUES.filter((t) => t !== 'cut')) {
      let prec = rendu(t, 0)
      let pire = 0
      for (let s = PAS; s <= DUREE[t] + PAS; s += PAS) {
        const r = rendu(t, s)
        // le poids du nouveau corps, vu de l'ecran : 0 tant que seul l'ancien est la
        const poids = (x: typeof r) => (x.corps === 'avant' ? 0 : x.corps === 'apres' ? 1 : x.melange)
        // au basculement d'un corps a l'autre, il faut qu'il soit invisible (profil, pop a 0)
        if (r.corps !== prec.corps && r.corps !== 'deux' && prec.corps !== 'deux') {
          expect(Math.max(r.sx * r.sy, prec.sx * prec.sy), `${t} bascule a ${s}`).toBeLessThan(PROFIL)
        } else pire = Math.max(pire, Math.abs(poids(r) - poids(prec)))
        pire = Math.max(pire, Math.abs(r.sx - prec.sx), Math.abs(r.sy - prec.sy))
        prec = r
      }
      // la pente la plus raide est celle d'un easeOutQuint au depart : 5 / duree par seconde
      expect(pire, t).toBeLessThan((5 / Math.min(DUREE[t], RETRAIT)) * PAS * 1.05)
    }
  })

  it('le moteur change de forme quand la piece est de profil, pas avant', () => {
    for (let s = 0; s < DUREE.flip; s += PAS) {
      const r = rendu('flip', s)
      const avant = rendu('flip', s - PAS)
      if (r.bascule && !avant.bascule) expect(r.sx).toBeLessThan(PROFIL)
    }
  })

  it('le pop reprend la courbe de la pastille de notify', () => {
    expect(POP).toBeGreaterThan(0.2)
    expect(Math.max(...Array.from({ length: 200 }, (_, i) => popCourbe((i / 200) * POP)))).toBeGreaterThan(1.1)
    expect(popCourbe(POP)).toBe(1)
  })

  it('le feutre deforme suit le contour du moteur, donc les yeux', () => {
    const avant = SHAPE_BY_ID.get('cercle')!.radii
    const apres = SHAPE_BY_ID.get('losange')!.radii
    const engine = new BotEngine(RAYON, 'idle', avant, null)
    const t0 = 3.2
    engine.setShape(apres, t0)
    const forme = engine as unknown as { shapeAtTime(t: number): number[] }
    for (let s = 0; s <= DUREE.warp + 0.05; s += PAS * 7) {
      const moteur = forme.shapeAtTime(t0 + s)
      const warp = rayonsWarp(avant, apres, s)
      for (let i = 0; i < warp.length; i++) expect(warp[i]).toBeCloseTo(moteur[i]!, 12)
    }
  })
})
