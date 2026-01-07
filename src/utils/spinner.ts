import ora, { type Ora } from 'ora'

let currentSpinner: Ora | null = null

/**
 * Start a spinner with a message
 */
export function start(message: string): Ora {
  // Stop any existing spinner
  if (currentSpinner) {
    currentSpinner.stop()
  }

  currentSpinner = ora(message).start()
  return currentSpinner
}

/**
 * Update the current spinner's text
 */
export function update(message: string): void {
  if (currentSpinner) {
    currentSpinner.text = message
  }
}

/**
 * Mark spinner as succeeded
 */
export function succeed(message?: string): void {
  if (currentSpinner) {
    currentSpinner.succeed(message)
    currentSpinner = null
  }
}

/**
 * Mark spinner as failed
 */
export function fail(message?: string): void {
  if (currentSpinner) {
    currentSpinner.fail(message)
    currentSpinner = null
  }
}

/**
 * Stop spinner without status
 */
export function stop(): void {
  if (currentSpinner) {
    currentSpinner.stop()
    currentSpinner = null
  }
}

/**
 * Run an async function with a spinner
 */
export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
  successMessage?: string
): Promise<T> {
  const spinner = start(message)
  try {
    const result = await fn()
    spinner.succeed(successMessage ?? message)
    return result
  } catch (error) {
    spinner.fail()
    throw error
  }
}
