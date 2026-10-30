import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'

const EXPECTED_FILES = [
  'LICENSE',
  'README.md',
  'README.zh.md',
  'SECURITY.md',
  'cordis.patch.yml',
  'docs/compatibility-0.1.1.md',
  'dsh.plugin.json',
  'lib/index.js',
  'lib/types/index.d.ts',
  'lib/types/receipt.d.ts',
  'package.json',
]

const root = resolve(import.meta.dirname, '..')
const work = await mkdtemp(join(root, '.release-smoke-'))
const pnpmCli = process.env.npm_execpath
if (pnpmCli === undefined) throw new Error('run this check through pnpm run release:smoke')

function run(args, cwd = root) {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout
}

try {
  // Packing must create the distributable without relying on stale lib/.
  await rm(join(root, 'lib'), { recursive: true, force: true })

  // Retain the source manifest so pnpm's default lifecycle stripping cannot
  // conceal install hooks that another packager would leave in the tarball.
  const raw = run(['pack', '--skip-manifest-obfuscation', '--json', '--silent', '--pack-destination', work])
  const parsed = JSON.parse(raw)
  const packed = Array.isArray(parsed) ? parsed[0] : parsed
  const paths = packed.files.map(file => file.path).sort()
  const expected = [...EXPECTED_FILES].sort()
  if (JSON.stringify(paths) !== JSON.stringify(expected)) {
    throw new Error(`unexpected pack files\nactual: ${JSON.stringify(paths)}\nexpected: ${JSON.stringify(expected)}`)
  }

  const tgz = resolve(work, packed.filename)
  for (const scriptsEnabled of [false, true]) {
    const consumer = join(work, scriptsEnabled ? 'scripts-enabled' : 'scripts-disabled')
    await mkdir(consumer)
    await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n', 'utf8')
    await writeFile(join(consumer, 'pnpm-workspace.yaml'),
      'packages:\n  - .\nallowBuilds:\n  dsh-verification-receipt: true\n', 'utf8')
    run([
      'add', scriptsEnabled ? '--ignore-scripts=false' : '--ignore-scripts',
      tgz,
      '@deepseek-ai/cordis@4.0.2',
      '@deepseek-ai/dsh-session@0.1.2-alpha.5',
      '@deepseek-ai/schemastery@3.18.2',
    ], consumer)
    await writeFile(join(consumer, 'smoke.mjs'), [
      "import * as plugin from 'dsh-verification-receipt'",
      "if (typeof plugin.apply !== 'function' || typeof plugin.createReceipt !== 'function') throw new Error('bad root exports')",
      "if (plugin.name !== 'verification-receipt') throw new Error('bad plugin name')",
      "const start = { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } }",
      "const end = { type: 'turn/end', seq: 1, time: 2, data: { turn: 1, reason: { kind: 'completed' } } }",
      "const receipt = plugin.createReceipt({ id: 'pack-smoke', events: [start, end] }, end)",
      "if (receipt.outcome !== 'completed' || receipt.tools.calls !== 0 || receipt.claim !== 'execution-trace-only') throw new Error('packed receipt behavior changed')",
      "console.log('tgz-package-import: ok')",
      '',
    ].join('\n'), 'utf8')
    const importedResult = spawnSync(process.execPath, ['smoke.mjs'], { cwd: consumer, encoding: 'utf8' })
    if (importedResult.status !== 0) throw new Error(`package import failed\n${importedResult.stderr}`)
    const imported = importedResult.stdout.trim()
    const packageRoot = join(consumer, 'node_modules', 'dsh-verification-receipt')
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    if (manifest.name !== 'dsh-verification-receipt') throw new Error('installed package name changed')
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare']) {
      if (manifest.scripts?.[hook] !== undefined) throw new Error(`consumer install hook in tarball: ${hook}`)
    }
    for (const path of ['README.md', 'README.zh.md']) {
      const readme = await readFile(join(packageRoot, path), 'utf8')
      if (readme.includes('\uFFFD')) throw new Error(`${path} is not valid UTF-8 content`)
    }
    const chinese = await readFile(join(packageRoot, 'README.zh.md'), 'utf8')
    if (!chinese.includes('启发式执行摘要')) throw new Error('Chinese README content missing from tarball')
    console.log(`${scriptsEnabled ? 'scripts-enabled' : 'scripts-disabled'}: ${imported}; receipt behavior: ok`)
  }
  console.log(`fresh-pack-files: ${paths.length} exact`)
} finally {
  await rm(work, { recursive: true, force: true })
}
