#!/usr/bin/env node

import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {preflightProfile} from './voice-profile.mjs';
import {
  assertPrivatePath,
  parseArgs,
  readJson,
  relativePath,
  resolveInside,
  sha256,
  stableSeed,
  verifyHash,
  writeJson,
} from './voice-common.mjs';

export async function createVoiceRun({root, profilePath, scriptPath, chapterId, purpose, outputPath}) {
  if (!chapterId || !['calibration', 'narration'].includes(purpose)) {
    throw new Error('voice run init requires --chapter and --purpose calibration|narration');
  }
  assertPrivatePath(profilePath, 'voice profile path');
  assertPrivatePath(scriptPath, 'voice script');
  assertPrivatePath(outputPath, 'voice run output');
  const preflight = await preflightProfile({root, profilePath, allowCalibration: purpose === 'calibration'});
  if (purpose === 'calibration' && !preflight.readyForCalibration) throw new Error('voice profile is not ready for calibration');
  if (purpose === 'narration' && !preflight.readyForNarration) throw new Error('voice profile is not ready for narration');
  const profileFile = resolveInside(root, profilePath, 'profile path');
  const profile = await readJson(profileFile);
  const scriptFile = resolveInside(root, scriptPath, 'script path');
  const text = (await readFile(scriptFile, 'utf8')).trim();
  if (!text) throw new Error('voice script must not be empty');
  const scriptSha256 = await sha256(scriptFile);
  const profileSha256 = await sha256(profileFile);
  const takeCount = profile.generation.takeCount;
  const seeds = Array.from({length: takeCount}, (_, index) => stableSeed(profile.version, scriptSha256, chapterId, index + 1));
  const run = {
    schemaVersion: 1,
    id: `${chapterId}-${scriptSha256.slice(0, 10)}`,
    purpose,
    status: 'profile_locked',
    localOnly: true,
    remoteUploadAuthorized: false,
    releaseApproved: false,
    profile: {path: profilePath, sha256: profileSha256, id: profile.profileId, version: profile.version},
    chapter: {id: chapterId, scriptPath, scriptSha256, text},
    provider: profile.provider,
    reference: profile.reference,
    generation: {...profile.generation, seeds},
    postProcess: profile.postProcess,
    qaPolicy: profile.qaPolicy,
    takes: seeds.map((seed, index) => ({
      take: index + 1,
      seed,
      status: 'pending_generation',
      output: null,
      sha256: null,
      machineQa: null,
      ownerDecision: null,
    })),
    ownerSelection: null,
    humanReview: {
      ownerTakeSelected: false,
      ownerFullTrackPassed: false,
      finalMixPassed: false,
    },
    nextState: 'takes_generated',
  };
  const output = resolveInside(root, outputPath, 'voice run output');
  await writeJson(output, run, {overwrite: false});
  return {run, path: relativePath(root, output), sha256: await sha256(output)};
}

export async function validateVoiceRun({root, runPath}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({name, ok, detail});
  let run = null;
  try {
    assertPrivatePath(runPath, 'voice run path');
    const runFile = resolveInside(root, runPath, 'voice run path');
    run = await readJson(runFile);
    assertPrivatePath(run.profile?.path, 'voice profile path');
    const profileFile = await verifyHash(root, run.profile, 'voice profile');
    const profile = await readJson(profileFile);
    const preflight = await preflightProfile({root, profilePath: run.profile.path, allowCalibration: run.purpose === 'calibration'});
    if (preflight.blockerCount) throw new Error('voice profile preflight failed');
    add('profile', true, `${profile.profileId}@${profile.version}`);
    assertPrivatePath(run.chapter?.scriptPath, 'voice script');
    await verifyHash(root, {path: run.chapter.scriptPath, sha256: run.chapter.scriptSha256}, 'voice script');
    const text = (await readFile(resolveInside(root, run.chapter.scriptPath, 'voice script'), 'utf8')).trim();
    if (text !== run.chapter.text) throw new Error('voice script content drifted');
    add('script', true, run.chapter.id);
    if (run.localOnly !== true || run.remoteUploadAuthorized !== false || run.releaseApproved !== false) {
      throw new Error('voice run privacy or release scope drifted');
    }
    add('privacy', true, 'local-only and no release approval');
    if (!isDeepStrictEqual(run.provider, profile.provider)) throw new Error('voice run provider lock drifted');
    if (!isDeepStrictEqual(run.reference, profile.reference)) throw new Error('voice run reference lock drifted');
    if (!isDeepStrictEqual(run.postProcess, profile.postProcess)) throw new Error('voice run post-process lock drifted');
    for (const [key, value] of Object.entries(profile.generation || {})) {
      if (!isDeepStrictEqual(run.generation?.[key], value)) throw new Error(`voice run generation setting drifted: ${key}`);
    }
    const expectedSeeds = Array.from(
      {length: profile.generation.takeCount},
      (_, index) => stableSeed(profile.version, run.chapter.scriptSha256, run.chapter.id, index + 1),
    );
    if (!isDeepStrictEqual(run.generation?.seeds, expectedSeeds)) throw new Error('voice run deterministic seeds drifted');
    if (!Array.isArray(run.takes) || run.takes.length !== profile.generation.takeCount) {
      throw new Error('voice run take count drifted');
    }
    for (const [index, take] of run.takes.entries()) {
      if (take.take !== index + 1 || take.seed !== expectedSeeds[index]) throw new Error(`take ${index + 1} identity drifted`);
      if (take.output) {
        assertPrivatePath(take.output, `take ${take.take} output`);
        await verifyHash(root, {path: take.output, sha256: take.sha256}, `take ${take.take}`);
      }
    }
    add('takes', true, `${run.takes.length} take records`);
    if (run.status === 'owner_take_selected') {
      if (run.ownerSelection?.releaseApproval !== false || run.ownerSelection?.scope !== 'this-run-only') {
        throw new Error('owner selection scope is invalid');
      }
      assertPrivatePath(run.ownerSelection.output, 'owner-selected take');
      await verifyHash(root, {path: run.ownerSelection.output, sha256: run.ownerSelection.sha256}, 'owner-selected take');
      const selected = run.takes.find((take) => take.take === run.ownerSelection.take);
      if (
        !selected
        || selected.machineQa?.status !== 'pass'
        || selected.machineQa?.inputWavSha256 !== selected.sha256
        || selected.output !== run.ownerSelection.output
        || selected.sha256 !== run.ownerSelection.sha256
        || selected.ownerDecision !== 'selected'
      ) {
        throw new Error('owner selection does not match a machine-QA-passed take');
      }
      add('owner selection', true, `take ${run.ownerSelection.take}`);
    }
  } catch (error) {
    add('blocker', false, error.message);
  }
  const blockerCount = checks.filter((check) => !check.ok).length;
  return {status: blockerCount ? 'blocked' : 'passed', blockerCount, run, checks};
}

