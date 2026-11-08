// DEV ONLY: sample data for previewing the resident report without verification.
// Used only behind process.env.NODE_ENV === 'development'; production builds never render it.
import assessment from '../../../../fixtures/assessment/assessment-sample.json';
import findings from '../../../../fixtures/assessment/findings-sample.json';
import type { FrameRowLike } from './DamageReport';

export const SAMPLE_ASSESSMENT = JSON.stringify(assessment);

export const SAMPLE_FRAMES: FrameRowLike[] = findings.findings.map((f) => ({
  frameIndex: f.frameIndex,
  tSec: f.tSec,
  thumbKey: '',
  findingJson: JSON.stringify(f),
}));
