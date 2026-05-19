# 拽舌头解压小游戏开发需求文档

版本：v0.1  
日期：2026-05-10  
目标阶段：重做第一版核心手感原型

配套流程：视觉专家通过工具调参并导出数据，程序加载数据还原效果；详细流程见 [visual-to-program-development-workflow.md](visual-to-program-development-workflow.md)。

## 1. 项目定位

本项目不是“表情训练游戏”，也不是“挑战计分游戏”。它的核心定位是一个面向解压、恶作剧式互动和轻度装扮扩展的拉扯玩具小游戏。

第一阶段只做一个角色的一张脸和一个可拉扯部位：舌头。玩家按住舌头，把它往任意方向拽长，看到舌头变细、变弯、变紧，角色脸部被牵动，松手后舌头快速弹回嘴里，并通过表情、文字、音效、粒子、轻微震动得到爽感。

后续可以扩展：

- 拽脸颊、拽嘴角、拽头发、拽耳朵等部位。
- 角色语言反馈和情绪反馈。
- 脸部装饰系统：眼镜、贴纸、胡子、头饰、牙套、耳环等。
- 化妆系统：腮红、眼影、口红、亮片，并支持拉扯时涂抹或晕染。
- 捏脸系统：脸型、眼距、嘴型、舌头颜色、舌头长度、舌头弹性、头发样式。

第一阶段的成功标准不是“有多少玩法”，而是“玩家愿意无目的地反复拉舌头”。

## 2. 当前原型问题

当前版本程序结构可以跑，但产品方向和视觉表现不符合目标：

- 主界面偏向训练和挑战，目标、分数、倒计时、表情墙、素材面板抢走了注意力。
- 脸和舌头没有成为绝对主视觉，解压玩具感弱。
- 舌头更像随鼠标变长的线段，缺少被抓住、被迫拉伸、快撑不住、啪地弹回的过程。
- UI 层级过重，像工具面板或任务游戏，不像解压玩具。
- 动画缺少明确状态机、弹簧、过冲、挤压、拉伸、余震。
- 表情反馈没有和拉扯强度建立强绑定。
- 素材层级还不足以支持后续拽脸、拽头发、化妆、捏脸。

重做时应删除或降级：

- 默认主界面的挑战 HUD、复杂进度条、表情训练目标。
- 训练式分数、combo、倒计时。
- 大面积侧栏和多面板布局。
- 需要玩家读规则才知道怎么玩的说明文本。

这些内容可以保留为调试工具或二级挑战模式，但不能成为默认体验。

## 3. 第一阶段体验目标

第一版只验证“拽舌头爽不爽”。

玩家流程：

1. 进入页面后看到一张大脸，占据屏幕主视觉。
2. 舌头自然露出一点点，有轻微待机动效。
3. 鼠标或手指点到舌头，舌尖立即放大，角色眼睛看向指针。
4. 拖动时舌头跟随方向拉长，越拉越细、越紧、越弯，脸和嘴被牵动。
5. 接近极限时进入过度拉伸区，角色表情夸张，舌头微抖，出现短文字反馈。
6. 松手后舌头在 150ms 内完成主要收回，随后有一次小过冲和 150-350ms 余震。
7. 回弹后角色眨眼、懵一下或吐槽一句。

核心手感句：

> 舌头不是“跟着鼠标变长”，而是“被玩家抓住、被迫拉伸、快撑不住、啪地弹回去”。

## 4. 视觉方向

### 4.1 风格

建议使用“软糖感、玩具感、轻微怪可爱”的方向。

角色像一个可揉捏的软弹玩具脸，不要像训练工具、任务游戏、竞技游戏或后台面板。

舌头材质：

- 圆润、柔软、有高光。
- 拉长时变细，颜色可略微变深。
- 回弹时可以变粗，产生 squash/stretch。
- 极限拉伸时有轻微抖动和紧绷感。

脸部材质：

- 软弹、可牵动。
- 嘴角、脸颊、眼睛、眉毛会受舌头拉扯影响。
- 角色不能只是静态头像。

### 4.2 屏幕构图

默认游戏画面优先级：

