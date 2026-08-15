# 来源与证据边界

## 当前版本

- 文章：`文章转视频应该做成Skill还是Workflow.md`
- 开源 Skill：`create-reviewable-ai-video/`
- 独立发布候选：`open-source/create-reviewable-ai-video/`
- 本地验证日期：2026-08-15

## 一手来源

| 文章中的判断 | 来源 | 支持范围 |
| --- | --- | --- |
| Skill 可以封装可复用任务方法、资源与脚本 | [OpenAI Academy：Using skills](https://openai.com/academy/skills/) | 支持 Skill 的公开形态；“Skill 负责判断、Workflow 负责确定性执行”是本文项目设计，不是 OpenAI 的强制分类 |
| Qwen3-TTS Base 支持用参考音频进行声音克隆 | [Qwen3-TTS 官方仓库](https://github.com/QwenLM/Qwen3-TTS) | 支持 Base 模型的声音克隆能力与公开模型范围 |
| MLX 接口接受目标文本、参考 WAV 和参考逐字稿 | [`mlx-audio` Qwen3-TTS README](https://github.com/Blaizzy/mlx-audio/blob/main/mlx_audio/tts/models/qwen3_tts/README.md) | 支持开源 Provider 的调用接口 |
| 当前 MLX Base 快照文件与 Apache-2.0 标识 | [MLX Base 模型卡](https://huggingface.co/mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16) | 支持示例 Provider 的模型路径、文件指纹与许可证提示；模型权重不随本仓库分发 |
| MLX Whisper 可以从本地模型目录转写 | [MLX Whisper README](https://github.com/ml-explore/mlx-examples/tree/main/whisper) | 支持本地 ASR 路径与 `path_or_hf_repo` 用法 |

## 项目证据

- `create-reviewable-ai-video/assets/example-package/`：从想法开始的五对象公开示例。
- `create-reviewable-ai-video/scripts/validate-package.mjs`：输入路由、状态顺序、时间轴、字幕来源、声音授权、私有路径和哈希绑定校验。
- `create-reviewable-ai-video/scripts/voice-profile.mjs`：首次声音建档时，锁定授权、Provider、TTS/ASR 模型、参考音频和运行时版本。
- `create-reviewable-ai-video/scripts/voice-run.mjs`：每条视频的章级多候选、机检状态与声音所有者选择。
- `test/release.test.mjs`：公开 Skill 生命周期与失败门禁测试。

## 教学策略，不是行业统计

- `quick / standard / deep / course-master` 的时长范围是本项目的内容预算。
- 每章三个候选 take 是本项目的人工选优策略，不表示三个是所有声音任务的最佳数量。
- 每个 beat 一个主要视觉任务，是本项目用于控制认知密度的制作规则。
- “两个时钟”是本项目为降低返工与权限混淆建立的生产模型，不声称是唯一正确的行业流程。

## 不作出的结论

- 自动校验通过不等于事实、身份、自然度或发布获得人工批准。
- `authorized=true` 是绑定证据的操作者声明，不是系统完成了法律身份验证。
- 本地模型、参考录音或生成 WAV 存在，不等于声音可以公开使用。
- 声音档案达到 `ready`，不等于任意文本可以自动生成和发布。
- 本地包、渲染文件、平台草稿、完整预览、定时发布和正式上线是不同状态。
- 截至 2026-08-15，公开仓库 `wanghui2323/create-reviewable-ai-video`、默认分支 `main`、README 与 MIT License 已在线核验；没有观察到公众号导入、预览或正式发布。
