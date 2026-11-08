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
import { account, account_device, account_property, email_challenge, demo_code, email_config, account_tick } from './tables/accounts';
import { claim_conflict, security_config, access_log, verification_start } from './tables/security';

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
  account,
  account_device,
  account_property,
  email_challenge,
  demo_code,
  email_config,
  account_tick,
  claim_conflict,
  security_config,
  access_log,
  verification_start,
});

export type Spacetime = typeof spacetimedb;
