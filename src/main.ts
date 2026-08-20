import { render } from 'solid-js/web'
import App from './App'
import './styles.css'

const root = document.getElementById('app')
if (!root) throw new Error('element #app introuvable')
render(() => App(), root)
