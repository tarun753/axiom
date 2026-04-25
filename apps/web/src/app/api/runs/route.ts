import { NextRequest, NextResponse } from 'next/server'
import { getStorage } from '@/lib/storage'

export async function GET(req: NextRequest) {
  const limit  = Number(req.nextUrl.searchParams.get('limit')  ?? 50)
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? 0)
  const runs   = await getStorage().listRuns({ limit, offset })
  return NextResponse.json(runs)
}
