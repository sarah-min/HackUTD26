// GET /api/health — web / stdb / storage reachability. Owner: Part 4.
import { NextResponse } from 'next/server';
import { createStorageFromEnv } from '@hack/storage';
import { pingStdb } from '../_lib/webAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  let storage = false;
  try {
    storage = await createStorageFromEnv().ping();
  } catch {
    storage = false;
  }

  let stdb = false;
  try {
    stdb = await pingStdb();
  } catch {
    stdb = false;
  }

  const ok = storage; // web is up if this handler runs; stdb optional until token registered
  return NextResponse.json({
    ok,
    web: true,
    stdb,
    storage,
    version: process.env.npm_package_version ?? '0.0.0',
  });
}
