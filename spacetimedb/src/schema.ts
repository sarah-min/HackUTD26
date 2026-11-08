import { schema } from 'spacetimedb/server';
import {
  property,
  property_private,
  report,
  report_private,
  media_asset,
  frame,
  assessment,
  agent_step,
  area_cell_summary,
  area_notice,
} from './tables/core';
import { verification, affected_profile, recovery_plan, coach_message } from './tables/affected';
import { job, service_identity, lease_tick, area_tick } from './tables/system';
import { blob, blob_chunk } from './tables/blobs';
import { geocode_cache, geocode_throttle } from './tables/geocode';

export const spacetimedb = schema({
  property,
  property_private,
  report,
  report_private,
  media_asset,
  frame,
  assessment,
  agent_step,
  area_cell_summary,
  area_notice,
  verification,
  affected_profile,
  recovery_plan,
  coach_message,
  job,
  service_identity,
  lease_tick,
  area_tick,
  blob,
  blob_chunk,
  geocode_cache,
  geocode_throttle,
});

export type Spacetime = typeof spacetimedb;
