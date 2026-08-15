#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const STAGES = [
  'brief_ready',
  'direction_selected',
  'content_plan_reviewed',
  'narration_reviewed',
  'voice_run_selected',
  'timing_ready',
  'visual_previewed',
  'rendered',
  'human_reviewed',
  'approved',
];

const STAGE_VALUES = new Set(['pending', 'passed', 'blocked', 'failed', 'not_applicable']);
const REVIEW_VALUES = new Set(['pending', 'passed', 'blocked', 'failed', 'not_applicable']);
const RELEASE_STATES = new Set(['local_package', 'review_candidate', 'release_candidate']);
const DURATION_LANES = {
  quick: [35000, 50000],
  standard: [60000, 85000],
  deep: [90000, 120000],
  'course-master': [130000, 180000],
};
const FORMAT_PROFILES = new Set(['landscape-knowledge', 'vertical-presence']);
const VISUAL_JOBS = new Set(['conflict', 'mechanism', 'comparison', 'evidence', 'action', 'conclusion']);
const LAYOUTS = new Set(['branch', 'radial', 'flow', 'columns', 'stack', 'steps', 'statement']);
const CAMERAS = new Set(['overview', 'focus', 'compare']);
const TIMING_SOURCES = new Set(['estimated', 'transcribed', 'manually-aligned']);
const AUDIO_MODES = new Set(['none', 'human', 'synthetic', 'cloned']);
const INPUT_MODES = new Set(['idea', 'article', 'outline', 'script', 'source-pack', 'audio']);
const EVIDENCE_STATES = new Set(['source-grounded', 'user-provided', 'needs-verification', 'creative-only']);
const VOICE_PROFILE_STATES = new Set(['not_applicable', 'missing', 'calibrating', 'ready', 'blocked']);

const parseArgs = (argv) => {
  const options = {json: false};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') options.json = true;
    if (token === '--dir') {
      options.dir = argv[index + 1];
      index += 1;
    }
    if (token === '--help' || token === '-h') options.help = true;
  }
  return options;
};

const usage = `Usage: node scripts/validate-package.mjs --dir <workflow-package> [--json]`;
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  console.log(usage);
  process.exit(0);
}

if (!options.dir) {
  console.error(usage);
  process.exit(2);
}

const root = path.resolve(options.dir);
const errors = [];
const warnings = [];

