import pc from 'picocolors'

/**
 * Log a success message
 */
export function success(message: string): void {
  console.log(pc.green('✓'), message)
}

/**
 * Log an error message
 */
export function error(message: string): void {
  console.log(pc.red('✗'), message)
}

/**
 * Log a warning message
 */
export function warn(message: string): void {
  console.log(pc.yellow('!'), message)
}

/**
 * Log an info message
 */
export function info(message: string): void {
  console.log(pc.blue('ℹ'), message)
}

/**
 * Log a plain message
 */
export function log(message: string): void {
  console.log(message)
}

/**
 * Log a blank line
 */
export function blank(): void {
  console.log()
}

/**
 * Log a header
 */
export function header(title: string): void {
  console.log()
  console.log(pc.bold(title))
  console.log(pc.dim('─'.repeat(40)))
}

/**
 * Log a key-value pair
 */
export function keyValue(key: string, value: string): void {
  console.log(`${pc.dim(key + ':')} ${value}`)
}

/**
 * Log a list item
 */
export function listItem(item: string, indent: number = 0): void {
  const prefix = '  '.repeat(indent)
  console.log(`${prefix}${pc.dim('•')} ${item}`)
}

/**
 * Format a version for display
 */
export function formatVersion(version: string): string {
  return pc.cyan(`v${version}`)
}

/**
 * Format a kit name for display
 */
export function formatKit(name: string): string {
  return pc.magenta(name)
}

/**
 * Format a path for display
 */
export function formatPath(path: string): string {
  return pc.yellow(path)
}

/**
 * Format a command for display
 */
export function formatCommand(cmd: string): string {
  return pc.cyan(cmd)
}
