/**
 * Egalite de CONTENU pour les donnees d'une image : tableaux, objets plats, nombres, chaines.
 * Le moteur rend des objets neufs a chaque image ; un `createMemo` qui les compare ainsi ne
 * relance pas les lignes d'un `For` dont rien n'a bouge. Le doute (une cle absente d'un cote,
 * `NaN`) compte comme un changement : on redessine de trop, jamais de moins.
 */
export function memeContenu(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!memeContenu(a[i], b[i])) return false
    return true
  }
  if (Array.isArray(b)) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  for (const k of ka) if (!(k in rb) || !memeContenu(ra[k], rb[k])) return false
  return true
}
