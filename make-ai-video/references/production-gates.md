# 生产与发布门禁

## 两条状态链

首次克隆声音或发生漂移时，单独执行：

```text
consent_ready → calibration_ready → calibration_takes_generated
→ machine_qa_passed → owner_selected → profile_ready
```

每条视频执行：

```text
brief_ready → direction_selected → content_plan_reviewed
→ narration_reviewed → voice_run_selected → timing_ready
→ visual_previewed → rendered → human_reviewed → approved
```

不需要配音的项目把 `voice_run_selected` 标为 `not_applicable`。使用克隆声音时，`VoiceProfile` 必须为 `ready` 且 preflight 通过；本次 VoiceRun 必须由声音所有者选择。

## 阶段证据

| 阶段 | 最低证据 |
| --- | --- |
| `brief_ready` | 输入模式、用户意图、来源和权利边界 |
| `direction_selected` | 唯一推荐候选与理由 |
| `content_plan_reviewed` | 已审主问题、时长、画幅和来源锚点 |
| `narration_reviewed` | 已审完整口播与事实边界 |
| `voice_run_selected` | 本次声音模式；克隆时包含 Profile preflight、本人选择和 WAV 哈希 |
| `timing_ready` | 转写或人工对齐字幕 |
| `visual_previewed` | 交付尺寸下的代表帧审核 |
| `rendered` | 目标文件存在且媒体检查通过 |
| `human_reviewed` | 事实、口播、声音、画面、权利和 AI 标识分别审核 |
| `approved` | 明确的发布候选批准 |

阶段值使用 `pending`、`passed`、`blocked`、`failed`、`not_applicable`。后一道状态不能替前一道补证据。

## 声音与隐私

- 只使用本人或另有独立授权的声音。
- 默认本地和私有；第三方上传需要另行授权。
- 授权是有范围的证据，不是一个布尔捷径。
- 锁定 Provider、运行时、TTS/ASR 模型指纹、参考音频、逐字稿、参数和选定 take。
- 机器只能拒绝缺陷；声音所有者决定身份与自然度。
- `ownerSelection` 只批准本次运行，不批准整片和发布。

## 状态报告

- `local_package`：本地输入和计划存在；
- `review_candidate`：渲染存在，但人工审核未完成；
- `release_candidate`：所有门禁通过；
- 平台 `draft`、`previewed`、`scheduled`、`published`：逐平台记录。

不要把本地生成、平台草稿、预览、定时和上线合并成“完成”。