1. 大脸和舌头。
2. 拉扯形变和表情反馈。
3. 极少量角落 UI。

构图要求：

- 脸占屏幕视觉面积约 60%-75%。
- 舌头从嘴里自然伸出，点击区域明显。
- 屏幕中下部保持干净，因为玩家主要在这里拖拽。
- 文字反馈出现在头部上方或侧上方，不挡舌头。
- 默认不显示大侧栏、大目标卡、大挑战面板。

常驻 UI 最多保留：

- 装饰入口。
- 设置按钮。
- 拍照/重置一类小图标。
- 可选金币或收藏数。

挑战、成就、分数、素材状态都应隐藏在调试或二级页面。

## 5. 运行时状态机

舌头拉扯状态机：

```text
Idle
  ↓ pointerDown 命中舌头
Grabbed
  ↓ dragDistance > tinyThreshold
Stretching
  ↓ dragDistance 接近上限
Overstretch
  ↓ pointerUp / pointerCancel
ReleaseSnap
  ↓ 回弹接近嘴部锚点
Settle
  ↓ 余震结束
Idle
```

状态说明：

- `Idle`：舌头自然露出一点点，脸部待机呼吸，舌尖可轻微摆动。
- `Grabbed`：点击命中瞬间，舌尖放大 1.08-1.15，眼睛立刻看向指针，播放抓取音。
- `Stretching`：长度、宽度、弯曲、口型、眼神、脸部偏移都随拉扯强度变化。
- `Overstretch`：舌头颜色加深、震动增强、角色进入慌张或崩溃表情。
- `ReleaseSnap`：松手后高速收回，允许越过嘴部锚点 6-12px。
- `Settle`：150-350ms 残余抖动，角色眨眼或吐槽，然后回到待机。

## 6. 关键手感参数

第一版建议参数：

```ts
tongue = {
  restLength: 42,
  minLength: 28,
  softMaxLength: 180,
  hardMaxLength: 260,

  grabRadius: 36,
  tongueTipHitRadius: 44,
  mouthAnchorRadius: 18,

  stretchResponse: 0.82,
  dragFollowLag: 0.08,
  maxBend: 38,

  widthRest: 34,
  widthMin: 13,
  tipScaleOnGrab: 1.12,

  releaseSpring: 720,
  releaseDamping: 38,
  releaseMaxSpeed: 2400,

  settleDuration: 0.28,
  microShakeAmount: 2.5,
  overstretchShakeAmount: 7
}
```

拉扯强度：

```text
pull = clamp(distance / softMaxLength, 0, 1)
overPull = clamp((distance - softMaxLength) / (hardMaxLength - softMaxLength), 0, 1)
```

第一版手感指标：

- 点击反馈小于 50ms。
- 主要回弹小于 150ms。
- 完整 settle 小于 350ms。
- 最大拉伸约为自然长度 4-6 倍。
- 至少 3 档表情变化。
- 至少 3 层反馈：表情、文字、音效或粒子。

## 7. 动画和物理模型

第一阶段不需要真实软体物理，用“嘴部锚点 + 控制点 + 舌尖”的 3-4 点模型。

```text
mouthAnchor ---- controlA ---- controlB ---- tongueTip
```

规则：

- `mouthAnchor` 固定在嘴里。
- `tongueTip` 追随拖拽目标，但受最大距离限制。
- `controlA/controlB` 根据拖拽方向和垂直偏移生成弯曲。
- 舌头使用可变宽 Bezier 或骨骼/网格渲染。

简化公式：

```text
dragVector = pointer - mouthAnchor
dir = normalize(dragVector)
normal = perpendicular(dir)

targetTip = mouthAnchor + dir * clampedLength

bendAmount = clamp(pointerSideOffset * 0.35, -maxBend, maxBend)
controlA = mouthAnchor + dir * length * 0.33 + normal * bendAmount * 0.4
controlB = mouthAnchor + dir * length * 0.72 + normal * bendAmount
```

拖拽长度不要 1:1 硬跟随，使用软上限：

```text
visualLength = restLength + softMaxLength * easeOutCubic(pull)
overLength = extra * easeOutSine(overPull)
finalLength = visualLength + overLength
```

