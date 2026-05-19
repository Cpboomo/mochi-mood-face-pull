# 视觉到程序的数据化开发流程

版本：v0.1  
日期：2026-05-10  
目标：确保最终成品从视觉、动画、手感上可控、可复现、可验收。

## 1. 核心原则

视觉专家的判断不能停留在口头描述，也不能只通过截图标注传给程序。视觉专家必须通过调参工具直接调整运行时参数，导出结构化数据，程序再加载这些数据还原同样效果。

换句话说：

```text
视觉专家的审美判断
  -> 调参工具中的具体操作
  -> JSON / 曲线 / 关键帧 / 规则数据
  -> 程序 runtime 加载
  -> 自动截图和人工视觉验收
```

程序不应该把“舌头拉多长更爽”“回弹多快更舒服”“表情什么时候切换”写死在代码里。这些都应该成为视觉和动画专家能调的数据。

## 2. 角色分工

### 2.1 视觉专家

负责：

- 判断画面层级是否正确。
- 调整角色比例、脸部位置、舌头粗细、颜色、高光、遮挡。
- 调整 UI 是否过重、是否抢核心玩法。
- 在工具中调整视觉参数并导出 preset。
- 对关键帧截图做视觉验收。

视觉专家交付物：

```text
visual_preset.json
layer_order.json
asset_manifest.json
visual_review_notes.md
accepted_screenshots/
```

### 2.2 动画专家

负责：

- 调整拖拽曲线、回弹曲线、过冲、余震。
- 调整状态机切换阈值。
- 调整脸部联动：眼睛、眉毛、嘴角、脸颊、头部偏移。
- 调整粒子、震动、音效触发阈值。
- 在工具中导出曲线和反馈规则。

动画专家交付物：

```text
motion_preset.json
curves/tongue_length_curve.json
curves/tongue_width_curve.json
curves/tongue_release_curve.json
rules/tongue_feedback_rules.json
motion_review_notes.md
```

### 2.3 程序

负责：

- 开发调参工具。
- 保证工具和游戏 runtime 使用同一套计算逻辑。
- 定义 schema，校验数据。
- 加载视觉/动画专家导出的配置。
- 做自动截图、轨迹回放、回归测试。
- 避免硬编码视觉和手感参数。

程序交付物：

```text
runtime/
tools/
schemas/
config/
tests/replay/
reports/visual-regression/
```

## 3. 单一数据源

所有影响视觉和手感的参数必须来自配置文件。

禁止散落硬编码：

```text
舌头长度
舌头宽度
舌头颜色变化
软上限 / 硬上限
回弹速度
阻尼
过冲
脸部偏移
眼睛看向指针的幅度
嘴角拉扯幅度
表情切换阈值
文字反馈冷却
粒子数量
音效音量和音高
```

推荐目录：

```text
config/
  parts/
    tongue_main.part.json
  curves/
    tongue_length_curve.json
    tongue_width_curve.json
    tongue_release_curve.json
  presets/
    soft.json
    snappy.json
    extreme.json
    mobile_friendly.json
  rules/
    tongue_feedback_rules.json
  visual/
    layer_order.json
    visual_preset.json
schemas/
  part.schema.json
  curve.schema.json
  preset.schema.json
  feedback-rule.schema.json
```

## 4. 调参工具必须具备的能力

第一阶段工具不追求复杂，但必须让视觉和动画专家能直接产出数据。

### 4.1 可视化编辑

工具需要显示：

- 嘴部锚点 `mouthAnchor`。
- 舌尖抓取点 `tongueTip`。
- 舌头 hit area。
- Bezier 控制点。
- softMax / hardMax 边界。
- 当前状态机状态。
- 当前 `pull`、`overPull`、速度、最大拉伸值。
- 当前触发的反馈规则。

### 4.2 参数面板

必须可调：

- `restLength`
- `softMaxLength`
- `hardMaxLength`
- `widthRest`
- `widthMin`
- `maxBend`
- `dragFollowLag`
- `releaseSpring`
- `releaseDamping`
- `releaseMaxSpeed`
- `settleDuration`
- `faceOffsetAmount`
- `eyeLookAmount`
- `mouthDeformAmount`
- `shakeAmount`
- `particleAmount`
- `releaseSfxVolume`

### 4.3 曲线编辑

至少支持关键点编辑：

```text
dragDistance -> tongueLength
dragDistance -> tongueWidth
dragDistance -> faceExpression
releaseTime -> tonguePosition
pull -> sfxPitch
```

曲线工具必须能实时 scrub 预览：

```text
0%
25%
50%
75%
100%
release 0.12s
release 0.30s
```

### 4.4 预设保存

工具需要支持保存并切换 preset：

```text
Soft
Snappy
Extreme
Mobile Friendly
```

每个 preset 是完整 JSON，不是工具本地状态。

### 4.5 导出与校验

导出时必须做：

- schema 校验。
- 缺字段提示。
- 数值范围提示。
- 引用资源是否存在。
- 曲线输入输出范围检查。
- 生成变更 diff，方便程序知道视觉专家调了什么。

