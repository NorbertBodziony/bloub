/*
 * Teinture des corps gris. Un corps gris est la luminance seule d'une generation, sa
 * mediane ramenee a GRIS (`tools/peluche/fit/forme.py`). La teinte est une table de 256
 * couleurs indexee par ce gris : la mediane tombe sur la couleur demandee, les creux de
 * fibres s'assombrissent et se saturent, les fibres eclairees blanchissent un peu.
 *
 * Elle est calculee UNE fois par (image, couleur), sur un canvas, et gardee en URL
 * `data:` : aucun filtre dans la boucle de rendu, dont chaque image coute deja une
 * mise en page et une peinture (`docs/architecture.md`).
 *
 * `data:` et pas une URL d'objet (`blob:`) : une page dont la CSP limite `img-src` a
 * `'self' data:` refuse les `blob:`, et le corps restait vide. L'encodage passe quand meme
 * par `toBlob`, asynchrone, hors du fil principal ; `toDataURL` encoderait sur place.
 */

/** la mediane de l'interieur d'un corps gris (`GRIS_CIBLE` de `forme.py`) */
export const GRIS = 0.55

/**
 * Courbe de la teinte, ajustee (`tools/peluche/mesure/teinte.py`) sur les quantiles des
 * corps cuits de Nexo, Malu, Yoshi, Vita et Fred, chaque forme grise teinte de l'encre du
 * personnage : ecart moyen par canal 14,3 sur 255, contre 18,8 pour la courbe d'avant.
 * `gamma` creuse les ombres, `sheen` blanchit les fibres au-dessus de la mediane.
 * La mediane reste la couleur demandee : un facteur d'exposition gagnait encore un peu,
 * mais seulement parce que le corps cuit de Malu est plus sombre que son encre, ce qui
 * tient a sa generation et pas a la matiere (celui de Yoshi est plus clair que la sienne).
 */
export const TINT = { gamma: 0.6, sheen: 0.08 }

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const srgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

export function parseHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * La table : pour chaque gris 0..255, la couleur RGB 0..255. Pure, donc testable, et
 * c'est elle qu'on etalonne. En lumiere lineaire : la couleur, multipliee par l'ecart de
 * luminance a la mediane (puissance `gamma`), puis melangee vers le blanc au-dessus.
 */
export function tintRamp(hex: string, { gamma, sheen } = TINT): Uint8ClampedArray {
  const ink = parseHex(hex).map((c) => lin(c / 255))
  const mid = lin(GRIS)
  const out = new Uint8ClampedArray(256 * 3)
  for (let g = 0; g < 256; g++) {
    const l = lin(g / 255)
    const k = (l / mid) ** gamma
    const haut = sheen * Math.max(0, (g / 255 - GRIS) / (1 - GRIS)) ** 2
    for (let c = 0; c < 3; c++) {
      const v = Math.min(1, ink[c]! * k)
      out[g * 3 + c] = Math.round(srgb(v + (1 - v) * haut) * 255)
    }
  }
  return out
}

const cache = new Map<string, Promise<string>>()

/** Le blob en URL `data:`, sans passer par une URL d'objet. */
function enData(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader()
    lecteur.onload = () =>
      typeof lecteur.result === 'string' ? resolve(lecteur.result) : reject(new Error('plush: teinture illisible'))
    lecteur.onerror = () => reject(lecteur.error ?? new Error('plush: teinture illisible'))
    lecteur.readAsDataURL(blob)
  })
}

function charge(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`plush: image introuvable ${url}`))
    img.src = url
  })
}

/** L'URL `data:` du corps `url` teint en `hex`, calculee une fois. Navigateur seulement. */
export function tinted(url: string, hex: string): Promise<string> {
  const clef = `${hex.toLowerCase()} ${url}`
  let pending = cache.get(clef)
  if (!pending) {
    pending = charge(url).then((img) => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const ramp = tintRamp(hex)
      const px = data.data
      // le corps gris a R = G = B : le canal rouge suffit comme index
      for (let i = 0; i < px.length; i += 4) {
        const g = px[i]! * 3
        px[i] = ramp[g]!
        px[i + 1] = ramp[g + 1]!
        px[i + 2] = ramp[g + 2]!
      }
      ctx.putImageData(data, 0, 0)
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.92)).then((blob) =>
        blob ? enData(blob) : canvas.toDataURL()
      )
    })
    // un echec ne reste pas en cache : le prochain essai recharge
    pending.catch(() => cache.delete(clef))
    cache.set(clef, pending)
  }
  return pending
}
