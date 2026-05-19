import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'assets', 'export_sample');
const characterId = 'mochiA';

const svgParts = [
  {
    name: 'mouth_upper',
    file: `${characterId}_mouth_upper.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_mouth_upper</metadata>
  <g id="${characterId}_mouth_upper">
    <path fill="#7a3445" d="M174 290c24-18 52-26 82-26s58 8 82 26c-20 13-47 21-82 21s-62-8-82-21Z"/>
    <path fill="#f39a76" d="M193 291c20-10 41-15 63-15s43 5 63 15c-19 7-40 10-63 10s-44-3-63-10Z"/>
  </g>
</svg>
`
  },
  {
    name: 'mouth_lower',
    file: `${characterId}_mouth_lower.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_mouth_lower</metadata>
  <g id="${characterId}_mouth_lower">
    <path fill="#8b3d4d" d="M186 321c18 26 43 39 70 39s52-13 70-39c-22 13-45 19-70 19s-48-6-70-19Z"/>
    <path fill="#f7af91" d="M204 324c16 14 33 21 52 21s36-7 52-21c-18 7-35 10-52 10s-34-3-52-10Z"/>
  </g>
</svg>
`
  },
  {
    name: 'tongue',
    file: `${characterId}_tongue.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_tongue</metadata>
  <g id="${characterId}_tongue">
    <path fill="#ff7898" d="M226 310c0-21 12-36 30-36s30 15 30 36v70c0 31-13 50-30 50s-30-19-30-50v-70Z"/>
    <path fill="#ff9fb5" d="M256 292c10 0 17 9 17 23v62c0 20-7 32-17 32s-17-12-17-32v-62c0-14 7-23 17-23Z"/>
    <path fill="#ffd7e2" d="M252 309h8v92h-8z" opacity="0.52"/>
  </g>
</svg>
`
  },
  {
    name: 'brow_L',
    file: `${characterId}_brow_L.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_brow_L</metadata>
  <g id="${characterId}_brow_L">
    <path fill="#5b342d" d="M162 178c28-18 59-20 82-6l-8 18c-21-8-44-6-67 8l-7-20Z"/>
  </g>
</svg>
`
  },
  {
    name: 'brow_R',
    file: `${characterId}_brow_R.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_brow_R</metadata>
  <g id="${characterId}_brow_R">
    <path fill="#5b342d" d="M350 178c-28-18-59-20-82-6l8 18c21-8 44-6 67 8l7-20Z"/>
  </g>
</svg>
`
  },
  {
    name: 'eyeWhite_L',
    file: `${characterId}_eyeWhite_L.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_eyeWhite_L</metadata>
  <g id="${characterId}_eyeWhite_L">
    <ellipse cx="203" cy="231" rx="45" ry="31" fill="#fff8ef"/>
  </g>
</svg>
`
  },
  {
    name: 'eyeWhite_R',
    file: `${characterId}_eyeWhite_R.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_eyeWhite_R</metadata>
  <g id="${characterId}_eyeWhite_R">
    <ellipse cx="309" cy="231" rx="45" ry="31" fill="#fff8ef"/>
  </g>
</svg>
`
  },
  {
    name: 'iris_L',
    file: `${characterId}_iris_L.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_iris_L</metadata>
  <g id="${characterId}_iris_L">
    <circle cx="203" cy="233" r="16" fill="#5b99c8"/>
    <circle cx="198" cy="228" r="5" fill="#bfe9ff"/>
  </g>
</svg>
`
  },
  {
    name: 'iris_R',
    file: `${characterId}_iris_R.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_iris_R</metadata>
  <g id="${characterId}_iris_R">
    <circle cx="309" cy="233" r="16" fill="#5b99c8"/>
    <circle cx="304" cy="228" r="5" fill="#bfe9ff"/>
  </g>
</svg>
`
  },
  {
    name: 'pupil_L',
    file: `${characterId}_pupil_L.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_pupil_L</metadata>
  <g id="${characterId}_pupil_L">
    <circle cx="203" cy="234" r="7" fill="#263044"/>
  </g>
</svg>
`
  },
  {
    name: 'pupil_R',
    file: `${characterId}_pupil_R.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_pupil_R</metadata>
  <g id="${characterId}_pupil_R">
    <circle cx="309" cy="234" r="7" fill="#263044"/>
  </g>
</svg>
`
  },
  {
    name: 'lash_upper_L',
    file: `${characterId}_lash_upper_L.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_lash_upper_L</metadata>
  <g id="${characterId}_lash_upper_L">
    <path fill="#3d2b30" d="M160 225c16-30 67-38 94-8l-12 9c-23-19-53-16-73 9l-9-10Z"/>
    <path fill="#3d2b30" d="M167 214l-12-15 10-5 11 17Z"/>
    <path fill="#3d2b30" d="M238 212l15-12 6 10-17 11Z"/>
  </g>
</svg>
`
  },
  {
    name: 'lash_upper_R',
    file: `${characterId}_lash_upper_R.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_lash_upper_R</metadata>
  <g id="${characterId}_lash_upper_R">
    <path fill="#3d2b30" d="M352 225c-16-30-67-38-94-8l12 9c23-19 53-16 73 9l9-10Z"/>
    <path fill="#3d2b30" d="M345 214l12-15-10-5-11 17Z"/>
    <path fill="#3d2b30" d="M274 212l-15-12-6 10 17 11Z"/>
  </g>
</svg>
`
  },
  {
    name: 'lash_lower_L',
    file: `${characterId}_lash_lower_L.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_lash_lower_L</metadata>
  <g id="${characterId}_lash_lower_L">
    <path fill="#6d4a4f" d="M169 250c22 16 48 18 73 1l6 10c-27 20-62 20-86-1l7-10Z"/>
  </g>
</svg>
`
  },
  {
    name: 'lash_lower_R',
    file: `${characterId}_lash_lower_R.svg`,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <metadata>origin:256,256 pivot:0.5,0.5 node:${characterId}_lash_lower_R</metadata>
  <g id="${characterId}_lash_lower_R">
    <path fill="#6d4a4f" d="M343 250c-22 16-48 18-73 1l-6 10c27 20 62 20 86-1l-7-10Z"/>
  </g>
</svg>
`
  }
];

const sequences = [
  {
    id: 'eye_blink',
    fps: 12,
    frameCount: 8,
    pattern: `${characterId}_eye_blink_{frame}.png`,
    draw: (canvas, frame, scale) => {
      const openValues = [1, 0.62, 0.28, 0.08, 0, 0.12, 0.45, 0.82];
      const open = openValues[frame];
      const centers = [
        [203 * scale, 231 * scale],
        [309 * scale, 231 * scale]
      ];
      for (const [cx, cy] of centers) {
        const rx = 45 * scale;
        const ry = Math.max(2 * scale, 30 * scale * open);
        if (open > 0.1) {
          canvas.ellipse(cx, cy, rx, ry, [255, 255, 255, 255]);
          canvas.ellipse(cx, cy + 2 * scale, 12 * scale, 12 * scale, [68, 143, 194, 255]);
          canvas.ellipse(cx, cy + 3 * scale, 5 * scale, 5 * scale, [32, 38, 54, 255]);
        }
        const lidY = Math.round(cy);
        const lineHeight = Math.max(2, Math.round(4 * scale));
        canvas.rect(cx - rx, lidY - lineHeight / 2, rx * 2, lineHeight, [97, 58, 63, 255]);
      }
    }
  },
  {
    id: 'mouth_open',
    fps: 12,
    frameCount: 8,
    pattern: `${characterId}_mouth_open_{frame}.png`,
    draw: (canvas, frame, scale) => {
      const openHeights = [5, 10, 18, 30, 43, 56, 68, 78];
      const cx = 256 * scale;
      const cy = 318 * scale;
      const rx = 72 * scale;
      const ry = Math.max(3 * scale, openHeights[frame] * scale);
      canvas.ellipse(cx, cy, rx, ry, [105, 45, 58, 255]);
      canvas.ellipse(cx, cy + ry * 0.38, rx * 0.56, ry * 0.38, [255, 119, 151, 255]);
      canvas.ellipse(cx, cy - ry * 0.55, rx * 0.92, 8 * scale, [244, 145, 112, 255]);
      canvas.ellipse(cx, cy + ry * 0.62, rx * 0.78, 8 * scale, [248, 174, 143, 255]);
    }
  }
];

const scales = [
  { name: '@1x', size: 512 },
  { name: '@2x', size: 1024 },
  { name: '@3x', size: 1536 }
];

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c ^= buffer[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunkData = data || Buffer.alloc(0);
  const chunk = Buffer.alloc(12 + chunkData.length);
  chunk.writeUInt32BE(chunkData.length, 0);
  typeBuffer.copy(chunk, 4);
  chunkData.copy(chunk, 8);
  const crc = crc32(Buffer.concat([typeBuffer, chunkData]));
  chunk.writeUInt32BE(crc, 8 + chunkData.length);
  return chunk;
}

function encodePng(width, height, drawFn) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);

  const canvas = {
    set(x, y, color) {
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= width || py >= height) return;
      const offset = py * stride + 1 + px * 4;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = color[3];
    },
    rect(x, y, w, h, color) {
      const x0 = Math.max(0, Math.floor(x));
      const y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(width, Math.ceil(x + w));
      const y1 = Math.min(height, Math.ceil(y + h));
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) this.set(px, py, color);
      }
    },
    ellipse(cx, cy, rx, ry, color) {
      const x0 = Math.floor(cx - rx);
      const y0 = Math.floor(cy - ry);
      const x1 = Math.ceil(cx + rx);
      const y1 = Math.ceil(cy + ry);
      for (let py = y0; py <= y1; py += 1) {
        for (let px = x0; px <= x1; px += 1) {
          const nx = (px - cx) / rx;
          const ny = (py - cy) / ry;
          if (nx * nx + ny * ny <= 1) this.set(px, py, color);
        }
      }
    }
  };

  drawFn(canvas);

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND')
  ]);
}

function drawGuides(canvas, scale, size) {
  const safe = 4 * scale;
  const tick = 30 * scale;
  const center = size / 2;
  const guide = [37, 126, 255, 255];
  const safety = [180, 188, 196, 255];
  const line = Math.max(1, Math.round(2 * scale));

  canvas.rect(safe, safe, tick, line, safety);
  canvas.rect(safe, safe, line, tick, safety);
  canvas.rect(size - safe - tick, safe, tick, line, safety);
  canvas.rect(size - safe - line, safe, line, tick, safety);
  canvas.rect(safe, size - safe - line, tick, line, safety);
  canvas.rect(safe, size - safe - tick, line, tick, safety);
  canvas.rect(size - safe - tick, size - safe - line, tick, line, safety);
  canvas.rect(size - safe - line, size - safe - tick, line, tick, safety);

  canvas.rect(center - 24 * scale, center - line / 2, 48 * scale, line, guide);
  canvas.rect(center - line / 2, center - 24 * scale, line, 48 * scale, guide);
  canvas.rect(center - 4 * scale, center - 4 * scale, 8 * scale, 8 * scale, guide);
}

function frameName(pattern, frame) {
  return pattern.replace('{frame}', String(frame).padStart(3, '0'));
}

function writeSvgParts() {
  const svgDir = path.join(outDir, 'svg');
  ensureDir(svgDir);
  for (const part of svgParts) {
    writeFileSync(path.join(svgDir, part.file), part.svg, 'utf8');
  }
}

function writeSequences() {
  for (const scaleDef of scales) {
    const scale = scaleDef.size / 512;
    for (const sequence of sequences) {
      const sequenceDir = path.join(outDir, 'seq', scaleDef.name, sequence.id);
      ensureDir(sequenceDir);
      for (let frame = 0; frame < sequence.frameCount; frame += 1) {
        const png = encodePng(scaleDef.size, scaleDef.size, (canvas) => {
          drawGuides(canvas, scale, scaleDef.size);
          sequence.draw(canvas, frame, scale);
        });
        writeFileSync(path.join(sequenceDir, frameName(sequence.pattern, frame)), png);
      }
    }
  }
}

function writeDocs() {
  const manifest = {
    characterId,
    coordinateSystem: {
      canvasPx: { '@1x': 512, '@2x': 1024, '@3x': 1536 },
      originPxAt1x: { x: 256, y: 256 },
      pivotNormalized: { x: 0.5, y: 0.5 },
      safetyPaddingPxAt1x: 4,
      note: 'All SVG parts and PNG sequence frames share a full-face 1:1 coordinate space.'
    },
    alpha: {
      pngFormat: '8-bit RGBA',
      runtimeBlend: 'premultiplied-alpha',
      placeholderNote: 'Guide pixels are fully opaque, so the placeholder PNGs have no semi-transparent fringe.'
    },
    svgParts: svgParts.map((part) => ({
      node: `${characterId}_${part.name}`,
      file: `svg/${part.file}`,
      pivotNormalized: { x: 0.5, y: 0.5 }
    })),
    sequences: sequences.map((sequence) => ({
      id: sequence.id,
      fps: sequence.fps,
      frameCount: sequence.frameCount,
      filenamePattern: sequence.pattern,
      dirs: Object.fromEntries(scales.map((scale) => [scale.name, `seq/${scale.name}/${sequence.id}`])),
      pivotNormalized: { x: 0.5, y: 0.5 }
    })),
    drawOrder: [
      'eyeWhite_L',
      'eyeWhite_R',
      'iris_L',
      'iris_R',
      'pupil_L',
      'pupil_R',
      'lash_lower_L',
      'lash_lower_R',
      'lash_upper_L',
      'lash_upper_R',
      'brow_L',
      'brow_R',
      'tongue',
      'mouth_lower',
      'mouth_upper'
    ].map((name) => `${characterId}_${name}`)
  };

  writeFileSync(path.join(outDir, 'export_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const readme = `# Mochi Mood 表情资产导出模板

这套文件是可替换的交付占位包，不接入当前 \`src/main.js\` 运行时。绘制完成后，保持文件名、节点名、锚点和帧数不变，直接覆盖同名 SVG/PNG 即可。

## 坐标与尺寸

- 角色 ID：\`${characterId}\`
- 画布比例：1:1，全脸统一坐标系
- SVG：\`viewBox="0 0 512 512"\`
- PNG 序列：\`@1x=512px\`、\`@2x=1024px\`、\`@3x=1536px\`
- 统一原点：画布中心，\`pivot=(0.5, 0.5)\`
- 安全区：占位 PNG 标出 4px @1x 角标；正式帧裁切时至少保留 2-4px 透明边
- 透明：正式 PNG 使用 8-bit RGBA，并按运行时 Premultiplied Alpha 导出

## 目录

\`\`\`text
assets/export_sample/
  svg/
    ${characterId}_mouth_upper.svg
    ${characterId}_mouth_lower.svg
    ${characterId}_tongue.svg
    ${characterId}_brow_L.svg
    ${characterId}_brow_R.svg
    ${characterId}_eyeWhite_L.svg
    ${characterId}_eyeWhite_R.svg
    ${characterId}_iris_L.svg
    ${characterId}_iris_R.svg
    ${characterId}_pupil_L.svg
    ${characterId}_pupil_R.svg
    ${characterId}_lash_upper_L.svg
    ${characterId}_lash_upper_R.svg
    ${characterId}_lash_lower_L.svg
    ${characterId}_lash_lower_R.svg
  seq/
    @1x/eye_blink/${characterId}_eye_blink_000.png ... 007.png
    @1x/mouth_open/${characterId}_mouth_open_000.png ... 007.png
    @2x/eye_blink/${characterId}_eye_blink_000.png ... 007.png
    @2x/mouth_open/${characterId}_mouth_open_000.png ... 007.png
    @3x/eye_blink/${characterId}_eye_blink_000.png ... 007.png
    @3x/mouth_open/${characterId}_mouth_open_000.png ... 007.png
  atlas/
  export_manifest.json
  readme_export.md
\`\`\`

## SVG 部件

- 每个 SVG 只有一个主 \`<g id="...">\`，id 与运行时节点名一致。
- 占位 SVG 不使用描边；正式稿如有描边，请在 Figma/Illustrator 导出前扩展为轮廓。
- 部件共用 512x512 全脸画板，不要把单个部件重新裁成局部画布，否则运行时锚点会漂移。

## PNG 序列

- \`eye_blink\`：8 帧，建议 12 fps；开眼到闭眼再回开眼。
- \`mouth_open\`：8 帧，建议 12 fps；闭合到张开。
- 命名规则：\`{角色}_{部位}_{动作}_{帧号3位}.png\`
- 所有帧同一画布、同一锚点、同一基准线。
- 占位帧含蓝色中心锚点和灰色安全区角标；正式帧可以移除这些辅助像素。

## 图集

\`atlas/\` 目前只保留目录。确认 DrawCall 或内存收益后再生成图集：

- 去透明裁切 + 2px padding
- 最大边 2048，极限兼容时用 1024
- 同步导出 JSON Atlas，记录 frame rect 与 pivot

## 对接

- Unity/Cocos：导入对应倍率目录，Sprite pivot 设为中心；启用 Premultiplied Alpha 对应的材质或混合模式。
- Web：可以直接挂 SVG 节点；不支持 SVG 时，把 SVG 在构建阶段转为 \`@2x/@3x\` PNG。
- 嘴型枚举可先映射 \`MouthShape.Open -> seq/<scale>/mouth_open\`；后续补 \`Closed\`、\`Smile\`、\`O\` 时沿用同一命名规则。
`;

  writeFileSync(path.join(outDir, 'readme_export.md'), readme, 'utf8');
  writeFileSync(path.join(outDir, 'atlas', 'README.md'), '# Atlas\n\nOptional atlas output goes here after packing.\n', 'utf8');
}

ensureDir(outDir);
writeSvgParts();
writeSequences();
writeDocs();

console.log(`Generated export sample assets in ${path.relative(rootDir, outDir)}`);
