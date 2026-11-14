/**
 * Release rehearsal for DSH-Superagent: one command that says whether this checkout may be published.
 *
 *   pnpm release:check
 *   pnpm release:check --skip-tests    # skips typecheck/tests, still builds lib
 *   pnpm release:check --skip-online   # offline: skips the GitHub release checks
 *
 * It checks the things that must never be wrong for a public release: the tree is clean and pushed, the attribution to
 * the upstream project is present everywhere a reader looks, the committed build matches a fresh build, the whole test
 * suite passes, and the published release's assets match the checksum the one-line installer will verify.
 *
 * Any skip makes the verdict `NOT VERIFIED` (exit 2): a partial run must never print READY TO PUBLISH.
 *
 * This is the only entry point; `scripts/release-check.ps1` is kept as historical reference for the Windows-only
 * original. Nothing here is tied to one machine or one shell: the version comes from package.json, the tools are
 * discovered on PATH, the repository name is an option, and every tool is spawned with an argv array rather than a
 * command line built by a shell. `--skip-tests` / `-SkipTests` and `--skip-online` / `-SkipOnline` are both accepted so
 * older documentation and habits keep working.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const upstream = 'deepseek-ai/dsh-superagent-prototype'
const build = 'ReSerendipity/dsh-superagent'
const REQUIRED_ENTRIES = [
  'package/lib/index.js',
  'package/lib/client.js',
  'package/cordis.patch.yml',
  'package/prompts/team/delivery.md',
  'package/skills/dsh-superagent-github/SKILL.md',
  'package/locale/zh.json',
]
// "Must not ship" binds as hard as "must ship": the `files` whitelist names whole directories, so a stray
// file dropped into one of them would pack silently. skills/ ships exactly its README and two SKILL.md files.
const FORBIDDEN_PREFIXES = ['package/local/', 'package/AGENTS.md', 'package/.env', 'package/scripts/', 'package/dist/']
const SKILLS_ENTRIES = 3

// ---------------------------------------------------------------- options

const options = {
  version: '',
  repo: 'ReSerendipity/dsh-superagent',
  gh: '',
  skipTests: false,
  skipOnline: false,
}

const USAGE = `Usage: node scripts/release-check.mjs [options]

  --skip-tests, -SkipTests, --skipTests     skip typecheck and tests (still builds lib)
  --skip-online, -SkipOnline, --skipOnline  skip the GitHub release checks (offline)
  --version <version>                       defaults to package.json
  --repo <owner/name>                       defaults to ${options.repo}
  --gh <path>                               defaults to gh discovered on PATH
  --help, -h                                show this text

Exit codes: 0 READY TO PUBLISH, 1 NOT READY TO PUBLISH (any FAIL), 2 NOT VERIFIED (any skip).`

const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index += 1) {
  const raw = argv[index]
  const equals = raw.indexOf('=')
  const name = (equals > 0 ? raw.slice(0, equals) : raw).replace(/^--?/, '').toLowerCase().replace(/-/g, '')
  const inline = equals > 0 ? raw.slice(equals + 1) : undefined
  const value = () => {
    if (inline !== undefined) return inline
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('-')) {
      console.error(`release-check: ${raw} needs a value\n\n${USAGE}`)
      process.exit(1)
    }
    index += 1
    return next
  }
  switch (name) {
    case 'skiptests': options.skipTests = true; break
    case 'skiponline': options.skipOnline = true; break
    case 'version': options.version = value(); break
    case 'repo': options.repo = value(); break
    case 'gh': options.gh = value(); break
    case 'help':
    case 'h':
      console.log(USAGE)
      process.exit(0)
      break
    default:
      console.error(`release-check: unknown option ${raw}\n\n${USAGE}`)
      process.exit(1)
  }
}

// ---------------------------------------------------------------- tools

const isWindows = process.platform === 'win32'
// PATHEXT is how Windows spells the executable suffixes it will run; POSIX tools have no suffix.
const windowsExtensions = (process.env.PATHEXT ?? '').split(';').filter(Boolean)

/**
 * Locate `name` on PATH, applying PATHEXT on Windows. Returns the full path or null; a missing tool is reported by the
 * check that needs it, never as a stack trace.
 */
