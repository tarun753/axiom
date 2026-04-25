import { NextRequest, NextResponse } from 'next/server'
import { buildComparison } from '@axiom-ai/core'
import { getStorage }      from '@/lib/storage'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ base: string; head: string }> }
) {
  const { base, head } = await params
  const storage = getStorage()

  const [baseRun, headRun] = await Promise.all([
    storage.getRun(base),
    storage.getRun(head),
  ])

  if (!baseRun) return NextResponse.json({ error: `Run not found: ${base}` }, { status: 404 })
  if (!headRun) return NextResponse.json({ error: `Run not found: ${head}` }, { status: 404 })

  const [prevResults, currResults] = await Promise.all([
    storage.getEvalResults(base),
    storage.getEvalResults(head),
  ])

  const comparison = buildComparison(baseRun, headRun, prevResults, currResults)
  return NextResponse.json(comparison)
}
