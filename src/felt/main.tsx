import { render } from '@solidjs/web'
import Atelier from './Atelier'
import Sandbox from './Sandbox'
import Transitions from './transitions/Transitions'

const root = document.getElementById('felt')
if (!root) throw new Error('element #felt introuvable')
// `#transitions` : les essais de changement de forme ; `#atelier` : le personnaliseur ; sinon la galerie
const page = location.hash.startsWith('#transitions') ? Transitions : location.hash.startsWith('#atelier') ? Atelier : Sandbox
render(() => page(), root)