function findTool(name) {
  if (name.includes('/') || name.includes('\\')) return existsSync(name) ? resolve(name) : null
  const extensions = isWindows ? windowsExtensions : ['']
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue
    for (const extension of extensions) {
      const candidate = join(directory.replace(/^"(.*)"$/, '$1'), name + extension)
      try {
        if (statSync(candidate).isFile()) return candidate
      } catch {
        // Not here; keep walking PATH.
      }
    }
  }
  return null
}

/** Last non-empty line of a captured stream, for a one-line failure message. */
function tail(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return lines.length ? `: ${lines[lines.length - 1]}` : ''
}

/**
 * Run a tool with an argv array and return the spawnSync result. On Windows an npm-style shim is a script the command
 * interpreter has to read, so that one case goes through ComSpec; the arguments are still quoted here, never assembled
 * from user input. Every other tool is spawned directly.
 */
function run(tool, args, spawnOptions = {}) {
  const settings = { encoding: 'utf8', ...spawnOptions }
  if (isWindows && /\.(?:cmd|bat)$/i.test(tool)) {
    const comspec = process.env.ComSpec
    if (!comspec) throw new Error(`${tool} is a shell shim but ComSpec is not set`)
    const line = [tool, ...args].map(argument => `"${String(argument).replace(/"/g, '""')}"`).join(' ')
    return spawnSync(comspec, ['/d', '/s', '/c', `"${line}"`], { ...settings, windowsVerbatimArguments: true })
  }
  return spawnSync(tool, args, settings)
}

/** Run a tool and require a zero exit status; the message stays readable when the tool is missing or fails. */
function runChecked(tool, args, label) {
  if (!tool) throw new Error(`${label} not found on PATH`)
  const result = run(tool, args, { cwd: root })
  if (result.error) throw new Error(`${label} could not be started (${result.error.code ?? result.error.message})`)
  if (result.status !== 0) throw new Error(`${label} exited ${result.status}${tail(result.stderr)}`)
  return String(result.stdout ?? '').trim()
}

const git = findTool('git')
const pnpm = findTool('pnpm')
const tar = findTool('tar')
const gh = options.gh ? findTool(options.gh) : findTool('gh')

// ---------------------------------------------------------------- output

const colored = (code, text) => process.stdout.isTTY ? `\u001b[${code}m${text}\u001b[0m` : text
const green = text => colored('32', text)
const red = text => colored('31', text)
const yellow = text => colored('33', text)
const cyan = text => colored('36', text)
const gray = text => colored('90', text)

const passed = []
const failed = []
const skipped = []
let tarballDigest = ''
let releaseDigest = ''

function need(condition, message) {
  if (!condition) throw new Error(message)
}

function check(name, probe) {
  try {
    const detail = probe()
    passed.push(name)
    console.log(`${green('PASS')}  ${name}`)
    if (detail) console.log(gray(`      ${detail}`))
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).trim()
    failed.push(`${name} — ${message}`)
    console.log(`${red('FAIL')}  ${name} — ${message}`)
  }
}

// ---------------------------------------------------------------- version

let version = options.version
if (!version) {
  version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
}

console.log('')
console.log(cyan('=== DSH-Superagent release check ==='))
console.log(`repository : ${options.repo}`)
console.log(`checkout   : ${root}`)
console.log(`version    : ${version}`)
console.log('')

// ---------------------------------------------------------------- source state

check('git repository present', () => {
  need(git, 'git not found on PATH')
  need(existsSync(join(root, '.git')), 'not a git checkout')
  return runChecked(git, ['-C', root, 'rev-parse', '--short', 'HEAD'], 'git')
})

