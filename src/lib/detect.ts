import fs from 'fs-extra'
import path from 'path'
import { z } from 'zod'

const VersionJsonSchema = z.object({
  version: z.string(),
  packageName: z.string(),
  packageDisplayName: z.string().optional(),
  releasedAt: z.string().optional(),
  minUpgradeFrom: z.string().optional(),
  fileCategories: z
    .object({
      alwaysReplace: z.array(z.string()).optional(),
      neverTouch: z.array(z.string()).optional(),
      mergeIfChanged: z.array(z.string()).optional(),
      addOnly: z.array(z.string()).optional(),
    })
    .optional(),
  changelog: z.record(z.string(), z.any()).optional(),
})

const KitJsonSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  type: z.enum(['bootstrap', 'inject']).optional(),
  // Personal kits (like Investor OS) don't need project linking
  // They work standalone without shared business context
  personal: z.boolean().optional(),
})

export type VersionJson = z.infer<typeof VersionJsonSchema>
export type KitJson = z.infer<typeof KitJsonSchema>

export interface DetectedKit {
  name: string
  displayName: string
  version: string
  versionJson: VersionJson
  kitJson?: KitJson
  rootPath: string
  /** Personal kits don't need project linking (e.g., Investor OS) */
  isPersonal: boolean
}

/**
 * Detect kit in a directory by looking for .claude/version.json or .claude/kit.json
 */
export async function detectKit(dirPath: string): Promise<DetectedKit | null> {
  const versionJsonPath = path.join(dirPath, '.claude', 'version.json')
  const kitJsonPath = path.join(dirPath, '.claude', 'kit.json')

  // Check for version.json (required)
  if (!(await fs.pathExists(versionJsonPath))) {
    return null
  }

  try {
    const versionRaw = await fs.readJson(versionJsonPath)
    const versionJson = VersionJsonSchema.parse(versionRaw)

    // Optionally load kit.json
    let kitJson: KitJson | undefined
    if (await fs.pathExists(kitJsonPath)) {
      try {
        const kitRaw = await fs.readJson(kitJsonPath)
        kitJson = KitJsonSchema.parse(kitRaw)
      } catch {
        // Ignore kit.json parse errors
      }
    }

    return {
      name: kitJson?.name ?? versionJson.packageName,
      displayName:
        kitJson?.displayName ??
        versionJson.packageDisplayName ??
        versionJson.packageName,
      version: versionJson.version,
      versionJson,
      kitJson,
      rootPath: dirPath,
      isPersonal: kitJson?.personal ?? false,
    }
  } catch {
    return null
  }
}

/**
 * Detect kit in current working directory
 */
export async function detectKitInCwd(): Promise<DetectedKit | null> {
  return detectKit(process.cwd())
}

/**
 * Get file categories from version.json
 */
export function getFileCategories(versionJson: VersionJson): {
  alwaysReplace: string[]
  neverTouch: string[]
  mergeIfChanged: string[]
  addOnly: string[]
} {
  return {
    alwaysReplace: versionJson.fileCategories?.alwaysReplace ?? [],
    neverTouch: versionJson.fileCategories?.neverTouch ?? [],
    mergeIfChanged: versionJson.fileCategories?.mergeIfChanged ?? [],
    addOnly: versionJson.fileCategories?.addOnly ?? [],
  }
}
