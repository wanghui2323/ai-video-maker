#!/usr/bin/env node

import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  assertPrivatePath,
  inspectWavHeader,
  parseArgs,
  readJson,
  relativePath,
  resolveInside,
  sha256,
  validateConsent,
  validateProvider,
  verifyHash,
  writeJson,
} from './voice-common.mjs';

export async function createProfile({root, id, version, consentPath, providerPath, referencePath, transcriptPath, outputPath}) {
  if (!id || !version) throw new Error('profile init requires --id and --version');
  const consent = await validateConsent(root, consentPath);
  const provider = await validateProvider(root, providerPath);
  assertPrivatePath(referencePath, 'reference audio');
  assertPrivatePath(transcriptPath, 'reference transcript');
  assertPrivatePath(outputPath, 'profile output');
  const reference = resolveInside(root, referencePath, 'reference audio');
  const transcript = resolveInside(root, transcriptPath, 'reference transcript');
  if (!existsSync(reference)) throw new Error(`reference audio does not exist: ${referencePath}`);
  if (!existsSync(transcript)) throw new Error(`reference transcript does not exist: ${transcriptPath}`);
  const transcriptText = (await readFile(transcript, 'utf8')).trim();
  if (!transcriptText) throw new Error('reference transcript must not be empty');
  const wav = await inspectWavHeader(reference);
  const profile = {
    schemaVersion: 1,
    profileId: id,
    version,
    status: 'locked_for_attended_calibration',
    localOnly: true,
    remoteUploadAuthorized: false,
    releaseApproved: false,
    consent: {
      path: consent.path,
      sha256: consent.sha256,
      evidencePath: consent.evidencePath,
      evidenceSha256: consent.evidenceSha256,
      ownerType: consent.value.voiceOwner.type,
    },
    provider: {
      path: provider.path,
      sha256: provider.sha256,
      kind: provider.value.kind,
      modelId: provider.value.modelId,
      modelPath: provider.value.modelPath,
      modelLicense: provider.value.modelLicense,
      modelSource: provider.value.modelSource,
      runtime: provider.value.runtime,
      fingerprints: provider.fingerprints,
    },
    reference: {
      audio: {path: referencePath, sha256: await sha256(reference), ...wav},
      transcript: {path: transcriptPath, sha256: await sha256(transcript)},
    },
    generation: provider.value.generation,
    postProcess: provider.value.postProcess,
    qaPolicy: {...provider.value.qaPolicy, asrFingerprints: provider.asrFingerprints},
    baselineEvidence: null,
    ownerApproval: null,
    previousProfile: null,
  };
  const output = resolveInside(root, outputPath, 'profile output');
  await writeJson(output, profile, {overwrite: false});
  return {profile, path: relativePath(root, output), sha256: await sha256(output)};
}

export async function preflightProfile({root, profilePath, allowCalibration = false}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({name, ok, detail});
  let profile = null;
  try {
    assertPrivatePath(profilePath, 'profile path');
    const absolute = resolveInside(root, profilePath, 'profile path');
    profile = await readJson(absolute);
    add('profile file', true, `${profile.profileId}@${profile.version}`);
    await verifyHash(root, profile.consent, 'consent');
    await verifyHash(root, {path: profile.consent.evidencePath, sha256: profile.consent.evidenceSha256}, 'consent evidence');
    add('consent hashes', true, 'consent and evidence are locked');
    const consent = await validateConsent(root, profile.consent.path);
    add('consent scope', consent.value.localOnly === true, 'local-only consent is active');
    const provider = await validateProvider(root, profile.provider.path);
    if (provider.sha256 !== profile.provider.sha256) throw new Error('provider config hash drifted');
    for (const locked of profile.provider.fingerprints || []) {
      const actual = provider.fingerprints.find((item) => item.path === locked.path);
      if (!actual || actual.sha256 !== locked.sha256) throw new Error(`model fingerprint drifted: ${locked.path}`);
    }
    for (const locked of profile.qaPolicy?.asrFingerprints || []) {
      const actual = provider.asrFingerprints.find((item) => item.path === locked.path);
      if (!actual || actual.sha256 !== locked.sha256) throw new Error(`ASR model fingerprint drifted: ${locked.path}`);
    }
    add('provider and model', true, `${provider.value.kind} / ${provider.value.modelId}`);
    await verifyHash(root, profile.reference.audio, 'reference audio');
    await verifyHash(root, profile.reference.transcript, 'reference transcript');
    add('reference hashes', true, 'reference audio and transcript are locked');
    if (profile.status === 'production-pilot') {
      await verifyHash(root, profile.baselineEvidence?.audio, 'accepted baseline audio');
      if (profile.ownerApproval?.releaseApproval !== false || profile.ownerApproval?.perRunOwnerReview !== true) {
        throw new Error('owner approval scope is incomplete or expanded to release');
      }
      add('owner baseline', true, 'production-pilot baseline is owner accepted');
    } else if (profile.status === 'locked_for_attended_calibration' && allowCalibration) {
      add('owner baseline', true, 'attended calibration is allowed; narration remains blocked');
    } else {
      throw new Error(`profile is not ready for narration: ${profile.status}`);
    }
  } catch (error) {
    add('blocker', false, error.message);
  }
  const blockerCount = checks.filter((check) => !check.ok).length;
  return {
    status: blockerCount ? 'blocked' : 'passed',
    blockerCount,
    readyForCalibration: blockerCount === 0 && ['locked_for_attended_calibration', 'production-pilot'].includes(profile?.status),
    readyForNarration: blockerCount === 0 && profile?.status === 'production-pilot',
    profile,
    checks,
  };
}

