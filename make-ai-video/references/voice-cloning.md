# 本地声音克隆

## 核心边界

只使用本人或另有书面授权的声音。参考录音、逐字稿、候选、Profile 和 Run 全部放入本地 `private/`，默认不提交、不部署、不上传。

`authorized=true` 是绑定证据的操作者声明，不是系统完成了身份核验。机器 QA 可以淘汰坏音频，只有声音所有者可以判断身份、自然度和用途。

## 两类声音任务

### 首次建档

```text
VoiceConsent
→ VoiceProfile calibration
→ 三个校准 take
→ 机器 QA
→ ownerSelection
→ production-pilot VoiceProfile
```

首次明确使用克隆声音时，先完成这条链，再开始完整视频生产。Profile 可跨项目复用，但参考、模型、运行时、授权或哈希漂移后必须重新校准。

### 本次配音

口播人工确认后执行：

```text
Profile preflight
→ narration VoiceRun
→ 三个完整章节 take
→ 机器 QA
→ ownerSelection
→ 转写/人工对齐
```

不要在口播未冻结时生成正式配音，不要跨句拼接或自动选优。

## 本地 Qwen3-TTS Provider

参考 Provider 使用 `mlx-audio` 的 Qwen3-TTS Base 声音克隆接口：目标文本、本地参考 WAV 和准确逐字稿。模型和运行时不随仓库分发。

一手来源：

- <https://github.com/QwenLM/Qwen3-TTS>
- <https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/qwen3_tts/README.md>
- <https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16>
- <https://github.com/ml-explore/mlx-examples/tree/main/whisper>

在 Skill 目录创建隔离环境：

```bash
python3.12 -m venv .venv-voice
.venv-voice/bin/pip install -r requirements-voice-mlx.txt
```

把模型放到生产包已忽略的 `models/`。Provider 强制离线运行，不在推理时下载模型。可先干跑合同：

```bash
python scripts/providers/qwen3-tts-mlx.py \
  --root <生产包> \
  --profile private/voice-profile-calibration.json \
  --run private/voice-runs/calibration/run.json \
  --dry-run
```

## 首次校准命令

复制禁用模板，填写真实授权，并放入参考音频和准确逐字稿：

```bash
mkdir -p <生产包>/private
cp assets/voice-clone-starter/voice-consent.json <生产包>/private/voice-consent.json
cp assets/voice-clone-starter/voice-provider.json <生产包>/voice-provider.json
```

初始化 Profile：

```bash
node scripts/voice-profile.mjs init \
  --root <生产包> --id my-voice --version 0.1.0 \
  --consent private/voice-consent.json --provider voice-provider.json \
  --reference private/reference.wav --transcript private/reference.txt \
  --output private/voice-profile-calibration.json
```

创建三个校准候选并执行本地生成、QA：

```bash
node scripts/voice-run.mjs init \
  --root <生产包> --profile private/voice-profile-calibration.json \
  --script private/calibration.txt --chapter calibration-01 \
  --purpose calibration --output private/voice-runs/calibration/run.json

python scripts/providers/qwen3-tts-mlx.py \
  --root <生产包> --profile private/voice-profile-calibration.json \
  --run private/voice-runs/calibration/run.json

python scripts/qa-voice-run.py \
  --root <生产包> --profile private/voice-profile-calibration.json \
  --run private/voice-runs/calibration/run.json
```

只向声音所有者展示机器通过的候选。得到明确选择后记录 take，并生成追加式新 Profile：

```bash
node scripts/voice-run.mjs select \
  --root <生产包> --run private/voice-runs/calibration/run.json \
  --take 2 --feedback "声音所有者确认本次校准候选"

node scripts/voice-profile.mjs accept \
  --root <生产包> --profile private/voice-profile-calibration.json \
  --run private/voice-runs/calibration/run.json --version 1.0.0 \
  --feedback "接受为本地 production-pilot 基线" \
  --output private/voice-profile-1.0.0.json
```

## 本次视频绑定

每次口播确认后先 preflight，再用 `--purpose narration` 创建 VoiceRun。选定后把 consent、Profile、Run、WAV 和 SHA-256 绑定到 `video-unit.json`。

保持 `timingSource=estimated`，直到选定 WAV 完成转写或人工对齐。渲染器临时复制私有音频时，必须在 `finally` 中清理并执行公开目录隐私残留检查。

## 仓库不包含

- 个人参考音频、逐字稿和授权证据；
- 生成或接受的克隆 WAV；
- 私有 Profile 与 Run；
- 模型权重和缓存；
- 平台凭据；
- 自动整片批准或自动发布。
