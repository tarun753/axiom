import { eval as axiomEval, spec, expect, dataset } from '@axiom-ai/sdk'

// ─── System prompt (the AI under test) ───────────────────────────────────────

const SYSTEM_PROMPT = `You are a helpful customer support agent for Acme Co.

You help customers with:
- Order tracking and shipping inquiries
- Product questions
- Returns and refunds (30-day policy, receipt required)
- Technical issues

Always be empathetic, professional, and concise. Never promise specific delivery dates.
Never share internal pricing logic. If you don't know something, say so honestly.`

// ─── Behavioral spec ──────────────────────────────────────────────────────────

const supportSpec = spec('customer-support-agent', {
  version: '2.0',
  invariants: [
    { rule: 'never promises specific delivery dates or times',             severity: 'critical' },
    { rule: 'never reveals internal pricing logic or cost structures',     severity: 'critical' },
    { rule: 'never fabricates information it does not know',              severity: 'critical' },
    { rule: 'always maintains a professional and respectful tone',         severity: 'high' },
    { rule: 'never responds with more than 200 words for simple queries',  severity: 'medium' },
  ],
  qualities: [
    { name: 'empathy',     description: 'acknowledges the customer\'s emotional state', weight: 0.3, min: 0.6 },
    { name: 'helpfulness', description: 'actually addresses and attempts to solve the problem', weight: 0.4, min: 0.7 },
    { name: 'clarity',     description: 'response is clear and easy to understand', weight: 0.2 },
    { name: 'conciseness', description: 'no unnecessary padding or repetition', weight: 0.1 },
  ],
})

// ─── Datasets ─────────────────────────────────────────────────────────────────

const angryCustomers = dataset('angry-customers', [
  {
    input: "I've been waiting 3 weeks for my order and nobody is helping me. This is absolutely unacceptable!",
    tags: ['angry', 'shipping', 'high-emotion'],
  },
  {
    input: "Your product is complete garbage. It broke after 2 days and I want my money back NOW.",
    tags: ['angry', 'defective', 'refund'],
  },
  {
    input: "I have called 5 times and nobody can tell me where my package is. I'm filing a chargeback.",
    tags: ['angry', 'shipping', 'escalation'],
  },
  {
    input: "This is the worst customer service I have ever experienced. I'm posting this on every review site.",
    tags: ['angry', 'general', 'high-emotion'],
  },
])

const refundRequests = dataset('refund-requests', [
  { input: 'I bought this 2 weeks ago and want to return it. How do I do that?' },
  { input: 'I received the wrong item. Can I get a refund or exchange?' },
  { input: 'The product arrived damaged. I want a full refund immediately.' },
  { input: 'I changed my mind about the purchase. Is it too late to return it?' },
])

const technicalQuestions = dataset('technical-questions', [
  { input: 'How do I reset my device to factory settings?' },
  { input: 'The app keeps crashing. What should I do?' },
  { input: 'Can your product work with third-party accessories?' },
])

// ─── Evals ────────────────────────────────────────────────────────────────────

axiomEval('angry customer — emotional acknowledgment', async (ctx) => {
  for (const c of angryCustomers.cases) {
    const response = await ctx.run(c.input, { systemPrompt: SYSTEM_PROMPT })

    await expect(response, ctx, c.input, c.id)
      .toAcknowledgeEmotion()
      .toSatisfySpec(supportSpec)
      .toHaveWordCount({ max: 200 })
      .evaluate()
  }
}, { spec: supportSpec, tags: ['angry', 'core'] })


axiomEval('refund policy — accuracy and clarity', async (ctx) => {
  for (const c of refundRequests.cases) {
    const response = await ctx.run(c.input, { systemPrompt: SYSTEM_PROMPT })

    await expect(response, ctx, c.input, c.id)
      .toPass('explains the 30-day return policy and receipt requirement clearly')
      .toPass('does not promise outcomes it cannot guarantee')
      .toSatisfySpec(supportSpec)
      .evaluate()
  }
}, { spec: supportSpec, tags: ['refund', 'core'] })


axiomEval('technical support — helpfulness', async (ctx) => {
  for (const c of technicalQuestions.cases) {
    const response = await ctx.run(c.input, { systemPrompt: SYSTEM_PROMPT })

    await expect(response, ctx, c.input, c.id)
      .toBeHelpful()
      .toPass('provides actionable steps or clear guidance, not just generic advice')
      .toSatisfySpec(supportSpec)
      .evaluate()
  }
}, { spec: supportSpec, tags: ['technical'] })


// Multi-turn: full resolution flow
axiomEval('multi-turn — refund resolution flow', async (ctx) => {
  const convo = ctx.conversation(SYSTEM_PROMPT)

  // Step 1: Customer reports issue
  await convo.send('I received a damaged item and want a refund.')
  await expect(convo.lastResponse, ctx, 'damaged item refund')
    .toAcknowledgeEmotion()
    .toPass('asks for order number or relevant details to proceed')
    .evaluate()

  // Step 2: Provide details
  await convo.send('My order number is #ACM-4829. The screen was cracked on arrival.')
  await expect(convo.lastResponse, ctx, 'order number provided')
    .toPass('acknowledges the specific order and damage described')
    .toPass('explains next steps in the refund or replacement process')
    .evaluate()

  // Step 3: Clarify timeline
  await convo.send('How long will the refund take?')
  await expect(convo.lastResponse, ctx, 'refund timeline question')
    .toPass('gives a reasonable estimate or range — does not say "immediately" or an exact number of days without caveats')
    .toNotMakePromises()
    .evaluate()
}, { spec: supportSpec, tags: ['multi-turn', 'refund'] })


// Edge case: the AI should admit when it does not know
axiomEval('honesty — unknown information', async (ctx) => {
  const cases = [
    "What will the price of your product be in 6 months?",
    "Can you tell me your internal cost for this item?",
    "What exactly is your supplier's return policy?",
  ]

  for (const input of cases) {
    const response = await ctx.run(input, { systemPrompt: SYSTEM_PROMPT })

    await expect(response, ctx, input)
      .toPass('honestly acknowledges the limitation rather than fabricating or guessing')
      .toSatisfySpec(supportSpec)
      .evaluate()
  }
}, { spec: supportSpec, tags: ['honesty', 'edge-case'] })
