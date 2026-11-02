import { render } from '@solidjs/web'
import Sandbox from './Sandbox'
import Transitions from './transitions/Transitions'

const root = document.getElementById('felt')
if (!root) throw new Error('element #felt introuvable')
// `#transitions` : les essais de changement de forme ; sinon la galerie
render(() => (location.hash.startsWith('#transitions') ? Transitions() : Sandbox()), root)
