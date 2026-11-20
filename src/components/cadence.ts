/** sous ce delai avant la prochaine image a dessiner, la boucle ne dort pas (s) */
const SOMMEIL_MIN = 0.012
/** le reveil precede l'image de cette marge, pour tomber sur la bonne image de l'ecran (s) */
const REVEIL_AVANCE = 0.008
/** une somme de pas flottants tombe juste sous la bride : sans cette marge, l'image est sautee (s) */
const ARRONDI = 1e-6

export type Abonne = (ms: number) => void

type Cadence = {
  budget: number
  abonnes: Set<Abonne>
  raf: number
  sleeping: boolean
  last: number
  clock: number
  drawn: number
}

/*
 * Une seule boucle par bride `fps`, partagee par tous les bots qui la demandent. Chaque bot
 * gardait sa propre boucle : des bots montes a des instants differents dessinaient sur des
 * images differentes de l'ecran, et la page refaisait style, mise en page et peinture a
 * presque chaque image. Ici les bots d'une meme bride dessinent sur la meme image, dans un
 * seul rappel, donc une seule mise a jour Solid. Chaque bot garde son horloge et sa phase :
 * l'animation ne change pas, seul l'instant du dessin est commun.
 */
const cadences = new Map<number, Cadence>()

function cadenceDe(fps: number): Cadence {
  const cle = fps > 0 ? fps : 0
  let cadence = cadences.get(cle)
  if (!cadence) {
    cadence = {
      budget: cle > 0 ? 1 / cle : 0,
      abonnes: new Set(),
      raf: 0,
      sleeping: false,
      last: 0,
      clock: 0,
      drawn: -Infinity
    }
    cadences.set(cle, cadence)
  }
  return cadence
}

function planifier(cadence: Cadence, wait: number) {
  cadence.sleeping = wait > SOMMEIL_MIN
  cadence.raf = cadence.sleeping
    ? window.setTimeout(() => reveiller(cadence), (wait - REVEIL_AVANCE) * 1000)
    : requestAnimationFrame((ms) => battre(cadence, ms))
}

function reveiller(cadence: Cadence) {
  cadence.sleeping = false
  cadence.raf = requestAnimationFrame((ms) => battre(cadence, ms))
}

/*
 * L'horloge de la cadence avance comme celle d'un bot : un sommeil sous la bride ne compte
 * pas comme une longue absence, et une image sautee ne fait pas perdre de temps.
 */
function battre(cadence: Cadence, ms: number) {
  const { budget } = cadence
  const dt = cadence.last ? Math.min((ms - cadence.last) / 1000, 0.064 + budget) : 0
  cadence.last = ms
  cadence.clock += dt
  const early = cadence.clock - cadence.drawn < budget - ARRONDI
  planifier(cadence, early ? budget - (cadence.clock - cadence.drawn) : budget)
  if (early) return
  cadence.drawn = cadence.clock
  let erreur: { valeur: unknown } | null = null
  for (const abonne of [...cadence.abonnes]) {
    if (!cadence.abonnes.has(abonne)) continue
    try {
      abonne(ms)
    } catch (valeur) {
      erreur ??= { valeur }
    }
  }
  if (erreur) throw erreur.valeur
}

function arreter(cadence: Cadence) {
  if (cadence.sleeping) clearTimeout(cadence.raf)
  else if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(cadence.raf)
  cadence.raf = 0
  cadence.sleeping = false
  cadence.last = 0
  cadence.clock = 0
  cadence.drawn = -Infinity
}

/**
 * Abonne `rappel` aux images dessinees de la bride `fps` (0 ou absent : chaque image de
 * l'ecran). Rend la fonction de desabonnement ; le dernier desabonnement arrete la boucle.
 */
export function abonnerCadence(fps: number | undefined, rappel: Abonne): () => void {
  const cadence = cadenceDe(fps ?? 0)
  cadence.abonnes.add(rappel)
  if (!cadence.raf) {
    cadence.sleeping = false
    cadence.raf = requestAnimationFrame((ms) => battre(cadence, ms))
  }
  return () => {
    if (!cadence.abonnes.delete(rappel) || cadence.abonnes.size) return
    arreter(cadence)
  }
}
