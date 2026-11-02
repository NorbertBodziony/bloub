import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const temporary = mkdtempSync(join(tmpdir(), 'bloub-package-'))
const packageSpec = process.argv[2]
const solidVersion = process.env.BLOUB_SOLID_VERSION ?? rootPackage.devDependencies['solid-js']

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' })
}

try {
  const output = JSON.parse(
    execFileSync('npm', ['pack', ...(packageSpec ? [packageSpec] : []), '--json', '--pack-destination', temporary], {
      cwd: root,
      encoding: 'utf8'
    })
  )
  // npm 11 rend un tableau, npm 12 un objet indexe par nom de paquet.
  const packed = Array.isArray(output) ? output[0] : Object.values(output)[0]
  if (!packed?.files) throw new Error(`Unexpected npm pack output: ${JSON.stringify(output).slice(0, 200)}`)
  const packedPaths = packed.files.map((file) => file.path)
  const forbidden = packedPaths.filter(
    (path) => path.endsWith('.map') || path.startsWith('src/') || path.includes('mediabunny')
  )
  if (forbidden.length) throw new Error(`Forbidden package files: ${forbidden.join(', ')}`)

  for (const required of [
    'LICENSE',
    'README.md',
    'package.json',
    'dist/package/index.js',
    'dist/package/server.js',
    'dist/package/types/index.d.ts',
    'dist/package/plush.js',
    'dist/package/plush-server.js',
    'dist/package/types/plush/index.d.ts',
    'dist/package/assets/boule.webp'
  ]) {
    if (!packedPaths.includes(required)) throw new Error(`Missing package file: ${required}`)
  }

  // chaque image que `plush.js` reference est dans l'archive : une URL sans fichier est un 404
  const plushCode = readFileSync(join(root, 'dist/package/plush.js'), 'utf8')
  const referenced = [...plushCode.matchAll(/new URL\("\.\/(assets\/[^"]+)"/g)].map((m) => `dist/package/${m[1]}`)
  if (referenced.length < 12) throw new Error(`plush.js references only ${referenced.length} images`)
  const unpacked = referenced.filter((path) => !packedPaths.includes(path))
  if (unpacked.length) throw new Error(`Images referenced but not packed: ${unpacked.join(', ')}`)
  if (/data:image/.test(plushCode)) throw new Error('plush.js inlines an image')

  // l'entree principale n'emmene pas la peluche : ni ses images, ni son code
  const mainFiles = ['dist/package/index.js', 'dist/package/server.js']
  for (const file of mainFiles) {
    const code = readFileSync(join(root, file), 'utf8')
    const imports = [...code.matchAll(/from ?"(\.\/[^"]+)"/g)].map((m) => join(dirname(file), m[1]))
    for (const path of [file, ...imports]) {
      const text = readFileSync(join(root, path), 'utf8')
      if (/\.webp|PlushBot|plush/i.test(text)) throw new Error(`${path} pulls plush code into the main entry`)
    }
  }

  const consumer = join(temporary, 'consumer')
  const source = join(consumer, 'src')
  mkdirSync(source, { recursive: true })
  const tarball = join(temporary, packed.filename)

  writeFileSync(
    join(consumer, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          '@norbert_bodziony/bloub': `file:${tarball}`,
          '@solidjs/web': rootPackage.devDependencies['@solidjs/web'],
          'solid-js': solidVersion
        },
        devDependencies: {
          '@types/node': rootPackage.devDependencies['@types/node'],
          typescript: rootPackage.devDependencies.typescript,
          vite: rootPackage.devDependencies.vite,
          '@solidjs/vite-plugin': rootPackage.devDependencies['@solidjs/vite-plugin']
        }
      },
      null,
      2
    )
  )
  writeFileSync(
    join(consumer, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          lib: ['ESNext', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'preserve',
          jsxImportSource: '@solidjs/web',
          noEmit: true,
          types: ['node', 'vite/client']
        },
        include: ['src', 'vite.config.ts']
      },
      null,
      2
    )
  )
  writeFileSync(
    join(consumer, 'vite.config.ts'),
    "import solid from '@solidjs/vite-plugin'\nimport { defineConfig } from 'vite'\nexport default defineConfig({ plugins: [solid()] })\n"
  )
  writeFileSync(
    join(consumer, 'index.html'),
    '<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.tsx"></script></body></html>\n'
  )
  writeFileSync(
    join(source, 'main.tsx'),
    `import { render } from '@solidjs/web'
import { BloubBot, defaultCycle, type BloubBotRef } from '@norbert_bodziony/bloub'

let bot: BloubBotRef | undefined
render(
  () => <BloubBot ref={(value) => { bot = value }} cycle={defaultCycle().blocks} playing />,
  document.getElementById('app')!
)
export const controller = () => bot
`
  )

  run('bun', ['install'], consumer)
  run('bunx', ['tsc', '--noEmit'], consumer)
  run('bunx', ['vite', 'build'], consumer)
  run(
    'node',
    [
      '--input-type=module',
      '--eval',
      "import { BloubBot, BotEngine, defaultCycle } from '@norbert_bodziony/bloub'; if (typeof BloubBot !== 'function' || !new BotEngine().sample(0).bodyPath || defaultCycle().blocks.length !== 14) process.exit(1)"
    ],
    consumer
  )

  const assets = join(consumer, 'dist', 'assets')
  const browserBytes = readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .reduce((total, name) => total + gzipSync(readFileSync(join(assets, name))).length, 0)
  if (browserBytes > 40_000) {
    throw new Error(`Consumer JavaScript is too large: ${browserBytes} gzip bytes`)
  }

  /*
   * La peluche dans un vrai projet : le bundler du consommateur doit emettre les images
   * que le bot affiche, puisque le paquet ne les incruste pas.
   */
  writeFileSync(
    join(source, 'main.tsx'),
    `import { render } from '@solidjs/web'
import { PlushBot } from '@norbert_bodziony/bloub/plush'

render(
  () => <PlushBot character="nexo" state="thinking" />,
  document.getElementById('app')!
)
`
  )
  run('bunx', ['tsc', '--noEmit'], consumer)
  run('bunx', ['vite', 'build', '--outDir', 'dist-plush'], consumer)
  const plushAssets = readdirSync(join(consumer, 'dist-plush', 'assets'))
  for (const image of ['nexo-corps', 'nexo-oeil0', 'boule']) {
    if (!plushAssets.some((name) => name.startsWith(image) && name.endsWith('.webp'))) {
      throw new Error(`The consumer build did not emit ${image}.webp`)
    }
  }
  run(
    'node',
    [
      '--input-type=module',
      '--eval',
      "import { PlushBot, PLUSH_CHARACTERS } from '@norbert_bodziony/bloub/plush'; if (typeof PlushBot !== 'function' || PLUSH_CHARACTERS.length !== 6) process.exit(1)"
    ],
    consumer
  )

  console.log(
    `bloub tarball with solid-js@${solidVersion}: ${packed.size} bytes, ${packed.entryCount} files; consumer JS: ${browserBytes} gzip bytes`
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
