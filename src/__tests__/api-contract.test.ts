/**
 * API Contract Tests
 *
 * These tests validate that the production API responses match the CLI's expected schemas.
 * Run before publishing CLI to catch schema mismatches early.
 *
 * IMPORTANT: Schemas are imported from api.ts to ensure we test the REAL definitions.
 * Never duplicate schemas here - that's how the beta tier bug happened!
 */

import { describe, test, expect } from 'vitest'
import { z } from 'zod'

// Import schemas from the actual API module - NEVER duplicate!
import { TierSchema, KitTypeSchema } from '../lib/api'

const API_BASE_URL = process.env.API_URL || 'https://aiorg.dev'

// Build schemas using imported enums
const LatestVersionSchema = z.object({
  version: z.string(),
  releasedAt: z.string(),
  packageName: z.string(),
  packageDisplayName: z.string(),
  changelog: z.record(z.string(), z.any()).optional(),
  tier: TierSchema.optional(),
  type: KitTypeSchema.optional(),
})

const ListKitsSchema = z.object({
  kits: z.array(z.object({
    name: z.string(),
    displayName: z.string(),
    description: z.string().nullable(),
    tier: TierSchema,
    type: KitTypeSchema,
    deployMode: z.string().nullable(),
    version: z.string(),
    priceCents: z.number(),
  }))
})

const VerifyLicenseResponseSchema = z.object({
  valid: z.boolean(),
  email: z.string().optional(),
  tier: TierSchema.optional(),
  kits: z.array(z.object({
    name: z.string(),
    tier: TierSchema,
    purchasedAt: z.string(),
  })).optional(),
  error: z.string().optional(),
})

const DownloadResponseSchema = z.object({
  downloadUrl: z.string(),
  version: z.string(),
  filename: z.string(),
})

describe('API Contract Tests', () => {
  // Skip in CI if no network or for unit test runs
  const isCI = process.env.CI === 'true'
  const runIntegration = process.env.RUN_INTEGRATION === 'true' || !isCI

  describe.runIf(runIntegration)('GET /api/kits', () => {
    test('response matches ListKitsSchema', async () => {
      const response = await fetch(`${API_BASE_URL}/api/kits`)
      expect(response.ok).toBe(true)

      const data = await response.json()
      const result = ListKitsSchema.safeParse(data)

      if (!result.success) {
        console.error('Schema validation failed:', JSON.stringify(result.error.issues, null, 2))
      }
      expect(result.success).toBe(true)
    })

    test('all tiers are valid enum values', async () => {
      const response = await fetch(`${API_BASE_URL}/api/kits`)
      const data = await response.json()

      for (const kit of data.kits) {
        const tierResult = TierSchema.safeParse(kit.tier)
        expect(tierResult.success, `Invalid tier "${kit.tier}" for kit "${kit.name}"`).toBe(true)
      }
    })
  })

  describe.runIf(runIntegration)('GET /api/kits/[name]/latest', () => {
    const testKits = ['claude-starter', 'idea-os']

    test.each(testKits)('response for %s matches LatestVersionSchema', async (kitName) => {
      const response = await fetch(`${API_BASE_URL}/api/kits/${kitName}/latest`)

      if (!response.ok) {
        console.warn(`Kit ${kitName} not found, skipping`)
        return
      }

      const data = await response.json()
      const result = LatestVersionSchema.safeParse(data)

      if (!result.success) {
        console.error(`Schema validation failed for ${kitName}:`, JSON.stringify(result.error.issues, null, 2))
      }
      expect(result.success).toBe(true)
    })

    test('paid kit (investor-os) response matches schema', async () => {
      const response = await fetch(`${API_BASE_URL}/api/kits/investor-os/latest`)

      // Paid kit should still return latest info (just download is restricted)
      if (!response.ok) {
        console.warn('investor-os not found, skipping')
        return
      }

      const data = await response.json()
      const result = LatestVersionSchema.safeParse(data)

      if (!result.success) {
        console.error('Schema validation failed for investor-os:', JSON.stringify(result.error.issues, null, 2))
      }
      expect(result.success).toBe(true)

      // Verify it's actually paid
      if (data.tier) {
        expect(data.tier).toBe('paid')
      }
    })
  })

  describe.runIf(runIntegration)('POST /api/licenses/verify', () => {
    test('valid license response matches schema', async () => {
      // Use a test license key if available
      const testKey = process.env.TEST_LICENSE_KEY || 'ak_investor_private_beta_2026'

      const response = await fetch(`${API_BASE_URL}/api/licenses/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: testKey })
      })

      const data = await response.json()
      const result = VerifyLicenseResponseSchema.safeParse(data)

      if (!result.success) {
        console.error('Schema validation failed:', JSON.stringify(result.error.issues, null, 2))
      }
      expect(result.success).toBe(true)
    })

    test('invalid license response matches schema', async () => {
      const response = await fetch(`${API_BASE_URL}/api/licenses/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'invalid_key_12345' })
      })

      const data = await response.json()
      const result = VerifyLicenseResponseSchema.safeParse(data)

      expect(result.success).toBe(true)
      expect(data.valid).toBe(false)
    })

    test('all kit tiers in license response are valid', async () => {
      const testKey = process.env.TEST_LICENSE_KEY || 'ak_investor_private_beta_2026'

      const response = await fetch(`${API_BASE_URL}/api/licenses/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: testKey })
      })

      const data = await response.json()

      if (data.kits) {
        for (const kit of data.kits) {
          const tierResult = TierSchema.safeParse(kit.tier)
          expect(tierResult.success, `Invalid tier "${kit.tier}" for kit "${kit.name}"`).toBe(true)
        }
      }
    })
  })
})

/**
 * Schema Consistency Tests
 *
 * These tests verify that our local schemas match what we expect,
 * catching issues before we even hit the API.
 */
describe('Schema Consistency', () => {
  test('TierSchema includes all valid tiers', () => {
    // This test documents all valid tiers
    // If you add a new tier, add it here first!
    const validTiers = ['free', 'paid', 'private', 'beta']

    for (const tier of validTiers) {
      const result = TierSchema.safeParse(tier)
      expect(result.success, `Tier "${tier}" should be valid`).toBe(true)
    }
  })

  test('TierSchema rejects invalid tiers', () => {
    const invalidTiers = ['premium', 'enterprise', 'trial', 'PAID', 'Free']

    for (const tier of invalidTiers) {
      const result = TierSchema.safeParse(tier)
      expect(result.success, `Tier "${tier}" should be invalid`).toBe(false)
    }
  })

  test('beta tier is valid for all-kit access licenses', () => {
    // Beta licenses grant access to ALL kits
    const betaLicenseResponse = {
      valid: true,
      email: 'test@example.com',
      tier: 'beta',
      kits: [
        { name: 'marketing-os', tier: 'paid', purchasedAt: '2026-01-01' },
        { name: 'idea-os', tier: 'free', purchasedAt: '2026-01-01' },
      ]
    }

    const result = VerifyLicenseResponseSchema.safeParse(betaLicenseResponse)
    expect(result.success).toBe(true)
  })
})
