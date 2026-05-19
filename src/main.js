/**
 * 拽脸解压玩具 - 核心 runtime
 *
 * 设计依据：
 *   docs/pull-tongue-relaxation-game-requirements.md (v0.1)
 *   docs/visual-to-program-development-workflow.md  (v0.1)
 *
 * 原则：
 *   - 默认画面聚焦大脸 + 嘴巴拉扯，HUD 保持轻量。
 *   - 所有手感参数集中在 `config` 中（PartConfig），debug 面板可调，可导出 JSON。
 *   - 舌头模型保留为待机嘴内细节，不再作为默认拖拽目标。
 *   - 状态机：Idle → Grabbed → Stretching → Overstretch → ReleaseSnap → Settle → Idle。
 *   - 反馈分层：表情、文字、粒子，按 pull 阈值触发，冷却去重避免刷屏。
 */

// ---------------------------------------------------------------------------
// 素材清单（沿用上一版命名，缺失时 fallback 到手绘）
// ---------------------------------------------------------------------------

const ASSET_FILES = {
  character_face_base: './assets/character_face_base.svg',
  character_face_shadow: './assets/character_face_shadow.svg',
  character_eyes_neutral: './assets/character_eyes_neutral.svg',
  character_eyes_squint: './assets/character_eyes_squint.svg',
  character_eyes_shock: './assets/character_eyes_shock.svg',
  character_mouth_neutral: './assets/character_mouth_neutral.svg',
  character_mouth_smile: './assets/character_mouth_smile.svg',
  character_mouth_worried: './assets/character_mouth_worried.svg',
  tongue_neutral: './assets/tongue_neutral.svg',
  tongue_stretch_1: './assets/tongue_stretch_1.svg',
  tongue_stretch_2: './assets/tongue_stretch_2.svg',
  tongue_stretch_3: './assets/tongue_stretch_3.svg',
  tongue_stretch_4: './assets/tongue_stretch_4.svg'
};

const IS_FILE_PREVIEW = window.location.protocol === 'file:';
const ENABLE_TONGUE_DRAG = false;

// ---------------------------------------------------------------------------
// PartConfig - 嘴巴拉扯与软体反馈配置。
// 所有审美/手感参数集中在这里，debug 面板和导出 preset 都基于它。
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  // 长度
  restLength: 58,
  minLength: 24,
  softMaxLength: 230,
  hardMaxLength: 340,

  // 构图 / 层级
  headRadiusRatio: 0.25,
  headCenterYRatio: 0.47,
  mouthAnchorYRatio: 0.345,
  lipOcclusionAmount: 0.68,
  tongueRootInset: 4,

  // 命中
  grabRadius: 36,
  tongueTipHitRadius: 44,
  mouthAnchorRadius: 18,

  // 跟随
  stretchResponse: 0.72,
  dragFollowLag: 0.045,
  maxBend: 58,

  // 宽度
  widthRest: 48,
  widthMin: 14,
  tipScaleOnGrab: 1.22,

  // 回弹
  releaseSpring: 520,
  releaseDamping: 28,
  releaseMaxSpeed: 2200,
  releaseOvershoot: 14,   // px，松手时允许穿过锚点的距离

  // 余震
  settleDuration: 0.32,
  microShakeAmount: 2.2,
  overstretchShakeAmount: 5.5,
  releaseSquashAmount: 0.42,

  // 脸部联动幅度（§9.1）
  faceOffsetAmount: 10,
  eyeLookAmount: 7,
  mouthDeformAmount: 13,
  eyebrowLiftAmount: 6,

  // 脸颊拉扯
  cheekGrabRadius: 46,
  cheekSoftMaxLength: 92,
  cheekHardMaxLength: 146,
  cheekFollowLag: 0.052,
  cheekReleaseSpring: 780,
  cheekReleaseDamping: 32,
  cheekReleaseMaxSpeed: 2300,
  cheekReleaseOvershoot: 7,
  noseGrabRadius: 34,
  noseSoftMaxLength: 72,
  noseHardMaxLength: 118,
  mouthCornerGrabRadius: 46,
  mouthCornerSoftMaxLength: 92,
  mouthCornerHardMaxLength: 146,
  earGrabRadius: 42,
  earSoftMaxLength: 86,
  earHardMaxLength: 138,
  hairGrabRadius: 52,
  hairSoftMaxLength: 82,
  hairHardMaxLength: 132,
  facePartFollowLag: 0.05,
  facePartReleaseSpring: 800,
  facePartReleaseDamping: 32,
  facePartReleaseMaxSpeed: 2300,
  facePartReleaseOvershoot: 7,

  // 反馈
  particleAmount: 16,
  grabSfxVolume: 0.055,
  tensionSfxVolume: 0.035,
  releaseSfxVolume: 0.22,
  hapticsEnabled: true,
  comboWindow: 2.35,
  feverDuration: 4.2,

  // 触发阈值（不直接渲染到 debug 面板的暴露项，但仍是数据）
  thresholds: {
    grabbedToStretch: 0.04,
    overstretchEnter: 1.0,   // pull 达到 1.0 即视为进入 over
    overstretchExit: 0.92
  }
};

// debug 面板里要显示的可调字段（label, key, min, max, step）
const DEBUG_FIELDS = [
  { key: 'headRadiusRatio', label: '脸部占比', min: 0.2, max: 0.32, step: 0.005 },
  { key: 'headCenterYRatio', label: '脸部高度', min: 0.38, max: 0.56, step: 0.005 },
  { key: 'mouthAnchorYRatio', label: '嘴部锚点', min: 0.26, max: 0.48, step: 0.005 },
  { key: 'lipOcclusionAmount', label: '嘴唇遮挡', min: 0.25, max: 1.1, step: 0.01 },
  { key: 'tongueRootInset', label: '舌根内缩', min: 0, max: 20, step: 1 },
  { key: 'restLength', label: '自然长度', min: 0, max: 120, step: 1 },
  { key: 'softMaxLength', label: '软上限', min: 60, max: 360, step: 2 },
  { key: 'hardMaxLength', label: '硬上限', min: 80, max: 500, step: 2 },
  { key: 'widthRest', label: '舌身原宽', min: 8, max: 80, step: 1 },
  { key: 'widthMin', label: '拉极限宽', min: 4, max: 40, step: 1 },
  { key: 'maxBend', label: '弯曲幅度', min: 0, max: 90, step: 1 },
  { key: 'dragFollowLag', label: '跟随延迟', min: 0, max: 0.5, step: 0.01 },
  { key: 'releaseSpring', label: '回弹刚度', min: 80, max: 1600, step: 20 },
  { key: 'releaseDamping', label: '回弹阻尼', min: 5, max: 120, step: 1 },
  { key: 'releaseMaxSpeed', label: '最大回弹速度', min: 200, max: 5000, step: 50 },
  { key: 'releaseOvershoot', label: '过冲距离', min: 0, max: 24, step: 1 },
  { key: 'releaseSquashAmount', label: '回弹变粗', min: 0, max: 0.8, step: 0.01 },
  { key: 'settleDuration', label: '余震时长', min: 0.05, max: 1, step: 0.01 },
  { key: 'faceOffsetAmount', label: '头部偏移', min: 0, max: 24, step: 0.5 },
  { key: 'eyeLookAmount', label: '眼神追踪', min: 0, max: 16, step: 0.5 },
  { key: 'mouthDeformAmount', label: '嘴巴拉扯', min: 0, max: 24, step: 0.5 },
  { key: 'eyebrowLiftAmount', label: '眉毛抬起', min: 0, max: 16, step: 0.5 },
  { key: 'cheekGrabRadius', label: '脸颊命中', min: 24, max: 80, step: 1 },
  { key: 'cheekSoftMaxLength', label: '脸颊软上限', min: 40, max: 180, step: 2 },
  { key: 'cheekReleaseSpring', label: '脸颊回弹', min: 80, max: 1600, step: 20 },
  { key: 'noseGrabRadius', label: '鼻子命中', min: 18, max: 64, step: 1 },
  { key: 'noseSoftMaxLength', label: '鼻子软上限', min: 28, max: 130, step: 2 },
  { key: 'mouthCornerGrabRadius', label: '嘴巴命中', min: 18, max: 72, step: 1 },
  { key: 'mouthCornerSoftMaxLength', label: '嘴巴软上限', min: 30, max: 160, step: 2 },
  { key: 'earGrabRadius', label: '耳朵命中', min: 20, max: 78, step: 1 },
  { key: 'hairGrabRadius', label: '头发命中', min: 24, max: 88, step: 1 },
  { key: 'facePartReleaseSpring', label: '五官回弹', min: 80, max: 1600, step: 20 },
  { key: 'particleAmount', label: '粒子数量', min: 0, max: 40, step: 1 },
  { key: 'releaseSfxVolume', label: '回弹音量', min: 0, max: 0.5, step: 0.01 }
];

// ---------------------------------------------------------------------------
// 反馈文字池（§9.2）
// ---------------------------------------------------------------------------

const SPEECH_POOL = {
  grab: ['诶？', '嗯？！', '别拽！'],
  mid: ['有点长了！', '等一下等一下！', '嘴巴要关不上了！'],
  strong: ['要弹回去了！', '这也能拉？！', '舌头不是橡皮筋啊！'],
  release: ['啪！', '收回成功。', '弹得真响。', '差点飞出去。'],
  settleSoft: ['呼……', '别再来了。'],
  cheekGrab: ['脸也要拽？', '喂，脸脸！', '这边不行！'],
  cheekMid: ['脸要变长了！', '松手会弹的！', '捏成饼了。'],
  cheekStrong: ['脸皮撑住！', '要回弹了！', '我脸呢？！'],
  cheekRelease: ['啵！', '脸弹回来了。', '好响。'],
  noseGrab: ['鼻子也来？', '别捏鼻子！', '鼻子警告。'],
  noseMid: ['鼻子要变长了！', '这不是把手。', '轻一点轻一点。'],
  noseStrong: ['鼻子快飞了！', '要弹了！', '鼻梁撑住！'],
  noseRelease: ['啵！', '鼻子回位。', '弹回来了。'],
  mouthGrab: ['嘴巴？', '别扯嘴！', '笑不出来了。'],
  mouthMid: ['嘴要歪了！', '这表情合理吗？', '有点离谱。'],
  mouthStrong: ['嘴巴撑住！', '要裂开了！', '快松手！'],
  mouthRelease: ['啪！', '嘴回来了。', '表情复原。'],
  earGrab: ['耳朵也拽？', '听见了听见了！', '别拉耳朵。'],
  earMid: ['耳朵要变大了！', '耳朵在报警。', '有点痒！'],
  earStrong: ['耳朵撑住！', '快松手！', '要弹回来了！'],
  earRelease: ['啵！', '耳朵复位。', '听力恢复。'],
  hairGrab: ['抓头发？', '发型危险！', '别薅！'],
  hairMid: ['发型飞起来了！', '头皮一紧。', '这撮头发很倔。'],
  hairStrong: ['要秃了！', '头发撑住！', '快弹了！'],
  hairRelease: ['咻！', '发型回来了。', '还好还在。']
};

// 文字冷却（秒）
const SPEECH_COOLDOWN = {
  grab: 0.6,
  mid: 1.2,
  strong: 1.8,
  release: 0.4,
  settleSoft: 2.5,
  cheekGrab: 0.7,
  cheekMid: 1.2,
  cheekStrong: 1.8,
  cheekRelease: 0.45,
  noseGrab: 0.7,
  noseMid: 1.15,
  noseStrong: 1.7,
  noseRelease: 0.45,
  mouthGrab: 0.7,
  mouthMid: 1.15,
  mouthStrong: 1.7,
  mouthRelease: 0.45,
  earGrab: 0.7,
  earMid: 1.15,
  earStrong: 1.7,
  earRelease: 0.45,
  hairGrab: 0.7,
  hairMid: 1.15,
  hairStrong: 1.7,
  hairRelease: 0.45
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}
function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}
function easeOutSine(t) {
  return Math.sin((t * Math.PI) / 2);
}
function length(x, y) {
  return Math.hypot(x, y);
}
function clampMag(vx, vy, maxMag) {
  const m = Math.hypot(vx, vy);
  if (m <= maxMag || m === 0) return { x: vx, y: vy };
  const s = maxMag / m;
  return { x: vx * s, y: vy * s };
}

// 持久化 / 克隆配置
function cloneConfig(src) {
  return JSON.parse(JSON.stringify(src));
}

function deepMerge(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], value);
      return;
    }
    target[key] = value;
  });
  return target;
}

let audioContext = null;

function getAudioContext() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  if (!audioContext) audioContext = new AudioCtor();
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playTone({ type = 'sine', from = 440, to = 220, duration = 0.12, volume = 0.08 }) {
  if (volume <= 0) return;
  if (state && state.soundOn === false) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, from), now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playGrabSfx() {
  playTone({
    type: 'triangle',
    from: 260,
    to: 520,
    duration: 0.08,
    volume: config.grabSfxVolume
  });
}

function playTensionSfx() {
  playTone({
    type: 'sawtooth',
    from: 150,
    to: 96,
    duration: 0.16,
    volume: config.tensionSfxVolume
  });
}

function playReleaseSfx(power) {
  const p = clamp(power, 0.1, 1.2);
  const volume = config.releaseSfxVolume * (0.38 + p * 0.62);
  playTone({
    type: 'triangle',
    from: 760 + p * 180,
    to: 130 + p * 40,
    duration: 0.13,
    volume
  });
  window.setTimeout(() => {
    playTone({
      type: 'sine',
      from: 210,
      to: 310,
      duration: 0.055,
      volume: volume * 0.55
    });
  }, 68);
}

function pulseHaptics(kind, power = 1) {
  if (!config.hapticsEnabled || !navigator.vibrate) return;
  if (kind === 'grab') navigator.vibrate(8);
  if (kind === 'tension') navigator.vibrate([10, 24, 10]);
  if (kind === 'release') {
    const strong = power > 0.75;
    navigator.vibrate(strong ? [16, 26, 22] : [12, 18, 10]);
  }
}

// ---------------------------------------------------------------------------
// DOM 引用
// ---------------------------------------------------------------------------

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const toyShellEl = document.querySelector('.toy-shell');
const resetPoseBtn = document.getElementById('resetPose');
const openMenuBtn = document.getElementById('openMenu');
const toggleSoundBtn = document.getElementById('toggleSound');
const captureMomentBtn = document.getElementById('captureMoment');
const toggleDecorBtn = document.getElementById('toggleDecor');
const toggleDebugBtn = document.getElementById('toggleDebug');
const speechBubbleEl = document.getElementById('speechBubble');
const gestureHintEl = document.getElementById('gestureHint');
const debugPanelEl = document.getElementById('debugPanel');
const debugControlsEl = document.getElementById('debugControls');
const debugReadoutEl = document.getElementById('debugReadout');
const exportPresetBtn = document.getElementById('exportPreset');
const decorPanelEl = document.getElementById('decorPanel');
const decorControlsEl = document.getElementById('decorControls');
const clearDecorBtn = document.getElementById('clearDecor');
const closeDecorBtn = document.getElementById('closeDecor');
const satisfactionFillEl = document.getElementById('satisfactionFill');
const strengthFillEl = document.getElementById('strengthFill');
const satisfactionTextEl = document.getElementById('satisfactionText');
const coinCountEl = document.getElementById('coinCount');
const moodLabelEl = document.getElementById('moodLabel');
const relaxValueEl = document.getElementById('relaxValue');
const thresholdTextEl = document.getElementById('thresholdText');
const interactionTitleEl = document.getElementById('interactionTitle');
const interactionDetailEl = document.getElementById('interactionDetail');
const partTabButtons = Array.from(document.querySelectorAll('[data-part-tab]'));
const runStripEl = document.getElementById('runStrip');
const modeLabelEl = document.getElementById('modeLabel');
const timerTextEl = document.getElementById('timerText');
const questTextEl = document.getElementById('questText');
const questFillEl = document.getElementById('questFill');
const comboTextEl = document.getElementById('comboText');
const startOverlayEl = document.getElementById('startOverlay');
const resultOverlayEl = document.getElementById('resultOverlay');
const startFreeBtn = document.getElementById('startFree');
const startTimedBtn = document.getElementById('startTimed');
const replayTimedBtn = document.getElementById('replayTimed');
const backFreeBtn = document.getElementById('backFree');
const bestScoreTextEl = document.getElementById('bestScoreText');
const bestComboTextEl = document.getElementById('bestComboText');
const menuCoinTextEl = document.getElementById('menuCoinText');
const resultTitleEl = document.getElementById('resultTitle');
const resultScoreTextEl = document.getElementById('resultScoreText');
const resultDetailEl = document.getElementById('resultDetail');

// ---------------------------------------------------------------------------
// 全局 runtime state
// ---------------------------------------------------------------------------

const config = cloneConfig(DEFAULT_CONFIG);

const state = {
  // 画布
  width: 1,
  height: 1,
  dpr: 1,

  // 基础锚点只由布局决定；渲染锚点由脸部拉扯姿态推导，不能回写到物理锚点。
  mouthAnchor: { x: 0, y: 0 },
  renderMouthAnchor: { x: 0, y: 0 },
  headCenter: { x: 0, y: 0 },
  headRadius: 120,

  // 输入
  pointer: { x: 0, y: 0, active: false },
  activePart: null,
  hoverPart: null,
  dragOffset: { x: 0, y: 0 }, // 抓握点到舌尖的差，避免点到舌身时"跳到鼠标位置"
  cheekDragOffset: { x: 0, y: 0 },
  facePartDragOffset: { x: 0, y: 0 },

  // 舌尖：实时位置和速度（相对 mouthAnchor 的坐标系）
  tip: { x: 0, y: 0, vx: 0, vy: 0 },
  // 跟随目标（拖拽时的期望舌尖位置，相对 anchor）
  target: { x: 0, y: 0 },
  dragIntent: { x: 0, y: 0, rawLen: 0, finalLen: 0 },
  releaseDir: { x: 0, y: 1 },
  // 拉扯强度
  pull: 0,
  overPull: 0,
  maxPullThisDrag: 0,

  cheeks: {
    left: { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, pull: 0, maxPull: 0 },
    right: { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, pull: 0, maxPull: 0 }
  },
  cheekReleaseDir: { x: 1, y: 0 },
  faceParts: {
    nose: { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, pull: 0, maxPull: 0 },
    mouthLeft: { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, pull: 0, maxPull: 0 },
    mouthRight: { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, pull: 0, maxPull: 0 },
    earLeft: { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, pull: 0, maxPull: 0 },
    earRight: { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, pull: 0, maxPull: 0 },
    hairTop: { x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, pull: 0, maxPull: 0 }
  },
  facePartReleaseDir: { x: 1, y: 0 },

  // 状态机
  phase: 'Idle',
  phaseEnteredAt: performance.now(),

  // 反馈冷却
  lastSpeech: {},      // 池名 -> 时间戳
  lastSpoken: '',      // 上次内容，避免重复
  hintHidden: false,

  // 待机呼吸
  idleTimer: 0,

  // 粒子
  particles: [],
  impactRings: [],
  floatingTexts: [],

  // 回弹冲击
  releasePunch: { age: 999, power: 0 },

  // 轻量成长与装扮
  screen: 'menu',
  gameMode: 'free',
  runActive: false,
  runDuration: 60,
  runTimeLeft: 0,
  runScore: 0,
  bestScore: 0,
  bestCombo: 0,
  satisfaction: 0,
  coins: 0,
  combo: { count: 0, timer: 0 },
  fever: { timer: 0, level: 0 },
  soundOn: true,
  quests: [],
  questIndex: 0,
  completedQuests: 0,
  decorOpen: false,
  decor: {
    glasses: false,
    blush: false,
    star: false,
    mustache: false,
    hat: false,
    sparkle: false
  },
  uiPartHint: 'mouth',
  uiSignature: '',
  sessionSignature: '',

  // 资源
  assets: {},
  assetRows: [],

  // 帧时间
  lastFrame: performance.now(),

  // 调试
  debugOpen: false,
  debugDirty: true,
  lastTongueGeometry: null
};

const DECOR_OPTIONS = [
  { key: 'glasses', label: '软糖眼镜' },
  { key: 'blush', label: '蜜桃腮红' },
  { key: 'star', label: '星星贴' },
  { key: 'mustache', label: '奶油胡子' },
  { key: 'hat', label: '布丁帽' },
  { key: 'sparkle', label: '闪闪光' }
];

