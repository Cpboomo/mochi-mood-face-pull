# Mochi Mood 表情资产导出模板

这套文件是可替换的交付占位包，不接入当前 `src/main.js` 运行时。绘制完成后，保持文件名、节点名、锚点和帧数不变，直接覆盖同名 SVG/PNG 即可。

## 坐标与尺寸

- 角色 ID：`mochiA`
- 画布比例：1:1，全脸统一坐标系
- SVG：`viewBox="0 0 512 512"`
- PNG 序列：`@1x=512px`、`@2x=1024px`、`@3x=1536px`
- 统一原点：画布中心，`pivot=(0.5, 0.5)`
- 安全区：占位 PNG 标出 4px @1x 角标；正式帧裁切时至少保留 2-4px 透明边
- 透明：正式 PNG 使用 8-bit RGBA，并按运行时 Premultiplied Alpha 导出

## 目录

```text
assets/export_sample/
  svg/
    mochiA_mouth_upper.svg
    mochiA_mouth_lower.svg
    mochiA_tongue.svg
    mochiA_brow_L.svg
    mochiA_brow_R.svg
    mochiA_eyeWhite_L.svg
    mochiA_eyeWhite_R.svg
    mochiA_iris_L.svg
    mochiA_iris_R.svg
    mochiA_pupil_L.svg
    mochiA_pupil_R.svg
    mochiA_lash_upper_L.svg
    mochiA_lash_upper_R.svg
    mochiA_lash_lower_L.svg
    mochiA_lash_lower_R.svg
  seq/
    @1x/eye_blink/mochiA_eye_blink_000.png ... 007.png
    @1x/mouth_open/mochiA_mouth_open_000.png ... 007.png
    @2x/eye_blink/mochiA_eye_blink_000.png ... 007.png
    @2x/mouth_open/mochiA_mouth_open_000.png ... 007.png
    @3x/eye_blink/mochiA_eye_blink_000.png ... 007.png
    @3x/mouth_open/mochiA_mouth_open_000.png ... 007.png
  atlas/
  export_manifest.json
  readme_export.md
```

## SVG 部件

- 每个 SVG 只有一个主 `<g id="...">`，id 与运行时节点名一致。
- 占位 SVG 不使用描边；正式稿如有描边，请在 Figma/Illustrator 导出前扩展为轮廓。
- 部件共用 512x512 全脸画板，不要把单个部件重新裁成局部画布，否则运行时锚点会漂移。

## PNG 序列

- `eye_blink`：8 帧，建议 12 fps；开眼到闭眼再回开眼。
- `mouth_open`：8 帧，建议 12 fps；闭合到张开。
- 命名规则：`{角色}_{部位}_{动作}_{帧号3位}.png`
- 所有帧同一画布、同一锚点、同一基准线。
- 占位帧含蓝色中心锚点和灰色安全区角标；正式帧可以移除这些辅助像素。

## 图集

`atlas/` 目前只保留目录。确认 DrawCall 或内存收益后再生成图集：

- 去透明裁切 + 2px padding
- 最大边 2048，极限兼容时用 1024
- 同步导出 JSON Atlas，记录 frame rect 与 pivot

## 对接

- Unity/Cocos：导入对应倍率目录，Sprite pivot 设为中心；启用 Premultiplied Alpha 对应的材质或混合模式。
- Web：可以直接挂 SVG 节点；不支持 SVG 时，把 SVG 在构建阶段转为 `@2x/@3x` PNG。
- 嘴型枚举可先映射 `MouthShape.Open -> seq/<scale>/mouth_open`；后续补 `Closed`、`Smile`、`O` 时沿用同一命名规则。
