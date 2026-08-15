#!/usr/bin/env python3
"""Generate local-only Qwen3-TTS voice-clone takes from a locked VoiceRun."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import wave
from importlib.metadata import version as package_version
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_inside(root: Path, value: str, label: str) -> Path:
    path = (root / value).resolve()
    if Path(value).is_absolute() or (path != root and root not in path.parents):
        raise RuntimeError(f"{label} must stay inside the package root")
    return path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def require_private_path(value: str, label: str) -> None:
    parts = {part.lower() for part in Path(value).parts}
    require("private" in parts, f"{label} must be stored under the package private directory")
    require(not parts.intersection({"public", "assets", "static", "dist", "build"}), f"{label} is inside a public or deploy directory")


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_wav(path: Path, audio, sample_rate: int) -> None:
    import numpy as np

    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.round(np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())


def prepare_audio(audio, sample_rate: int, post: dict):
    import numpy as np

    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    require(audio.size > 0, "The provider returned empty audio")
    active = np.flatnonzero(np.abs(audio) >= 0.003)
    if active.size:
        pad = round(sample_rate * 0.055)
        audio = audio[max(0, int(active[0]) - pad) : min(len(audio), int(active[-1]) + pad + 1)]
    fade_count = min(round(sample_rate * post.get("edgeFadeMs", 8) / 1000), len(audio) // 2)
    if fade_count > 1:
        ramp = np.sin(np.linspace(0, math.pi / 2, fade_count, dtype=np.float32)) ** 2
        audio[:fade_count] *= ramp
        audio[-fade_count:] *= ramp[::-1]
    frame = max(1, round(sample_rate * 0.02))
    usable = len(audio) - len(audio) % frame
    blocks = audio[:usable].reshape(-1, frame) if usable else audio.reshape(1, -1)
    block_rms = np.sqrt(np.mean(blocks * blocks, axis=1, dtype=np.float64))
    selected = blocks[block_rms >= 10 ** (-42 / 20)]
    active_audio = selected.reshape(-1) if selected.size else audio
    rms = max(float(np.sqrt(np.mean(active_audio * active_audio, dtype=np.float64))), 1e-12)
    target = 10 ** (post.get("targetActiveRmsDbfs", -22) / 20)
    gain = target / rms
    peak = max(float(np.max(np.abs(audio))), 1e-12)
    ceiling = 10 ** (post.get("peakCeilingDbfs", -1) / 20)
    gain = min(gain, ceiling / peak)
    audio = audio * gain
    leading = np.zeros(round(sample_rate * post.get("leadingSilenceMs", 160) / 1000), dtype=np.float32)
    trailing = np.zeros(round(sample_rate * post.get("trailingSilenceMs", 260) / 1000), dtype=np.float32)
    return np.concatenate([leading, audio, trailing]), 20 * math.log10(max(gain, 1e-12))


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
    profile_path = resolve_inside(root, args.profile, "profile path")
    run_path = resolve_inside(root, args.run, "run path")
    profile = load_json(profile_path)
    run = load_json(run_path)
    require(run.get("status") in {"profile_locked", "generation_in_progress"}, "VoiceRun status does not allow generation")
    require(run.get("localOnly") is True and run.get("remoteUploadAuthorized") is False, "VoiceRun must remain local-only")
    require(run["profile"]["path"] == args.profile, "VoiceRun profile path differs from the requested profile")
    require(run["profile"]["sha256"] == sha256(profile_path), "VoiceRun profile hash drifted")
    require(profile.get("localOnly") is True and profile.get("remoteUploadAuthorized") is False, "VoiceProfile must remain local-only")
    require(profile["provider"]["kind"] == "qwen3-tts-mlx", "VoiceProfile is not configured for qwen3-tts-mlx")
    provider_path = resolve_inside(root, profile["provider"]["path"], "provider config path")
    consent_path = resolve_inside(root, profile["consent"]["path"], "consent path")
    consent_evidence_path = resolve_inside(root, profile["consent"]["evidencePath"], "consent evidence path")
    model_path = resolve_inside(root, profile["provider"]["modelPath"], "model path")
    reference_path = resolve_inside(root, profile["reference"]["audio"]["path"], "reference audio")
    transcript_path = resolve_inside(root, profile["reference"]["transcript"]["path"], "reference transcript")
    script_path = resolve_inside(root, run["chapter"]["scriptPath"], "script path")
    for value, label in [
        (profile["consent"]["path"], "consent path"),
        (profile["consent"]["evidencePath"], "consent evidence path"),
        (profile["reference"]["audio"]["path"], "reference audio"),
        (profile["reference"]["transcript"]["path"], "reference transcript"),
        (run["chapter"]["scriptPath"], "script path"),
    ]:
        require_private_path(value, label)
    require(provider_path.exists() and sha256(provider_path) == profile["provider"]["sha256"], "Provider config drifted")
    provider = load_json(provider_path)
    require(
        provider.get("confirmed") is True
        and provider.get("localOnly") is True
        and provider.get("allowNetwork") is False
        and provider.get("remoteUploadAuthorized") is False,
        "Provider is not confirmed for local offline use",
    )
    require(consent_path.exists() and sha256(consent_path) == profile["consent"]["sha256"], "Consent manifest drifted")
    require(consent_evidence_path.exists() and sha256(consent_evidence_path) == profile["consent"]["evidenceSha256"], "Consent evidence drifted")
    require(model_path.exists(), "Local model snapshot is missing")
    for locked in profile["provider"].get("fingerprints", []):
        fingerprint_path = resolve_inside(root, locked["path"], "model fingerprint path")
        require(fingerprint_path.exists() and sha256(fingerprint_path) == locked["sha256"], f"Model fingerprint drifted: {locked['path']}")
    require(reference_path.exists() and sha256(reference_path) == profile["reference"]["audio"]["sha256"], "Reference audio drifted")
    require(transcript_path.exists() and sha256(transcript_path) == profile["reference"]["transcript"]["sha256"], "Reference transcript drifted")
    require(script_path.exists() and sha256(script_path) == run["chapter"]["scriptSha256"], "Narration script drifted")
    require(run.get("provider") == profile.get("provider"), "VoiceRun provider lock drifted")
    require(run.get("reference") == profile.get("reference"), "VoiceRun reference lock drifted")
    require(run.get("postProcess") == profile.get("postProcess"), "VoiceRun post-process lock drifted")
    require(
        all(run.get("generation", {}).get(key) == value for key, value in profile.get("generation", {}).items()),
        "VoiceRun generation settings drifted",
    )
    script_hash = run["chapter"]["scriptSha256"]
    expected_seeds = []
    for take_number in range(1, int(profile["generation"]["takeCount"]) + 1):
        digest = hashlib.sha256(f"{profile['version']}\0{script_hash}\0{run['chapter']['id']}\0{take_number}".encode()).digest()
        expected_seeds.append(1_000_000_000 + int.from_bytes(digest[:4], "big") % 1_000_000_000)
    require(run["generation"].get("seeds") == expected_seeds, "VoiceRun deterministic seeds drifted")
    require(
        [(take.get("take"), take.get("seed")) for take in run.get("takes", [])]
        == list(enumerate(expected_seeds, start=1)),
        "VoiceRun take records drifted",
    )
    output_dir = run_path.parent / "takes"
    plan = {
        "status": "ready",
        "provider": profile["provider"]["kind"],
        "model": profile["provider"]["modelId"],
        "takeCount": len(run["takes"]),
        "outputDir": str(output_dir.relative_to(root)),
        "networkAllowed": False,
        "runtime": profile["provider"]["runtime"],
    }
    if args.dry_run:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
        return

    runtime = profile["provider"]["runtime"]
    require(".".join(platform.python_version_tuple()[:2]) == runtime["python"], "Python runtime version differs from VoiceProfile")
    for field, distribution in [("mlxAudio", "mlx-audio"), ("mlxWhisper", "mlx-whisper"), ("numpy", "numpy")]:
        require(package_version(distribution) == runtime[field], f"{distribution} runtime version differs from VoiceProfile")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    import mlx.core as mx
    import numpy as np
    from mlx_audio.tts.utils import load_model

    model = load_model(str(model_path))
    reference_text = transcript_path.read_text(encoding="utf-8").strip()
    generation = profile["generation"]
    generated_takes = []
    for take in run["takes"]:
        mx.random.seed(int(take["seed"]))
        kwargs = {
            "text": run["chapter"]["text"],
            "ref_audio": str(reference_path),
            "ref_text": reference_text,
            "temperature": generation.get("temperature", 0.85),
            "top_p": generation.get("topP", 0.95),
            "top_k": generation.get("topK", 50),
            "repetition_penalty": generation.get("repetitionPenalty", 1.1),
            "max_tokens": generation.get("maxTokens", 512),
            "verbose": False,
        }
        results = list(model.generate(**kwargs))
        require(bool(results), f"No audio generated for take {take['take']}")
        result = results[0]
        sample_rate = int(getattr(result, "sample_rate", model.sample_rate))
        audio, gain_db = prepare_audio(np.asarray(result.audio, dtype=np.float32), sample_rate, profile["postProcess"])
        output = output_dir / f"take-{int(take['take']):02d}.wav"
        write_wav(output, audio, sample_rate)
        generated_takes.append({
            **take,
            "status": "generated_requires_machine_qa",
            "output": str(output.relative_to(root)),
            "sha256": sha256(output),
            "sampleRateHz": sample_rate,
            "durationSeconds": round(len(audio) / sample_rate, 3),
            "gainDb": round(gain_db, 3),
            "timeStretchApplied": False,
        })
        run["takes"] = generated_takes + run["takes"][len(generated_takes):]
        run["status"] = "generation_in_progress"
        write_json(run_path, run)

    run["takes"] = generated_takes
    run["status"] = "takes_generated_requires_machine_qa"
    run["generationEvidence"] = {
        "provider": profile["provider"]["kind"],
        "modelId": profile["provider"]["modelId"],
        "modelFingerprints": profile["provider"]["fingerprints"],
        "referenceAudioSha256": profile["reference"]["audio"]["sha256"],
        "referenceTranscriptSha256": profile["reference"]["transcript"]["sha256"],
        "runtime": runtime,
        "localOnly": True,
        "timeStretchApplied": False,
    }
    run["nextState"] = "machine_qa_passed"
    write_json(run_path, run)
    print(json.dumps({"status": run["status"], "takes": len(generated_takes)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