## 5. 开发循环

每个视觉/手感迭代必须按这个循环走。

### Step 1：程序提供可调 runtime

程序先实现最小可运行版本：

- 大脸。
- 舌头。
- 可拖拽。
- 可回弹。
- 调参工具。
- 数据导入/导出。
- 固定轨迹回放。

此时美术可以是占位，但参数必须已经数据化。

### Step 2：视觉专家用工具调视觉层级

视觉专家打开工具，调整：

- 角色在画面中的大小和位置。
- 舌头默认露出长度。
- 舌头颜色、粗细、高光。
- 嘴唇前后遮挡。
- 脸部与舌头的层级。
- 默认 UI 是否隐藏或缩到角落。

导出：

```text
visual_preset.json
layer_order.json
visual_review_notes.md
```

### Step 3：动画专家用工具调手感

动画专家调整：

- 抓住瞬间的舌尖放大。
- 拉伸长度曲线。
- 宽度压缩曲线。
- 过拉阈值。
- 回弹弹簧和阻尼。
- 余震时长。
- 表情切换阈值。
- 文字/粒子/音效触发。

导出：

```text
motion_preset.json
curves/*.json
rules/*.json
```

### Step 4：程序加载数据并生成回归报告

程序不根据主观描述改参数，而是加载专家导出的数据。

程序运行固定轨迹：

```text
idle
grab
drag 25%
drag 50%
drag 90%
overstretch
release 0.12s
release 0.30s
settle
```

自动输出：

```text
reports/visual-regression/run-001/
  00_idle.png
  01_grab.png
  02_drag_25.png
  03_drag_50.png
  04_drag_90.png
  05_overstretch.png
  06_release_012.png
  07_release_030.png
  metrics.json
```

### Step 5：视觉专家验收截图

视觉专家只对截图和实际浏览器表现给结论：

```text
accept
accept_with_notes
reject
```

如果 reject，必须回到工具调数据，不直接让程序凭感觉改。

### Step 6：程序修工具或 runtime 偏差

程序只处理两类问题：

- 工具调出来的数据无法表达视觉专家想要的效果。
- runtime 没有准确还原工具效果。

程序不直接替视觉专家调审美参数，除非是临时验证。

## 6. 验收门槛

每次合入前必须过三道门。

### 6.1 数据门

- 所有配置通过 schema。
- 没有新增硬编码手感参数。
- preset 可导入导出。
- 配置变更有 diff。

### 6.2 视觉门

视觉专家确认：

- 默认画面第一眼就是大脸和舌头。
- UI 没抢主视觉。
- 舌头从嘴里伸出的层级正确。
- 拉长时不穿帮、不穿嘴、不断开。
- 松手回弹有明显“啪”的爽点。
- 关键截图没有严重遮挡、错位、比例问题。

### 6.3 手感门

动画专家确认：

- 点击反馈小于 50ms。
- 主回弹小于 150ms。
- settle 小于 350ms。
- 拉伸不是硬直线，有弯曲和弹性延迟。
- 表情变化和拉伸强度匹配。
- 文字/音效/粒子不过度刷屏。

## 7. 工具与程序的沟通协议

视觉专家通过工具输出的数据包必须包含：

```json
{
  "version": 1,
  "authorRole": "visual",
  "targetBuild": "tongue-prototype-v1",
  "changedAt": "2026-05-10T00:00:00.000Z",
  "files": [
    "config/visual/visual_preset.json",
    "config/visual/layer_order.json",
    "config/curves/tongue_width_curve.json"
  ],
  "notes": [
    "舌头拉到 75% 时太细，已增加 widthMin。",
    "嘴唇前景层需要遮住舌根。"
  ],
  "acceptanceFocus": [
    "drag_75",
    "release_012"
  ]
}
```

程序接收后只做：

- 校验数据。
- 加载数据。
- 跑固定回放。
- 生成截图和 metrics。
- 若还原失败，修 runtime 或工具。

## 8. 最终成品视觉无问题的保证方式

最终视觉质量不是靠最后一轮人工“看一眼”，而是靠全过程约束：

1. 视觉参数全部数据化。
2. 视觉专家直接用工具调数据。
3. 工具和 runtime 共享计算逻辑。
4. 每轮都有固定轨迹截图。
5. 每轮都有视觉验收结论。
6. 程序只修表达能力和还原一致性。
7. 默认体验始终以大脸、舌头、拉扯爽感为第一层级。

只要某个视觉问题无法通过工具表达，就说明工具还不够，需要先补工具，而不是让程序在代码里写死一次性修补。

## 9. 第一阶段落地任务

下一轮实现应按这个顺序：

1. 删除默认挑战/训练 UI，仅保留极简角落按钮。
2. 新增 `config/` 和 `schemas/`。
3. 新增舌头部位配置和曲线配置。
4. 重写 runtime 为 `PartInteractionSystem + TongueRuntime`。
5. 新增 `?debug=1` 调参面板。
6. 调参面板支持导出 preset。
7. 新增固定轨迹回放脚本和截图输出。
8. 由视觉专家根据截图和浏览器表现验收。

