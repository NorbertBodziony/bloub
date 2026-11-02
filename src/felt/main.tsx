import { render } from '@solidjs/web'
import Sandbox from './Sandbox'

const root = document.getElementById('felt')
if (!root) throw new Error('element #felt introuvable')
render(() => Sandbox(), root)
