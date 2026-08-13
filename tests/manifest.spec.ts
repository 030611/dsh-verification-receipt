import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const OFFICIAL_HEAD = '47f943859bef60e4160492346772ded9b24f765a'

describe('release manifest', () => {
  it('binds evidence-backed peer ranges to the audited DSH head', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
      peerDependencies: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
      dependencies?: Record<string, string>
      dshCompatibility?: { testedHead?: string, peersAtTestedHead?: Record<string, string> }
    }
    expect(manifest.peerDependencies).toEqual({
      '@deepseek-ai/cordis': '^4.0.1',
      '@deepseek-ai/dsh-session': '>=0.1.0-rc.5 <0.1.0',
      '@deepseek-ai/schemastery': '^3.18.1',
    })
    expect(manifest).toMatchObject({
      dependencies: { '@deepseek-ai/schemastery': '3.18.1' },
      peerDependenciesMeta: {
        '@deepseek-ai/cordis': { optional: true },
        '@deepseek-ai/dsh-session': { optional: true },
      },
    })
    expect(manifest.dshCompatibility).toEqual({
      testedHead: OFFICIAL_HEAD,
      peersAtTestedHead: {
        '@deepseek-ai/cordis': '4.0.1',
        '@deepseek-ai/dsh-session': '0.1.0-rc.5',
        '@deepseek-ai/schemastery': '3.18.1',
      },
    })
  })

  it('keeps both READMEs valid UTF-8 without replacement characters', async () => {
    for (const path of ['README.md', 'README.zh.md']) {
      expect(await readFile(path, 'utf8'), path).not.toContain('\uFFFD')
    }
  })
})