宽度压缩：

```text
width = lerp(widthRest, widthMin, easeOutQuad(pull))
```

回弹使用弹簧：

```text
force = -spring * (tipPosition - restPosition) - damping * velocity
velocity += force * dt
tipPosition += velocity * dt
```

防爆规则：

```text
dt = min(dt, 1 / 30)
velocity = clampMagnitude(velocity, releaseMaxSpeed)
```

松手时间线：

```text
0ms      舌头开始高速收回
60ms     舌体明显变粗，形成“啪”的收缩感
110ms    舌尖越过嘴部锚点 6-12px
180ms    反弹回来
260ms    残余抖动结束
```

## 8. 部位命中和扩展规则

所有可拉扯部位使用统一 `DraggablePart` 配置：

```ts
DraggablePart = {
  id: "tongue",
  hitShape: Circle | Capsule | Polygon,
  grabPoint: "nearest" | "tip" | "center",
  anchorPoint: Vec2,
  restPose: Pose,
  maxStretch: number,
  deformationProfile: "elastic" | "skin" | "hair" | "bone-lite",
  priority: number
}
```

舌头命中规则：

- 优先命中舌尖圆。
- 其次命中舌身胶囊区域。
- 手指触屏命中半径为鼠标的 1.4-1.8 倍。
- 点击落空但距离舌头小于 16px 时，可以磁吸到舌尖。
- 如果点中舌身，将抓点向舌尖滑 40%，避免捏中间导致不好看。
- 拖拽过程中不切换部位，直到松手。
- 舌头交互优先级高于嘴唇、脸颊。

未来扩展：

- 脸颊：皮肤弹性，锚点在脸部中心，局部拉伸范围较短。
- 嘴角：锚点在嘴部附近，适合拉出夸张表情。
- 头发：多段骨骼，允许滞后和甩动。
- 装饰：随附近骨骼轻微晃动，不一定可拉。
- 化妆：绑定脸部局部区域，拉扯时可出现涂抹/拉伸/晕染。

## 9. 表情、语言、声音反馈

### 9.1 表情反馈

表情由 `pull` 和 `overPull` 驱动，使用阈值段落切换，不做每帧随机。

```text
pull 0.00-0.15：疑惑，眼睛看向手指
pull 0.15-0.40：惊讶，眉毛抬起，嘴角被拉开
pull 0.40-0.70：紧张，眼睛变大，脸部向拖拽方向偏
pull 0.70-0.95：慌张，瞳孔缩小，额头汗滴
overPull > 0：夸张崩溃表情，脸轻微抖动
release：眼睛眨一下，嘴巴啪地闭合
settle：恢复，但保留 0.3s 委屈/懵表情
```

脸部联动：

- 头部向拖拽方向偏移 `pull * 8px`。
- 嘴角向舌头方向拉开 `pull * 10px`。
- 眼球看向舌尖，最大偏移 6px。
- 眉毛上抬 `pull * 5px`，overstretch 时变成八字眉。
- 松手回弹时脸部反方向抖一下，幅度 3-6px。

### 9.2 语言反馈

文字短、随机、分层，不能刷屏。

触发规则：

- `Grabbed`：立即一次轻反馈。
- `pull > 0.45`：中度反馈，冷却 1.2s。
- `pull > 0.8`：强反馈，冷却 1.8s。
- `ReleaseSnap`：根据本次最大拉伸距离结算一句。

轻度：

```text
诶？
别拽！
嗯？！
```

中度：

```text
有点长了！
等一下等一下！
嘴巴要关不上了！
```

强度：

```text
要弹回去了！
这也能拉？！
舌头不是橡皮筋啊！
```

松手：

```text
啪！
收回成功。
弹得真响。
差点飞出去。
```

同一句 8 秒内不要重复。文字出现 600-900ms 后淡出。

### 9.3 音效和触感

声音分层：

- `grab`：短促软 pop。
- `stretch_loop`：轻橡胶拉伸循环音，音高随 `pull` 升高。
- `overstretch`：紧绷 squeak，低频触发。
- `release`：核心爽点，短促 thwap/boing。
- `settle`：嘴巴闭合或吞回小音效。