export async function selectVoiceTake({root, runPath, takeNumber, feedback}) {
  if (!takeNumber || !feedback) throw new Error('voice run select requires --take and --feedback from the voice owner');
  assertPrivatePath(runPath, 'voice run path');
  const runFile = resolveInside(root, runPath, 'voice run path');
  const run = await readJson(runFile);
  if (run.status !== 'machine_qa_passed_owner_selection_pending') {
    throw new Error(`voice run is not awaiting owner selection: ${run.status}`);
  }
  const validation = await validateVoiceRun({root, runPath});
  if (validation.blockerCount) throw new Error('voice run validation failed before owner selection');
  const selected = run.takes.find((take) => take.take === Number(takeNumber));
  if (!selected || selected.machineQa?.status !== 'pass') {
    throw new Error('only a machine-QA-passed take can be selected');
  }
  const selectedFile = await verifyHash(root, {path: selected.output, sha256: selected.sha256}, 'selected take');
  if (selected.machineQa.inputWavSha256 !== selected.sha256) {
    throw new Error('machine QA was not measured on the selected WAV');
  }
  run.status = 'owner_take_selected';
  run.ownerSelection = {
    decision: 'owner_take_selected',
    selectedAt: new Date().toISOString(),
    take: selected.take,
    seed: selected.seed,
    output: selected.output,
    sha256: await sha256(selectedFile),
    feedback,
    scope: 'this-run-only',
    releaseApproval: false,
  };
  run.takes = run.takes.map((take) => ({
    ...take,
    ownerDecision: take.take === selected.take ? 'selected' : 'not_selected',
  }));
  run.humanReview.ownerTakeSelected = true;
  run.humanReview.ownerSelectedTake = selected.take;
  run.nextState = run.purpose === 'calibration' ? 'profile_acceptance' : 'chapters_locked';
  await writeJson(runFile, run);
  return run;
}

async function main() {
  const command = process.argv[2];
  const options = parseArgs(process.argv.slice(3));
  if (!['init', 'validate', 'select'].includes(command)) {
    console.error('Usage: voice-run.mjs init|validate|select --root <package> ...');
    process.exitCode = 2;
    return;
  }
  const root = path.resolve(options.root || '.');
  if (command === 'init') {
    const result = await createVoiceRun({
      root,
      profilePath: options.profile,
      scriptPath: options.script,
      chapterId: options.chapter,
      purpose: options.purpose,
      outputPath: options.output,
    });
    console.log(JSON.stringify({status: result.run.status, path: result.path, seeds: result.run.generation.seeds}, null, 2));
    return;
  }
  if (command === 'validate') {
    const report = await validateVoiceRun({root, runPath: options.run});
    console.log(JSON.stringify(report, null, 2));
    if (report.blockerCount) process.exitCode = 1;
    return;
  }
  const run = await selectVoiceTake({root, runPath: options.run, takeNumber: options.take, feedback: options.feedback});
  console.log(JSON.stringify({status: run.status, ownerSelection: run.ownerSelection}, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
