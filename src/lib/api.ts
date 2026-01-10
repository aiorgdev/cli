import { z } from 'zod'

const API_BASE_URL = process.env.AIORG_API_URL?.trim() || 'https://aiorg.dev'
const API_TIMEOUT_MS = 30000 // 30 seconds

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeout)
  }
}

// Response schemas
const LatestVersionSchema = z.object({
  version: z.string(),
  releasedAt: z.string(),
  packageName: z.string(),
  packageDisplayName: z.string(),
  changelog: z.record(z.string(), z.any()).optional(),
  tier: z.enum(['free', 'paid', 'private']).optional(),
  type: z.enum(['template', 'companion', 'inject']).optional(),
})

const DownloadResponseSchema = z.object({
  downloadUrl: z.string(),
  version: z.string(),
  filename: z.string(),
})

const VerifyLicenseResponseSchema = z.object({
  valid: z.boolean(),
  email: z.string().optional(),
  kits: z
    .array(
      z.object({
        name: z.string(),
        tier: z.enum(['free', 'paid', 'private']),
        purchasedAt: z.string(),
      })
    )
    .optional(),
  error: z.string().optional(),
})

const ListKitsSchema = z.object({
  kits: z.array(z.object({
    name: z.string(),
    displayName: z.string(),
    description: z.string().nullable(),
    tier: z.enum(['free', 'paid', 'private']),
    type: z.enum(['template', 'companion', 'inject']),
    deployMode: z.string().nullable(),
    version: z.string(),
    priceCents: z.number(),
  }))
})

export type LatestVersion = z.infer<typeof LatestVersionSchema>
export type DownloadResponse = z.infer<typeof DownloadResponseSchema>
export type VerifyLicenseResponse = z.infer<typeof VerifyLicenseResponseSchema>
export type ListKitsResponse = z.infer<typeof ListKitsSchema>

class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'APIError'
  }
}

/**
 * Fetch latest version info for a kit
 */
export async function fetchLatestVersion(
  kitName: string
): Promise<LatestVersion> {
  const url = `${API_BASE_URL}/api/kits/${kitName}/latest`

  try {
    const response = await fetchWithTimeout(url)

    if (!response.ok) {
      if (response.status === 404) {
        throw new APIError(`Kit not found: "${kitName}"`, 404)
      }
      throw new APIError(`Failed to fetch version info`, response.status)
    }

    const data = await response.json()
    return LatestVersionSchema.parse(data)
  } catch (error) {
    if (error instanceof APIError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('Request timed out')
    }
    throw new APIError(
      `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Get download URL for a kit (license key optional for free kits)
 */
export async function getDownloadUrl(
  kitName: string,
  licenseKey: string | null
): Promise<DownloadResponse> {
  const url = `${API_BASE_URL}/api/kits/${kitName}/download`

  const headers: Record<string, string> = {}
  if (licenseKey) {
    headers.Authorization = `Bearer ${licenseKey}`
  }

  try {
    const response = await fetchWithTimeout(url, { headers })

    if (!response.ok) {
      if (response.status === 401) {
        throw new APIError('Invalid or expired license key', 401)
      }
      if (response.status === 403) {
        throw new APIError(
          'License key does not have access to this kit',
          403
        )
      }
      if (response.status === 404) {
        throw new APIError(`Kit not found: "${kitName}"`, 404)
      }
      throw new APIError(`Failed to get download URL`, response.status)
    }

    const data = await response.json()
    return DownloadResponseSchema.parse(data)
  } catch (error) {
    if (error instanceof APIError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('Request timed out')
    }
    throw new APIError(
      `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Verify a license key with the API
 */
export async function verifyLicense(
  licenseKey: string,
  kitName?: string
): Promise<VerifyLicenseResponse> {
  const url = `${API_BASE_URL}/api/licenses/verify`

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: licenseKey,
        kit: kitName,
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string }
      throw new APIError(
        data.error || 'License verification failed',
        response.status
      )
    }

    const data = await response.json()
    return VerifyLicenseResponseSchema.parse(data)
  } catch (error) {
    if (error instanceof APIError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('Request timed out')
    }
    throw new APIError(
      `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Download a file from a URL
 */
export async function downloadFile(url: string): Promise<ArrayBuffer> {
  const DOWNLOAD_TIMEOUT_MS = 120000 // 2 minutes for file downloads

  try {
    const response = await fetchWithTimeout(url, {}, DOWNLOAD_TIMEOUT_MS)

    if (!response.ok) {
      throw new APIError(`Download failed`, response.status)
    }

    return await response.arrayBuffer()
  } catch (error) {
    if (error instanceof APIError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('Download timed out')
    }
    throw new APIError(
      `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

/**
 * Fetch list of all available kits
 */
export async function fetchKitsList(): Promise<ListKitsResponse> {
  const url = `${API_BASE_URL}/api/kits`

  try {
    const response = await fetchWithTimeout(url)

    if (!response.ok) {
      throw new APIError('Failed to fetch kits list', response.status)
    }

    const data = await response.json()
    return ListKitsSchema.parse(data)
  } catch (error) {
    if (error instanceof APIError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('Request timed out')
    }
    throw new APIError(
      `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
