import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '@/lib/storage'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const storage = getStorage()
  const run     = await storage.getRun(id)
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const results = await storage.getEvalResults(id)
  return NextResponse.json({ run, results })
}