音频参数：

```text
stretch pitch = 1.0 + pull * 0.45
stretch volume = 0.05 + pull * 0.18
release volume = lerp(0.4, 1.0, maxPull)
release pitch = lerp(1.2, 0.85, maxPull)
```

触感：

- 轻拉：短震 8ms。
- 超过 70%：中震 16ms。
- 松手回弹：20-35ms。
- 不允许拖动中每帧震动，只在跨阈值时触发。

## 10. 数据驱动架构

项目应从单部位舌头重构为可扩展的部位系统。

建议三层：

1. 表现层：渲染、骨骼/网格变形、粒子、音效、表情、轻 UI。
2. 交互模拟层：输入、命中、约束、弹性、回弹、阻尼、疲劳值、形变值。
3. 数据与规则层：配置每个部位的锚点、拉伸范围、曲线、反馈规则、状态机。

建议模块：

```text
GameApp
  Scene
  InputController
  PartInteractionSystem
  DeformRuntime
  FeedbackRuntime
  RuleRuntime
  AssetRuntime
  DebugOverlay

ToolApp
  PartConfigEditor
  AnchorEditor
  CurveEditor
  KeyframePreview
  FeedbackRuleEditor
  ExportValidator
```

第一阶段可先用原生 Canvas 或 Phaser Graphics 做 Bezier 舌头；后续如果要高质量骨骼/网格形变，优先考虑 PixiJS 或 Phaser + Spine/DragonBones。

## 11. 配置格式

第一阶段至少要有：

```text
config/parts/tongue_main.part.json
config/curves/tongue_length_curve.json
config/curves/tongue_width_curve.json
config/rules/tongue_feedback_rules.json
```

示例部位配置：

```json
{
  "id": "tongue_main",
  "type": "stretchable",
  "displayName": "舌头主段",
  "anchors": {
    "root": { "x": 0.5, "y": 0.54 },
    "handle": { "mode": "tip" }
  },
  "input": {
    "hitArea": "tongue_tip_hit",
    "dragAxis": "free",
    "softMaxDistance": 180,
    "hardMaxDistance": 260,
    "deadZone": 8
  },
  "physics": {
    "spring": 720,
    "damping": 38,
    "maxSpeed": 2400,
    "overshoot": 0.12
  },
  "deform": {
    "lengthCurve": "tongue_length_curve",
    "widthCurve": "tongue_width_curve",
    "bendMax": 38
  },
  "feedback": ["tongue_grab", "tongue_stretch", "tongue_release"]
}
```

示例反馈规则：

```json
{
  "id": "tongue_overstretch_reaction",
  "when": {
    "part": "tongue_main",
    "state": "Overstretch",
    "overPull": { "gte": 0.01 }
  },
  "do": [
    { "type": "setExpression", "name": "panic", "weight": 1 },
    { "type": "emitParticle", "name": "sweat_small", "cooldown": 0.3 },
    { "type": "say", "pool": "strong", "cooldown": 1.8 },
    { "type": "cameraShake", "strength": 0.12 }
  ]
}
```

## 12. 调参工具需求

调参工具必须复用游戏 runtime 的计算逻辑，保证工具里看到的表现和正式游戏一致。

开发流程硬约束：视觉和动画专家必须通过调参工具生成 preset、曲线和反馈规则。程序不直接硬编码审美参数，只负责工具表达能力、runtime 还原一致性、schema 校验和回归截图。

第一版调参面板：

- 当前状态：Idle/Grabbed/Stretching/Overstretch/ReleaseSnap/Settle。
- 当前命中部位。
- pointer 坐标。
- mouthAnchor 坐标。
- tongueTip 坐标。
- dragDistance、pull、overPull、maxPullThisDrag、velocity。
- restLength、softMaxLength、hardMaxLength。
- widthRest、widthMin、maxBend。
- spring、damping、maxSpeed、settleDuration。
- faceOffset、eyeLook、mouthDeform、shakeAmount。
- 显示 hitShape、anchorPoint、control points、Bezier 曲线。
- 显示 softMax/hardMax 边界。
- 显示当前触发的反馈规则。
- 支持保存 preset：Soft、Snappy、Extreme、Mobile Friendly。
- 支持导出 JSON。

