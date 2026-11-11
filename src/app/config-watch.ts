/**
 * Watch the declarative settings file so a saved edit is applied without restarting the service.
 *
 * The watcher listens on the **parent directory**, not on the file: editors write a temporary file and rename it
 * over the target, which invalidates a handle on the old inode and would leave a file watcher silently dead. A
 * directory watcher keeps firing across that rename. Whether to reload is decided by the watched files' own
 * identity, not by the event's filename: macOS FSEvents can attribute a neighbour's write to a watched name.
 */
import { statSync, watch, type FSWatcher } from 'node:fs'
import { dirname } from 'node:path'

export type DeclarativeWatcher = { close(): void }

/** Repeated events (one save can emit several) collapse into one callback after the quiet period. */
const DEFAULT_DEBOUNCE_MS = 250

/**
 * A stable identity for the watched files. A rename over one changes its inode; an in-place write changes its
 * mtime/size. Checked on every event, because macOS FSEvents can report a watched filename when a neighbour changed.
 */
const fingerprint = (paths: readonly string[]): string => paths.map(path => {
  try {
    const stat = statSync(path)
    return `${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`
  } catch {
    // The file does not exist yet; its creation changes the fingerprint.
    return ''
  }
}).join('\n')

/**
 * `onChange` runs once per settled change of any of `path`'s names — the configured file and the extensions the
 * loader accepts for the same stem, so saving a `.yaml` next to a `.json` configuration still reloads. A directory
 * that cannot be watched (missing, no permission) yields a watcher that does nothing and closes cleanly: the
 * declarative file is fail-open by design, and a watcher failure must never be louder than the setting it was
 * meant to reload.
 */
export function watchDeclarative(
  path: string | string[],
  onChange: () => void,
  options: { debounceMs?: number } = {},
): DeclarativeWatcher {
  const paths = Array.isArray(path) ? path : [path]
  const directory = dirname(paths[0]!)
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  let timer: NodeJS.Timeout | undefined
  let watcher: FSWatcher | undefined
  let closed = false
  let seen = fingerprint(paths)

  const close = (): void => {
    if (closed) return
    closed = true
    if (timer) { clearTimeout(timer); timer = undefined }
    watcher?.close()
    watcher = undefined
  }

  try {
    watcher = watch(directory, { persistent: false }, () => {
      if (closed) return
      // The filename is a hint, not proof: macOS FSEvents can report a watched name for a neighbour's write. Only a
      // change to a watched file itself may reload the settings.
      const current = fingerprint(paths)
      if (current === seen) return
      seen = current
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        if (!closed) onChange()
      }, debounceMs)
    })
  } catch {
    // Unwatchable directory: keep the service running on the settings it already has.
    return { close }
  }
  watcher.on('error', () => { close() })

  return { close }
}
