/**
 * Platform decisions in one place. Windows is the only platform with batch shims, `cmd.exe`, and an explicit
 * environment layer for setup probes; macOS and Linux share the POSIX path. Keeping the predicates here makes a
 * platform difference reviewable without searching the whole source tree.
 */
import { delimiter } from 'node:path'

export const isWindows: boolean = process.platform === 'win32'

/** Absolute paths are drive-qualified on Windows (`C:/...`, `C:\...`) and slash-rooted elsewhere; both schema layers share it. */
export const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\/)/

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

/**
 * The argv a runtime CLI is spawned with. A batch wrapper goes to `cmd.exe /d /c` with the program and its
 * arguments kept as separate entries - Node then quotes each one for cmd - exactly how `runAsWorker` spawns
 * one, so the polling, replying and git commands a validated wrapper serves behave like its setup probe.
 */
export const runtimeArgv = (program: string, args: readonly string[]): readonly string[] =>
  isBatchWrapper(program) ? ['cmd.exe', '/d', '/c', program, ...args] : [program, ...args]

/** One setup-probe invocation: the argv to spawn and, on Windows, the explicit environment layer. */
export interface ProbeCommand {
  argv: string[]
  env?: Record<string, string>
}

/**
 * Builds a setup-probe invocation with a shim-free PATH, the agent's `GH_CONFIG_DIR`, and any Source-specific
 * variables. POSIX has `env`, so those become argv prefixes; Windows has no `env` executable and needs an explicit
 * environment object. `GH_CONFIG_DIR` is supplied on both platforms so the probe reads the agent account, never the
 * operator's own.
 */
export const probeEnv = (path: string, ghConfig: string, argv: readonly string[], extra: Record<string, string> = {}): ProbeCommand => {
  const variables = { GH_CONFIG_DIR: ghConfig, ...extra }
  if (!isWindows) {
    return { argv: ['env', `PATH=${path}`, ...Object.entries(variables).map(([name, value]) => `${name}=${value}`), ...argv] }
  }
  // Windows variable names are case-insensitive, so override the spelling that already exists in the environment.
  const pathVariable = Object.keys(process.env).find(name => name.toUpperCase() === 'PATH') ?? 'PATH'
  return { argv: [...argv], env: { [pathVariable]: path, ...variables } }
}