const QUEST_DECK = [
  { key: 'mouth3', part: 'mouth', label: '嘴巴三连拽', target: 3, minPull: 0.18, reward: 190 },
  { key: 'cheek2', part: 'cheek', label: '脸颊左右拽', target: 2, minPull: 0.32, reward: 150 },
  { key: 'nose1', part: 'nose', label: '鼻尖拉到位', target: 1, minPull: 0.52, reward: 130 },
  { key: 'mouthWide', part: 'mouth', label: '嘴巴变形秀', target: 2, minPull: 0.32, reward: 170 },
  { key: 'ear2', part: 'ear', label: '耳朵弹回来', target: 2, minPull: 0.36, reward: 145 },
  { key: 'hair1', part: 'hair', label: '头发飞起来', target: 1, minPull: 0.46, reward: 120 }
];

const PART_SCORE_MULTIPLIER = {
  tongue: 1,
  cheek: 1,
  nose: 0.95,
  mouth: 1.18,
  ear: 0.98,
  hair: 0.96
};

function restorePlayerState() {
  try {
    const raw = localStorage.getItem('pull-toy-player');
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.satisfaction = clamp(Number(saved.satisfaction) || 0, 0, 99);
    state.coins = Math.max(0, Math.floor(Number(saved.coins) || 0));
    state.bestScore = Math.max(0, Math.floor(Number(saved.bestScore) || 0));
    state.bestCombo = Math.max(0, Math.floor(Number(saved.bestCombo) || 0));
    state.soundOn = saved.soundOn !== false;
    if (saved.decor && typeof saved.decor === 'object') {
      Object.keys(state.decor).forEach((key) => {
        state.decor[key] = Boolean(saved.decor[key]);
      });
    }
  } catch (error) {
    // 本地存档不可用时直接使用默认状态。
  }
}

function savePlayerState() {
  try {
    localStorage.setItem('pull-toy-player', JSON.stringify({
      satisfaction: state.satisfaction,
      coins: state.coins,
      bestScore: state.bestScore,
      bestCombo: state.bestCombo,
      soundOn: state.soundOn,
      decor: state.decor
    }));
  } catch (error) {
    // 无痕模式或权限限制时不影响游玩。
  }
}

function createQuestDeck() {
  return QUEST_DECK.map((quest) => ({ ...quest, count: 0 }));
}

function currentQuest() {
  if (!state.quests.length) return null;
  return state.quests[state.questIndex % state.quests.length];
}

function updateMenuStats() {
  if (bestScoreTextEl) bestScoreTextEl.textContent = String(state.bestScore);
  if (bestComboTextEl) bestComboTextEl.textContent = String(state.bestCombo);
  if (menuCoinTextEl) menuCoinTextEl.textContent = String(state.coins);
}

function formatTimer(seconds) {
  if (!Number.isFinite(seconds)) return '∞';
  return String(Math.max(0, Math.ceil(seconds))).padStart(2, '0');
}

function updateSoundButton() {
  if (!toggleSoundBtn) return;
  toggleSoundBtn.textContent = state.soundOn ? '♪' : '–';
  toggleSoundBtn.title = state.soundOn ? '声音开' : '声音关';
  toggleSoundBtn.setAttribute('aria-label', toggleSoundBtn.title);
}

function updateSessionHud(force = false) {
  const quest = currentQuest();
  const questProgress = quest ? clamp(quest.count / quest.target, 0, 1) : 0;
  const timer = state.gameMode === 'timed' ? formatTimer(state.runTimeLeft) : '∞';
  const combo = state.combo.count > 0 ? state.combo.count : 0;
  const mode = state.gameMode === 'timed' ? '60秒' : '自由';
  const fever = state.fever.timer > 0 ? 'FEVER' : '';
  const signature = [
    mode,
    timer,
    state.runScore,
    combo,
    quest?.key,
    quest?.count,
    questProgress.toFixed(2),
    fever
  ].join('|');
  if (!force && signature === state.sessionSignature) return;
  state.sessionSignature = signature;

  if (modeLabelEl) modeLabelEl.textContent = state.gameMode === 'timed' ? '爆爽局' : '自由模式';
  if (timerTextEl) timerTextEl.textContent = timer;
  if (questTextEl) {
    questTextEl.textContent = quest
      ? `${quest.label} ${quest.count}/${quest.target}${fever ? ' · FEVER' : ''}`
      : `分数 ${state.runScore}`;
  }
  if (questFillEl) questFillEl.style.width = `${Math.round(questProgress * 100)}%`;
  if (comboTextEl) comboTextEl.textContent = combo ? `x${combo}` : String(state.runScore);
  if (runStripEl) runStripEl.classList.toggle('is-fever', state.fever.timer > 0);
  if (toyShellEl) toyShellEl.classList.toggle('is-fever', state.fever.timer > 0);
  updateMenuStats();
  updateSoundButton();
}

function showStartMenu() {
  state.screen = 'menu';
  state.runActive = false;
  state.pointer.active = false;
  if (startOverlayEl) startOverlayEl.hidden = false;
  if (resultOverlayEl) resultOverlayEl.hidden = true;
  toggleDebug(false);
  toggleDecor(false);
  updateSessionHud(true);
}

function startRun(mode = 'free') {
  state.screen = 'playing';
  state.gameMode = mode;
  state.runActive = true;
  state.runScore = 0;
  state.runTimeLeft = mode === 'timed' ? state.runDuration : Infinity;
  state.quests = createQuestDeck();
  state.questIndex = 0;
  state.completedQuests = 0;
  state.combo.count = 0;
  state.combo.timer = 0;
  state.fever.timer = 0;
  state.fever.level = 0;
  state.sessionSignature = '';
  if (startOverlayEl) startOverlayEl.hidden = true;
  if (resultOverlayEl) resultOverlayEl.hidden = true;
  resetPose({ silent: true });
  showSpeech(mode === 'timed' ? '60秒开始！' : '自由捏。');
  updateSessionHud(true);
}

function endRun() {
  if (state.screen === 'result') return;
  state.screen = 'result';
  state.runActive = false;
  const isRecord = state.runScore > state.bestScore;
  state.bestScore = Math.max(state.bestScore, state.runScore);
  state.bestCombo = Math.max(state.bestCombo, state.combo.count);
  savePlayerState();
  if (resultTitleEl) resultTitleEl.textContent = isRecord ? '新纪录' : '爆爽完成';
  if (resultScoreTextEl) resultScoreTextEl.textContent = String(state.runScore);
  if (resultDetailEl) {
    resultDetailEl.textContent = `完成 ${state.completedQuests} 个目标 · 最佳连拽 ${state.bestCombo}`;
  }
  if (resultOverlayEl) resultOverlayEl.hidden = false;
  updateSessionHud(true);
}

function progressQuest(partKey, power) {
  const quest = currentQuest();
  if (!quest) return;
  if (quest.part !== partKey || power < quest.minPull) return;
  quest.count = Math.min(quest.target, quest.count + 1);
  if (quest.count < quest.target) return;
  state.completedQuests += 1;
  state.runScore += quest.reward;
  state.fever.timer = Math.max(state.fever.timer, config.feverDuration * 0.55);
  state.floatingTexts.push({
    x: state.headCenter.x,
    y: state.headCenter.y - state.headRadius * 0.88,
    text: `目标 +${quest.reward}`,
    age: 0,
    life: 0.8,
    vy: -46
  });
  showSpeech(`${quest.label} 完成`);
  state.questIndex += 1;
  const next = currentQuest();
  if (next && next.count >= next.target) next.count = 0;
}

function recordRelease(partKey, power, x, y) {
  const combo = Math.max(1, state.combo.count);
  const partMultiplier = PART_SCORE_MULTIPLIER[partKey] || 1;
  const feverMultiplier = state.fever.timer > 0 ? 1.35 : 1;
  const comboMultiplier = 1 + Math.min(0.52, (combo - 1) * 0.08);
  const score = Math.round((70 + power * 180) * partMultiplier * comboMultiplier * feverMultiplier);
  state.runScore += score;
  if (state.gameMode === 'free') state.bestScore = Math.max(state.bestScore, state.runScore);
  state.bestCombo = Math.max(state.bestCombo, combo);
  if (combo >= 5) {
    state.fever.timer = Math.max(state.fever.timer, config.feverDuration);
    state.fever.level = 1;
  }
  progressQuest(partKey, power);
  state.floatingTexts.push({
    x,
    y: y - 28,
    text: `+${score}`,
    age: 0,
    life: 0.68,
    vy: -58
  });
  updateSessionHud(true);
  savePlayerState();
}

function partKeyForUi(part) {
  if (!part) return state.uiPartHint || 'mouth';
  if (part.type === 'tongue') return 'tongue';
  if (part.type === 'cheek') return 'cheek';
  if (part.type === 'facePart') {
    if (part.key === 'nose') return 'nose';
    if (part.key === 'hairTop') return 'hair';
    if (part.key === 'earLeft' || part.key === 'earRight') return 'ear';
    if (isMouthPartKey(part.key)) return 'mouth';
    return 'mouth';
  }
  return state.uiPartHint || 'mouth';
}

function partLabelForUi(part) {
  const key = partKeyForUi(part);
  return partLabelFromTabKey(key);
}

function partLabelFromTabKey(key) {
  if (key === 'cheek') return '脸颊';
  if (key === 'nose') return '鼻子';
  if (key === 'mouth') return '嘴巴';
  if (key === 'ear') return '耳朵';
  if (key === 'hair') return '头发';
  return '嘴巴';
}

function moodForUi(pull) {
  if (pull >= 0.86) return '啵叽爆爽';
  if (pull >= 0.58) return '拽到上头';
  if (pull >= 0.28) return '有点害羞';
  return '软乎乎';
}

function thresholdForUi(pull) {
  if (pull >= 0.86) return '爆爽';
  if (pull >= 0.58) return '上头';
  if (pull >= 0.28) return '轻拽';
  return '待机';
}

function currentUiPull(part) {
  if (!part) return 0;
  return clamp(interactionPull(part), 0, 1);
}

function updatePartTabs(activeKey) {
  partTabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.partTab === activeKey);
  });
}

function updateInteractionHud() {
  const part = state.activePart || state.hoverPart;
  const activeKey = partKeyForUi(part);
  const label = partLabelForUi(part);
  const pull = currentUiPull(part);
  const pullPercent = Math.round(pull * 100);
  const holdingPhase = state.phase === 'Grabbed' || state.phase === 'Stretching' || state.phase === 'Overstretch'
    || isCheekHoldPhase() || isFacePartHoldPhase();
  const releasePhase = state.phase === 'ReleaseSnap' || state.phase === 'Settle'
    || isCheekReleasePhase() || isFacePartReleasePhase();
  const isHolding = Boolean(state.activePart) && state.pointer.active && holdingPhase;
  const displayPercent = isHolding ? pullPercent : Math.round(state.satisfaction);

  let title = activeKey === 'mouth' ? '拽嘴巴' : `试试${label}`;
  let detail = activeKey === 'mouth' ? '点住嘴巴，往外拽，松手回弹' : `${label}也会软软弹回`;
  if (isHolding) {
    title = `正在拽${label}`;
    detail = pullPercent > 0
      ? `拉伸 ${pullPercent}%`
      : '往外拖';
  } else if (state.hoverPart) {
    title = `可以拽${label}`;
    detail = '往外拉';
  } else if (releasePhase) {
    title = `${label}回弹中`;
    detail = '回弹中';
  }

  const signature = [
    activeKey,
    title,
    detail,
    pullPercent,
    Math.round(state.satisfaction),
    state.coins
  ].join('|');
  if (signature === state.uiSignature) return;
  state.uiSignature = signature;

  updatePartTabs(activeKey);
  if (satisfactionFillEl) satisfactionFillEl.style.width = `${displayPercent}%`;
  if (strengthFillEl) strengthFillEl.style.width = `${displayPercent}%`;
  if (satisfactionTextEl) satisfactionTextEl.textContent = `${displayPercent}%`;
  if (interactionTitleEl) interactionTitleEl.textContent = title;
  if (interactionDetailEl) interactionDetailEl.textContent = detail;
  if (moodLabelEl) moodLabelEl.textContent = moodForUi(Math.max(pull, state.satisfaction / 100));
  if (thresholdTextEl) thresholdTextEl.textContent = thresholdForUi(pull);
  if (relaxValueEl) relaxValueEl.textContent = String(state.coins * 100 + Math.round(state.satisfaction));
}

function updateHud() {
  if (satisfactionFillEl) satisfactionFillEl.style.width = `${Math.round(state.satisfaction)}%`;
  if (strengthFillEl) strengthFillEl.style.width = `${Math.round(state.satisfaction)}%`;
  if (satisfactionTextEl) satisfactionTextEl.textContent = `${Math.round(state.satisfaction)}%`;
  if (coinCountEl) coinCountEl.textContent = String(state.coins);
  updateInteractionHud();
}

function addSatisfaction(amount, x, y, label = '爽') {
  const gained = Math.max(1, Math.round(amount));
  state.combo.count = state.combo.timer > 0 ? state.combo.count + 1 : 1;
  state.combo.timer = config.comboWindow;
  const comboBonus = state.combo.count > 1 ? Math.min(8, (state.combo.count - 1) * 2) : 0;
  const totalGained = gained + comboBonus;
  state.satisfaction += totalGained;
  let coinsGained = 0;
  while (state.satisfaction >= 100) {
    state.satisfaction -= 100;
    state.coins += 1;
    coinsGained += 1;
  }
  state.floatingTexts.push({
    x,
    y,
    text: coinsGained
      ? `+${coinsGained} 金币`
      : state.combo.count > 1
        ? `连拽 x${state.combo.count} +${totalGained}`
        : `+${gained} ${label}`,
    age: 0,
    life: 0.72,
    vy: -54
  });
  if (coinsGained > 0) {
    showSpeech('金币 +1');
  }
  updateHud();
  savePlayerState();
}

// ---------------------------------------------------------------------------
// 素材加载（保留旧实现，缺失时不影响 fallback）
// ---------------------------------------------------------------------------

function loadImage(key, src) {
  if (IS_FILE_PREVIEW) {
    return Promise.resolve({ key, src, img: null, loaded: false });
  }
  return fetch(src)
    .then((response) => {
      if (!response.ok) return { key, src, img: null, loaded: false };
      return response.blob().then((blob) => new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve({ key, src, img, loaded: true });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ key, src, img: null, loaded: false });
        };
        img.src = url;
      }));
    })
    .catch(() => {
      return { key, src, img: null, loaded: false };
  });
}

async function loadAssets() {
  const rows = await Promise.all(
    Object.entries(ASSET_FILES).map(([key, src]) => loadImage(key, src))
  );
  state.assetRows = rows;
  state.assets = rows.reduce((acc, row) => {
    if (row.loaded) acc[row.key] = row.img;
    return acc;
  }, {});
}

async function loadRuntimeConfig() {
  if (IS_FILE_PREVIEW) return;
  try {
    const response = await fetch('./config/parts/tongue_main.part.json', { cache: 'no-store' });
    if (!response.ok) return;
    const payload = await response.json();
    deepMerge(config, payload.config || payload);
  } catch (error) {
    // 静态预览或旧部署没有配置文件时继续使用内置 fallback。
  }
}

// ---------------------------------------------------------------------------
// 画布尺寸 / 锚点
// ---------------------------------------------------------------------------

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = Math.max(320, rect.width);
  state.height = Math.max(420, rect.height);
  canvas.width = Math.round(state.width * state.dpr);
  canvas.height = Math.round(state.height * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  // 让脸占屏幕主要面积（§4.2），横屏矮窗口里稍微收小，给 UI 留出呼吸。
  const min = Math.min(state.width, state.height);
  const compactLandscape = clamp((state.width / Math.max(1, state.height) - 1.08) / 0.55, 0, 1)
    * clamp((1040 - state.height) / 260, 0, 1);
  state.headRadius = clamp(min * config.headRadiusRatio * (1 - compactLandscape * 0.12), 120, 260);
  state.headCenter.x = state.width * 0.5;
  const tallLayout = clamp((state.height / Math.max(1, state.width) - 1.35) / 0.9, 0, 1);
  state.headCenter.y = state.height * (config.headCenterYRatio - tallLayout * 0.065 + compactLandscape * 0.024);
  // mouthAnchor 在脸下半，舌头从这里出来
  state.mouthAnchor.x = state.headCenter.x;
  state.mouthAnchor.y = state.headCenter.y + state.headRadius * config.mouthAnchorYRatio;
  state.renderMouthAnchor.x = state.mouthAnchor.x;
  state.renderMouthAnchor.y = state.mouthAnchor.y;
}

function computeFacePose({ includeShake = false } = {}) {
  const vector = getExpressionVector();
  const dirLen = length(vector.x, vector.y) || 1;
  const offsetX = (vector.x / dirLen) * vector.pull * config.faceOffsetAmount;
  const offsetY = (vector.y / dirLen) * vector.pull * config.faceOffsetAmount * 0.6;
  const r = state.headRadius;
  const baseCx = state.headCenter.x + offsetX;
  const baseCy = state.headCenter.y + offsetY;
  const shakeAmount = state.phase === 'Overstretch' || state.phase === 'CheekOverstretch' || state.phase === 'FacePartOverstretch'
    ? config.overstretchShakeAmount
    : 0;
  const shakePhase = performance.now() * 0.048;
  const shakeX = includeShake ? Math.sin(shakePhase) * shakeAmount * 0.5 : 0;
  const shakeY = includeShake ? Math.cos(shakePhase * 1.17) * shakeAmount * 0.24 : 0;
  const cx = baseCx + shakeX;
  const cy = baseCy + shakeY;
  return {
    cx,
    cy,
    r,
    shakeX,
    shakeY,
    anchorX: cx,
    anchorY: cy + r * config.mouthAnchorYRatio
  };
}

function currentRenderAnchor() {
  const pose = computeFacePose();
  return { x: pose.anchorX, y: pose.anchorY };
}

function updateRenderAnchor() {
  const anchor = currentRenderAnchor();
  state.renderMouthAnchor.x = anchor.x;
  state.renderMouthAnchor.y = anchor.y;
}

function cheekKey(side) {
  return side < 0 ? 'left' : 'right';
}

function activeCheek() {
  if (!state.activePart || state.activePart.type !== 'cheek') return null;
  return state.cheeks[cheekKey(state.activePart.side)];
}

function cheekBase(side, pose = computeFacePose()) {
  return {
    x: pose.cx + side * pose.r * 0.55,
    y: pose.cy + pose.r * 0.18,
    r: pose.r
  };
}

function getCheekInfluence() {
  let best = { x: 0, y: 0, pull: 0, overPull: 0, side: 0 };
  [-1, 1].forEach((side) => {
    const cheek = state.cheeks[cheekKey(side)];
    const len = length(cheek.x, cheek.y);
    const pull = clamp(len / config.cheekSoftMaxLength, 0, 1.25);
    if (pull > best.pull) {
      best = {
        x: cheek.x,
        y: cheek.y,
        pull,
        overPull: clamp(
          (len - config.cheekSoftMaxLength) / Math.max(1, config.cheekHardMaxLength - config.cheekSoftMaxLength),
          0,
          1
        ),
        side
      };
    }
  });
  return best;
}

function facePartMeta(key) {
  if (key === 'nose') {
    return {
      kind: 'nose',
      grabRadius: config.noseGrabRadius,
      softMax: config.noseSoftMaxLength,
      hardMax: config.noseHardMaxLength,
      pullWeight: 0.88
    };
  }
  if (key === 'earLeft' || key === 'earRight') {
    return {
      kind: 'ear',
      grabRadius: config.earGrabRadius,
      softMax: config.earSoftMaxLength,
      hardMax: config.earHardMaxLength,
      pullWeight: 0.82
    };
  }
  if (key === 'hairTop') {
    return {
      kind: 'hair',
      grabRadius: config.hairGrabRadius,
      softMax: config.hairSoftMaxLength,
      hardMax: config.hairHardMaxLength,
      pullWeight: 0.76
    };
  }
  return {
    kind: 'mouth',
    grabRadius: config.mouthCornerGrabRadius,
    softMax: config.mouthCornerSoftMaxLength,
    hardMax: config.mouthCornerHardMaxLength,
    pullWeight: 1
  };
}

function activeFacePart() {
  if (!state.activePart || state.activePart.type !== 'facePart') return null;
  return state.faceParts[state.activePart.key] || null;
}

function facePartBase(key, pose = computeFacePose()) {
  if (key === 'nose') {
    return { x: pose.cx, y: pose.cy + pose.r * 0.09, r: pose.r, side: 0 };
  }
  if (key === 'earLeft' || key === 'earRight') {
    const side = key === 'earLeft' ? -1 : 1;
    return { x: pose.cx + side * pose.r * 0.9, y: pose.cy + pose.r * 0.03, r: pose.r, side };
  }
  if (key === 'hairTop') {
    return { x: pose.cx - pose.r * 0.04, y: pose.cy - pose.r * 0.78, r: pose.r, side: 0 };
  }
  const side = isMouthPartKey(key) && key === 'mouthLeft' ? -1 : 1;
  return {
    x: pose.cx + side * pose.r * 0.25,
    y: pose.cy + pose.r * 0.34,
    r: pose.r,
    side
  };
}

