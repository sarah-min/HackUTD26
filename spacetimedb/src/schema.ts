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
});

export type Spacetime = typeof spacetimedb;
