import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { z } from 'zod'

const CONFIG_DIR = path.join(os.homedir(), '.aiorg')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const KitLicenseSchema = z.object({
  tier: z.enum(['free', 'paid', 'private', 'beta']),
  purchasedAt: z.string(),
})

const ConfigSchema = z.object({
  licenseKey: z.string(),
  email: z.string().optional(),
  kits: z.record(z.string(), KitLicenseSchema).optional(),
})

export type Config = z.infer<typeof ConfigSchema>
export type KitLicense = z.infer<typeof KitLicenseSchema>

/**
 * Get the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR
}

/**
 * Get the config file path
 */
export function getConfigFile(): string {
  return CONFIG_FILE
}

/**
 * Ensure config directory exists
 */
export async function ensureConfigDir(): Promise<void> {
  await fs.ensureDir(CONFIG_DIR)
}

/**
 * Check if user is logged in (has config file with license key)
 */
export async function isLoggedIn(): Promise<boolean> {
  try {
    const config = await loadConfig()
    return !!config?.licenseKey
  } catch {
    return false
  }
}

/**
 * Load config from disk
 */
export async function loadConfig(): Promise<Config | null> {
  try {
    if (!(await fs.pathExists(CONFIG_FILE))) {
      return null
    }
    const raw = await fs.readJson(CONFIG_FILE)
    return ConfigSchema.parse(raw)
  } catch {
    return null
  }
}

/**
 * Save config to disk
 */
export async function saveConfig(config: Config): Promise<void> {
  await ensureConfigDir()
  await fs.writeJson(CONFIG_FILE, config, { spaces: 2 })
}

/**
 * Get license key from config or environment
 */
export async function getLicenseKey(): Promise<string | null> {
  // Check environment first
  const envKey = process.env.AIORG_LICENSE_KEY
  if (envKey) {
    return envKey
  }

  // Check config file
  const config = await loadConfig()
  return config?.licenseKey ?? null
}

/**
 * Save license key to config
 */
export async function saveLicenseKey(
  licenseKey: string,
  email?: string,
  kits?: Record<string, KitLicense>
): Promise<void> {
  const existing = await loadConfig()
  await saveConfig({
    ...(existing || {}),
    licenseKey,
    email: email ?? existing?.email,
    kits: kits ?? existing?.kits,
  })
}

/**
 * Clear config (logout)
 */
export async function clearConfig(): Promise<void> {
  try {
    await fs.remove(CONFIG_FILE)
  } catch {
    // Ignore errors
  }
}

/**
 * Add kit to user's licensed kits
 */
export async function addLicensedKit(
  kitName: string,
  tier: 'free' | 'paid' | 'private' | 'beta' = 'paid'
): Promise<void> {
  const config = await loadConfig()
  if (!config) {
    throw new Error('Not logged in')
  }

  const kits = config.kits ?? {}
  kits[kitName] = {
    tier,
    purchasedAt: new Date().toISOString().split('T')[0],
  }

  await saveConfig({ ...config, kits })
}