function getFacePartInfluence() {
  let best = { x: 0, y: 0, pull: 0, overPull: 0, side: 0, key: null };
  Object.entries(state.faceParts).forEach(([key, part]) => {
    const meta = facePartMeta(key);
    const len = length(part.x, part.y);
    const pull = clamp(len / meta.softMax, 0, 1.25);
    const weighted = pull * meta.pullWeight;
    if (weighted > best.pull) {
      best = {
        x: part.x,
        y: part.y,
        pull: weighted,
        overPull: clamp((len - meta.softMax) / Math.max(1, meta.hardMax - meta.softMax), 0, 1),
        side: key === 'mouthLeft' || key === 'earLeft' ? -1 : key === 'mouthRight' || key === 'earRight' ? 1 : 0,
        key
      };
    }
  });
  return best;
}

function getExpressionVector() {
  const cheek = getCheekInfluence();
  const facePart = getFacePartInfluence();
  if (facePart.pull > state.pull * 0.75 && facePart.pull > cheek.pull * 0.9) return facePart;
  if (cheek.pull > state.pull * 0.78) return cheek;
  return { x: state.tip.x, y: state.tip.y, pull: state.pull, overPull: state.overPull, side: 0 };
}

function isTonguePhase(phase = state.phase) {
  return phase === 'Grabbed' || phase === 'Stretching' || phase === 'Overstretch';
}

function isCheekHoldPhase(phase = state.phase) {
  return phase === 'CheekGrabbed' || phase === 'CheekStretching' || phase === 'CheekOverstretch';
}

function isCheekReleasePhase(phase = state.phase) {
  return phase === 'CheekReleaseSnap' || phase === 'CheekSettle';
}

function isFacePartHoldPhase(phase = state.phase) {
  return phase === 'FacePartGrabbed' || phase === 'FacePartStretching' || phase === 'FacePartOverstretch';
}

function isFacePartReleasePhase(phase = state.phase) {
  return phase === 'FacePartReleaseSnap' || phase === 'FacePartSettle';
}

function facePartSpeechPrefix(key) {
  if (key === 'nose') return 'nose';
  if (key === 'earLeft' || key === 'earRight') return 'ear';
  if (key === 'hairTop') return 'hair';
  return 'mouth';
}

function isMouthPartKey(key) {
  return key === 'mouthLeft' || key === 'mouthRight';
}

function tongueRewardPoint() {
  const anchor = currentRenderAnchor();
  return {
    x: anchor.x + state.tip.x * 0.55,
    y: anchor.y + state.tip.y * 0.55
  };
}

function cheekRewardPoint() {
  const part = state.activePart;
  const cheek = activeCheek();
  if (!part || !cheek) return currentRenderAnchor();
  const base = cheekBase(part.side);
  return {
    x: base.x + cheek.x * 0.72,
    y: base.y + cheek.y * 0.72
  };
}

function facePartRewardPoint() {
  const active = state.activePart;
  const part = activeFacePart();
  if (!active || !part) return currentRenderAnchor();
  const base = facePartBase(active.key);
  return {
    x: base.x + part.x * 0.72,
    y: base.y + part.y * 0.72
  };
}

// ---------------------------------------------------------------------------
// 状态机
// ---------------------------------------------------------------------------

function setPhase(next) {
  if (state.phase === next) return;
  state.phase = next;
  state.phaseEnteredAt = performance.now();
  state.debugDirty = true;

  if (next === 'Grabbed') {
    sayFromPool('grab');
    playGrabSfx();
    pulseHaptics('grab');
    state.maxPullThisDrag = state.pull;
  }
  if (next === 'Overstretch') {
    playTensionSfx();
    pulseHaptics('tension');
  }
  if (next === 'ReleaseSnap') {
    sayFromPool('release', { suffix: pickReleaseSuffix() });
    playReleaseSfx(state.maxPullThisDrag);
    pulseHaptics('release', state.maxPullThisDrag);
    state.releasePunch.age = 0;
    state.releasePunch.power = clamp(state.maxPullThisDrag, 0.18, 1.15);
    spawnReleaseBurst();
    const point = tongueRewardPoint();
    addSatisfaction(6 + state.maxPullThisDrag * 13, point.x, point.y, '爽感');
    recordRelease('tongue', state.maxPullThisDrag, point.x, point.y);
  }
  if (next === 'Settle' && state.maxPullThisDrag > 0.55) {
    sayFromPool('settleSoft');
  }
  if (next === 'Idle') {
    state.maxPullThisDrag = 0;
    state.activePart = null;
  }
  if (next === 'CheekGrabbed') {
    sayFromPool('cheekGrab');
    playGrabSfx();
    pulseHaptics('grab');
    const cheek = activeCheek();
    if (cheek) cheek.maxPull = cheek.pull;
  }
  if (next === 'CheekOverstretch') {
    sayFromPool('cheekStrong');
    playTensionSfx();
    pulseHaptics('tension');
  }
  if (next === 'CheekReleaseSnap') {
    const cheek = activeCheek();
    const power = cheek ? cheek.maxPull : 0.35;
    sayFromPool('cheekRelease');
    playReleaseSfx(power * 0.86);
    pulseHaptics('release', power);
    state.releasePunch.age = 0;
    state.releasePunch.power = clamp(power * 0.8, 0.16, 0.92);
    spawnCheekReleaseBurst();
    const point = cheekRewardPoint();
    addSatisfaction(4 + power * 9, point.x, point.y, '揉捏');
    recordRelease('cheek', power, point.x, point.y);
  }
  if (next === 'CheekSettle') {
    const cheek = activeCheek();
    if (cheek && cheek.maxPull > 0.55) sayFromPool('settleSoft');
  }
  if (next === 'FacePartGrabbed') {
    const part = activeFacePart();
    const prefix = facePartSpeechPrefix(state.activePart?.key);
    sayFromPool(`${prefix}Grab`);
    playGrabSfx();
    pulseHaptics('grab');
    if (part) part.maxPull = part.pull;
  }
  if (next === 'FacePartOverstretch') {
    const prefix = facePartSpeechPrefix(state.activePart?.key);
    sayFromPool(`${prefix}Strong`);
    playTensionSfx();
    pulseHaptics('tension');
  }
  if (next === 'FacePartReleaseSnap') {
    const part = activeFacePart();
    const prefix = facePartSpeechPrefix(state.activePart?.key);
    const power = part ? part.maxPull : 0.35;
    const partKey = partKeyForUi(state.activePart);
    const mouthPrimary = partKey === 'mouth';
    sayFromPool(`${prefix}Release`);
    playReleaseSfx(power * (mouthPrimary ? 0.96 : 0.82));
    pulseHaptics('release', power);
    state.releasePunch.age = 0;
    state.releasePunch.power = clamp(power * (mouthPrimary ? 0.86 : 0.72), 0.14, mouthPrimary ? 0.96 : 0.86);
    spawnFacePartReleaseBurst();
    const point = facePartRewardPoint();
    addSatisfaction(
      mouthPrimary ? 6 + power * 13 : 3 + power * 8,
      point.x,
      point.y,
      mouthPrimary ? '爽感' : '整活'
    );
    recordRelease(partKey, power, point.x, point.y);
  }
  if (next === 'FacePartSettle') {
    const part = activeFacePart();
    if (part && part.maxPull > 0.58) sayFromPool('settleSoft');
  }
}

function pickReleaseSuffix() {
  // 拉得越长，结束语越夸张（这里只是把 maxPullThisDrag 翻成短描述）
  if (state.maxPullThisDrag > 0.92) return '炸裂';
  if (state.maxPullThisDrag > 0.72) return '弹响';
  if (state.maxPullThisDrag > 0.4) return '收回';
  return null;
}

// ---------------------------------------------------------------------------
// 输入：命中判断 + 拖拽
// ---------------------------------------------------------------------------

function pointerToCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function hitTongue(point) {
  const anchor = currentRenderAnchor();
  // 优先命中舌尖圆
  const tipX = anchor.x + state.tip.x;
  const tipY = anchor.y + state.tip.y;
  const isTouch = state.pointer.kind === 'touch' || state.pointer.kind === 'pen';
  const hitScale = isTouch ? 1.45 : 1;
  if (length(point.x - tipX, point.y - tipY) <= config.tongueTipHitRadius * hitScale) {
    return { hit: true, snapToTip: true };
  }
  // 其次命中舌身胶囊：从 anchor 到 tip 的线段，半径取舌头当前宽度
  const ax = anchor.x;
  const ay = anchor.y;
  const dx = tipX - ax;
  const dy = tipY - ay;
  const len = length(dx, dy);
  if (len < config.restLength * 0.45) {
    // 舌头基本缩回去了，只能命中嘴部锚点
    const d = length(point.x - ax, point.y - ay);
    return { hit: d <= (config.mouthAnchorRadius + 18) * hitScale, snapToTip: true };
  }
  // 计算点到线段的距离
  const t = clamp(((point.x - ax) * dx + (point.y - ay) * dy) / (len * len), 0, 1);
  const px = ax + dx * t;
  const py = ay + dy * t;
  const segDist = length(point.x - px, point.y - py);
  const widthNow = lerp(config.widthRest, config.widthMin, easeOutQuad(state.pull));
  if (segDist <= (widthNow * 0.7 + 6) * hitScale) {
    return { hit: true, snapToTip: false, t };
  }
  // 磁吸：点附近 16px 内也算命中舌尖
  if (length(point.x - tipX, point.y - tipY) <= (config.tongueTipHitRadius + 16) * hitScale) {
    return { hit: true, snapToTip: true };
  }
  return { hit: false };
}

function hitCheek(point) {
  const pose = computeFacePose();
  let best = { hit: false, dist: Infinity, side: 0 };
  [-1, 1].forEach((side) => {
    const base = cheekBase(side, pose);
    const cheek = state.cheeks[cheekKey(side)];
    const cx = base.x + cheek.x;
    const cy = base.y + cheek.y;
    const isTouch = state.pointer.kind === 'touch' || state.pointer.kind === 'pen';
    const radius = config.cheekGrabRadius * (isTouch ? 1.28 : 1);
    const dist = length(point.x - cx, point.y - cy);
    if (dist <= radius && dist < best.dist) {
      best = { hit: true, dist, side };
    }
  });
  return best;
}

function hitMouthArea(point, pose = computeFacePose()) {
  const leftBase = facePartBase('mouthLeft', pose);
  const rightBase = facePartBase('mouthRight', pose);
  const left = state.faceParts.mouthLeft;
  const right = state.faceParts.mouthRight;
  const leftX = leftBase.x + left.x;
  const leftY = leftBase.y + left.y;
  const rightX = rightBase.x + right.x;
  const rightY = rightBase.y + right.y;
  const centerX = (leftX + rightX) * 0.5;
  const centerY = (leftY + rightY) * 0.5;
  const isTouch = state.pointer.kind === 'touch' || state.pointer.kind === 'pen';
  const halfW = Math.max(pose.r * 0.32, Math.abs(rightX - leftX) * 0.64);
  const halfH = pose.r * (isTouch ? 0.135 : 0.1);
  const nx = (point.x - centerX) / Math.max(1, halfW);
  const ny = (point.y - centerY) / Math.max(1, halfH);
  if (nx * nx + ny * ny > 1) return { hit: false };

  const key = point.x < centerX ? 'mouthLeft' : 'mouthRight';
  const handleX = key === 'mouthLeft' ? leftX : rightX;
  const handleY = key === 'mouthLeft' ? leftY : rightY;
  return {
    hit: true,
    dist: length(point.x - handleX, point.y - handleY),
    key,
    mouthArea: true
  };
}

function hitFacePart(point) {
  const pose = computeFacePose();
  const mouthHit = hitMouthArea(point, pose);
  if (mouthHit.hit) return mouthHit;

  let best = { hit: false, dist: Infinity, key: null };
  Object.keys(state.faceParts).forEach((key) => {
    const base = facePartBase(key, pose);
    const part = state.faceParts[key];
    const cx = base.x + part.x;
    const cy = base.y + part.y;
    const meta = facePartMeta(key);
    const isTouch = state.pointer.kind === 'touch' || state.pointer.kind === 'pen';
    const radius = meta.grabRadius * (isTouch ? 1.28 : 1);
    const dist = length(point.x - cx, point.y - cy);
    if (dist <= radius && dist < best.dist) {
      best = { hit: true, dist, key };
    }
  });
  return best;
}

function updateHoverPart(point) {
  if (state.pointer.active) {
    state.hoverPart = null;
    return;
  }

  const facePartHit = hitFacePart(point);
  if (facePartHit.hit) {
    state.hoverPart = { type: 'facePart', key: facePartHit.key };
    return;
  }

  const cheekHit = hitCheek(point);
  if (cheekHit.hit) {
    state.hoverPart = { type: 'cheek', side: cheekHit.side };
    return;
  }

  if (ENABLE_TONGUE_DRAG) {
    const tongueHit = hitTongue(point);
    if (tongueHit.hit) {
      state.hoverPart = { type: 'tongue', side: 0 };
      return;
    }
  }

  state.hoverPart = null;
}

function onPointerDown(event) {
  event.preventDefault();
  const point = pointerToCanvas(event);
  state.pointer = { x: point.x, y: point.y, active: true, kind: event.pointerType || 'mouse' };
  state.hoverPart = null;

  const facePartHit = hitFacePart(point);
  if (facePartHit.hit) {
    const part = state.faceParts[facePartHit.key];
    const base = facePartBase(facePartHit.key);
    state.activePart = { type: 'facePart', key: facePartHit.key };
    state.facePartDragOffset.x = base.x + part.x - point.x;
    state.facePartDragOffset.y = base.y + part.y - point.y;
    setPhase('FacePartGrabbed');
    canvas.classList.add('dragging');
    canvas.setPointerCapture(event.pointerId);
    hideGestureHint();
    updateFacePartTarget(point);
    return;
  }

  const cheekHit = hitCheek(point);
  if (cheekHit.hit) {
    const cheek = state.cheeks[cheekKey(cheekHit.side)];
    const base = cheekBase(cheekHit.side);
    state.activePart = { type: 'cheek', side: cheekHit.side };
    state.cheekDragOffset.x = base.x + cheek.x - point.x;
    state.cheekDragOffset.y = base.y + cheek.y - point.y;
    setPhase('CheekGrabbed');
    canvas.classList.add('dragging');
    canvas.setPointerCapture(event.pointerId);
    hideGestureHint();
    updateCheekTarget(point);
    return;
  }

  if (ENABLE_TONGUE_DRAG) {
    const result = hitTongue(point);
    if (result.hit) {
      state.activePart = { type: 'tongue', side: 0 };

      // 抓握偏移：如果点中舌身，把抓点稍微滑向舌尖 40%（§8）
      if (result.snapToTip) {
        state.dragOffset.x = 0;
        state.dragOffset.y = 0;
      } else {
        const anchor = currentRenderAnchor();
        const tipX = anchor.x + state.tip.x;
        const tipY = anchor.y + state.tip.y;
        const slideT = 0.4; // 从命中点向 tip 方向滑 40%
        const grabX = lerp(point.x, tipX, slideT);
        const grabY = lerp(point.y, tipY, slideT);
        state.dragOffset.x = tipX - grabX;
        state.dragOffset.y = tipY - grabY;
      }

      setPhase('Grabbed');
      canvas.classList.add('dragging');
      canvas.setPointerCapture(event.pointerId);
      hideGestureHint();
      updateDragTarget(point);
      return;
    }
  }

  state.pointer.active = false;
}

function onPointerMove(event) {
  const point = pointerToCanvas(event);
  state.pointer.x = point.x;
  state.pointer.y = point.y;
  state.pointer.kind = event.pointerType || state.pointer.kind || 'mouse';
  if (isTonguePhase()) {
    updateDragTarget(point);
  } else if (isCheekHoldPhase()) {
    updateCheekTarget(point);
  } else if (isFacePartHoldPhase()) {
    updateFacePartTarget(point);
  } else {
    updateHoverPart(point);
  }
}

function onPointerUp(event) {
  if (!state.pointer.active) return;
  state.pointer.active = false;
  canvas.classList.remove('dragging');
  if (isTonguePhase()) {
    // 给舌尖一个朝 anchor 的初速度（穿过 anchor 形成过冲）
    const dir = length(state.tip.x, state.tip.y);
    if (dir > 0) {
      const k = -1; // 反方向
      state.releaseDir.x = state.tip.x / dir;
      state.releaseDir.y = state.tip.y / dir;
      const speed = clamp(
        160 + state.maxPullThisDrag * config.releaseMaxSpeed * 0.42,
        80,
        config.releaseMaxSpeed
      );
      state.tip.vx = state.releaseDir.x * k * speed;
      state.tip.vy = state.releaseDir.y * k * speed;
    }
    setPhase('ReleaseSnap');
  } else if (isCheekHoldPhase()) {
    const cheek = activeCheek();
    if (cheek) {
      const dir = length(cheek.x, cheek.y);
      if (dir > 0) {
        state.cheekReleaseDir.x = cheek.x / dir;
        state.cheekReleaseDir.y = cheek.y / dir;
        const speed = clamp(
          150 + cheek.maxPull * config.cheekReleaseMaxSpeed * 0.38,
          90,
          config.cheekReleaseMaxSpeed
        );
        cheek.vx = -state.cheekReleaseDir.x * speed;
        cheek.vy = -state.cheekReleaseDir.y * speed;
      }
    }
    setPhase('CheekReleaseSnap');
  } else if (isFacePartHoldPhase()) {
    const part = activeFacePart();
    if (part) {
      const dir = length(part.x, part.y);
      if (dir > 0) {
        state.facePartReleaseDir.x = part.x / dir;
        state.facePartReleaseDir.y = part.y / dir;
        const speed = clamp(
          150 + part.maxPull * config.facePartReleaseMaxSpeed * 0.38,
          90,
          config.facePartReleaseMaxSpeed
        );
        part.vx = -state.facePartReleaseDir.x * speed;
        part.vy = -state.facePartReleaseDir.y * speed;
      }
    }
    setPhase('FacePartReleaseSnap');
  }
}

function onPointerLeave() {
  if (!state.pointer.active) {
    state.hoverPart = null;
  }
}

function updateDragTarget(point) {
  const anchor = currentRenderAnchor();
  // 目标舌尖 = 鼠标 + dragOffset，相对 anchor
  const desiredX = point.x + state.dragOffset.x - anchor.x;
  const desiredY = point.y + state.dragOffset.y - anchor.y;

  // 软上限：超过 softMaxLength 用 easeOutSine 缓慢追加，限制在 hardMax
  const rawLen = length(desiredX, desiredY);
  if (rawLen < 1) {
    state.target.x = 0;
    state.target.y = 0;
    return;
  }
  const dirX = desiredX / rawLen;
  const dirY = desiredY / rawLen;

  const response = clamp(config.stretchResponse, 0.2, 1);
  let finalLen;
  if (rawLen <= config.restLength) {
    finalLen = rawLen;
  } else if (rawLen <= config.softMaxLength) {
    const t = clamp(
      (rawLen - config.restLength) / Math.max(1, config.softMaxLength - config.restLength),
      0,
      1
    );
    const resistance = (rawLen - config.restLength) * (1 - response) * easeOutQuad(t) * 0.72;
    finalLen = rawLen - resistance;
  } else {
    const extra = rawLen - config.softMaxLength;
    const range = Math.max(40, config.hardMaxLength - config.softMaxLength);
    const overT = clamp(extra / (range * 1.6), 0, 1); // 越拉越难追
    const eased = easeOutSine(overT) * range;
    const resistedSoft = config.softMaxLength
      - (config.softMaxLength - config.restLength) * (1 - response) * 0.72;
    finalLen = Math.min(config.hardMaxLength, resistedSoft + eased);
  }
  state.target.x = dirX * finalLen;
  state.target.y = dirY * finalLen;
  state.dragIntent.x = dirX;
  state.dragIntent.y = dirY;
  state.dragIntent.rawLen = rawLen;
  state.dragIntent.finalLen = finalLen;
}