const requiredString = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${label} must be a non-empty string`);
};

const unique = (values) => new Set(values).size === values.length;
const isPassed = (value) => value === 'passed' || value === 'not_applicable';
const localPath = (value) => typeof value === 'string' && value.length > 0 && !/^https?:\/\//i.test(value);
const resolveArtifact = (value) => path.resolve(root, value);
const isPrivateArtifact = (value) => {
  const segments = String(value).split(/[\\/]+/).map((item) => item.toLowerCase());
  return segments.includes('private')
    && !segments.some((item) => ['public', 'assets', 'static', 'dist', 'build'].includes(item));
};
const staysInsideRoot = (value) => {
  if (!localPath(value) || path.isAbsolute(value)) return false;
  const resolved = resolveArtifact(value);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
};
const sha256File = async (file) => {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
};

const loadJson = async (name) => {
  const file = path.join(root, name);
  if (!existsSync(file)) {
    errors.push(`missing required file: ${name}`);
    return null;
  }
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    errors.push(`invalid JSON in ${name}: ${error.message}`);
    return null;
  }
};

const validateTimedItems = (items, durationMs, label, itemValidator) => {
  if (!Array.isArray(items) || items.length === 0) {
    errors.push(`${label} must contain at least one item`);
    return;
  }
  const ids = items.map((item) => item.id).filter(Boolean);
  if (ids.length && !unique(ids)) errors.push(`${label} ids must be unique`);
  let expectedStart = 0;
  for (const [index, item] of items.entries()) {
    const itemLabel = `${label}[${index}]`;
    if (!Number.isFinite(item.startMs) || !Number.isFinite(item.endMs) || item.endMs <= item.startMs) {
      errors.push(`${itemLabel} has an invalid time range`);
      continue;
    }
    if (item.startMs !== expectedStart) errors.push(`${itemLabel}.startMs must be ${expectedStart}`);
    expectedStart = item.endMs;
    itemValidator(item, itemLabel);
  }
  if (expectedStart !== durationMs) errors.push(`${label} must end at durationMs ${durationMs}, got ${expectedStart}`);
};

const validateBrief = (brief) => {
  if (!brief) return;
  if (brief.schemaVersion !== 1) errors.push('video-brief.json schemaVersion must be 1');
  requiredString(brief.id, 'video-brief.id');
  if (!INPUT_MODES.has(brief.inputMode)) errors.push('video-brief.inputMode is not supported');
  requiredString(brief.input?.summary, 'video-brief.input.summary');
  requiredString(brief.input?.sourceState, 'video-brief.input.sourceState');
  requiredString(brief.input?.rightsState, 'video-brief.input.rightsState');
  if (!EVIDENCE_STATES.has(brief.input?.evidenceState)) errors.push('video-brief.input.evidenceState is not supported');
  requiredString(brief.audience, 'video-brief.audience');
  requiredString(brief.viewerChange, 'video-brief.viewerChange');
  if (!AUDIO_MODES.has(brief.voiceIntent?.mode)) errors.push('video-brief.voiceIntent.mode is not supported');
  if (!Array.isArray(brief.input?.sourceFiles)) errors.push('video-brief.input.sourceFiles must be an array');
  for (const source of brief.input?.sourceFiles || []) {
    if (!staysInsideRoot(source) || !existsSync(resolveArtifact(source))) errors.push(`brief source file does not exist inside the package: ${source}`);
  }
};

const validateContentDecision = (decision, brief) => {
  if (!decision) return null;
  if (decision.schemaVersion !== 1) errors.push('content-decision.json schemaVersion must be 1');
  requiredString(decision.id, 'content-decision.id');
  requiredString(decision.briefId, 'content-decision.briefId');
  requiredString(decision.coreIntent, 'content-decision.coreIntent');
  if (!INPUT_MODES.has(decision.inputMode)) errors.push('content-decision.inputMode is not supported');
  if (brief && decision.briefId !== brief.id) errors.push('content-decision.briefId must match video-brief.id');
  if (brief && decision.inputMode !== brief.inputMode) errors.push('content-decision.inputMode must match video-brief.inputMode');
  requiredString(decision.decisionRationale, 'content-decision.decisionRationale');
  const candidates = decision.candidateUnits;
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 6) {
    errors.push('content-decision.candidateUnits must contain 1-6 candidates');
    return null;
  }
  if (!unique(candidates.map((candidate) => candidate.id))) errors.push('candidate ids must be unique');
  for (const [index, candidate] of candidates.entries()) {
    const label = `candidateUnits[${index}]`;
    for (const field of ['id', 'workingTitle', 'primaryQuestion', 'coreJudgment', 'viewerAction']) {
      requiredString(candidate[field], `${label}.${field}`);
    }
    if (!DURATION_LANES[candidate.suggestedLane]) errors.push(`${label}.suggestedLane is not supported`);
    if (!FORMAT_PROFILES.has(candidate.formatProfile)) errors.push(`${label}.formatProfile is not supported`);
    if (!Array.isArray(candidate.sourceAnchors) || candidate.sourceAnchors.length === 0) {
      errors.push(`${label}.sourceAnchors must not be empty`);
    }
    for (const score of ['standalone', 'evidence', 'decisionValue', 'visualPotential']) {
      const value = candidate.scores?.[score];
      if (!Number.isInteger(value) || value < 1 || value > 5) errors.push(`${label}.scores.${score} must be an integer from 1 to 5`);
    }
    if (!Array.isArray(candidate.verificationNeeds)) errors.push(`${label}.verificationNeeds must be an array`);
  }
  const recommended = candidates.filter((candidate) => candidate.status === 'recommended');
  if (recommended.length !== 1) errors.push('exactly one candidate must have status=recommended');
  return recommended[0] || null;
};

const validateVisual = (visual, label) => {
  if (!VISUAL_JOBS.has(visual?.visualJob)) errors.push(`${label}.visualJob is not supported`);
  if (!LAYOUTS.has(visual?.layout)) errors.push(`${label}.layout is not supported`);
  if (!CAMERAS.has(visual?.camera)) errors.push(`${label}.camera is not supported`);
  requiredString(visual?.headline, `${label}.headline`);
  if (!Array.isArray(visual?.objects) || visual.objects.length === 0) errors.push(`${label}.objects must not be empty`);
  const maximum = visual?.layout === 'flow' ? 4 : 3;
  if (visual?.objects?.length > maximum) errors.push(`${label}.objects exceeds ${maximum}`);
};

const validateContentPlan = (plan, recommended) => {
  if (!plan) return;
  if (plan.schemaVersion !== 1) errors.push('video-content-plan.json schemaVersion must be 1');
  for (const field of ['id', 'selectedUnitId', 'primaryQuestion', 'coreJudgment', 'viewerAction']) {
    requiredString(plan[field], `video-content-plan.${field}`);
  }
  const lane = DURATION_LANES[plan.durationLane];
  if (!lane) errors.push('video-content-plan.durationLane is not supported');
  else if (!Number.isFinite(plan.durationMs) || plan.durationMs < lane[0] || plan.durationMs > lane[1]) {
    errors.push(`video-content-plan.durationMs must be within ${lane[0]}-${lane[1]}`);
  }
  if (!FORMAT_PROFILES.has(plan.formatProfile)) errors.push('video-content-plan.formatProfile is not supported');
  for (const field of ['visibleConflict', 'withheldAnswer', 'payoff']) {
    requiredString(plan.openingContract?.[field], `video-content-plan.openingContract.${field}`);
  }
  if (recommended) {
    if (plan.selectedUnitId !== recommended.id) errors.push('selectedUnitId must match the recommended candidate');
    for (const field of ['primaryQuestion', 'coreJudgment', 'viewerAction', 'formatProfile']) {
      if (plan[field] !== recommended[field]) errors.push(`video-content-plan.${field} must match the recommended candidate`);
    }
  }
  validateTimedItems(plan.segments, plan.durationMs, 'segments', (segment, label) => {
    for (const field of ['id', 'role', 'purpose']) requiredString(segment[field], `${label}.${field}`);
    if (segment.role !== 'outro') requiredString(segment.narration, `${label}.narration`);
    if (!Array.isArray(segment.sourceAnchors) || segment.sourceAnchors.length === 0) errors.push(`${label}.sourceAnchors must not be empty`);
    validateVisual(segment.visual, `${label}.visual`);
  });
  if (plan.durationLane === 'course-master') {
    if (!Array.isArray(plan.chapters) || plan.chapters.length < 3 || plan.chapters.length > 5) {
      errors.push('course-master must define 3-5 chapters');
    }
  }
};

const validateVideoUnit = (unit, contentPlan) => {
  if (!unit) return;
  if (unit.schemaVersion !== 1) errors.push('video-unit.json schemaVersion must be 1');
  for (const field of ['id', 'primaryQuestion', 'coreJudgment']) requiredString(unit[field], `video-unit.${field}`);
  if (!FORMAT_PROFILES.has(unit.formatProfile)) errors.push('video-unit.formatProfile is not supported');
  if (contentPlan) {
    for (const field of ['id', 'primaryQuestion', 'coreJudgment', 'formatProfile', 'durationMs']) {
      const sourceField = field === 'id' ? 'id' : field;
      if (unit[field] !== contentPlan[sourceField]) errors.push(`video-unit.${field} must match video-content-plan.${sourceField}`);
    }
  }
  validateTimedItems(unit.beats, unit.durationMs, 'beats', (beat, label) => {
    requiredString(beat.id, `${label}.id`);
    validateVisual(beat, label);
  });
  const audio = unit.audio || {};
  if (!AUDIO_MODES.has(audio.mode)) errors.push('video-unit.audio.mode is not supported');
  if (!TIMING_SOURCES.has(audio.timingSource)) errors.push('video-unit.audio.timingSource is not supported');
  if (audio.mode === 'cloned') {
    if (audio.authorized !== true) errors.push('cloned voice requires audio.authorized=true');
    requiredString(audio.consentPath, 'video-unit.audio.consentPath');
    requiredString(audio.profilePath, 'video-unit.audio.profilePath');
    requiredString(audio.runPath, 'video-unit.audio.runPath');
    requiredString(audio.selectedAsset, 'video-unit.audio.selectedAsset');
    requiredString(audio.selectedAssetSha256, 'video-unit.audio.selectedAssetSha256');
    if (audio.localOnly !== true && audio.remoteUploadAuthorized !== true) {
      errors.push('cloned voice must stay local unless remote upload is explicitly authorized');
    }
    for (const [label, value] of [
      ['consentPath', audio.consentPath],
      ['profilePath', audio.profilePath],
      ['runPath', audio.runPath],
      ['selectedAsset', audio.selectedAsset],
    ]) {
      if (value && (!staysInsideRoot(value) || !isPrivateArtifact(value))) {
        errors.push(`cloned voice ${label} must stay in a private path inside the package`);
      }
    }
  }
};

const validateClonedVoice = async (unit, state) => {
  const audio = unit?.audio;
  if (audio?.mode !== 'cloned') return;
  try {
    const consentFile = resolveArtifact(audio.consentPath);
    const profileFile = resolveArtifact(audio.profilePath);
    const runFile = resolveArtifact(audio.runPath);
    const selectedFile = resolveArtifact(audio.selectedAsset);
    for (const [label, file] of [
      ['consent', consentFile],
      ['profile', profileFile],
      ['run', runFile],
      ['selected asset', selectedFile],
    ]) {
      if (!existsSync(file)) errors.push(`cloned voice ${label} does not exist`);
    }
    if (![consentFile, profileFile, runFile, selectedFile].every((file) => existsSync(file))) return;
    const [consent, profile, run] = await Promise.all([
      readFile(consentFile, 'utf8').then(JSON.parse),
      readFile(profileFile, 'utf8').then(JSON.parse),
      readFile(runFile, 'utf8').then(JSON.parse),
    ]);
    if (consent.authorized !== true || consent.localOnly !== true || consent.remoteUploadAuthorized !== false) {
      errors.push('cloned voice consent is not authorized for local-only use');
    }
    if (profile.status !== 'production-pilot') errors.push('cloned voice profile must be production-pilot');
    if (profile.localOnly !== true || profile.remoteUploadAuthorized !== false || profile.releaseApproved !== false) {
      errors.push('cloned voice profile privacy or release scope is invalid');
    }
    if (profile.consent?.path !== audio.consentPath || profile.consent?.sha256 !== await sha256File(consentFile)) {
      errors.push('cloned voice profile consent does not match the video unit');
    }
    if (run.status !== 'owner_take_selected') errors.push('cloned voice run must reach owner_take_selected');
    if (run.purpose !== 'narration') errors.push('video unit must use a narration VoiceRun, not a calibration run');
    if (run.profile?.path !== audio.profilePath || run.profile?.sha256 !== await sha256File(profileFile)) {
      errors.push('cloned voice run profile does not match the video unit');
    }
    const selection = run.ownerSelection || {};
    const selectedHash = await sha256File(selectedFile);
    if (selection.output !== audio.selectedAsset || selection.sha256 !== audio.selectedAssetSha256 || selectedHash !== audio.selectedAssetSha256) {
      errors.push('cloned voice selected asset or hash does not match ownerSelection');
    }
    if (selection.releaseApproval !== false || selection.scope !== 'this-run-only') {
      errors.push('cloned voice ownerSelection scope is invalid');
    }
    const selectedTake = run.takes?.find((take) => take.take === selection.take);
    if (
      !selectedTake
      || selectedTake.machineQa?.status !== 'pass'
      || selectedTake.machineQa?.inputWavSha256 !== selectedTake.sha256
      || selectedTake.ownerDecision !== 'selected'
      || selectedTake.output !== selection.output
      || selectedTake.sha256 !== selection.sha256
    ) {
      errors.push('cloned voice ownerSelection is not backed by the selected machine-QA-passed take');
    }
    if (state?.stages?.voice_run_selected === 'passed' && profile.ownerApproval?.perRunOwnerReview !== true) {
      errors.push('voice_run_selected requires per-run owner review in the production profile');
    }
  } catch (error) {
    errors.push(`cloned voice manifests could not be validated: ${error.message}`);
  }
};

const validateCaptions = (captionsFile, unit, state) => {
  if (!captionsFile || !unit || !state) return;
  if (!TIMING_SOURCES.has(captionsFile.timingSource)) errors.push('captions.json timingSource is not supported');
  if (captionsFile.timingSource !== unit.audio?.timingSource) {
    errors.push('captions timingSource must match video-unit.audio.timingSource');
  }
  if (state.stages?.timing_ready === 'passed' && captionsFile.timingSource === 'estimated') {
    errors.push('timing_ready cannot pass with estimated captions');
  }
  const captions = captionsFile.captions;
  if (!Array.isArray(captions) || captions.length === 0) {
    errors.push('captions.json captions must not be empty');
    return;
  }
  let previousEnd = 0;
  for (const [index, caption] of captions.entries()) {
    const label = `captions[${index}]`;
    requiredString(caption.text, `${label}.text`);
    if (!Number.isFinite(caption.startMs) || !Number.isFinite(caption.endMs) || caption.endMs <= caption.startMs) {
      errors.push(`${label} has an invalid time range`);
      continue;
    }
    if (caption.startMs < previousEnd) errors.push(`${label} overlaps the previous caption`);
    if (caption.endMs > unit.durationMs) errors.push(`${label} exceeds video duration`);
    previousEnd = caption.endMs;
  }
};

const validateState = (state, brief, unit) => {
  if (!state) return;
  if (state.schemaVersion !== 1) errors.push('workflow-state.json schemaVersion must be 1');
  requiredString(state.id, 'workflow-state.id');
  if (!RELEASE_STATES.has(state.releaseState)) errors.push('workflow-state.releaseState is not supported');
  if (unit && state.id !== unit.id) errors.push('workflow-state.id must match video-unit.id');
  let earlierIncomplete = false;
  for (const stage of STAGES) {
    const value = state.stages?.[stage];
    if (!STAGE_VALUES.has(value)) {
      errors.push(`workflow-state.stages.${stage} is not supported`);
      earlierIncomplete = true;
      continue;
    }
    if (value === 'passed' && earlierIncomplete) errors.push(`${stage} cannot pass before all required earlier stages`);
    if (!isPassed(value)) earlierIncomplete = true;
  }
  const requiredArtifacts = ['source', 'brief', 'contentDecision', 'contentPlan', 'narrationReview', 'videoUnit', 'captions'];
  for (const key of requiredArtifacts) {
    const value = state.artifacts?.[key];
    requiredString(value, `workflow-state.artifacts.${key}`);
    if (localPath(value) && !existsSync(resolveArtifact(value))) errors.push(`artifact does not exist: ${value}`);
  }
  if (brief?.input?.evidenceState === 'needs-verification' && state.stages?.approved === 'passed') {
    errors.push('approved cannot pass while the brief still needs evidence verification');
  }
  const voiceDependency = state.dependencies?.voiceProfile;
  if (!voiceDependency || !VOICE_PROFILE_STATES.has(voiceDependency.status)) {
    errors.push('workflow-state.dependencies.voiceProfile.status is not supported');
  }
  if (unit?.audio?.mode === 'cloned') {
    if (voiceDependency?.mode !== 'cloned' || voiceDependency?.status !== 'ready' || voiceDependency?.preflight !== 'passed') {
      errors.push('cloned narration requires a ready, preflight-passed voice profile dependency');
    }
    if (state.stages?.voice_run_selected !== 'passed') errors.push('cloned narration requires voice_run_selected=passed');
  }
  if (state.stages?.rendered === 'passed') {
    requiredString(state.artifacts?.finalVideo, 'workflow-state.artifacts.finalVideo');
    if (localPath(state.artifacts?.finalVideo) && !existsSync(resolveArtifact(state.artifacts.finalVideo))) {
      errors.push(`rendered video does not exist: ${state.artifacts.finalVideo}`);
    }
  }
  for (const key of ['facts', 'narration', 'voice', 'visuals', 'rights', 'aiDisclosure']) {
    if (!REVIEW_VALUES.has(state.review?.[key])) errors.push(`workflow-state.review.${key} is not supported`);
  }
  if (state.stages?.approved === 'passed') {
    if (state.stages?.human_reviewed !== 'passed') errors.push('approved requires human_reviewed=passed');
    for (const [key, value] of Object.entries(state.review || {})) {
      if (!isPassed(value)) errors.push(`approved requires review.${key} to pass or be not_applicable`);
    }
  }
  if (state.releaseState === 'review_candidate' && state.stages?.rendered !== 'passed') {
    errors.push('review_candidate requires rendered=passed');
  }
  if (state.releaseState === 'release_candidate' && state.stages?.approved !== 'passed') {
    errors.push('release_candidate requires approved=passed');
  }
  if (unit?.audio?.mode === 'none' && state.stages?.voice_run_selected !== 'not_applicable') {
    warnings.push('voice_run_selected should be not_applicable while audio.mode is none');
  }
};

const brief = await loadJson('video-brief.json');
const contentDecision = await loadJson('content-decision.json');
const contentPlan = await loadJson('video-content-plan.json');
const videoUnit = await loadJson('video-unit.json');
const workflowState = await loadJson('workflow-state.json');
const captions = await loadJson('captions.json');

validateBrief(brief);
const recommended = validateContentDecision(contentDecision, brief);
validateContentPlan(contentPlan, recommended);
validateVideoUnit(videoUnit, contentPlan);
validateState(workflowState, brief, videoUnit);
validateCaptions(captions, videoUnit, workflowState);
await validateClonedVoice(videoUnit, workflowState);

const result = {
  status: errors.length ? 'invalid' : warnings.length ? 'valid_with_warnings' : 'valid',
  packageDir: root,
  errors,
  warnings,
  summary: {
    inputMode: brief?.inputMode || null,
    candidateCount: contentDecision?.candidateUnits?.length || 0,
    selectedUnitId: contentPlan?.selectedUnitId || null,
    durationMs: contentPlan?.durationMs || null,
    releaseState: workflowState?.releaseState || null,
  },
};

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`${result.status}: ${root}`);
  for (const error of errors) console.log(`ERROR ${error}`);
  for (const warning of warnings) console.log(`WARN  ${warning}`);
  console.log(`input=${result.summary.inputMode || '-'} candidates=${result.summary.candidateCount} selected=${result.summary.selectedUnitId || '-'} durationMs=${result.summary.durationMs || '-'} release=${result.summary.releaseState || '-'}`);
}

process.exit(errors.length ? 1 : 0);
