/**
 * Platform decisions in one place. Windows is the only platform with batch shims, `cmd.exe`, and an explicit
 * environment layer for setup probes; macOS and Linux share the POSIX path. Keeping the predicates here makes a
 * platform difference reviewable without searching the whole source tree.
 */
import { delimiter } from 'node:path'

export const isWindows: boolean = process.platform === 'win32'

/** The separator between PATH entries (`;` on Windows, `:` elsewhere). */
export const pathDelimiter = (): string => delimiter

/** The filename a worker shim gets: `.cmd` on Windows, the bare name elsewhere. */
export const shimName = (name: string): string => isWindows ? `${name}.cmd` : name

/** The complete text of a worker shim, including its platform-specific first line and ownership marker. */
export const shimBody = (marker: string, body: string): string =>
  isWindows ? `@echo off\r\n@REM ${marker}\r\n${body}\r\n` : `#!/bin/sh\n${marker}\n${body}\n`

/** The file mode a worker shim is written with. */
export const shimMode = (): number => isWindows ? 0o644 : 0o755

/** The command that runs an `executor.prepare` string on this platform. */
export const commandShell = (): readonly string[] => isWindows ? ['cmd.exe', '/d', '/s', '/c'] : ['sh', '-c']

/** True when `program` is a batch wrapper that Node must hand to cmd.exe instead of spawning directly. */
export const isBatchWrapper = (program: string): boolean => isWindows && /\.(cmd|bat)$/i.test(program)

/** One setup-probe invocation: the argv to spawn and, on Windows, the explicit environment layer. */
export interface ProbeCommand {
  argv: string[]
  env?: Record<string, string>
}

/**
 * Builds a setup-probe invocation with a shim-free PATH and, on Windows, the agent's `GH_CONFIG_DIR`. POSIX has
 * `env`, so the PATH becomes an argv prefix; Windows has no `env` executable and needs an explicit environment object.
 */
export const probeEnv = (path: string, ghConfig: string, argv: readonly string[]): ProbeCommand => {
  if (!isWindows) return { argv: ['env', `PATH=${path}`, ...argv] }
  // Windows variable names are case-insensitive, so override the spelling that already exists in the environment.
  const pathVariable = Object.keys(process.env).find(name => name.toUpperCase() === 'PATH') ?? 'PATH'
  return { argv: [...argv], env: { [pathVariable]: path, GH_CONFIG_DIR: ghConfig } }
}
