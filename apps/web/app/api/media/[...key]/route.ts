// GET /api/media/[...key] — RETIRED (410 Gone). Files now live in SpacetimeDB and are read with the read_blob procedure
// (apps/web/lib/stdb/files.ts), which honors account sign-out, device removal and step-up. This route authorized with a
// verification secret that bypassed all of those, so it no longer serves anything. Exports kept so imports still compile.
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, _ctx: { params: Promise<{ key: string[] }> }) {
  return NextResponse.json({ error: 'gone' }, { status: 410 });
}
