import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '@/lib/storage'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name }  = await params
  const limit     = Number(req.nextUrl.searchParams.get('limit') ?? 30)
  const evalName  = decodeURIComponent(name)
  const results   = await getStorage().getEvalResultsByName(evalName, limit)
  return NextResponse.json(results)
}
