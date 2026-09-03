import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const DSH_RANGE = '0.1.2-alpha.3 || 0.1.2-alpha.4 || 0.1.2-alpha.5'

describe('release manifest', () => {
  it('binds evidence-backed peer ranges to the audited DSH head', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
      packageManager?: string
      peerDependencies: Record<string, string>
      peerDependenciesMeta?: Record<string, { optional?: boolean }>
      dependencies?: Record<string, string>
      dsh?: {
        compatibility?: {
          dsh?: string
          dshReleases?: Record<string, string>
          profiles?: string[]
        }
      }
    }
    expect(manifest.packageManager).toBe('pnpm@11.19.0')
    expect(manifest.peerDependencies).toEqual({
      '@deepseek-ai/cordis': '^4.0.2',
      '@deepseek-ai/dsh-session': DSH_RANGE,
      '@deepseek-ai/schemastery': '^3.18.2',
    })
    expect(manifest).toMatchObject({
      dependencies: { '@deepseek-ai/schemastery': '3.18.2' },
      peerDependenciesMeta: {
        '@deepseek-ai/cordis': { optional: true },
        '@deepseek-ai/dsh-session': { optional: true },
      },
    })
    expect(manifest.dsh?.compatibility).toEqual({
      dsh: DSH_RANGE,
      dshReleases: {
        '0.1.2-alpha.3': 'compatible',
        '0.1.2-alpha.4': 'compatible',
        '0.1.2-alpha.5': 'compatible',
      },
      profiles: ['web'],
    })
  })

  it('keeps both READMEs valid UTF-8 without replacement characters', async () => {
    for (const path of ['README.md', 'README.zh.md']) {
      expect(await readFile(path, 'utf8'), path).not.toContain('\uFFFD')
    }
  })
})
