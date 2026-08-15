#!/usr/bin/env python3
"""Run local ASR and PCM gates on generated VoiceRun takes."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import re
import wave
from difflib import SequenceMatcher
from importlib.metadata import version as package_version
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_inside(root: Path, value: str) -> Path:
    path = (root / value).resolve()
    if Path(value).is_absolute() or (path != root and root not in path.parents):
        raise RuntimeError(f"Path escapes package root: {value}")
    return path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def require_private_path(value: str, label: str) -> None:
    parts = {part.lower() for part in Path(value).parts}
    require("private" in parts, f"{label} must be stored under the package private directory")
    require(not parts.intersection({"public", "assets", "static", "dist", "build"}), f"{label} is inside a public or deploy directory")


def normalize_text(text: str) -> str:
    return "".join(re.findall(r"[\u3400-\u9fff]+|[a-z0-9]+", text.lower()))


def load_wav(path: Path):
    import numpy as np

    with wave.open(str(path), "rb") as handle:
        if handle.getsampwidth() != 2:
            raise RuntimeError(f"Expected PCM16 WAV: {path}")
        channels = handle.getnchannels()
        rate = handle.getframerate()
        audio = np.frombuffer(handle.readframes(handle.getnframes()), dtype="<i2").astype(np.float32) / 32768
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    return audio, rate


def resample_16k(audio, source_rate: int):
    import numpy as np

    if source_rate == 16000:
        return audio
    source = np.arange(len(audio), dtype=np.float64)
    target = np.linspace(0, max(0, len(audio) - 1), round(len(audio) * 16000 / source_rate))
    return np.interp(target, source, audio).astype(np.float32)


def audio_metrics(audio, rate: int) -> dict:
    import numpy as np

    frame = max(1, round(rate * 0.02))
    usable = len(audio) - len(audio) % frame
    blocks = audio[:usable].reshape(-1, frame) if usable else audio.reshape(1, -1)
    block_rms = np.sqrt(np.mean(blocks * blocks, axis=1, dtype=np.float64))
    active = blocks[block_rms >= 10 ** (-42 / 20)]
    active_audio = active.reshape(-1) if active.size else audio
    rms = max(float(np.sqrt(np.mean(active_audio * active_audio, dtype=np.float64))), 1e-12)
    peak = max(float(np.max(np.abs(audio))), 1e-12)
    return {
        "durationSeconds": round(len(audio) / rate, 3),
        "activeRmsDbfs": round(20 * math.log10(rms), 3),
        "peakDbfs": round(20 * math.log10(peak), 3),
        "clippingPercent": round(100 * float(np.mean(np.abs(audio) >= 0.999)), 6),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--run", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    require_private_path(args.profile, "profile path")
    require_private_path(args.run, "run path")
    profile_path = resolve_inside(root, args.profile)
    run_path = resolve_inside(root, args.run)
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    run = json.loads(run_path.read_text(encoding="utf-8"))
    require(run.get("status") == "takes_generated_requires_machine_qa", "VoiceRun has no generated takes awaiting QA")
    require(run.get("localOnly") is True and run.get("remoteUploadAuthorized") is False, "VoiceRun must remain local-only")
    require(profile.get("localOnly") is True and profile.get("remoteUploadAuthorized") is False, "VoiceProfile must remain local-only")
    require(run["profile"]["path"] == args.profile and run["profile"]["sha256"] == sha256(profile_path), "VoiceRun profile lock drifted")
    require(
        (run.get("purpose") == "calibration" and profile.get("status") in {"locked_for_attended_calibration", "production-pilot"})
        or (run.get("purpose") == "narration" and profile.get("status") == "production-pilot"),
        "VoiceRun purpose is incompatible with the VoiceProfile state",
    )
    require(run.get("provider") == profile.get("provider"), "VoiceRun provider lock drifted")
    require(run.get("reference") == profile.get("reference"), "VoiceRun reference lock drifted")
    require(run.get("postProcess") == profile.get("postProcess"), "VoiceRun post-process lock drifted")
    generation_evidence = run.get("generationEvidence", {})
    require(generation_evidence.get("localOnly") is True, "VoiceRun lacks local generation evidence")
    require(generation_evidence.get("modelFingerprints") == profile["provider"].get("fingerprints"), "Generation model fingerprints drifted")
    require(generation_evidence.get("referenceAudioSha256") == profile["reference"]["audio"]["sha256"], "Generation reference audio drifted")
    require(generation_evidence.get("referenceTranscriptSha256") == profile["reference"]["transcript"]["sha256"], "Generation reference transcript drifted")
    require(generation_evidence.get("runtime") == profile["provider"].get("runtime"), "Generation runtime evidence drifted")
    asr_path = resolve_inside(root, profile["qaPolicy"]["asrModelPath"])
    require(asr_path.exists(), "Local ASR model is missing")
    for locked in profile["qaPolicy"].get("asrFingerprints", []):
        fingerprint_path = resolve_inside(root, locked["path"])
        require(fingerprint_path.exists() and sha256(fingerprint_path) == locked["sha256"], f"ASR model fingerprint drifted: {locked['path']}")
    for take in run["takes"]:
        require_private_path(take["output"], f"take {take['take']} output")
        audio_path = resolve_inside(root, take["output"])
        require(audio_path.exists() and sha256(audio_path) == take["sha256"], f"Take {take['take']} hash drifted")
    if args.dry_run:
        print(json.dumps({"status": "ready", "takes": len(run["takes"]), "asrModel": profile["qaPolicy"]["asrModelPath"]}, ensure_ascii=False))
        return

    runtime = profile["provider"]["runtime"]
    require(".".join(platform.python_version_tuple()[:2]) == runtime["python"], "Python runtime version differs from VoiceProfile")
    for field, distribution in [("mlxAudio", "mlx-audio"), ("mlxWhisper", "mlx-whisper"), ("numpy", "numpy")]:
        require(package_version(distribution) == runtime[field], f"{distribution} runtime version differs from VoiceProfile")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import mlx_whisper

    expected = normalize_text(run["chapter"]["text"])
    policy = profile["qaPolicy"]
    initial_prompt = policy.get("initialPrompt", "")
    critical_terms = sorted(set(re.findall(r"[A-Za-z][A-Za-z0-9./+-]*|\d+(?:\.\d+)?", run["chapter"]["text"])))
    passed = 0
    for take in run["takes"]:
        audio_path = resolve_inside(root, take["output"])
        audio, rate = load_wav(audio_path)
        audio_16k = resample_16k(audio, rate)
        prompted = mlx_whisper.transcribe(
            audio_16k,
            path_or_hf_repo=str(asr_path),
            language=policy.get("language", "zh"),
            task="transcribe",
            initial_prompt=initial_prompt,
            verbose=False,
        )
        no_prompt = mlx_whisper.transcribe(
            audio_16k,
            path_or_hf_repo=str(asr_path),
            language=policy.get("language", "zh"),
            task="transcribe",
            verbose=False,
        )
        prompted_text = normalize_text(prompted.get("text", ""))
        no_prompt_text = normalize_text(no_prompt.get("text", ""))
        prompted_similarity = SequenceMatcher(None, expected, prompted_text).ratio()
        no_prompt_similarity = SequenceMatcher(None, expected, no_prompt_text).ratio()
        term_results = {
            term: normalize_text(term) in prompted_text or normalize_text(term) in no_prompt_text
            for term in critical_terms
        }
        coverage = sum(term_results.values()) / len(term_results) if term_results else 1.0
        measured = audio_metrics(audio, rate)
        rms_range = policy["activeRmsDbfs"]
        machine_pass = (
            prompted_similarity >= policy["promptedSimilarityMin"]
            and no_prompt_similarity >= policy["noPromptSimilarityMin"]
            and coverage >= policy["criticalTermsCoverage"]
            and measured["clippingPercent"] <= policy["clippingPercentMax"]
            and rms_range["min"] <= measured["activeRmsDbfs"] <= rms_range["max"]
            and measured["peakDbfs"] <= policy["peakDbfsMax"]
        )
        take["machineQa"] = {
            "status": "pass" if machine_pass else "reject",
            "promptedText": prompted.get("text", "").strip(),
            "noPromptText": no_prompt.get("text", "").strip(),
            "promptedSimilarity": round(prompted_similarity, 4),
            "noPromptSimilarity": round(no_prompt_similarity, 4),
            "criticalTerms": term_results,
            "criticalTermsCoverage": round(coverage, 4),
            "inputWavSha256": take["sha256"],
            "measuredAudio": measured,
            "note": "Machine QA rejects defects; it does not approve speaker identity or naturalness.",
        }
        take["status"] = "machine_qa_passed_owner_review_pending" if machine_pass else "machine_qa_rejected"
        if machine_pass:
            passed += 1
    run["status"] = "machine_qa_passed_owner_selection_pending" if passed else "blocked_no_machine_qa_candidate"
    run["machineQaSummary"] = {"passed": passed, "total": len(run["takes"]), "ownerSelectionRequired": True}
    run["nextState"] = "owner_take_selected" if passed else "script_or_generation_revision_required"
    run_path.write_text(json.dumps(run, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(run["machineQaSummary"], ensure_ascii=False))


if __name__ == "__main__":
    main()
