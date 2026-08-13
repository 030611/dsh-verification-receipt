import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'

const EXPECTED_FILES = [
  'LICENSE',
  'README.md',
  'README.zh.md',
  'SECURITY.md',
  'cordis.patch.yml',
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
  const raw = run(['pack', '--json', '--silent', '--pack-destination', work])
  const parsed = JSON.parse(raw)
  const packed = Array.isArray(parsed) ? parsed[0] : parsed
  const paths = packed.files.map(file => file.path).sort()
  const expected = [...EXPECTED_FILES].sort()
  if (JSON.stringify(paths) !== JSON.stringify(expected)) {
    throw new Error(`unexpected pack files\nactual: ${JSON.stringify(paths)}\nexpected: ${JSON.stringify(expected)}`)
  }

  const tgz = resolve(work, packed.filename)
  await writeFile(join(work, 'package.json'), '{"private":true,"type":"module"}\n', 'utf8')
  await writeFile(join(work, 'pnpm-workspace.yaml'), 'packages:\n  - .\n', 'utf8')
  run([
    'add', '--ignore-scripts',
    tgz,
    '@deepseek-ai/cordis@4.0.1',
    '@deepseek-ai/dsh-session@0.1.0-rc.6',
    '@deepseek-ai/schemastery@3.18.1',
  ], work)
  await writeFile(join(work, 'smoke.mjs'), [
    "import * as plugin from 'dsh-verification-receipt'",
    "if (typeof plugin.apply !== 'function' || typeof plugin.createReceipt !== 'function') throw new Error('bad root exports')",
    "if (plugin.name !== 'verification-receipt') throw new Error('bad plugin name')",
    "console.log('tgz-package-import: ok')",
    '',
  ].join('\n'), 'utf8')
  const importedResult = spawnSync(process.execPath, ['smoke.mjs'], { cwd: work, encoding: 'utf8' })
  if (importedResult.status !== 0) throw new Error(`package import failed\n${importedResult.stderr}`)
  const imported = importedResult.stdout.trim()
  const manifest = JSON.parse(await readFile(join(work, 'node_modules', 'dsh-verification-receipt', 'package.json'), 'utf8'))
  if (manifest.name !== 'dsh-verification-receipt') throw new Error('installed package name changed')
  for (const path of ['README.md', 'README.zh.md']) {
    const readme = await readFile(join(work, 'node_modules', 'dsh-verification-receipt', path), 'utf8')
    if (readme.includes('\uFFFD')) throw new Error(`${path} is not valid UTF-8 content`)
  }
  const chinese = await readFile(join(work, 'node_modules', 'dsh-verification-receipt', 'README.zh.md'), 'utf8')
  if (!chinese.includes('启发式执行摘要')) throw new Error('Chinese README content missing from tarball')
  console.log(`pack-files: ${paths.length} exact`)
  console.log(imported)
} finally {
  await rm(work, { recursive: true, force: true })
}
