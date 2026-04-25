import { spawn }   from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '@axiom-ai/core'

interface UIFlags {
  port?:   string
  host?:   string
  open?:   boolean
}

// Walk up from this file to find apps/web in the monorepo install.
function findWebApp(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  let dir = here
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'apps', 'web')
    if (existsSync(join(candidate, 'package.json'))) return candidate
    const sibling = join(dir, '..', 'web')
    if (existsSync(join(sibling, 'package.json'))) return resolve(sibling)
    dir = resolve(dir, '..')
  }
  return null
}

export async function uiCommand(flags: UIFlags = {}): Promise<void> {
  const config  = await loadConfig()
  const webApp  = findWebApp()
  const port    = flags.port ?? '3847'
  const host    = flags.host ?? 'localhost'

  if (!webApp) {
    console.error('Could not locate the Axiom web app. If you are using a published')
    console.error('version, the dashboard files were not found in the install path.')
    process.exit(1)
  }

  const storagePath = resolve(process.cwd(), config.storagePath)

  console.log()
  console.log(`  \x1b[1mAxiom Dashboard\x1b[0m`)
  console.log(`  \x1b[2mhttp://${host}:${port}\x1b[0m`)
  console.log(`  \x1b[2mreading from: ${storagePath}\x1b[0m`)
  console.log()

  const child = spawn('npx', ['next', 'dev', '-p', port, '-H', host], {
    cwd:   webApp,
    stdio: 'inherit',
    env: {
      ...process.env,
      AXIOM_STORAGE_PATH: storagePath,
    },
  })

  // Auto-open the browser after a short delay (skipped if --no-open).
  if (flags.open !== false) {
    setTimeout(() => {
      const url = `http://${host}:${port}`
      const cmd = process.platform === 'darwin' ? 'open'
                : process.platform === 'win32'  ? 'start'
                : 'xdg-open'
      spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref()
    }, 1500)
  }

  // Forward signals so Ctrl-C cleanly stops the Next process.
  const shutdown = () => { child.kill('SIGINT') }
  process.on('SIGINT',  shutdown)
  process.on('SIGTERM', shutdown)

  child.on('exit', code => process.exit(code ?? 0))
}