export async function acceptCalibration({root, profilePath, runPath, outputPath, version, feedback}) {
  if (!version || !feedback) throw new Error('profile accept requires --version and --feedback');
  assertPrivatePath(profilePath, 'calibration profile path');
  assertPrivatePath(runPath, 'calibration run path');
  assertPrivatePath(outputPath, 'accepted profile output');
  const sourceProfileFile = resolveInside(root, profilePath, 'profile path');
  const sourceProfile = await readJson(sourceProfileFile);
  if (sourceProfile.status !== 'locked_for_attended_calibration') throw new Error('only a calibration profile can be accepted');
  const runFile = resolveInside(root, runPath, 'voice run path');
  const run = await readJson(runFile);
  if (run.purpose !== 'calibration' || run.status !== 'owner_take_selected') {
    throw new Error('calibration run must reach owner_take_selected');
  }
  const sourceHash = await sha256(sourceProfileFile);
  if (run.profile.sha256 !== sourceHash || run.profile.path !== profilePath) throw new Error('calibration run profile drifted');
  const profilePreflight = await preflightProfile({root, profilePath, allowCalibration: true});
  if (profilePreflight.blockerCount) throw new Error('calibration profile preflight failed before acceptance');
  const selection = run.ownerSelection;
  if (selection?.releaseApproval !== false || selection?.scope !== 'this-run-only') {
    throw new Error('calibration owner selection scope is invalid');
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
    throw new Error('calibration selection does not match a machine-QA-passed take');
  }
  assertPrivatePath(selection.output, 'selected calibration take');
  const selectedFile = await verifyHash(root, {path: selection.output, sha256: selection.sha256}, 'selected calibration take');
  const accepted = {
    ...sourceProfile,
    version,
    status: 'production-pilot',
    baselineEvidence: {
      audio: {path: selection.output, sha256: selection.sha256},
      run: {path: runPath, sha256: await sha256(runFile)},
      take: selection.take,
      seed: selection.seed,
    },
    ownerApproval: {
      decision: 'accepted_as_production_pilot_baseline',
      acceptedAt: new Date().toISOString(),
      feedback,
      scope: 'voice-profile-baseline-only',
      releaseApproval: false,
      perRunOwnerReview: true,
      selectedAudioBytes: (await readFile(selectedFile)).length,
    },
    previousProfile: {path: profilePath, sha256: sourceHash, version: sourceProfile.version},
  };
  const output = resolveInside(root, outputPath, 'accepted profile output');
  await writeJson(output, accepted, {overwrite: false});
  return {profile: accepted, path: relativePath(root, output), sha256: await sha256(output)};
}

async function main() {
  const command = process.argv[2];
  const options = parseArgs(process.argv.slice(3));
  if (!['init', 'preflight', 'accept'].includes(command)) {
    console.error('Usage: voice-profile.mjs init|preflight|accept --root <package> ...');
    process.exitCode = 2;
    return;
  }
  const root = path.resolve(options.root || '.');
  if (command === 'init') {
    const result = await createProfile({
      root,
      id: options.id,
      version: options.version,
      consentPath: options.consent,
      providerPath: options.provider,
      referencePath: options.reference,
      transcriptPath: options.transcript,
      outputPath: options.output,
    });
    console.log(JSON.stringify({status: result.profile.status, path: result.path, sha256: result.sha256}, null, 2));
    return;
  }
  if (command === 'preflight') {
    const report = await preflightProfile({root, profilePath: options.profile, allowCalibration: options['allow-calibration'] === true});
    console.log(JSON.stringify(report, null, 2));
    if (report.blockerCount) process.exitCode = 1;
    return;
  }
  const result = await acceptCalibration({
    root,
    profilePath: options.profile,
    runPath: options.run,
    outputPath: options.output,
    version: options.version,
    feedback: options.feedback,
  });
  console.log(JSON.stringify({status: result.profile.status, path: result.path, sha256: result.sha256}, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