check('working tree clean', () => {
  const dirty = runChecked(git, ['-C', root, 'status', '--porcelain'], 'git')
  need(!dirty, `uncommitted files: ${dirty.split(/\r?\n/).slice(0, 5).join(', ')}`)
  return 'no uncommitted files'
})

check('branch pushed', () => {
  // A stale local origin/main reference passes against a remote that moved; refresh it when the gate runs online.
  if (!options.skipOnline) run(git, ['-C', root, 'fetch', 'origin', 'main'])
  const local = runChecked(git, ['-C', root, 'rev-parse', 'HEAD'], 'git')
  const remote = runChecked(git, ['-C', root, 'rev-parse', 'origin/main'], 'git')
  need(local === remote, 'local HEAD differs from origin/main; push before publishing')
  return local.slice(0, 8)
})

// ---------------------------------------------------------------- attribution (must stay visible)

check('attribution present', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const notice = readFileSync(join(root, 'NOTICE'), 'utf8')
  const license = readFileSync(join(root, 'LICENSE'), 'utf8')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const zh = readFileSync(join(root, 'locale', 'zh.json'), 'utf8')
  const en = readFileSync(join(root, 'locale', 'en.json'), 'utf8')
  need(readme.includes(upstream), 'README does not name the upstream repository')
  need(notice.includes(upstream), 'NOTICE does not name the upstream repository')
  need(license.includes('DeepSeek Harness Team'), 'LICENSE lost the upstream copyright line')
  need(zh.includes(upstream) && en.includes(upstream), 'locale metadata does not name upstream')
  need(pkg.license === 'MIT', 'package.json licence is not MIT')
  need(JSON.stringify(pkg.repository ?? {}).includes(build), 'package.json repository does not point at this repository')
  need(String(pkg.description).includes(upstream) && JSON.stringify(pkg.contributors ?? []).includes('DeepSeek Harness Team'),
    'package.json attribution does not name upstream')
  return 'README, NOTICE, LICENSE, locale and package metadata all name upstream'
})

check('changelog has this version', () => {
  const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  need(new RegExp(`^## \\[${escaped}\\]`, 'm').test(changelog), `CHANGELOG.md has no section for ${version}`)
  return version
})

// ---------------------------------------------------------------- build and lib freshness

check('pnpm available', () => {
  need(pnpm, 'pnpm not found on PATH')
  return runChecked(pnpm, ['--version'], 'pnpm')
})

// A git install serves `lib/` as committed, so a stale build ships old behaviour while every source-level check
// stays green. Keep it a gate in every mode, including --skip-tests, and build first so "clean" really means
// "matches src".
check('committed lib matches a fresh build', () => {
  runChecked(pnpm, ['build'], 'pnpm build')
  const dirty = runChecked(git, ['-C', root, 'status', '--porcelain', '--', 'lib'], 'git')
  need(!dirty, `lib/ is stale - rebuild and commit it: ${dirty.split(/\r?\n/).slice(0, 5).join(', ')}`)
  return 'lib/ is what a git install serves'
})

// ---------------------------------------------------------------- typecheck and tests

if (!options.skipTests) {
  check('typecheck', () => {
    runChecked(pnpm, ['typecheck'], 'pnpm typecheck')
    return 'tsc --noEmit'
  })
  check('tests', () => {
    runChecked(pnpm, ['vitest', 'run'], 'pnpm vitest run')
    return 'vitest run (includes portability and release invariants)'
  })
} else {
  skipped.push('typecheck', 'tests')
  console.log(yellow('SKIP  typecheck and tests (--skip-tests)'))
}

// ---------------------------------------------------------------- the published artifact

