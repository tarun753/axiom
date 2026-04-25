import { writeFileSync, mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CONFIG_TEMPLATE = `import { defineConfig } from '@axiom-ai/core'

export default defineConfig({
  models: {
    default: 'claude-sonnet-4-6',
    judge:   'claude-opus-4-7',
  },
  storagePath: '.axiom/db.sqlite',
  reporters:   ['console'],
  thresholds: {
    minPassRate:             0.8,
    failOnCriticalViolation: true,
  },
})
`

const EVAL_TEMPLATE = `import { eval, spec, expect, dataset } from '@axiom-ai/sdk'

// Define what your AI must always do
const mySpec = spec('my-assistant', {
  invariants: [
    { rule: 'always responds in a helpful and professional tone', severity: 'high' },
    { rule: 'never makes up information it does not know',        severity: 'critical' },
  ],
  qualities: [
    { name: 'helpfulness', description: 'directly addresses the user question',  weight: 0.5 },
    { name: 'clarity',     description: 'response is easy to understand',         weight: 0.3 },
    { name: 'conciseness', description: 'response is not unnecessarily verbose',  weight: 0.2 },
  ],
})

// A simple dataset
const cases = dataset('basic-questions', [
  { input: 'What is the capital of France?' },
  { input: 'Explain how HTTP works in one sentence.' },
  { input: 'What is 2 + 2?' },
])

// Your eval
eval('basic assistant behavior', async (ctx) => {
  for (const c of cases.cases) {
    const response = await ctx.run(c.input)

    await expect(response, ctx, c.input)
      .toSatisfySpec(mySpec)
      .toHaveWordCount({ max: 200 })
      .evaluate()
  }
}, { spec: mySpec })
`

export async function initCommand(cwd = process.cwd()): Promise<void> {
  const configPath = join(cwd, 'axiom.config.ts')
  const evalsDir   = join(cwd, 'evals')
  const evalPath   = join(evalsDir, 'example.eval.ts')
  const gitignore  = join(cwd, '.gitignore')

  if (existsSync(configPath)) {
    console.log('axiom.config.ts already exists — skipping')
  } else {
    writeFileSync(configPath, CONFIG_TEMPLATE)
    console.log('✓ Created axiom.config.ts')
  }

  if (!existsSync(evalsDir)) {
    mkdirSync(evalsDir, { recursive: true })
    console.log('✓ Created evals/')
  }

  if (!existsSync(evalPath)) {
    writeFileSync(evalPath, EVAL_TEMPLATE)
    console.log('✓ Created evals/example.eval.ts')
  }

  // Add .axiom/ to .gitignore
  if (existsSync(gitignore)) {
    const content = readFileSync(gitignore, 'utf8')
    if (!content.includes('.axiom/')) {
      appendFileSync(gitignore, '\n# Axiom\n.axiom/\n')
      console.log('✓ Added .axiom/ to .gitignore')
    }
  } else {
    writeFileSync(gitignore, '# Axiom\n.axiom/\n')
    console.log('✓ Created .gitignore with .axiom/')
  }

  console.log()
  console.log('Ready! Set your API key and run:')
  console.log()
  console.log('  export ANTHROPIC_API_KEY=sk-ant-...')
  console.log('  npx axiom run')
  console.log()
}