第一版可隐藏在 `?debug=1` 或调试按钮里，默认玩家不可见。

## 13. 素材分层规范

角色分层建议：

```text
character_root
  head
    face_base
    face_shadow
    eyes
    eyebrows
    nose
    mouth_back
    tongue
    mouth_front
    cheeks
    decorations
    makeup
    hair_front
  hair_back
  fx_attach
```

命名规则：

```text
charA_face_tongue_mesh_01_idle
charA_face_tongue_bone_root
charA_face_tongue_bone_mid
charA_face_tongue_bone_tip
charA_face_tongue_hit_tip
charA_face_mouth_slot_front
charA_fx_saliva_particle_01
charA_expr_panic
charA_expr_dizzy
```

规则：

- 所有可交互点必须有 `hit_*`。
- 程序控制骨骼必须有 `bone_*`。
- 可替换装饰放入 `decorations` 层。
- 化妆素材独立在 `makeup` 层。
- 嘴部需要 `mouth_back` 和 `mouth_front`，舌头从中间伸出，嘴唇可遮挡舌根。
- 视觉交付必须包含骨骼、slot、hit area 清单。

## 14. 第一阶段最小实现范围

必须做：

- 一个大脸主画面。
- 一个舌头可拖拽部位。
- 命中检测：舌尖圆 + 舌身胶囊。
- 任意方向拖拽。
- softMax/hardMax 限制。
- 可变宽 Bezier 舌头。
- 拖拽过程脸部、眼睛、嘴巴联动。
- ReleaseSnap 弹簧回弹。
- Settle 余震。
- 3 档表情反馈。
- 语言反馈池。
- 粒子或音效至少一种。
- 调试面板可查看参数。
- 固定拖拽轨迹回放或手动测试脚本。

不要做：

- 挑战模式。
- 表情墙。
- 复杂成就或数值系统。
- 商店、背包、完整装饰系统。
- 完整化妆系统。
- 多角色。
- 复杂行为树。
- 多部位联动。

## 15. 验收标准

交互验收：

- 鼠标和触屏都能拖。
- 点中舌头后小于 50ms 出现抓取反馈。
- 命中区域宽容，不出现“明明点到却没反应”。
- 拖拽过程中不会穿脸、穿嘴角、断开。
- 超过硬上限后不再无限拉长，但仍有小抖动和紧绷反馈。
- 松手后主要回弹小于 150ms。
- 完整 settle 小于 350ms。

表现验收：

- 舌头拉长符合曲线，越长越细。
- 舌头有弯曲和弹性延迟，不是硬直线。
- 拉扯强度至少触发 3 档表情。
- 松手时有明显“啪地收回”的视觉反馈。
- 文字/音效/粒子不过度刷屏。

工具验收：

- 调参面板修改参数后实时生效。
- 导出配置后重载表现一致。
- 关键参数没有散落硬编码。
- Debug 可视化能显示 anchor、hitShape、control points、soft/hard 边界。

自动/半自动回归：

```text
拖拽舌尖到 25% -> 截图
拖拽舌尖到 50% -> 截图
拖拽舌尖到 90% -> 截图
松手后 0.12s -> 截图
松手后 0.30s -> 截图
```

每张截图人工检查层级、形变、表情、遮挡和 UI 是否干净。

## 16. 重做实施顺序

1. 清掉默认挑战/训练 UI，把默认界面还给大脸和舌头。
2. 建立 `PartConfig` 和 `TongueRuntime`，把舌头参数配置化。
3. 实现舌头状态机：Idle、Grabbed、Stretching、Overstretch、ReleaseSnap、Settle。
4. 用可变宽 Bezier 重做舌头形变。
5. 实现弹簧回弹和过冲。
6. 实现脸部联动：眼睛看向舌尖、嘴巴牵动、头部偏移、眉毛变化。
7. 加短文字反馈和粒子/音效。
8. 加 `?debug=1` 调参面板。
9. 加固定轨迹回放测试。
10. 用浏览器截图验收桌面和移动端。