// The installable plugin tarball is the artifact a release ships: no git, no build step for the installer.
check('plugin tarball builds, is complete, and matches its checksum file', () => {
  const pack = run(process.execPath, [join(root, 'scripts', 'pack-plugin.mjs')], { cwd: root })
  if (pack.error) throw new Error(`pack-plugin could not be started (${pack.error.code ?? pack.error.message})`)
  need(pack.status === 0, `pack-plugin exited ${pack.status}${tail(pack.stderr)}`)
  const name = `dsh-superagent-${version}.tgz`
  const tarball = join(root, 'dist', name)
  need(existsSync(tarball), `pack did not produce dist/${name}`)
  const digest = createHash('sha256').update(readFileSync(tarball)).digest('hex')
  const recorded = readFileSync(`${tarball}.sha256`, 'utf8').trim().split(/\s+/)[0]
  need(digest === recorded, 'the .sha256 file next to the tarball does not match the tarball')
  // A relative path keeps GNU tar from reading a Windows drive letter as a remote host.
  need(tar, 'tar not found on PATH')
  const listing = run(tar, ['-tzf', join('dist', name)], { cwd: root })
  if (listing.error) throw new Error(`tar could not be started (${listing.error.code ?? listing.error.message})`)
  need(listing.status === 0, `tar -tzf exited ${listing.status}${tail(listing.stderr)}`)
  const entries = String(listing.stdout ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (const required of REQUIRED_ENTRIES) need(entries.includes(required), `the tarball lacks ${required}`)
  for (const banned of FORBIDDEN_PREFIXES) {
    need(!entries.some(entry => entry.startsWith(banned)), `the tarball carries ${banned}`)
  }
  need(entries.filter(entry => entry.startsWith('package/skills/')).length === SKILLS_ENTRIES, 'the tarball carries unexpected files under skills/')
  tarballDigest = digest
  return `${entries.length} entries, sha256 ${digest.slice(0, 12)}…`
})

// ---------------------------------------------------------------- the published release

if (!options.skipOnline) {
  check('gh available', () => {
    need(gh, 'gh not found; pass --gh or install the GitHub CLI')
    return runChecked(gh, ['--version'], 'gh').split(/\r?\n/)[0]
  })

  check(`release v${version} carries the plugin tarball and its checksum`, () => {
    const release = JSON.parse(runChecked(gh, ['api', `repos/${options.repo}/releases/tags/v${version}`], 'gh'))
    const assets = Array.isArray(release.assets) ? release.assets : []
    const asset = assets.find(item => String(item.name ?? '').startsWith('dsh-superagent-') && String(item.name).endsWith('.tgz'))
    const sum = assets.find(item => String(item.name ?? '').endsWith('.sha256'))
    need(asset, 'release has no dsh-superagent-*.tgz asset')
    need(sum, 'release has no .sha256 asset')
    releaseDigest = String(asset.digest ?? '')
    return `tarball ${Math.round(Number(asset.size ?? 0) / 1024 * 10) / 10} KB, digest ${asset.digest}`
  })

  check('the release digest matches the tarball built here', () => {
    const published = releaseDigest.replace(/^sha256:/, '')
    need(published, 'the release asset carries no digest to compare')
    need(tarballDigest, 'the local tarball check did not produce a digest')
    need(published === tarballDigest,
      `checksum mismatch: local ${tarballDigest.slice(0, 12)}… vs release ${published.slice(0, 12)}…`)
    return 'the release ships exactly the artifact this checkout builds'
  })
} else {
  skipped.push('online release checks')
  console.log(yellow('SKIP  release checks (--skip-online)'))
}

// ---------------------------------------------------------------- verdict

console.log('')
const verdictColor = failed.length ? red : green
console.log(verdictColor(`=== ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped ===`))
if (failed.length) {
  console.log(red('NOT READY TO PUBLISH:'))
  for (const item of failed) console.log(red(`  - ${item}`))
  process.exit(1)
}
if (skipped.length) {
  console.log(yellow(`NOT VERIFIED - skipped: ${skipped.join(', ')}`))
  console.log(yellow('This checkout is not proven ready to publish; rerun without --skip-tests / --skip-online for a verdict.'))
  process.exit(2)
}
console.log(green('READY TO PUBLISH.'))
console.log('Remaining manual steps (docs/020): start the app and confirm setup runs, open the panel guide, and install the tarball into a clean profile.')
process.exit(0)