function updateCheekTarget(point) {
  const part = state.activePart;
  if (!part || part.type !== 'cheek') return;
  const cheek = state.cheeks[cheekKey(part.side)];
  const base = cheekBase(part.side);
  const desiredX = point.x + state.cheekDragOffset.x - base.x;
  const desiredY = point.y + state.cheekDragOffset.y - base.y;
  const rawLen = length(desiredX, desiredY);
  if (rawLen < 1) {
    cheek.targetX = 0;
    cheek.targetY = 0;
    return;
  }
  const dirX = desiredX / rawLen;
  const dirY = desiredY / rawLen;
  let finalLen;
  if (rawLen <= config.cheekSoftMaxLength) {
    const t = clamp(rawLen / config.cheekSoftMaxLength, 0, 1);
    finalLen = rawLen - rawLen * 0.24 * easeOutQuad(t);
  } else {
    const extra = rawLen - config.cheekSoftMaxLength;
    const range = Math.max(24, config.cheekHardMaxLength - config.cheekSoftMaxLength);
    finalLen = Math.min(
      config.cheekHardMaxLength,
      config.cheekSoftMaxLength * 0.76 + easeOutSine(clamp(extra / (range * 1.35), 0, 1)) * range
    );
  }
  cheek.targetX = dirX * finalLen;
  cheek.targetY = dirY * finalLen;
  state.dragIntent.x = dirX;
  state.dragIntent.y = dirY;
  state.dragIntent.rawLen = rawLen;
  state.dragIntent.finalLen = finalLen;
}

function updateFacePartTarget(point) {
  const active = state.activePart;
  if (!active || active.type !== 'facePart') return;
  const part = state.faceParts[active.key];
  const meta = facePartMeta(active.key);
  const base = facePartBase(active.key);
  const desiredX = point.x + state.facePartDragOffset.x - base.x;
  const desiredY = point.y + state.facePartDragOffset.y - base.y;
  const rawLen = length(desiredX, desiredY);
  if (rawLen < 1) {
    part.targetX = 0;
    part.targetY = 0;
    return;
  }
  const dirX = desiredX / rawLen;
  const dirY = desiredY / rawLen;
  let finalLen;
  if (rawLen <= meta.softMax) {
    const t = clamp(rawLen / meta.softMax, 0, 1);
    const resistance = active.key === 'nose' ? 0.18 : 0.22;
    finalLen = rawLen - rawLen * resistance * easeOutQuad(t);
  } else {
    const extra = rawLen - meta.softMax;
    const range = Math.max(20, meta.hardMax - meta.softMax);
    const baseResistance = active.key === 'nose' ? 0.82 : 0.78;
    finalLen = Math.min(
      meta.hardMax,
      meta.softMax * baseResistance + easeOutSine(clamp(extra / (range * 1.35), 0, 1)) * range
    );
  }
  part.targetX = dirX * finalLen;
  part.targetY = dirY * finalLen;
  state.dragIntent.x = dirX;
  state.dragIntent.y = dirY;
  state.dragIntent.rawLen = rawLen;
  state.dragIntent.finalLen = finalLen;
}

// ---------------------------------------------------------------------------
// 物理与状态推进
// ---------------------------------------------------------------------------

function getReleasePulse() {
  const duration = 0.34;
  if (state.releasePunch.age >= duration) return 0;
  const t = clamp(state.releasePunch.age / duration, 0, 1);
  return Math.sin(t * Math.PI) * (1 - t * 0.48) * state.releasePunch.power;
}

function update(dt) {
  // 上限保护
  dt = Math.min(dt, 1 / 30);
  state.releasePunch.age += dt;
  if (state.combo.timer > 0) {
    state.combo.timer = Math.max(0, state.combo.timer - dt);
  } else if (state.combo.count !== 0) {
    state.combo.count = 0;
  }
  if (state.fever.timer > 0) {
    state.fever.timer = Math.max(0, state.fever.timer - dt);
    if (state.fever.timer === 0) state.fever.level = 0;
  }
  if (state.runActive && state.gameMode === 'timed' && state.screen === 'playing') {
    state.runTimeLeft = Math.max(0, state.runTimeLeft - dt);
    if (state.runTimeLeft <= 0) {
      endRun();
    }
  }

  if (state.phase === 'Grabbed' || state.phase === 'Stretching' || state.phase === 'Overstretch') {
    // 跟随目标，使用 dragFollowLag 做指数趋近
    const k = 1 - Math.exp(-dt / Math.max(0.016, config.dragFollowLag));
    state.tip.x = lerp(state.tip.x, state.target.x, k);
    state.tip.y = lerp(state.tip.y, state.target.y, k);
    state.tip.vx = 0;
    state.tip.vy = 0;

    const len = length(state.tip.x, state.tip.y);
    state.pull = clamp(len / config.softMaxLength, 0, 1.4);
    state.overPull = clamp(
      (len - config.softMaxLength) / Math.max(1, config.hardMaxLength - config.softMaxLength),
      0,
      1
    );

    // 状态切换
    if (state.pull > config.thresholds.grabbedToStretch && state.phase === 'Grabbed') {
      setPhase('Stretching');
    }
    if (state.overPull > 0 && state.phase === 'Stretching') {
      setPhase('Overstretch');
    }
    if (state.overPull === 0 && state.phase === 'Overstretch' && state.pull < config.thresholds.overstretchExit) {
      setPhase('Stretching');
    }

    // 中度/强度文字
    if (state.pull > 0.45 && state.pull < 0.8) sayFromPool('mid');
    if (state.pull > 0.8 || state.overPull > 0) sayFromPool('strong');

    state.maxPullThisDrag = Math.max(state.maxPullThisDrag, state.pull);
  } else if (isCheekHoldPhase()) {
    const cheek = activeCheek();
    if (cheek) {
      const k = 1 - Math.exp(-dt / Math.max(0.016, config.cheekFollowLag));
      cheek.x = lerp(cheek.x, cheek.targetX, k);
      cheek.y = lerp(cheek.y, cheek.targetY, k);
      cheek.vx = 0;
      cheek.vy = 0;
      const len = length(cheek.x, cheek.y);
      cheek.pull = clamp(len / config.cheekSoftMaxLength, 0, 1.25);
      const over = clamp(
        (len - config.cheekSoftMaxLength) / Math.max(1, config.cheekHardMaxLength - config.cheekSoftMaxLength),
        0,
        1
      );

      if (cheek.pull > 0.04 && state.phase === 'CheekGrabbed') {
        setPhase('CheekStretching');
      }
      if (over > 0 && state.phase === 'CheekStretching') {
        setPhase('CheekOverstretch');
      }
      if (over === 0 && state.phase === 'CheekOverstretch' && cheek.pull < 0.9) {
        setPhase('CheekStretching');
      }
      if (cheek.pull > 0.42 && cheek.pull < 0.78) sayFromPool('cheekMid');
      if (cheek.pull > 0.82 || over > 0) sayFromPool('cheekStrong');
      cheek.maxPull = Math.max(cheek.maxPull, cheek.pull);
    }
  } else if (isFacePartHoldPhase()) {
    const part = activeFacePart();
    if (part) {
      const meta = facePartMeta(state.activePart.key);
      const k = 1 - Math.exp(-dt / Math.max(0.016, config.facePartFollowLag));
      part.x = lerp(part.x, part.targetX, k);
      part.y = lerp(part.y, part.targetY, k);
      part.vx = 0;
      part.vy = 0;
      const len = length(part.x, part.y);
      const rawPull = clamp(len / meta.softMax, 0, 1.25);
      part.pull = rawPull;
      const over = clamp((len - meta.softMax) / Math.max(1, meta.hardMax - meta.softMax), 0, 1);

      if (part.pull > 0.04 && state.phase === 'FacePartGrabbed') {
        setPhase('FacePartStretching');
      }
      if (over > 0 && state.phase === 'FacePartStretching') {
        setPhase('FacePartOverstretch');
      }
      if (over === 0 && state.phase === 'FacePartOverstretch' && part.pull < 0.9) {
        setPhase('FacePartStretching');
      }

      const prefix = facePartSpeechPrefix(state.activePart.key);
      if (part.pull > 0.42 && part.pull < 0.78) sayFromPool(`${prefix}Mid`);
      if (part.pull > 0.82 || over > 0) sayFromPool(`${prefix}Strong`);
      part.maxPull = Math.max(part.maxPull, part.pull);
    }
  } else if (state.phase === 'ReleaseSnap' || state.phase === 'Settle') {
    // 弹簧物理：朝 (0,0) 拉回
    const fx = -config.releaseSpring * state.tip.x - config.releaseDamping * state.tip.vx;
    const fy = -config.releaseSpring * state.tip.y - config.releaseDamping * state.tip.vy;
    state.tip.vx += fx * dt;
    state.tip.vy += fy * dt;
    const clamped = clampMag(state.tip.vx, state.tip.vy, config.releaseMaxSpeed);
    state.tip.vx = clamped.x;
    state.tip.vy = clamped.y;
    state.tip.x += state.tip.vx * dt;
    state.tip.y += state.tip.vy * dt;

    const len = length(state.tip.x, state.tip.y);
    state.pull = clamp(len / config.softMaxLength, 0, 1.4);
    state.overPull = 0;

    // 状态进展
    const sinceEnter = (performance.now() - state.phaseEnteredAt) / 1000;
    if (state.phase === 'ReleaseSnap') {
      const projection = state.tip.x * state.releaseDir.x + state.tip.y * state.releaseDir.y;
      // 主要回弹完成：按松手方向可控地穿过锚点后才进入余震。
      if (projection <= -config.releaseOvershoot || sinceEnter > 0.18) {
        setPhase('Settle');
      }
    } else if (state.phase === 'Settle') {
      const speed = length(state.tip.vx, state.tip.vy);
      if ((len < 1.2 && speed < 8) || sinceEnter > config.settleDuration + 0.15) {
        state.tip.x = 0;
        state.tip.y = 0;
        state.tip.vx = 0;
        state.tip.vy = 0;
        setPhase('Idle');
      }
    }
  } else if (isCheekReleasePhase()) {
    const cheek = activeCheek();
    if (cheek) {
      const fx = -config.cheekReleaseSpring * cheek.x - config.cheekReleaseDamping * cheek.vx;
      const fy = -config.cheekReleaseSpring * cheek.y - config.cheekReleaseDamping * cheek.vy;
      cheek.vx += fx * dt;
      cheek.vy += fy * dt;
      const clamped = clampMag(cheek.vx, cheek.vy, config.cheekReleaseMaxSpeed);
      cheek.vx = clamped.x;
      cheek.vy = clamped.y;
      cheek.x += cheek.vx * dt;
      cheek.y += cheek.vy * dt;
      const len = length(cheek.x, cheek.y);
      cheek.pull = clamp(len / config.cheekSoftMaxLength, 0, 1.25);

      const sinceEnter = (performance.now() - state.phaseEnteredAt) / 1000;
      if (state.phase === 'CheekReleaseSnap') {
        const projection = cheek.x * state.cheekReleaseDir.x + cheek.y * state.cheekReleaseDir.y;
        if (projection <= -config.cheekReleaseOvershoot || sinceEnter > 0.17) {
          setPhase('CheekSettle');
        }
      } else if (state.phase === 'CheekSettle') {
        const speed = length(cheek.vx, cheek.vy);
        if ((len < 1.1 && speed < 9) || sinceEnter > config.settleDuration + 0.16) {
          cheek.x = 0;
          cheek.y = 0;
          cheek.vx = 0;
          cheek.vy = 0;
          cheek.pull = 0;
          cheek.maxPull = 0;
          setPhase('Idle');
        }
      }
    } else {
      setPhase('Idle');
    }
  } else if (isFacePartReleasePhase()) {
    const part = activeFacePart();
    if (part) {
      const fx = -config.facePartReleaseSpring * part.x - config.facePartReleaseDamping * part.vx;
      const fy = -config.facePartReleaseSpring * part.y - config.facePartReleaseDamping * part.vy;
      part.vx += fx * dt;
      part.vy += fy * dt;
      const clamped = clampMag(part.vx, part.vy, config.facePartReleaseMaxSpeed);
      part.vx = clamped.x;
      part.vy = clamped.y;
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      const meta = facePartMeta(state.activePart.key);
      const len = length(part.x, part.y);
      part.pull = clamp(len / meta.softMax, 0, 1.25);

      const sinceEnter = (performance.now() - state.phaseEnteredAt) / 1000;
      if (state.phase === 'FacePartReleaseSnap') {
        const projection = part.x * state.facePartReleaseDir.x + part.y * state.facePartReleaseDir.y;
        if (projection <= -config.facePartReleaseOvershoot || sinceEnter > 0.17) {
          setPhase('FacePartSettle');
        }
      } else if (state.phase === 'FacePartSettle') {
        const speed = length(part.vx, part.vy);
        if ((len < 1.05 && speed < 9) || sinceEnter > config.settleDuration + 0.16) {
          part.x = 0;
          part.y = 0;
          part.vx = 0;
          part.vy = 0;
          part.pull = 0;
          part.maxPull = 0;
          setPhase('Idle');
        }
      }
    } else {
      setPhase('Idle');
    }
  } else {
    // Idle：呼吸 / 微摆
    state.idleTimer += dt;
    const sway = Math.sin(state.idleTimer * 1.8) * 1.8;
    state.tip.x = lerp(state.tip.x, 0, 0.18);
    const idleTongueLength = clamp(config.restLength * 0.18, 8, 14);
    state.tip.y = lerp(state.tip.y, idleTongueLength + sway * 0.16, 0.2);
    state.pull = 0;
    state.overPull = 0;
    [-1, 1].forEach((side) => {
      const cheek = state.cheeks[cheekKey(side)];
      cheek.x = lerp(cheek.x, 0, 0.2);
      cheek.y = lerp(cheek.y, 0, 0.2);
      cheek.vx = 0;
      cheek.vy = 0;
      cheek.pull = clamp(length(cheek.x, cheek.y) / config.cheekSoftMaxLength, 0, 1.25);
      if (cheek.pull < 0.01) cheek.maxPull = 0;
    });
    Object.values(state.faceParts).forEach((part) => {
      part.x = lerp(part.x, 0, 0.2);
      part.y = lerp(part.y, 0, 0.2);
      part.vx = 0;
      part.vy = 0;
      part.pull = 0;
      if (length(part.x, part.y) < 0.8) part.maxPull = 0;
    });
  }

  // 粒子
  updateParticles(dt);
  updateInteractionHud();

  // 调试面板 readout
  if (state.debugOpen) updateDebugReadout();
}

// ---------------------------------------------------------------------------
// 渲染入口
// ---------------------------------------------------------------------------

