// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
  offered: true,
  defaultBrand: vi.fn(async () => ({ id: 'organisation:pure-science', name: 'pure.science' })),
  onBrandsChanged: vi.fn(() => () => {}),
}))
vi.mock('@purescience/platform-ui/bridge/brands.mjs', () => ({
  brandsOffered: () => bridge.offered,
  defaultBrand: bridge.defaultBrand,
  getBrand: vi.fn(),
  listBrands: vi.fn(async () => []),
  onBrandsChanged: bridge.onBrandsChanged,
  proposeBrand: vi.fn(),
  proposeBrandSamples: vi.fn(),
}))

import { brandsOffered, defaultBrand, onBrandsChanged } from './platformBridge'

describe('the brands bridge wrappers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    bridge.defaultBrand.mockClear()
    bridge.onBrandsChanged.mockClear()
    bridge.offered = true
  })

  it('reads the house style when the shell offers brands', async () => {
    vi.stubEnv('DEV', false)
    expect(brandsOffered()).toBe(true)
    expect(await defaultBrand()).toMatchObject({ name: 'pure.science' })
  })

  it('is one cheap null, with no call, when the shell does not offer them', async () => {
    vi.stubEnv('DEV', false)
    bridge.offered = false
    expect(brandsOffered()).toBe(false)
    expect(await defaultBrand()).toBeNull()
    expect(bridge.defaultBrand).not.toHaveBeenCalled()
    onBrandsChanged(() => {})()
    expect(bridge.onBrandsChanged).not.toHaveBeenCalled()
  })

  it('is off in standalone development, where there is no shell', async () => {
    vi.stubEnv('DEV', true)
    expect(brandsOffered()).toBe(false)
    expect(await defaultBrand()).toBeNull()
  })
})
