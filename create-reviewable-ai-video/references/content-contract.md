# 内容对象合同

## 对象顺序

```text
VideoBrief → ContentDecision → VideoContentPlan → VideoUnit → WorkflowState
```

文章输入可以产生文章切片分析，但它是 `ContentDecision` 的路由实现，不是所有视频项目的必选对象。

## VideoBrief

记录输入模式、用户意图、来源、权利、证据成熟度、受众变化、限制和声音意图。`sourceFiles` 必须位于生产包内；仅有想法时可以使用用户笔记作为来源，但不得把未核验事实标为已证实。

## ContentDecision

包含 1–6 个候选，通常给出 2–6 个。每个候选包含：

- `primaryQuestion`、`coreJudgment` 与 `viewerAction`；
- `sourceAnchors` 与 `verificationNeeds`；
- `suggestedLane`、`formatProfile`；
- 独立性、证据、决策价值和视觉潜力评分。

必须且只能有一个 `recommended`。没有足够证据或无法形成单一问题时，保留为待补充，不要强行进入制作。

## VideoContentPlan

冻结观众认知路径。顶层记录选中候选、主问题、判断、动作、时长、画幅和开场合同。每个 segment 必须连续覆盖完整时长，并包含口播职责、来源锚点、情绪和一个视觉任务。

时长档位是内容预算，不是行业标准。先重写内容，再考虑语速。

## VideoUnit

作为声音、字幕和渲染器的稳定生产输入，记录：

- 已审主问题、判断、时长和画幅；
- 声音模式、授权、Profile/Run、选定资产与哈希；
- 连续 beat 与唯一视觉任务；
- 字幕来源；
- 审核状态，但不暗示发布批准。

克隆声音必须绑定 `consentPath`、`profilePath`、`runPath`、`selectedAsset` 和 `selectedAssetSha256`。校准 take 不能冒充本次正式配音。

## 合同检查

- 一个视频只回答一个主问题。
- 改变结论的事实必须有锚点或明确待核验状态。
- 候选、内容计划和制作单元保持同一个问题、判断和画幅。
- 时间段连续且不越过总时长。
- 一个 beat 最多三个支撑对象；流程图可使用四个。
- 口播、字幕和画面互补，不重复同一句话三遍。