function loop() {
  const now = performance.now();
  const dt = (now - state.lastFrame) / 1000;
  state.lastFrame = now;
  state.frameTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function draw() {
  drawBackdrop();
  const pose = computeFacePose({ includeShake: true });
  state.renderMouthAnchor.x = pose.anchorX;
  state.renderMouthAnchor.y = pose.anchorY;
  drawFeverAura(pose);
  drawTongueShadow();
  drawFace(pose);
  drawMouthCavity(pose.cx, pose.cy, pose.r);
  drawTongueOver();
  drawMouthForeground(pose.cx, pose.cy, pose.r);
  drawDragTensionLine(pose);
  drawInteractionAura(pose);
  drawImpactRings();
  drawParticles();
  drawFloatingTexts();
  if (state.debugOpen) drawDebugOverlay(pose);
}

function drawBackdrop() {
  const w = state.width;
  const h = state.height;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#fffaf3');
  g.addColorStop(0.52, '#fff1e9');
  g.addColorStop(1, '#fdeeff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const wash = ctx.createLinearGradient(0, h * 0.18, w, h * 0.82);
  wash.addColorStop(0, 'rgba(158, 220, 248, 0.15)');
  wash.addColorStop(0.38, 'rgba(255, 255, 255, 0)');
  wash.addColorStop(1, 'rgba(255, 138, 167, 0.18)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  const centerGlow = ctx.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, Math.max(w, h) * 0.56);
  centerGlow.addColorStop(0, 'rgba(255,255,255,0.72)');
  centerGlow.addColorStop(0.46, 'rgba(255,255,255,0.18)');
  centerGlow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, w, h);

  const floorY = h - Math.max(120, h * 0.18);
  const floor = ctx.createLinearGradient(0, floorY, 0, h);
  floor.addColorStop(0, 'rgba(255, 238, 229, 0)');
  floor.addColorStop(0.4, 'rgba(255, 211, 207, 0.18)');
  floor.addColorStop(1, 'rgba(255, 185, 206, 0.18)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, floorY, w, h - floorY);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = 'rgba(90, 51, 82, 0.18)';
  ctx.lineWidth = 1.5;
  const step = Math.max(56, Math.min(w, h) * 0.12);
  for (let x = -step; x < w + step; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.12);
    ctx.quadraticCurveTo(x + step * 0.36, h * 0.2, x + step * 0.12, h * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFeverAura(pose) {
  if (state.fever.timer <= 0) return;
  const t = clamp(state.fever.timer / config.feverDuration, 0, 1);
  const pulse = (Math.sin((state.frameTime || performance.now()) * 0.018) + 1) * 0.5;
  const { cx, cy, r } = pose;
  ctx.save();
  ctx.globalAlpha = 0.16 + t * 0.18;
  ctx.translate(cx, cy);
  ctx.rotate((state.frameTime || performance.now()) * 0.00035);
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    const inner = r * (0.95 + pulse * 0.04);
    const outer = r * (1.28 + (i % 3) * 0.04);
    ctx.strokeStyle = i % 2 ? '#ff6f94' : '#49b7aa';
    ctx.lineWidth = Math.max(2, r * 0.012);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.28 + t * 0.14;
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 + pulse * 0.16;
    drawStar(Math.cos(a) * r * 1.16, Math.sin(a) * r * 1.08, r * (0.024 + (i % 2) * 0.01), i % 2 ? '#ffd56a' : '#9edcf8');
  }
  ctx.restore();
}

// 头部 + 脸部反馈
function drawFace(pose) {
  const { cx, cy, r } = pose;

  // 投影
  const shadow = ctx.createRadialGradient(cx, cy + r * 0.96, r * 0.04, cx, cy + r * 0.98, r * 0.92);
  shadow.addColorStop(0, 'rgba(105, 54, 74, 0.2)');
  shadow.addColorStop(0.58, 'rgba(105, 54, 74, 0.1)');
  shadow.addColorStop(1, 'rgba(105, 54, 74, 0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.98, r * 0.9, r * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  applyFaceSquash(cx, cy);
  drawEars(cx, cy, r);
  drawFallbackHead(cx, cy, r);
  drawCheekPulls(cx, cy, r);
  drawCheekTension(cx, cy, r);
  drawNose(cx, cy, r);
  drawEyes(cx, cy, r);
  drawEyebrows(cx, cy, r);
  drawHair(cx, cy, r);
  drawDecorations(cx, cy, r);
  ctx.restore();
}

function applyFaceSquash(cx, cy) {
  const pulse = getReleasePulse();
  if (pulse <= 0) return;
  ctx.translate(cx, cy);
  ctx.scale(1 + pulse * 0.055, 1 - pulse * 0.038);
  ctx.translate(-cx, -cy);
}

function drawMochiHeadPath(r) {
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.88);
  ctx.bezierCurveTo(-r * 0.58, -r * 0.88, -r * 0.94, -r * 0.54, -r * 0.94, r * 0.02);
  ctx.bezierCurveTo(-r * 0.94, r * 0.55, -r * 0.56, r * 0.86, 0, r * 0.87);
  ctx.bezierCurveTo(r * 0.56, r * 0.86, r * 0.94, r * 0.55, r * 0.94, r * 0.02);
  ctx.bezierCurveTo(r * 0.94, -r * 0.54, r * 0.58, -r * 0.88, 0, -r * 0.88);
  ctx.closePath();
}

function drawFallbackHead(x, y, r) {
  const vector = getExpressionVector();
  const dirLen = length(vector.x, vector.y) || 1;
  const dirX = vector.x / dirLen;
  const dirY = vector.y / dirLen;
  const pull = clamp(vector.pull, 0, 1);
  const stretchX = 0.985 + Math.abs(dirX) * pull * 0.05;
  const stretchY = 1.035 + Math.max(0, dirY) * pull * 0.026 - Math.abs(dirX) * pull * 0.014;

  const hx = x + dirX * pull * r * 0.025;
  const hy = y + dirY * pull * r * 0.018;

  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(stretchX, stretchY);
  const g = ctx.createRadialGradient(-r * 0.34, -r * 0.48, r * 0.08, r * 0.08, r * 0.08, r * 1.2);
  g.addColorStop(0, '#fff6d8');
  g.addColorStop(0.32, '#ffe5b4');
  g.addColorStop(0.72, '#f8ad76');
  g.addColorStop(1, '#df8460');
  ctx.fillStyle = g;
  drawMochiHeadPath(r);
  ctx.fill();

  ctx.clip();
  const crown = ctx.createRadialGradient(-r * 0.04, -r * 0.4, r * 0.08, -r * 0.04, -r * 0.15, r * 0.82);
  crown.addColorStop(0, 'rgba(255, 255, 222, 0.42)');
  crown.addColorStop(0.54, 'rgba(255, 255, 222, 0.1)');
  crown.addColorStop(1, 'rgba(255, 255, 222, 0)');
  ctx.fillStyle = crown;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  const lower = ctx.createLinearGradient(0, -r * 0.14, 0, r * 0.86);
  lower.addColorStop(0, 'rgba(255,255,255,0)');
  lower.addColorStop(0.68, 'rgba(180, 79, 72, 0.07)');
  lower.addColorStop(1, 'rgba(112, 52, 66, 0.12)');
  ctx.fillStyle = lower;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  const rim = ctx.createLinearGradient(-r, -r * 0.1, r, r * 0.6);
  rim.addColorStop(0, 'rgba(255, 141, 174, 0.16)');
  rim.addColorStop(0.24, 'rgba(255, 141, 174, 0)');
  rim.addColorStop(0.76, 'rgba(168, 75, 77, 0)');
  rim.addColorStop(1, 'rgba(168, 75, 77, 0.11)');
  ctx.fillStyle = rim;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  const cheekVolume = ctx.createRadialGradient(0, r * 0.16, r * 0.2, 0, r * 0.34, r * 0.95);
  cheekVolume.addColorStop(0, 'rgba(255, 236, 190, 0.16)');
  cheekVolume.addColorStop(0.58, 'rgba(255, 174, 122, 0.08)');
  cheekVolume.addColorStop(1, 'rgba(191, 82, 72, 0.08)');
  ctx.fillStyle = cheekVolume;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  ctx.strokeStyle = 'rgba(255, 248, 228, 0.62)';
  ctx.lineWidth = Math.max(9, r * 0.082);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-r * 0.2, -r * 0.19, r * 0.5, Math.PI * 1.02, Math.PI * 1.42);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = Math.max(3, r * 0.018);
  ctx.beginPath();
  ctx.arc(-r * 0.25, -r * 0.25, r * 0.32, Math.PI * 1.05, Math.PI * 1.38);
  ctx.stroke();

  ctx.restore();

  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(stretchX, stretchY);
  ctx.strokeStyle = 'rgba(111, 49, 66, 0.07)';
  ctx.lineWidth = Math.max(2, r * 0.012);
  drawMochiHeadPath(r);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  [-1, 1].forEach((side) => {
    const blush = ctx.createRadialGradient(x + side * r * 0.52, y + r * 0.18, r * 0.02, x + side * r * 0.52, y + r * 0.18, r * 0.2);
    blush.addColorStop(0, 'rgba(255, 104, 134, 0.36)');
    blush.addColorStop(0.62, 'rgba(255, 132, 142, 0.2)');
    blush.addColorStop(1, 'rgba(255, 132, 142, 0)');
    ctx.fillStyle = blush;
    ctx.beginPath();
    ctx.ellipse(x + side * r * 0.52, y + r * 0.18, r * 0.21, r * 0.095, side * 0.06, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawCheekTension(cx, cy, r) {
  const vector = getExpressionVector();
  const pull = clamp(vector.pull, 0, 1);
  if (pull < 0.2) return;
  const { mouthY, pullX } = mouthMetrics(cx, cy, r);
  const alpha = clamp((pull - 0.2) / 0.7, 0, 1) * 0.34;
  const lineCount = state.overPull > 0 ? 3 : 2;
  ctx.save();
  ctx.strokeStyle = `rgba(122, 52, 69, ${alpha})`;
  ctx.lineWidth = Math.max(2, r * 0.012);
  ctx.lineCap = 'round';
  for (let i = 0; i < lineCount; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const yOffset = (Math.floor(i / 2) - 0.5) * r * 0.1;
    ctx.beginPath();
    ctx.moveTo(cx + side * r * 0.23 + pullX * 0.26, mouthY + yOffset);
    ctx.quadraticCurveTo(
      cx + side * r * 0.38 + pullX * 0.18,
      mouthY + r * 0.05 + yOffset,
      cx + side * r * 0.55,
      cy + r * 0.13 + yOffset
    );
    ctx.stroke();
  }
  ctx.restore();
}

function drawCheekPulls(cx, cy, r) {
  [-1, 1].forEach((side) => {
    const cheek = state.cheeks[cheekKey(side)];
    const len = length(cheek.x, cheek.y);
    const baseX = cx + side * r * 0.55;
    const baseY = cy + r * 0.18;
    const active = state.activePart?.type === 'cheek' && state.activePart.side === side;
    const tipX = baseX + cheek.x;
    const tipY = baseY + cheek.y;

    if (len < 0.8) {
      // 轻微高光提示脸颊可互动，不打扰主画面。
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 246, 229, 0.42)';
      ctx.lineWidth = Math.max(2, r * 0.01);
      ctx.beginPath();
      ctx.arc(baseX - side * r * 0.03, baseY - r * 0.02, r * 0.085, 0.1, Math.PI * 0.9);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const dirX = cheek.x / len;
    const dirY = cheek.y / len;
    const nx = -dirY;
    const ny = dirX;
    const pull = clamp(len / config.cheekSoftMaxLength, 0, 1);
    const rootW = r * lerp(0.145, 0.105, pull);
    const tipW = r * lerp(0.105, 0.07, pull);
    const rootX = baseX + dirX * r * 0.015;
    const rootY = baseY + dirY * r * 0.015;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(rootX + nx * rootW, rootY + ny * rootW);
    ctx.bezierCurveTo(
      baseX + cheek.x * 0.34 + nx * rootW * 0.9,
      baseY + cheek.y * 0.34 + ny * rootW * 0.9,
      baseX + cheek.x * 0.78 + nx * tipW * 0.88,
      baseY + cheek.y * 0.78 + ny * tipW * 0.88,
      tipX + nx * tipW,
      tipY + ny * tipW
    );
    ctx.quadraticCurveTo(tipX + dirX * r * 0.055, tipY + dirY * r * 0.055, tipX - nx * tipW, tipY - ny * tipW);
    ctx.bezierCurveTo(
      baseX + cheek.x * 0.78 - nx * tipW * 0.88,
      baseY + cheek.y * 0.78 - ny * tipW * 0.88,
      baseX + cheek.x * 0.34 - nx * rootW * 0.9,
      baseY + cheek.y * 0.34 - ny * rootW * 0.9,
      rootX - nx * rootW,
      rootY - ny * rootW
    );
    ctx.closePath();
    ctx.fillStyle = `rgba(255, 127, 113, ${0.26 + pull * 0.18})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(122, 52, 69, ${0.18 + pull * 0.22})`;
    ctx.lineWidth = Math.max(2, r * 0.012);
    ctx.stroke();

    ctx.strokeStyle = `rgba(255, 246, 229, ${0.2 + pull * 0.2})`;
    ctx.lineWidth = Math.max(2, r * 0.01);
    ctx.beginPath();
    ctx.moveTo(baseX + cheek.x * 0.18 + nx * rootW * 0.35, baseY + cheek.y * 0.18 + ny * rootW * 0.35);
    ctx.quadraticCurveTo(
      baseX + cheek.x * 0.55 + nx * tipW * 0.3,
      baseY + cheek.y * 0.55 + ny * tipW * 0.3,
      tipX - dirX * tipW * 0.2 + nx * tipW * 0.28,
      tipY - dirY * tipW * 0.2 + ny * tipW * 0.28
    );
    ctx.stroke();

    ctx.fillStyle = active ? 'rgba(255,255,255,0.86)' : 'rgba(255,246,229,0.55)';
    ctx.beginPath();
    ctx.ellipse(tipX, tipY, Math.max(6, tipW * 0.42), Math.max(4, tipW * 0.24), Math.atan2(dirY, dirX), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawEars(cx, cy, r) {
  ['earLeft', 'earRight'].forEach((key) => {
    const base = facePartBase(key, { cx, cy, r });
    const part = state.faceParts[key];
    const len = length(part.x, part.y);
    const side = base.side;
    const x = base.x + part.x;
    const y = base.y + part.y;
    const pull = clamp(part.pull, 0, 1);

    ctx.save();
    if (len < 0.8) {
      const earX = base.x + side * r * 0.035;
      const earY = base.y + r * 0.004;
      const earG = ctx.createRadialGradient(earX - side * r * 0.04, earY - r * 0.04, r * 0.02, earX, earY, r * 0.22);
      earG.addColorStop(0, '#ffd0a2');
      earG.addColorStop(0.72, '#f4a06f');
      earG.addColorStop(1, '#de7e60');
      ctx.fillStyle = earG;
      ctx.beginPath();
      ctx.ellipse(earX, earY, r * 0.14, r * 0.18, side * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 226, 204, 0.5)';
      ctx.beginPath();
      ctx.ellipse(earX + side * r * 0.018, earY + r * 0.008, r * 0.062, r * 0.096, side * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(118, 50, 65, 0.1)';
      ctx.lineWidth = Math.max(1.5, r * 0.009);
      ctx.beginPath();
      ctx.ellipse(earX, earY, r * 0.14, r * 0.18, side * 0.08, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const dirX = part.x / len;
    const dirY = part.y / len;
    const nx = -dirY;
    const ny = dirX;
    const rootW = r * lerp(0.13, 0.1, pull);
    const tipW = r * lerp(0.12, 0.075, pull);
    ctx.beginPath();
    ctx.moveTo(base.x + nx * rootW, base.y + ny * rootW);
    ctx.bezierCurveTo(
      base.x + part.x * 0.32 + nx * rootW,
      base.y + part.y * 0.32 + ny * rootW,
      base.x + part.x * 0.76 + nx * tipW,
      base.y + part.y * 0.76 + ny * tipW,
      x + nx * tipW,
      y + ny * tipW
    );
    ctx.quadraticCurveTo(x + dirX * tipW * 0.72, y + dirY * tipW * 0.72, x - nx * tipW, y - ny * tipW);
    ctx.bezierCurveTo(
      base.x + part.x * 0.76 - nx * tipW,
      base.y + part.y * 0.76 - ny * tipW,
      base.x + part.x * 0.32 - nx * rootW,
      base.y + part.y * 0.32 - ny * rootW,
      base.x - nx * rootW,
      base.y - ny * rootW
    );
    ctx.closePath();
    ctx.fillStyle = `rgba(239, 159, 114, ${0.88 + pull * 0.08})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(122, 52, 69, ${0.16 + pull * 0.2})`;
    ctx.lineWidth = Math.max(2, r * 0.01);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 246, 229, 0.36)';
    ctx.beginPath();
    ctx.ellipse(x - dirX * tipW * 0.12, y - dirY * tipW * 0.12, tipW * 0.46, tipW * 0.28, Math.atan2(dirY, dirX), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawHair(cx, cy, r) {
  const part = state.faceParts.hairTop;
  const base = facePartBase('hairTop', { cx, cy, r });
  const len = length(part.x, part.y);
  const tipX = base.x + part.x;
  const tipY = base.y + part.y;
  const pull = clamp(part.pull, 0, 1);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#4a2b3a';
  ctx.fillStyle = '#4a2b3a';

  if (len < 0.8) {
    const strokeHair = (drawPath, width) => {
      ctx.save();
      ctx.shadowColor = 'rgba(55, 24, 38, 0.22)';
      ctx.shadowBlur = r * 0.025;
      ctx.shadowOffsetY = r * 0.014;
      ctx.strokeStyle = '#47283a';
      ctx.lineWidth = width;
      drawPath();
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(255, 224, 206, 0.2)';
      ctx.lineWidth = Math.max(2, width * 0.22);
      drawPath();
      ctx.stroke();
      ctx.restore();
    };
    const hairW = Math.max(9, r * 0.048);
    strokeHair(() => {
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.17, cy - r * 0.74);
      ctx.quadraticCurveTo(cx - r * 0.2, cy - r * 0.94, cx - r * 0.34, cy - r * 0.84);
    }, hairW);
    strokeHair(() => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.77);
      ctx.quadraticCurveTo(cx, cy - r * 0.97, cx, cy - r * 0.89);
    }, hairW * 0.96);
    strokeHair(() => {
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.17, cy - r * 0.74);
      ctx.quadraticCurveTo(cx + r * 0.2, cy - r * 0.94, cx + r * 0.34, cy - r * 0.84);
    }, hairW);
    ctx.restore();
    return;
  }

  const dirX = part.x / len;
  const dirY = part.y / len;
  const nx = -dirY;
  const ny = dirX;
  const rootW = r * lerp(0.07, 0.05, pull);
  const tipW = r * lerp(0.055, 0.035, pull);
  ctx.beginPath();
  ctx.moveTo(base.x + nx * rootW, base.y + ny * rootW);
  ctx.bezierCurveTo(
    base.x + part.x * 0.25 + nx * rootW * 0.65,
    base.y + part.y * 0.25 + ny * rootW * 0.65,
    base.x + part.x * 0.72 + nx * tipW,
    base.y + part.y * 0.72 + ny * tipW,
    tipX + nx * tipW,
    tipY + ny * tipW
  );
  ctx.quadraticCurveTo(tipX + dirX * tipW * 0.9, tipY + dirY * tipW * 0.9, tipX - nx * tipW, tipY - ny * tipW);
  ctx.bezierCurveTo(
    base.x + part.x * 0.72 - nx * tipW,
    base.y + part.y * 0.72 - ny * tipW,
    base.x + part.x * 0.25 - nx * rootW * 0.65,
    base.y + part.y * 0.25 - ny * rootW * 0.65,
    base.x - nx * rootW,
    base.y - ny * rootW
  );
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 246, 229, 0.24)';
  ctx.lineWidth = Math.max(2, r * 0.01);
  ctx.beginPath();
  ctx.moveTo(base.x + part.x * 0.15, base.y + part.y * 0.15);
  ctx.quadraticCurveTo(base.x + part.x * 0.55, base.y + part.y * 0.55, tipX - dirX * tipW * 0.35, tipY - dirY * tipW * 0.35);
  ctx.stroke();
  ctx.fillStyle = state.activePart?.key === 'hairTop' ? 'rgba(255,255,255,0.82)' : 'rgba(255,246,229,0.52)';
  ctx.beginPath();
  ctx.ellipse(tipX, tipY, Math.max(4, tipW * 0.38), Math.max(3, tipW * 0.26), Math.atan2(dirY, dirX), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDecorations(cx, cy, r) {
  if (state.decor.blush) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 91, 128, 0.32)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.56, cy + r * 0.2, r * 0.2, r * 0.08, -0.08, 0, Math.PI * 2);
    ctx.ellipse(cx + r * 0.56, cy + r * 0.2, r * 0.2, r * 0.08, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (state.decor.glasses) {
    ctx.save();
    const eyeY = cy - r * 0.16;
    ctx.strokeStyle = '#2b2030';
    ctx.lineWidth = Math.max(3, r * 0.018);
    ctx.beginPath();
    ctx.roundRect(cx - r * 0.5, eyeY - r * 0.14, r * 0.31, r * 0.25, r * 0.055);
    ctx.roundRect(cx + r * 0.19, eyeY - r * 0.14, r * 0.31, r * 0.25, r * 0.055);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.19, eyeY - r * 0.02);
    ctx.lineTo(cx + r * 0.19, eyeY - r * 0.02);
    ctx.stroke();
    ctx.restore();
  }

  if (state.decor.mustache) {
    ctx.save();
    const y = cy + r * 0.27;
    ctx.fillStyle = '#3d2430';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.1, y, r * 0.18, r * 0.055, -0.18, 0, Math.PI * 2);
    ctx.ellipse(cx + r * 0.1, y, r * 0.18, r * 0.055, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (state.decor.hat) {
    ctx.save();
    ctx.translate(cx, cy - r * 0.91);
    ctx.rotate(-0.08);
    ctx.fillStyle = '#49b7aa';
    ctx.beginPath();
    ctx.roundRect(-r * 0.46, -r * 0.04, r * 0.92, r * 0.11, r * 0.035);
    ctx.fill();
    ctx.fillStyle = '#4a2b3a';
    ctx.beginPath();
    ctx.roundRect(-r * 0.25, -r * 0.32, r * 0.5, r * 0.3, r * 0.055);
    ctx.fill();
    ctx.fillStyle = '#ffd56a';
    ctx.fillRect(-r * 0.25, -r * 0.1, r * 0.5, r * 0.055);
    ctx.restore();
  }

  if (state.decor.star) {
    ctx.save();
    drawStar(cx + r * 0.48, cy - r * 0.02, r * 0.055, '#ffd56a');
    drawStar(cx + r * 0.59, cy - r * 0.12, r * 0.034, '#49b7aa');
    ctx.restore();
  }

  if (state.decor.sparkle) {
    ctx.save();
    const t = (state.frameTime || performance.now()) * 0.003;
    [
      [cx - r * 0.46, cy - r * 0.42, 0],
      [cx + r * 0.42, cy - r * 0.48, 1.4],
      [cx + r * 0.58, cy + r * 0.12, 2.2]
    ].forEach(([x, y, phase]) => {
      const s = r * (0.025 + Math.sin(t + phase) * 0.006 + 0.012);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = Math.max(1.5, r * 0.008);
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s);
      ctx.lineTo(x, y + s);
      ctx.stroke();
    });
    ctx.restore();
  }
}

function drawStar(cx, cy, radius, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? radius : radius * 0.46;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawNose(cx, cy, r) {
  const part = state.faceParts.nose;
  const baseX = cx;
  const baseY = cy + r * 0.09;
  const len = length(part.x, part.y);
  const active = state.activePart?.type === 'facePart' && state.activePart.key === 'nose';

  ctx.save();
  if (len < 0.8) {
    const noseG = ctx.createRadialGradient(baseX - r * 0.018, baseY - r * 0.012, r * 0.008, baseX, baseY, r * 0.06);
    noseG.addColorStop(0, '#ffd2a8');
    noseG.addColorStop(0.62, '#f0a270');
    noseG.addColorStop(1, '#cf775e');
    ctx.fillStyle = 'rgba(122, 52, 69, 0.08)';
    ctx.beginPath();
    ctx.ellipse(baseX, baseY + r * 0.026, r * 0.054, r * 0.022, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = noseG;
    ctx.beginPath();
    ctx.ellipse(baseX, baseY + r * 0.004, r * 0.048, r * 0.038, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(118, 50, 55, 0.22)';
    ctx.beginPath();
    ctx.ellipse(baseX - r * 0.012, baseY + r * 0.01, r * 0.006, r * 0.004, -0.2, 0, Math.PI * 2);
    ctx.ellipse(baseX + r * 0.014, baseY + r * 0.01, r * 0.006, r * 0.004, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 245, 226, 0.62)';
    ctx.beginPath();
    ctx.ellipse(baseX - r * 0.016, baseY - r * 0.012, r * 0.014, r * 0.008, -0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const dirX = part.x / len;
  const dirY = part.y / len;
  const nx = -dirY;
  const ny = dirX;
  const pull = clamp(len / config.noseSoftMaxLength, 0, 1);
  const rootW = r * lerp(0.068, 0.052, pull);
  const tipW = r * lerp(0.078, 0.058, pull);
  const tipX = baseX + part.x;
  const tipY = baseY + part.y;

  ctx.beginPath();
  ctx.moveTo(baseX + nx * rootW, baseY + ny * rootW);
  ctx.bezierCurveTo(
    baseX + part.x * 0.34 + nx * rootW,
    baseY + part.y * 0.34 + ny * rootW,
    baseX + part.x * 0.74 + nx * tipW,
    baseY + part.y * 0.74 + ny * tipW,
    tipX + nx * tipW,
    tipY + ny * tipW
  );
  ctx.quadraticCurveTo(tipX + dirX * tipW * 0.85, tipY + dirY * tipW * 0.85, tipX - nx * tipW, tipY - ny * tipW);
  ctx.bezierCurveTo(
    baseX + part.x * 0.74 - nx * tipW,
    baseY + part.y * 0.74 - ny * tipW,
    baseX + part.x * 0.34 - nx * rootW,
    baseY + part.y * 0.34 - ny * rootW,
    baseX - nx * rootW,
    baseY - ny * rootW
  );
  ctx.closePath();
  ctx.fillStyle = `rgba(225, 125, 95, ${0.34 + pull * 0.18})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(122, 52, 69, ${0.22 + pull * 0.2})`;
  ctx.lineWidth = Math.max(2, r * 0.011);
  ctx.stroke();

  ctx.fillStyle = `rgba(255, 153, 120, ${0.24 + pull * 0.18})`;
  ctx.beginPath();
  ctx.ellipse(tipX + dirX * tipW * 0.22, tipY + dirY * tipW * 0.22, tipW * 0.72, tipW * 0.48, Math.atan2(dirY, dirX), 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255, 246, 229, ${0.24 + pull * 0.18})`;
  ctx.lineWidth = Math.max(2, r * 0.009);
  ctx.beginPath();
  ctx.moveTo(baseX + nx * rootW * 0.32, baseY + ny * rootW * 0.32);
  ctx.quadraticCurveTo(
    baseX + part.x * 0.52 + nx * tipW * 0.18,
    baseY + part.y * 0.52 + ny * tipW * 0.18,
    tipX - dirX * tipW * 0.28 + nx * tipW * 0.18,
    tipY - dirY * tipW * 0.28 + ny * tipW * 0.18
  );
  ctx.stroke();

  ctx.fillStyle = active ? 'rgba(255,255,255,0.84)' : 'rgba(255,246,229,0.58)';
  ctx.beginPath();
  ctx.ellipse(tipX - nx * tipW * 0.22, tipY - ny * tipW * 0.22, tipW * 0.34, tipW * 0.2, Math.atan2(dirY, dirX), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEyes(cx, cy, r) {
  const eyeY = cy - r * 0.17;
  const leftX = cx - r * 0.31;
  const rightX = cx + r * 0.31;

  // 眼神追舌尖
  const tipX = state.activePart?.type !== 'tongue' && state.pointer.active && state.activePart
    ? state.pointer.x
    : state.renderMouthAnchor.x + state.tip.x;
  const tipY = state.activePart?.type !== 'tongue' && state.pointer.active && state.activePart
    ? state.pointer.y
    : state.renderMouthAnchor.y + state.tip.y;
  const lookX = clamp((tipX - cx) / (r * 1.8), -1, 1) * config.eyeLookAmount;
  const lookY = clamp((tipY - cy) / (r * 1.8), -1, 1) * config.eyeLookAmount * 0.7;

  // 选择眼神表情
  const vector = getExpressionVector();
  let mode = 'neutral';
  if (vector.pull > 0.72 || vector.overPull > 0) mode = 'shock';
  else if (vector.pull > 0.16) mode = 'squint';

  const blink = getBlinkAmount();
  const eyeR = r * (mode === 'shock' ? 0.145 : 0.128);
  const eyeScaleY = mode === 'squint'
    ? 0.68
    : lerp(1, 0.08, blink);
  const pupilR = eyeR * (mode === 'shock' ? 0.55 : 0.5);

  ctx.save();

  if (eyeScaleY < 0.18) {
    ctx.strokeStyle = '#33213a';
    ctx.lineWidth = Math.max(3, r * 0.026);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leftX - eyeR * 0.88, eyeY);
    ctx.lineTo(leftX + eyeR * 0.88, eyeY);
    ctx.moveTo(rightX - eyeR * 0.88, eyeY);
    ctx.lineTo(rightX + eyeR * 0.88, eyeY);
    ctx.stroke();
    ctx.restore();
    return;
  }

  [leftX, rightX].forEach((eyeX) => {
    ctx.fillStyle = 'rgba(119, 62, 81, 0.08)';
    ctx.beginPath();
    ctx.ellipse(eyeX, eyeY + eyeR * 0.13, eyeR * 1.08, eyeR * 1.15 * eyeScaleY, 0, 0, Math.PI * 2);
    ctx.fill();

    const whiteG = ctx.createRadialGradient(eyeX - eyeR * 0.28, eyeY - eyeR * 0.38, eyeR * 0.12, eyeX, eyeY, eyeR * 1.28);
    whiteG.addColorStop(0, '#ffffff');
    whiteG.addColorStop(0.68, '#fffdf7');
    whiteG.addColorStop(1, '#eadbd5');
    ctx.fillStyle = whiteG;
    ctx.beginPath();
    ctx.ellipse(eyeX, eyeY, eyeR, eyeR * 1.08 * eyeScaleY, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(84, 32, 51, 0.12)';
    ctx.lineWidth = Math.max(1.4, r * 0.008);
    ctx.stroke();

    const irisX = eyeX + lookX;
    const irisY = eyeY + lookY * eyeScaleY;
    const irisG = ctx.createRadialGradient(irisX - pupilR * 0.24, irisY - pupilR * 0.28, pupilR * 0.08, irisX, irisY, pupilR * 1.1);
    irisG.addColorStop(0, '#6f5877');
    irisG.addColorStop(0.46, '#35283f');
    irisG.addColorStop(1, '#17101d');
    ctx.fillStyle = irisG;
    ctx.beginPath();
    ctx.ellipse(irisX, irisY, pupilR, pupilR * eyeScaleY, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(irisX + pupilR * 0.32, irisY - pupilR * 0.42 * eyeScaleY, pupilR * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    ctx.beginPath();
    ctx.arc(irisX - pupilR * 0.32, irisY + pupilR * 0.24 * eyeScaleY, pupilR * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 244, 220, 0.5)';
    ctx.lineWidth = Math.max(1.2, r * 0.007);
    ctx.beginPath();
    ctx.arc(eyeX - eyeR * 0.08, eyeY - eyeR * 0.06, eyeR * 0.72, Math.PI * 1.08, Math.PI * 1.52);
    ctx.stroke();

    if (mode === 'squint') {
      ctx.strokeStyle = 'rgba(75, 41, 57, 0.2)';
      ctx.lineWidth = Math.max(1.2, r * 0.007);
      ctx.beginPath();
      ctx.arc(eyeX, eyeY - eyeR * 0.08, eyeR * 0.9, Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
    }
  });

  ctx.restore();
}

function getBlinkAmount() {
  if (state.pointer.active || state.phase !== 'Idle') return 0;
  const cycle = 3.4;
  const t = state.idleTimer % cycle;
  if (t > 0.12) return 0;
  return Math.sin((t / 0.12) * Math.PI);
}

function drawEyebrows(cx, cy, r) {
  const vector = getExpressionVector();
  const lift = vector.pull * config.eyebrowLiftAmount;
  const tilt = vector.overPull * 0.35; // 八字眉
  const leftX = cx - r * 0.31;
  const rightX = cx + r * 0.31;
  const browY = cy - r * 0.37 - lift;
  ctx.strokeStyle = '#3f2637';
  ctx.lineWidth = Math.max(4, r * 0.028);
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(leftX - r * 0.13, browY + r * 0.006 + tilt * 5);
  ctx.quadraticCurveTo(leftX, browY - r * 0.018, leftX + r * 0.13, browY + r * 0.004 - tilt * 4);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(rightX - r * 0.13, browY + r * 0.004 - tilt * 4);
  ctx.quadraticCurveTo(rightX, browY - r * 0.018, rightX + r * 0.13, browY + r * 0.006 + tilt * 5);
  ctx.stroke();
}

function mouthMetrics(cx, cy, r) {
  const mouthY = cy + r * 0.335;
  // 嘴巴朝当前主拉扯方向变形。
  const vector = getExpressionVector();
  const dirLen = length(vector.x, vector.y) || 1;
  const pullX = (vector.x / dirLen) * vector.pull * config.mouthDeformAmount;
  const tongueLift = state.activePart?.type === 'tongue' || state.phase === 'ReleaseSnap' || state.phase === 'Settle'
    ? 0.012
    : 0;
  const tongueMode = state.activePart?.type === 'tongue' || isTonguePhase() || state.phase === 'ReleaseSnap' || state.phase === 'Settle';
  const openMax = tongueMode ? r * 0.118 : r * 0.205;
  const open = lerp(r * (0.06 + tongueLift), openMax, clamp(vector.pull, 0, 1)) + getReleasePulse() * r * 0.026;
  const left = state.faceParts.mouthLeft;
  const right = state.faceParts.mouthRight;
  const leftCorner = {
    x: cx - r * 0.24 + pullX * 0.12 + left.x,
    y: mouthY - open * 0.06 + left.y
  };
  const rightCorner = {
    x: cx + r * 0.24 + pullX * 0.12 + right.x,
    y: mouthY - open * 0.06 + right.y
  };
  const cornerPull = Math.max(left.pull, right.pull);
  const cornerCenterX = (left.x + right.x) * 0.18;
  const cornerCenterY = (left.y + right.y) * 0.12;
  return { mouthY, pullX, open, leftCorner, rightCorner, cornerPull, cornerCenterX, cornerCenterY, tongueMode };
}

function mouthOpeningGeometry(cx, r, metrics) {
  const vector = getExpressionVector();
  const pull = clamp(vector.pull, 0, 1);
  const t = easeOutQuad(pull);
  const tongueMode = Boolean(metrics.tongueMode);
  return {
    x: cx + metrics.pullX * 0.32 + metrics.cornerCenterX,
    y: metrics.mouthY + metrics.open * lerp(tongueMode ? -0.22 : -0.12, tongueMode ? -0.03 : 0.04, t) + metrics.cornerCenterY,
    w: r * lerp(tongueMode ? 0.132 : 0.17, tongueMode ? 0.182 : 0.235, t),
    h: r * lerp(tongueMode ? 0.022 : 0.04, tongueMode ? 0.074 : 0.15, t) + getReleasePulse() * r * (tongueMode ? 0.007 : 0.014),
    pull
  };
}

function drawMouthOpeningPath(x, y, w, h, pull = 0) {
  const topLift = lerp(0.22, 0.06, pull);
  const lowerRound = lerp(0.72, 0.9, pull);
  ctx.beginPath();
  ctx.moveTo(x - w, y - h * topLift);
  ctx.bezierCurveTo(
    x - w * 0.82,
    y - h * 0.98,
    x + w * 0.82,
    y - h * 0.98,
    x + w,
    y - h * topLift
  );
  ctx.bezierCurveTo(
    x + w * 0.96,
    y + h * lowerRound,
    x - w * 0.96,
    y + h * lowerRound,
    x - w,
    y - h * topLift
  );
  ctx.closePath();
}

const EXPORTED_MOUTH_ASSETS = {
  mouthUpperDark: 'M174 290c24-18 52-26 82-26s58 8 82 26c-20 13-47 21-82 21s-62-8-82-21Z',
  mouthUpperWarm: 'M193 291c20-10 41-15 63-15s43 5 63 15c-19 7-40 10-63 10s-44-3-63-10Z',
  mouthLowerDark: 'M186 321c18 26 43 39 70 39s52-13 70-39c-22 13-45 19-70 19s-48-6-70-19Z',
  mouthLowerWarm: 'M204 324c16 14 33 21 52 21s36-7 52-21c-18 7-35 10-52 10s-34-3-52-10Z',
  tongueOuter: 'M226 310c0-21 12-36 30-36s30 15 30 36v70c0 31-13 50-30 50s-30-19-30-50v-70Z',
  tongueInner: 'M256 292c10 0 17 9 17 23v62c0 20-7 32-17 32s-17-12-17-32v-62c0-14 7-23 17-23Z',
  tongueHighlight: 'M252 309h8v92h-8z'
};

const exportedPathCache = {};

function exportedPath(key) {
  if (!exportedPathCache[key]) exportedPathCache[key] = new Path2D(EXPORTED_MOUTH_ASSETS[key]);
  return exportedPathCache[key];
}

function drawExportedPath(key, fillStyle, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = fillStyle;
  ctx.fill(exportedPath(key));
  ctx.restore();
}

function exportedMouthPose(cx, r, metrics) {
  const geom = mouthOpeningGeometry(cx, r, metrics);
  const pull = clamp(geom.pull, 0, 1);
  return {
    x: geom.x,
    y: geom.y - r * 0.002,
    sx: r * lerp(0.0023, 0.00272, easeOutQuad(pull)),
    sy: r * lerp(0.00118, 0.00195, easeOutQuad(pull)),
    pull
  };
}

function useExportedRestMouth(pull) {
  return pull < 0.18 && !isTonguePhase();
}

function useIdleSmileMouth(pull) {
  return state.phase === 'Idle' && !state.activePart && pull < 0.08;
}

function withExportedMouthTransform(pose, draw) {
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.scale(pose.sx, pose.sy);
  ctx.translate(-256, -300);
  draw();
  ctx.restore();
}

function drawExportedMouthBase(pose) {
  withExportedMouthTransform(pose, () => {
    drawExportedPath('mouthLowerDark', '#8b3d4d', 0.68);
    drawExportedPath('mouthLowerWarm', '#f7af91', 0.48);
    drawExportedPath('mouthUpperDark', '#7a3445', 0.92);
    drawExportedPath('mouthUpperWarm', '#f39a76', 0.34);
  });
}

function drawExportedMouthForeground(pose) {
  withExportedMouthTransform(pose, () => {
    drawExportedPath('mouthUpperDark', '#5a2338', 0.96);
    drawExportedPath('mouthUpperWarm', '#f39a76', 0.22);
  });
}

function drawIdleSmileMouthBase(cx, r, metrics) {
  const x = cx + metrics.cornerCenterX;
  const y = metrics.mouthY - r * 0.006 + metrics.cornerCenterY;
  const w = r * 0.225;
  const h = r * 0.105;

  ctx.save();
  ctx.fillStyle = 'rgba(108, 47, 67, 0.045)';
  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.52, w * 0.92, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  const slot = ctx.createLinearGradient(x, y + h * 0.02, x, y + h * 0.86);
  slot.addColorStop(0, 'rgba(38, 11, 29, 0.72)');
  slot.addColorStop(0.58, 'rgba(82, 28, 51, 0.58)');
  slot.addColorStop(1, 'rgba(138, 61, 78, 0.3)');
  ctx.fillStyle = slot;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.64, y + h * 0.12);
  ctx.quadraticCurveTo(x, y + h * 0.28, x + w * 0.64, y + h * 0.12);
  ctx.quadraticCurveTo(x, y + h * 0.86, x - w * 0.64, y + h * 0.12);
  ctx.closePath();
  ctx.fill();

  const blush = ctx.createLinearGradient(x, y - h, x, y + h);
  blush.addColorStop(0, 'rgba(255, 211, 188, 0)');
  blush.addColorStop(1, 'rgba(255, 145, 141, 0.1)');
  ctx.strokeStyle = blush;
  ctx.lineWidth = Math.max(1.6, r * 0.01);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - w * 0.72, y + h * 0.19);
  ctx.quadraticCurveTo(x, y + h * 0.62, x + w * 0.72, y + h * 0.19);
  ctx.stroke();
  ctx.restore();
}

function drawIdleSmileMouthForeground(cx, r, mouthY, cornerCenterX, cornerCenterY) {
  const x = cx + cornerCenterX;
  const y = mouthY - r * 0.006 + cornerCenterY;
  const w = r * 0.242;
  const h = r * 0.105;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(54, 18, 39, 0.82)';
  ctx.lineWidth = Math.max(2.4, r * 0.013);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.7, y + h * 0.1);
  ctx.quadraticCurveTo(x, y + h * 0.28, x + w * 0.7, y + h * 0.1);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(92, 35, 55, 0.42)';
  ctx.lineWidth = Math.max(1.7, r * 0.008);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.5, y + h * 0.55);
  ctx.quadraticCurveTo(x, y + h * 0.78, x + w * 0.5, y + h * 0.55);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 218, 190, 0.45)';
  ctx.lineWidth = Math.max(1, r * 0.0045);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.38, y + h * 0.6);
  ctx.quadraticCurveTo(x, y + h * 0.72, x + w * 0.38, y + h * 0.6);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 160, 148, 0.16)';
  ctx.beginPath();
  ctx.ellipse(x - w * 0.9, y + h * 0.06, r * 0.02, r * 0.011, -0.15, 0, Math.PI * 2);
  ctx.ellipse(x + w * 0.9, y + h * 0.06, r * 0.02, r * 0.011, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMouthCavity(cx, cy, r) {
  const metrics = mouthMetrics(cx, cy, r);
  const { x, y, w, h, pull } = mouthOpeningGeometry(cx, r, metrics);
  const tongueMode = Boolean(metrics.tongueMode);
  if (useIdleSmileMouth(pull)) {
    drawIdleSmileMouthBase(cx, r, metrics);
    return;
  }
  if (useExportedRestMouth(pull)) {
    drawExportedMouthBase(exportedMouthPose(cx, r, metrics));
    return;
  }

  ctx.save();

  ctx.fillStyle = `rgba(92, 34, 54, ${tongueMode ? 0.055 + pull * 0.035 : 0.1 + pull * 0.08})`;
  ctx.beginPath();
  ctx.ellipse(x, y + h * (tongueMode ? 0.38 : 0.46), w * (tongueMode ? 0.95 : 1.08), h * (tongueMode ? 0.42 : 0.56), 0, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createRadialGradient(
    x - w * 0.08,
    y - h * 0.16,
    h * 0.12,
    x,
    y + h * 0.08,
    Math.max(w, h) * 1.08
  );
  if (tongueMode) {
    g.addColorStop(0, '#2b1126');
    g.addColorStop(0.58, '#52253f');
    g.addColorStop(1, '#8a405f');
  } else {
    g.addColorStop(0, '#1c0b19');
    g.addColorStop(0.58, '#42203a');
    g.addColorStop(1, '#71324f');
  }
  ctx.fillStyle = g;
  drawMouthOpeningPath(x, y, w, h, pull);
  ctx.fill();

  const inner = ctx.createLinearGradient(x, y - h, x, y + h);
  inner.addColorStop(0, `rgba(255, 225, 214, ${tongueMode ? 0.16 : 0.1})`);
  inner.addColorStop(0.55, `rgba(23, 7, 19, ${tongueMode ? 0.04 : 0.08})`);
  inner.addColorStop(1, `rgba(16, 5, 15, ${tongueMode ? 0.18 : 0.34})`);
  ctx.fillStyle = inner;
  drawMouthOpeningPath(x, y, w * 0.86, h * 0.78, pull);
  ctx.fill();

  ctx.strokeStyle = `rgba(65, 22, 41, ${tongueMode ? 0.52 : 0.68})`;
  ctx.lineWidth = Math.max(2, r * (tongueMode ? 0.011 : 0.014));
  drawMouthOpeningPath(x, y, w, h, pull);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 213, 194, ${tongueMode ? 0.26 + pull * 0.05 : 0.34 + pull * 0.08})`;
  ctx.lineWidth = Math.max(1.4, r * 0.007);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - w * 0.62, y - h * 0.35);
  ctx.quadraticCurveTo(x, y - h * 0.68, x + w * 0.62, y - h * 0.35);
  ctx.stroke();
  ctx.restore();
}

function drawMouthForeground(cx, cy, r) {
  const { mouthY, pullX, open, leftCorner, rightCorner, cornerPull, cornerCenterX, cornerCenterY, tongueMode } = mouthMetrics(cx, cy, r);
  const mouthCornerActive = state.activePart?.key === 'mouthLeft'
    || state.activePart?.key === 'mouthRight'
    || cornerPull > 0.035;

  drawCleanMouthForeground(cx, mouthY, r, open, pullX, cornerCenterX, cornerCenterY, tongueMode);
  if (!mouthCornerActive) return;

  ctx.save();
  drawMouthCornerHints(cx, cy, r);
  ctx.restore();
}

function drawCleanMouthForeground(cx, mouthY, r, open, pullX, cornerCenterX, cornerCenterY, tongueMode = false) {
  const geom = mouthOpeningGeometry(cx, r, { mouthY, open, pullX, cornerCenterX, cornerCenterY, tongueMode });
  const { x, y, w, h, pull } = geom;
  if (useIdleSmileMouth(pull)) {
    drawIdleSmileMouthForeground(cx, r, mouthY, cornerCenterX, cornerCenterY);
    return;
  }
  if (useExportedRestMouth(pull)) {
    drawExportedMouthForeground(exportedMouthPose(cx, r, { mouthY, open, pullX, cornerCenterX, cornerCenterY, tongueMode }));
    return;
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = `rgba(58, 20, 39, ${0.48 + pull * 0.12})`;
  ctx.lineWidth = Math.max(1.8, r * 0.011);
  drawMouthOpeningPath(x, y, w * 1.01, h * 1.01, pull);
  ctx.stroke();

  const lowerGlow = ctx.createLinearGradient(x, y - h * 0.2, x, y + h * 1.05);
  lowerGlow.addColorStop(0, 'rgba(255, 190, 176, 0)');
  lowerGlow.addColorStop(1, `rgba(255, 160, 146, ${0.2 + pull * 0.1})`);
  ctx.strokeStyle = lowerGlow;
  ctx.lineWidth = Math.max(2, r * 0.012);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.78, y + h * 0.28);
  ctx.quadraticCurveTo(x, y + h * 0.72, x + w * 0.78, y + h * 0.28);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 239, 219, ${0.18 + pull * 0.06})`;
  ctx.lineWidth = Math.max(1.2, r * 0.006);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.54, y - h * 0.42);
  ctx.quadraticCurveTo(x - w * 0.08, y - h * 0.58, x + w * 0.4, y - h * 0.45);
  ctx.stroke();

  if (tongueMode) {
    const lipG = ctx.createLinearGradient(x, y - h * 0.5, x, y + h * 1.4);
    lipG.addColorStop(0, 'rgba(255, 220, 190, 0.28)');
    lipG.addColorStop(0.54, 'rgba(113, 45, 62, 0.28)');
    lipG.addColorStop(1, 'rgba(255, 188, 154, 0.3)');
    ctx.strokeStyle = lipG;
    ctx.lineWidth = Math.max(4, r * 0.026);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.8, y + h * 0.06);
    ctx.quadraticCurveTo(x, y + h * 0.68, x + w * 0.8, y + h * 0.06);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(61, 22, 42, 0.62)';
    ctx.lineWidth = Math.max(2, r * 0.012);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.72, y - h * 0.32);
    ctx.quadraticCurveTo(x, y - h * 0.54, x + w * 0.72, y - h * 0.32);
    ctx.stroke();
  }

  ctx.restore();
}

function drawMouthCornerHints(cx, cy, r) {
  const shouldShow = state.activePart?.key === 'mouthLeft'
    || state.activePart?.key === 'mouthRight'
    || state.faceParts.mouthLeft.pull > 0.04
    || state.faceParts.mouthRight.pull > 0.04;
  if (!shouldShow) return;

  const pose = { cx, cy, r };
  ['mouthLeft', 'mouthRight'].forEach((key) => {
    const base = facePartBase(key, pose);
    const part = state.faceParts[key];
    const active = state.activePart?.type === 'facePart' && state.activePart.key === key;
    const pull = clamp(part.pull, 0, 1);
    const x = base.x + part.x;
    const y = base.y + part.y;
    ctx.save();
    ctx.fillStyle = active ? 'rgba(255,255,255,0.86)' : `rgba(255,246,229,${0.18 + pull * 0.24})`;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(3, r * 0.018), Math.max(2, r * 0.012), part.x * 0.015, 0, Math.PI * 2);
    ctx.fill();
    if (active || pull > 0.08) {
      ctx.strokeStyle = `rgba(122,52,69,${0.22 + pull * 0.28})`;
      ctx.lineWidth = Math.max(2, r * 0.009);
      ctx.beginPath();
      ctx.arc(x - Math.sign(base.side || 1) * r * 0.014, y, r * (0.034 + pull * 0.018), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function interactionPoint(part, pose = computeFacePose()) {
  if (!part) return null;
  if (part.type === 'tongue') {
    return {
      x: pose.anchorX + state.tip.x,
      y: pose.anchorY + state.tip.y
    };
  }
  if (part.type === 'cheek') {
    const cheek = state.cheeks[cheekKey(part.side)];
    const base = cheekBase(part.side, pose);
    return {
      x: base.x + cheek.x,
      y: base.y + cheek.y
    };
  }
  if (part.type === 'facePart' && part.key) {
    const facePart = state.faceParts[part.key];
    const base = facePartBase(part.key, pose);
    return {
      x: base.x + facePart.x,
      y: base.y + facePart.y
    };
  }
  return null;
}

function interactionRadius(part) {
  if (!part) return 0;
  if (part.type === 'tongue') return Math.max(20, config.widthRest * 0.72);
  if (part.type === 'cheek') return config.cheekGrabRadius * 0.42;
  if (part.type === 'facePart') return facePartMeta(part.key).grabRadius * 0.48;
  return 0;
}

function interactionPull(part) {
  if (!part) return 0;
  if (part.type === 'tongue') return state.pull;
  if (part.type === 'cheek') return state.cheeks[cheekKey(part.side)].pull;
  if (part.type === 'facePart') return state.faceParts[part.key].pull;
  return 0;
}

function drawDragTensionLine(pose) {
  if (!state.pointer.active || !state.activePart) return;
  if (state.activePart.type === 'tongue') return;
  const point = interactionPoint(state.activePart, pose);
  if (!point) return;
  const dx = state.pointer.x - point.x;
  const dy = state.pointer.y - point.y;
  const dist = length(dx, dy);
  if (dist < 10) return;

  const pull = clamp(interactionPull(state.activePart), 0, 1.1);
  const alpha = clamp((dist - 10) / 110, 0, 1) * (0.28 + pull * 0.28);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([5, 9]);
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(state.pointer.x, state.pointer.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = `rgba(255, 111, 148, ${alpha * 0.72})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(state.pointer.x, state.pointer.y);
  ctx.stroke();
  ctx.restore();
}

function drawInteractionAura(pose) {
  const part = state.activePart || state.hoverPart;
  if (!part) return;
  const point = interactionPoint(part, pose);
  if (!point) return;

  const active = Boolean(state.activePart);
  const pull = clamp(interactionPull(part), 0, 1.15);
  const pulse = (Math.sin((state.frameTime || performance.now()) * 0.009) + 1) * 0.5;
  const tongueActive = part.type === 'tongue' && active;
  if (tongueActive) return;
  const radius = tongueActive
    ? interactionRadius(part) * 0.34 + pull * 5 + pulse * 1.6
    : interactionRadius(part) * (active ? 0.82 : 0.68) + pull * 10 + pulse * 3;
  const alpha = tongueActive ? 0.22 : active ? 0.62 : 0.36;

  ctx.save();
  ctx.lineWidth = active ? 3 : 2;
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.fillStyle = `rgba(255, 255, 255, ${tongueActive ? 0.025 : active ? 0.08 : 0.045})`;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 111, 148, ${alpha * 0.55})`;
  ctx.lineWidth = active ? 1.8 : 1.2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * (0.62 + pulse * 0.08), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 舌头阴影（在脸下面那层）
function drawTongueShadow() {
  const len = length(state.tip.x, state.tip.y);
  if (!shouldDrawFullTongue(len)) return;
  if (len < config.restLength * 0.32) return;
  drawTongueShape({ shadow: true });
}

// 舌头主体（在脸上面那层）
function drawTongueOver() {
  drawTongueShape({ shadow: false });
}

function drawTongueShape({ shadow }) {
  const anchorX = state.renderMouthAnchor.x;
  const anchorY = state.renderMouthAnchor.y;
  const dx = state.tip.x;
  const dy = state.tip.y;
  const len = length(dx, dy);
  if (!shouldDrawFullTongue(len)) {
    if (shadow) return;
    drawIdleTongueNub(anchorX, anchorY);
    return;
  }
  if (len < 1) return;

  // 方向 + 法线
  const dirX = dx / len;
  const dirY = dy / len;
  const nx = -dirY;
  const ny = dirX;
  const rootEmbed = Math.min(config.tongueRootInset * 0.35 + len * 0.012, 8);
  const ax = anchorX - dirX * rootEmbed;
  const ay = anchorY - dirY * rootEmbed;
  let tipX = anchorX + state.tip.x;
  let tipY = anchorY + state.tip.y;
  const releaseShakeT = state.phase === 'Settle'
    ? clamp(1 - (performance.now() - state.phaseEnteredAt) / Math.max(1, config.settleDuration * 1000), 0, 1)
    : 0;
  const overstretchT = clamp(state.overPull, 0, 1);
  const shakeAmount = state.phase === 'Overstretch'
    ? config.microShakeAmount + overstretchT * config.overstretchShakeAmount * 0.45
    : config.microShakeAmount * releaseShakeT;
  if (shakeAmount > 0) {
    const t = (state.frameTime || performance.now()) * 0.06;
    tipX += nx * Math.sin(t) * shakeAmount;
    tipY += ny * Math.sin(t * 1.13) * shakeAmount;
  }

  // 弯曲：左右偏移
  const pull = state.pull;
  const pointerSide = state.pointer.active
    ? ((state.pointer.x - tipX) * nx + (state.pointer.y - tipY) * ny) * 0.28
    : 0;
  const gravityBend = ny * config.maxBend * 0.12 * (1 - clamp(pull, 0, 1) * 0.35);
  const now = state.frameTime || performance.now();
  const bendBase = Math.sin(now * 0.006) * 4.6 * (1 - pull * 0.55);
  const organicBend = Math.sin(now * 0.003 + len * 0.015) * (2.5 + pull * 8.5);
  const bend = clamp(pointerSide + gravityBend + bendBase + organicBend, -config.maxBend, config.maxBend) * (0.5 + pull * 0.72);

  // 控制点（§7 简化公式）
  const visibleDx = tipX - ax;
  const visibleDy = tipY - ay;
  const c1x = ax + visibleDx * 0.28 + nx * bend * 0.5;
  const c1y = ay + visibleDy * 0.28 + ny * bend * 0.5;
  const c2x = ax + visibleDx * 0.68 - nx * bend * 0.9;
  const c2y = ay + visibleDy * 0.68 - ny * bend * 0.9;

  // 宽度：根 → 中 → 尖 三段，越拉越细
  const speed = length(state.tip.vx, state.tip.vy);
  const snapT = state.phase === 'ReleaseSnap' ? clamp(speed / config.releaseMaxSpeed, 0, 1) : 0;
  const widthScale = 1 + snapT * config.releaseSquashAmount;
  const wRoot = lerp(config.widthRest * 1.08, config.widthMin * 1.9, easeOutQuad(pull)) * widthScale;
  const wMid = lerp(config.widthRest * 0.82, config.widthMin * 1.18, easeOutCubic(pull)) * widthScale;
  const wTip = lerp(config.widthRest * 0.72, config.widthMin * 1.62, easeOutCubic(pull)) * (1 + snapT * config.releaseSquashAmount * 0.72);

  if (shadow) {
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 22, 44, 0.035)';
    ctx.lineWidth = Math.max(5, wMid * 0.58);
    ctx.lineCap = 'butt';
    ctx.shadowColor = 'rgba(80, 22, 44, 0.035)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.moveTo(ax, ay + 5);
    ctx.bezierCurveTo(c1x, c1y + 5, c2x, c2y + 5, tipX, tipY + 5);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 主体：用 12 段沿曲线的梯形手动画，实现可变宽度
  const segs = 18;
  const points = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const p = cubicPoint(ax, ay, c1x, c1y, c2x, c2y, tipX, tipY, t);
    const waist = Math.sin(t * Math.PI);
    const baseWidth = t < 0.58
      ? lerp(wRoot, wMid, easeOutSine(t / 0.58))
      : lerp(wMid, wTip, easeOutQuad((t - 0.58) / 0.42));
    const w = baseWidth * (1 + waist * 0.06 * (1 - clamp(pull, 0, 1)) - waist * 0.08 * clamp(pull, 0, 1));
    // 当前段法线
    const pNear = cubicPoint(
      ax,
      ay,
      c1x,
      c1y,
      c2x,
      c2y,
      tipX,
      tipY,
      i === segs ? Math.max(0, t - 0.01) : Math.min(1, t + 0.01)
    );
    const tx = i === segs ? p.x - pNear.x : pNear.x - p.x;
    const ty = i === segs ? p.y - pNear.y : pNear.y - p.y;
    const tl = Math.hypot(tx, ty) || 1;
    const ntx = tx / tl;
    const nty = ty / tl;
    const lnx = -nty;
    const lny = ntx;
    points.push({ x: p.x, y: p.y, nx: lnx, ny: lny, tx: ntx, ty: nty, w });
  }

  // 填充粉色舌身
  ctx.save();
  const bodyPath = new Path2D();
  for (let i = 0; i <= segs; i += 1) {
    const pt = points[i];
    const x = pt.x + pt.nx * pt.w * 0.5;
    const y = pt.y + pt.ny * pt.w * 0.5;
    if (i === 0) bodyPath.moveTo(x, y);
    else bodyPath.lineTo(x, y);
  }
  const tipPoint = points[segs];
  const tipRound = tipPoint.w * lerp(0.42, 0.32, clamp(pull, 0, 1));
  bodyPath.bezierCurveTo(
    tipPoint.x + tipPoint.nx * tipPoint.w * 0.5 + tipPoint.tx * tipRound,
    tipPoint.y + tipPoint.ny * tipPoint.w * 0.5 + tipPoint.ty * tipRound,
    tipPoint.x - tipPoint.nx * tipPoint.w * 0.5 + tipPoint.tx * tipRound,
    tipPoint.y - tipPoint.ny * tipPoint.w * 0.5 + tipPoint.ty * tipRound,
    tipPoint.x - tipPoint.nx * tipPoint.w * 0.5,
    tipPoint.y - tipPoint.ny * tipPoint.w * 0.5
  );
  for (let i = segs - 1; i >= 0; i -= 1) {
    const pt = points[i];
    const x = pt.x - pt.nx * pt.w * 0.5;
    const y = pt.y - pt.ny * pt.w * 0.5;
    bodyPath.lineTo(x, y);
  }
  const rootPoint = points[0];
  const rootRound = rootPoint.w * 0.42;
  bodyPath.bezierCurveTo(
    rootPoint.x - rootPoint.nx * rootPoint.w * 0.5 - rootPoint.tx * rootRound,
    rootPoint.y - rootPoint.ny * rootPoint.w * 0.5 - rootPoint.ty * rootRound,
    rootPoint.x + rootPoint.nx * rootPoint.w * 0.5 - rootPoint.tx * rootRound,
    rootPoint.y + rootPoint.ny * rootPoint.w * 0.5 - rootPoint.ty * rootRound,
    rootPoint.x + rootPoint.nx * rootPoint.w * 0.5,
    rootPoint.y + rootPoint.ny * rootPoint.w * 0.5
  );
  bodyPath.closePath();

  const grd = ctx.createLinearGradient(ax + nx * wRoot * 0.35, ay + ny * wRoot * 0.35, tipX - nx * wTip * 0.4, tipY - ny * wTip * 0.4);
  grd.addColorStop(0, state.overPull > 0 ? '#f15383' : '#ff7aa0');
  grd.addColorStop(0.42, state.overPull > 0 ? '#ee3f78' : '#ff5f8c');
  grd.addColorStop(0.76, state.overPull > 0 ? '#d2356c' : '#ff7fa3');
  grd.addColorStop(1, state.overPull > 0 ? '#bf2f66' : '#ff9ab4');
  ctx.fillStyle = grd;
  ctx.fill(bodyPath);

  const rootFold = ctx.createRadialGradient(ax, ay - wRoot * 0.08, 0, ax, ay + wRoot * 0.12, wRoot * 0.9);
  rootFold.addColorStop(0, 'rgba(80, 18, 42, 0.18)');
  rootFold.addColorStop(0.48, 'rgba(255, 110, 150, 0.08)');
  rootFold.addColorStop(1, 'rgba(255, 110, 150, 0)');
  ctx.save();
  ctx.clip(bodyPath);
  ctx.fillStyle = rootFold;
  ctx.beginPath();
  ctx.ellipse(ax, ay + wRoot * 0.14, wRoot * 0.58, wRoot * 0.34, Math.atan2(dirY, dirX), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const sideShade = ctx.createLinearGradient(ax - nx * wRoot, ay - ny * wRoot, ax + nx * wRoot, ay + ny * wRoot);
  sideShade.addColorStop(0, 'rgba(122, 28, 62, 0.12)');
  sideShade.addColorStop(0.34, 'rgba(122, 28, 62, 0)');
  sideShade.addColorStop(0.7, 'rgba(255, 232, 239, 0.14)');
  sideShade.addColorStop(1, 'rgba(255, 232, 239, 0.22)');
  ctx.fillStyle = sideShade;
  ctx.fill(bodyPath);

  ctx.strokeStyle = state.overPull > 0 ? 'rgba(126, 22, 58, 0.48)' : 'rgba(147, 42, 76, 0.26)';
  ctx.lineWidth = Math.max(1.2, wMid * 0.055);
  ctx.lineJoin = 'round';
  ctx.stroke(bodyPath);

  // 中线柔光
  ctx.beginPath();
  for (let i = 0; i <= segs; i += 1) {
    const pt = points[i];
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = 'rgba(255, 218, 230, 0.42)';
  ctx.lineWidth = Math.max(1.4, wTip * 0.12);
  ctx.stroke();

  drawTongueSurfaceDetails(points, pull);

  // 紧绷时的尖端火花，使用确定性摆动，避免整条舌头随机闪烁。
  if (state.overPull > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      const t = (state.frameTime || performance.now()) * 0.018 + i * 2.1;
      const ox = Math.sin(t) * (7 + i * 2);
      const oy = Math.cos(t * 1.27) * (5 + i);
      ctx.beginPath();
      ctx.moveTo(tipX + ox, tipY + oy);
      ctx.lineTo(tipX + ox * 0.36, tipY + oy * 0.36);
      ctx.stroke();
    }
  }

  // 舌尖高光只做贴面处理，不再额外画圆球。
  const tipAngle = Math.atan2(tipPoint.ty, tipPoint.tx) + Math.PI / 2;
  ctx.fillStyle = 'rgba(255, 239, 244, 0.34)';
  ctx.beginPath();
  ctx.ellipse(
    tipPoint.x + tipPoint.nx * tipPoint.w * 0.16 - tipPoint.tx * tipPoint.w * 0.1,
    tipPoint.y + tipPoint.ny * tipPoint.w * 0.16 - tipPoint.ty * tipPoint.w * 0.1,
    Math.max(2, wTip * 0.12),
    Math.max(1.3, wTip * 0.07),
    tipAngle,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

function shouldDrawFullTongue(len) {
  if (isTonguePhase()) return true;
  if (state.phase === 'ReleaseSnap' || state.phase === 'Settle') return len >= config.restLength * 0.38;
  if (state.phase === 'Idle') return len >= config.restLength * 0.38;
  return false;
}

function drawTongueSurfaceDetails(points, pull) {
  const tension = clamp((pull - 0.16) / 0.84, 0, 1);
  const wetAlpha = 0.08 + tension * 0.06;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 侧向湿润高光会随着拉伸变细，帮助玩家读出“橡皮感”。
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    points.forEach((pt, index) => {
      const taper = index / Math.max(1, points.length - 1);
      const offset = pt.w * lerp(0.2, 0.1, taper) * side;
      const x = pt.x + pt.nx * offset;
      const y = pt.y + pt.ny * offset;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = `rgba(255, 238, 244, ${wetAlpha})`;
    ctx.lineWidth = Math.max(1, points[0].w * 0.035);
    ctx.stroke();
  });

  ctx.beginPath();
  points.slice(1, -1).forEach((pt, index) => {
    const taper = index / Math.max(1, points.length - 3);
    const offset = pt.w * lerp(0.06, 0.02, taper);
    const x = pt.x + pt.nx * offset;
    const y = pt.y + pt.ny * offset;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = `rgba(255, 213, 226, ${0.18 + tension * 0.08})`;
  ctx.lineWidth = Math.max(1, points[0].w * 0.026);
  ctx.stroke();

  const tip = points[points.length - 1];
  const beforeTip = points[Math.max(0, points.length - 4)];
  const forkAlpha = 0.18 + tension * 0.1;
  ctx.strokeStyle = `rgba(134, 29, 69, ${0.12 + tension * 0.12})`;
  ctx.lineWidth = Math.max(1.2, tip.w * 0.052);
  ctx.beginPath();
  ctx.moveTo(beforeTip.x, beforeTip.y);
  ctx.quadraticCurveTo(
    lerp(beforeTip.x, tip.x, 0.62),
    lerp(beforeTip.y, tip.y, 0.62),
    tip.x - tip.nx * tip.w * 0.08,
    tip.y - tip.ny * tip.w * 0.08
  );
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 230, 239, ${forkAlpha})`;
  ctx.lineWidth = Math.max(1, tip.w * 0.034);
  [-1, 1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(lerp(beforeTip.x, tip.x, 0.72), lerp(beforeTip.y, tip.y, 0.72));
    ctx.quadraticCurveTo(
      tip.x + tip.nx * tip.w * 0.08 * side,
      tip.y + tip.ny * tip.w * 0.08 * side,
      tip.x + tip.nx * tip.w * 0.28 * side,
      tip.y + tip.ny * tip.w * 0.28 * side
    );
    ctx.stroke();
  });

  if (tension > 0.68) {
    const marks = [0.5, 0.72];
    const markT = clamp((tension - 0.56) / 0.44, 0, 1);
    ctx.strokeStyle = `rgba(120, 28, 62, ${0.025 + markT * 0.055})`;
    ctx.lineWidth = Math.max(1, points[0].w * 0.018);
    marks.forEach((t, index) => {
      const pt = points[Math.min(points.length - 1, Math.max(0, Math.round(t * (points.length - 1))))];
      const wobble = Math.sin((state.frameTime || performance.now()) * 0.006 + index) * pt.w * 0.045 * tension;
      const span = pt.w * lerp(0.1, 0.18, tension);
      ctx.beginPath();
      ctx.moveTo(pt.x - pt.nx * span + pt.ny * wobble, pt.y - pt.ny * span - pt.nx * wobble);
      ctx.quadraticCurveTo(pt.x + pt.ny * wobble, pt.y - pt.nx * wobble, pt.x + pt.nx * span + pt.ny * wobble, pt.y + pt.ny * span - pt.nx * wobble);
      ctx.stroke();
    });
  }

  ctx.restore();
}

function drawIdleTongueNub(ax, ay) {
  // 待机舌头藏进嘴缝里，只露出一个软软的可拖拽提示。
  const tucked = state.phase !== 'Idle';
  const now = state.frameTime || performance.now();
  const idleT = state.idleTimer;
  if (!tucked) {
    drawIdleTongueInsideMouth(ax, ay, idleT);
    return;
  }
  const vector = getExpressionVector();
  const facePull = state.activePart?.type === 'tongue' ? 0 : clamp(vector.pull, 0, 1);
  const idleBreath = state.phase === 'Idle' ? (Math.sin(idleT * 2.25) + 1) * 0.5 : 0;
  const faceFlutter = facePull > 0.05 ? Math.sin(now * 0.024) * facePull : 0;
  const side = tucked
    ? faceFlutter * 2.6 + clamp(vector.x / Math.max(1, state.headRadius), -1, 1) * facePull * 2.2
    : Math.sin(idleT * 3.6) * 0.35;
  const r = state.headRadius;
  const rootY = ay - r * 0.038;
  const tipY = ay + r * (0.006 + idleBreath * 0.002);
  const x = ax + side;
  const rootHalf = r * (tucked ? 0.044 : 0.052);
  const bellyHalf = r * (tucked ? 0.056 : 0.062);
  const tipHalf = r * (tucked ? 0.044 : 0.036);

  ctx.save();
  if (!tucked) {
    ctx.beginPath();
    ctx.ellipse(ax, ay - r * 0.004, r * 0.108, r * 0.028, 0, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.shadowColor = 'rgba(86, 27, 52, 0.08)';
  ctx.shadowBlur = r * 0.008;
  ctx.shadowOffsetY = r * 0.004;

  ctx.beginPath();
  ctx.moveTo(x - rootHalf, rootY);
  ctx.bezierCurveTo(
    x - bellyHalf,
    ay - r * 0.01,
    x - tipHalf,
    tipY - r * 0.01,
    x - tipHalf * 0.36,
    tipY + r * 0.004
  );
  ctx.quadraticCurveTo(x, tipY + r * 0.03, x + tipHalf * 0.36, tipY + r * 0.004);
  ctx.bezierCurveTo(
    x + tipHalf,
    tipY - r * 0.01,
    x + bellyHalf,
    ay - r * 0.01,
    x + rootHalf,
    rootY
  );
  ctx.quadraticCurveTo(x, rootY - r * 0.024, x - rootHalf, rootY);
  ctx.closePath();

  const g = ctx.createLinearGradient(x - bellyHalf, rootY, x + bellyHalf, tipY);
  g.addColorStop(0, '#ff7ca0');
  g.addColorStop(0.5, '#ff5f8f');
  g.addColorStop(1, '#ff86a8');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  ctx.strokeStyle = 'rgba(142, 38, 74, 0.26)';
  ctx.lineWidth = Math.max(1.2, r * 0.009);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 222, 232, 0.58)';
  ctx.lineWidth = Math.max(1.2, r * 0.009);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, ay - r * 0.018);
  ctx.quadraticCurveTo(x + side * 0.03, ay - r * 0.006, x, tipY - r * 0.012);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 236, 242, 0.58)';
  ctx.beginPath();
  ctx.ellipse(x - bellyHalf * 0.2, ay - r * 0.01, bellyHalf * 0.1, r * 0.006, -0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawIdleTongueInsideMouth(ax, ay, idleT) {
  const r = state.headRadius;
  const x = ax + Math.sin(idleT * 3.2) * 0.22;
  const y = ay + r * 0.014;
  const breath = (Math.sin(idleT * 2.15) + 1) * 0.5;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ax - r * 0.086, ay - r * 0.001);
  ctx.quadraticCurveTo(ax, ay + r * 0.018, ax + r * 0.086, ay - r * 0.001);
  ctx.quadraticCurveTo(ax, ay + r * 0.054, ax - r * 0.086, ay - r * 0.001);
  ctx.closePath();
  ctx.clip();

  const g = ctx.createLinearGradient(x - r * 0.05, y - r * 0.018, x + r * 0.05, y + r * 0.022);
  g.addColorStop(0, '#ff7fa1');
  g.addColorStop(0.58, '#ff5f91');
  g.addColorStop(1, '#ff92ad');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + r * (0.001 + breath * 0.0015), r * 0.046, r * 0.02, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 226, 236, 0.56)';
  ctx.lineWidth = Math.max(1, r * 0.004);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.012);
  ctx.lineTo(x, y + r * 0.016);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 238, 244, 0.58)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.02, y - r * 0.004, r * 0.012, r * 0.005, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function cubicPoint(x0, y0, x1, y1, x2, y2, x3, y3, t) {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: x0 * b0 + x1 * b1 + x2 * b2 + x3 * b3,
    y: y0 * b0 + y1 * b1 + y2 * b2 + y3 * b3
  };
}

// ---------------------------------------------------------------------------
// 粒子（松手爆点）
// ---------------------------------------------------------------------------

function spawnReleaseBurst() {
  const n = Math.round(config.particleAmount * (0.4 + state.maxPullThisDrag * 0.9));
  const anchor = currentRenderAnchor();
  const tipX = anchor.x + state.tip.x;
  const tipY = anchor.y + state.tip.y;
  const x = lerp(tipX, anchor.x, 0.35);
  const y = lerp(tipY, anchor.y, 0.35);
  state.impactRings.push({
    x,
    y,
    age: 0,
    life: 0.38,
    power: clamp(state.maxPullThisDrag, 0.18, 1.15)
  });
  for (let i = 0; i < n; i += 1) {
    const baseA = Math.atan2(-state.releaseDir.y, -state.releaseDir.x);
    const a = baseA + (Math.random() - 0.5) * Math.PI * 0.95;
    const s = 110 + Math.random() * 260;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      age: 0,
      life: 0.4 + Math.random() * 0.4,
      size: 2 + Math.random() * 4,
      color: i % 2 ? '#ff7f71' : '#ffd56a'
    });
  }
}

function spawnCheekReleaseBurst() {
  const part = state.activePart;
  const cheek = activeCheek();
  if (!part || !cheek) return;
  const base = cheekBase(part.side);
  const x = base.x + cheek.x * 0.72;
  const y = base.y + cheek.y * 0.72;
  const power = clamp(cheek.maxPull, 0.18, 1.1);
  state.impactRings.push({
    x,
    y,
    age: 0,
    life: 0.34,
    power: power * 0.72
  });
  const n = Math.round(config.particleAmount * (0.25 + power * 0.5));
  for (let i = 0; i < n; i += 1) {
    const baseA = Math.atan2(-state.cheekReleaseDir.y, -state.cheekReleaseDir.x);
    const a = baseA + (Math.random() - 0.5) * Math.PI * 0.9;
    const s = 80 + Math.random() * 210;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      age: 0,
      life: 0.32 + Math.random() * 0.32,
      size: 2 + Math.random() * 3.5,
      color: i % 2 ? '#ff7f71' : '#ffd6a4'
    });
  }
}

function spawnFacePartReleaseBurst() {
  const active = state.activePart;
  const part = activeFacePart();
  if (!active || !part) return;
  const base = facePartBase(active.key);
  const x = base.x + part.x * 0.74;
  const y = base.y + part.y * 0.74;
  const power = clamp(part.maxPull, 0.18, 1.1);
  state.impactRings.push({
    x,
    y,
    age: 0,
    life: 0.32,
    power: power * 0.64
  });
  const n = Math.round(config.particleAmount * (0.2 + power * 0.45));
  for (let i = 0; i < n; i += 1) {
    const baseA = Math.atan2(-state.facePartReleaseDir.y, -state.facePartReleaseDir.x);
    const a = baseA + (Math.random() - 0.5) * Math.PI * 0.85;
    const s = 70 + Math.random() * 190;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      age: 0,
      life: 0.28 + Math.random() * 0.28,
      size: 1.8 + Math.random() * 3,
      color: active.key === 'nose'
        ? (i % 2 ? '#ffad68' : '#ff7f71')
        : (i % 2 ? '#ff6f94' : '#ffd56a')
    });
  }
}

function updateParticles(dt) {
  state.impactRings.forEach((ring) => {
    ring.age += dt;
  });
  state.impactRings = state.impactRings.filter((ring) => ring.age < ring.life).slice(-4);
  state.floatingTexts.forEach((item) => {
    item.age += dt;
    item.y += item.vy * dt;
    item.vy *= 0.96;
  });
  state.floatingTexts = state.floatingTexts.filter((item) => item.age < item.life).slice(-8);
  state.particles.forEach((p) => {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy = p.vy * 0.94 + 240 * dt;
  });
  state.particles = state.particles.filter((p) => p.age < p.life).slice(-80);
}

function drawImpactRings() {
  if (!state.impactRings.length) return;
  ctx.save();
  state.impactRings.forEach((ring) => {
    const t = clamp(ring.age / ring.life, 0, 1);
    const radius = lerp(18, 86, easeOutCubic(t)) * ring.power;
    const alpha = (1 - t) * 0.5;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = lerp(10, 1.5, t);
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff6f94';
    ctx.lineWidth = lerp(4, 1, t);
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();
}

function drawParticles() {
  if (!state.particles.length) return;
  ctx.save();
  state.particles.forEach((p) => {
    const a = clamp(1 - p.age / p.life, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.7 + a * 0.3), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawFloatingTexts() {
  if (!state.floatingTexts.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
  state.floatingTexts.forEach((item) => {
    const t = clamp(item.age / item.life, 0, 1);
    ctx.globalAlpha = (1 - t) * 0.96;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 250, 243, 0.82)';
    ctx.strokeText(item.text, item.x, item.y);
    ctx.fillStyle = '#4a2b3a';
    ctx.fillText(item.text, item.x, item.y);
  });
  ctx.restore();
}

function drawDebugOverlay() {
  const ax = state.renderMouthAnchor.x;
  const ay = state.renderMouthAnchor.y;
  const tx = ax + state.tip.x;
  const ty = ay + state.tip.y;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(73, 183, 170, 0.62)';
  ctx.beginPath();
  ctx.arc(ax, ay, config.softMaxLength, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 111, 148, 0.45)';
  ctx.beginPath();
  ctx.arc(ax, ay, config.hardMaxLength, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#49b7aa';
  ctx.beginPath();
  ctx.arc(ax, ay, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff6f94';
  ctx.beginPath();
  ctx.arc(tx, ty, 5, 0, Math.PI * 2);
  ctx.fill();

  if (state.pointer.active) {
    ctx.strokeStyle = 'rgba(54, 35, 58, 0.34)';
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(state.pointer.x, state.pointer.y);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Speech bubble / gesture hint
// ---------------------------------------------------------------------------

function sayFromPool(pool, opts = {}) {
  const now = performance.now() / 1000;
  const cooldown = SPEECH_COOLDOWN[pool] || 1;
  const last = state.lastSpeech[pool] || -999;
  if (now - last < cooldown) return;
  const arr = SPEECH_POOL[pool];
  if (!arr || !arr.length) return;
  let pick = arr[Math.floor(Math.random() * arr.length)];
  // 8 秒内不重复同一句
  if (pick === state.lastSpoken && arr.length > 1) {
    pick = arr[(arr.indexOf(pick) + 1) % arr.length];
  }
  if (opts.suffix) pick += ` ${opts.suffix}`;
  state.lastSpeech[pool] = now;
  state.lastSpoken = pick;
  showSpeech(pick);
}

let speechTimer = 0;
function showSpeech(text) {
  speechBubbleEl.textContent = text;
  speechBubbleEl.classList.add('show');
  clearTimeout(speechTimer);
  speechTimer = window.setTimeout(() => {
    speechBubbleEl.classList.remove('show');
  }, 850);
}

function hideGestureHint() {
  if (state.hintHidden) return;
  state.hintHidden = true;
  gestureHintEl.classList.add('hide');
}

// ---------------------------------------------------------------------------
// 调参面板（?debug=1 或点击右上齿轮）
// ---------------------------------------------------------------------------

function buildDebugPanel() {
  debugControlsEl.innerHTML = '';
  DEBUG_FIELDS.forEach((field) => {
    const wrap = document.createElement('div');
    wrap.className = 'debug-control';
    const label = document.createElement('label');
    label.textContent = field.label;
    label.htmlFor = `dbg-${field.key}`;
    const out = document.createElement('output');
    out.textContent = String(config[field.key]);
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `dbg-${field.key}`;
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step);
    input.value = String(config[field.key]);
    input.addEventListener('input', () => {
      config[field.key] = Number(input.value);
      out.textContent = input.value;
      if (field.key === 'headRadiusRatio' || field.key === 'headCenterYRatio' || field.key === 'mouthAnchorYRatio') {
        fitCanvas();
      }
      state.debugDirty = true;
    });
    wrap.append(label, out, input);
    debugControlsEl.appendChild(wrap);
  });
}

function updateDebugReadout() {
  const lines = [
    `phase     : ${state.phase}`,
    `part      : ${state.activePart ? `${state.activePart.type}:${state.activePart.side}` : 'none'}`,
    `pull      : ${state.pull.toFixed(3)}`,
    `overPull  : ${state.overPull.toFixed(3)}`,
    `cheek L/R : ${state.cheeks.left.pull.toFixed(3)} / ${state.cheeks.right.pull.toFixed(3)}`,
    `nose/mouth: ${state.faceParts.nose.pull.toFixed(3)} / ${state.faceParts.mouthLeft.pull.toFixed(3)} / ${state.faceParts.mouthRight.pull.toFixed(3)}`,
    `ear/hair  : ${state.faceParts.earLeft.pull.toFixed(3)} / ${state.faceParts.earRight.pull.toFixed(3)} / ${state.faceParts.hairTop.pull.toFixed(3)}`,
    `reward    : ${Math.round(state.satisfaction)}% / ${state.coins} coins`,
    `maxPull   : ${state.maxPullThisDrag.toFixed(3)}`,
    `raw/final : ${state.dragIntent.rawLen.toFixed(1)} / ${state.dragIntent.finalLen.toFixed(1)}`,
    `tip       : (${state.tip.x.toFixed(1)}, ${state.tip.y.toFixed(1)})`,
    `velocity  : (${state.tip.vx.toFixed(0)}, ${state.tip.vy.toFixed(0)})`,
    `anchor    : (${state.mouthAnchor.x.toFixed(0)}, ${state.mouthAnchor.y.toFixed(0)})`,
    `render    : (${state.renderMouthAnchor.x.toFixed(0)}, ${state.renderMouthAnchor.y.toFixed(0)})`,
    `pointer   : (${state.pointer.x.toFixed(0)}, ${state.pointer.y.toFixed(0)})`
  ];
  debugReadoutEl.textContent = lines.join('\n');
}

function toggleDebug(force) {
  state.debugOpen = typeof force === 'boolean' ? force : !state.debugOpen;
  debugPanelEl.hidden = !state.debugOpen;
  if (state.debugOpen) {
    toggleDecor(false);
    updateDebugReadout();
  }
}

function exportPreset() {
  const data = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    authorRole: 'visual_or_motion',
    targetBuild: 'mouth-drag-main-v1',
    partId: 'mouth_main',
    config
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mouth-preset-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  showSpeech('已导出 preset');
}

function buildDecorPanel() {
  decorControlsEl.innerHTML = '';
  DECOR_OPTIONS.forEach((option) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'decor-option';
    btn.textContent = option.label;
    btn.dataset.decorKey = option.key;
    btn.addEventListener('click', () => {
      state.decor[option.key] = !state.decor[option.key];
      btn.classList.toggle('is-on', state.decor[option.key]);
      savePlayerState();
      showSpeech(state.decor[option.key] ? `${option.label} 装上` : `${option.label} 拿下`);
    });
    btn.classList.toggle('is-on', state.decor[option.key]);
    decorControlsEl.appendChild(btn);
  });
}

function refreshDecorPanel() {
  decorControlsEl.querySelectorAll('.decor-option').forEach((btn) => {
    const key = btn.dataset.decorKey;
    btn.classList.toggle('is-on', Boolean(state.decor[key]));
  });
}

function toggleDecor(force) {
  state.decorOpen = typeof force === 'boolean' ? force : !state.decorOpen;
  decorPanelEl.hidden = !state.decorOpen;
  if (state.decorOpen) {
    toggleDebug(false);
    refreshDecorPanel();
  }
}

function clearDecor() {
  Object.keys(state.decor).forEach((key) => {
    state.decor[key] = false;
  });
  refreshDecorPanel();
  savePlayerState();
  showSpeech('清爽了。');
}

function toggleSound() {
  state.soundOn = !state.soundOn;
  updateSoundButton();
  savePlayerState();
  showSpeech(state.soundOn ? '声音开。' : '静音。');
  if (state.soundOn) {
    playTone({ type: 'sine', from: 420, to: 640, duration: 0.08, volume: 0.06 });
  }
}

function captureMoment() {
  try {
    draw();
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `boji-pull-face-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showSpeech('瞬间已保存');
  } catch (error) {
    showSpeech('保存失败');
  }
}

// ---------------------------------------------------------------------------
// 重置姿势
// ---------------------------------------------------------------------------

function resetPose(options = {}) {
  const silent = Boolean(options.silent);
  state.tip.x = 0;
  state.tip.y = 0;
  state.tip.vx = 0;
  state.tip.vy = 0;
  state.pull = 0;
  state.overPull = 0;
  state.maxPullThisDrag = 0;
  state.activePart = null;
  state.hoverPart = null;
  state.combo.count = 0;
  state.combo.timer = 0;
  [-1, 1].forEach((side) => {
    const cheek = state.cheeks[cheekKey(side)];
    cheek.x = 0;
    cheek.y = 0;
    cheek.vx = 0;
    cheek.vy = 0;
    cheek.targetX = 0;
    cheek.targetY = 0;
    cheek.pull = 0;
    cheek.maxPull = 0;
  });
  Object.values(state.faceParts).forEach((part) => {
    part.x = 0;
    part.y = 0;
    part.vx = 0;
    part.vy = 0;
    part.targetX = 0;
    part.targetY = 0;
    part.pull = 0;
    part.maxPull = 0;
  });
  state.particles = [];
  state.impactRings = [];
  state.floatingTexts = [];
  state.releasePunch.age = 999;
  state.releasePunch.power = 0;
  setPhase('Idle');
  if (!silent) showSpeech('好了好了。');
}

function handlePartTabClick(event) {
  const key = event.currentTarget.dataset.partTab || 'mouth';
  state.uiPartHint = key;
  updatePartTabs(key);
  const label = partLabelFromTabKey(key);
  const copy = key === 'cheek'
    ? '点脸颊两侧，往外拉会有果冻脸反馈'
    : key === 'mouth'
      ? '点住嘴巴往外拽，嘴唇和表情会一起变形'
      : key === 'ear'
        ? '点耳朵边缘往外拽，松手会弹回来'
        : key === 'hair'
          ? '点头发往上提，会有软软的拉伸'
          : key === 'nose'
            ? '点小鼻子往外拉，别太用力'
            : '点住嘴巴往外拽，这是主爽感';
  if (interactionTitleEl) interactionTitleEl.textContent = `试试拽${label}`;
  if (interactionDetailEl) interactionDetailEl.textContent = copy;
  showSpeech(copy);
}

// ---------------------------------------------------------------------------
// 事件绑定 + 启动
// ---------------------------------------------------------------------------

function initEvents() {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('resize', fitCanvas);
  resetPoseBtn.addEventListener('click', () => resetPose());
  openMenuBtn.addEventListener('click', showStartMenu);
  toggleSoundBtn.addEventListener('click', toggleSound);
  captureMomentBtn.addEventListener('click', captureMoment);
  toggleDecorBtn.addEventListener('click', () => toggleDecor());
  toggleDebugBtn.addEventListener('click', () => toggleDebug());
  exportPresetBtn.addEventListener('click', exportPreset);
  clearDecorBtn.addEventListener('click', clearDecor);
  if (closeDecorBtn) closeDecorBtn.addEventListener('click', () => toggleDecor(false));
  startFreeBtn.addEventListener('click', () => startRun('free'));
  startTimedBtn.addEventListener('click', () => startRun('timed'));
  replayTimedBtn.addEventListener('click', () => startRun('timed'));
  backFreeBtn.addEventListener('click', () => startRun('free'));
  partTabButtons.forEach((btn) => btn.addEventListener('click', handlePartTabClick));
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'd') toggleDebug();
    if (k === 'c') toggleDecor();
    if (k === 'm') showStartMenu();
    if (k === 'r') resetPose();
  });
}

async function boot() {
  await loadRuntimeConfig();
  restorePlayerState();
  fitCanvas();
  buildDebugPanel();
  buildDecorPanel();
  state.quests = createQuestDeck();
  updateHud();
  updateSessionHud(true);
  initEvents();

  // ?debug=1 / #debug 自动打开
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'free') {
    startRun('free');
  } else if (params.get('mode') === 'timed') {
    startRun('timed');
  } else {
    showStartMenu();
  }
  if (params.get('debug') === '1' || window.location.hash === '#debug') {
    toggleDebug(true);
  }
  window.setTimeout(hideGestureHint, 2400);

  await loadAssets();
  state.lastFrame = performance.now();
  requestAnimationFrame(loop);
}

boot();
