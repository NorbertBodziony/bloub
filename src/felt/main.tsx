import { render } from '@solidjs/web'
import { feltGl } from '@/components/feltgl'
import Sandbox from './Sandbox'
import detail from './feutre-detail.png'

const root = document.getElementById('felt')
if (!root) throw new Error('element #felt introuvable')

/*
 * La tuile de feutrine est decoupee dans l'affiche de reference, eclairage retire
 * (voir `feutre-detail.png`). Posee avant le premier rendu : les bots figes ne se
 * redessinent pas d'eux-memes. `#fibres=bruit` garde les fibres procedurales.
 */
if (!new URLSearchParams(location.hash.slice(1)).has('fibres')) {
  const image = new Image()
  image.src = detail
  await image.decode()
  feltGl()?.useDetail(image)
}
render(() => Sandbox(), root)
