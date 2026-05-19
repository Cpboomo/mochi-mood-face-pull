# 啵叽拽脸 · 解压小游戏

一个面向抖音/微信小游戏发行前验证的竖屏 H5 解压小游戏。核心爽点是“点哪拽哪”：按住舌头、脸颊、鼻子、嘴角、耳朵或头发拉扯变形，松手后用弹簧回弹、音效、震动、粒子和分数反馈制造爽感。

> 当前版本仍是纯静态 Web 工程，适合快速试玩、投放前 AB 测试和后续迁移到 Cocos/小游戏壳。视觉到程序的数据化协作流程见 [docs/visual-to-program-development-workflow.md](docs/visual-to-program-development-workflow.md)。

## 当前玩法

- 按住舌头往任意方向拖拽，舌头会拉长、变细、弯曲，脸部和表情跟随拉扯。
- 按住左右脸颊也可以向外拉扯，脸颊会被拽出软弹形变，松手后回弹。
- 按住鼻子或左右嘴角可以做更细的五官拉扯，角色会跟随变表情和吐槽。
- 按住左右耳朵和顶部头发也可以拉扯，形成更完整的“点哪拽哪”脸部玩具。
- 接近极限时进入过拉状态，舌头颜色加深并微抖。
- 松手后舌头快速回弹，带过冲、变粗、冲击环、粒子、音效和移动端震动反馈。
- 每次有效拉扯会增加爽感值，爽感满格转化为金币。
- 首页提供“自由捏”和“60秒爆爽”两种模式。
- 60 秒模式包含循环目标、分数、连拽、FEVER 爆爽状态和结算面板。
- 右上角声音按钮可静音；保存按钮可导出当前画面 PNG。
- 右上角装扮按钮可以切换眼镜、腮红、星贴、胡子、帽子、闪光等基础装扮。
- 右上角齿轮打开调参工具，可导出当前 preset。
- 快捷键：`M` 回到模式面板，`C` 打开/关闭装扮，`D` 打开/关闭调参工具，`R` 重置姿势。

## 本地预览

```bash
python3 -m http.server 8000
```

打开 `http://localhost:8000`。

也可以直接打开：

- `http://localhost:8000/?mode=free`
- `http://localhost:8000/?mode=timed`

也可以使用脚本：

```bash
npm run dev
```

## 游览模式

打开 `http://localhost:8000/asset-browser.html` 可以直接浏览 `assets/export_sample/` 里的头像素材包：组合预览、单个 SVG 部件、PNG 序列帧播放和 @1x/@2x/@3x 倍率切换。主游戏右上角也有“游览”入口。

## 云端部署

这是纯静态项目，不需要后端服务。

- Vercel：直接导入仓库，Framework Preset 选择 `Other`，Build Command 留空，Output Directory 留空。
- Netlify：Publish directory 设为项目根目录，Build command 留空。
- GitHub Pages：发布根目录即可。

`vercel.json` 已经配置静态缓存：`assets/` 下的正式素材会使用长期缓存，页面和代码保持可更新。

抖音/微信小游戏正式发布时建议把当前 H5 作为玩法与美术手感基线，再接入平台生命周期、分享、震动、音频策略和合规登录。当前代码已经把输入、分数、存档、HUD 和渲染集中在 `src/main.js`，方便迁移到 Cocos Creator 或小游戏 WebView 壳。

## 素材接入

把 SVG 或 PNG 放进 `assets/`，文件名保持和 `src/main.js` 里的 `ASSET_FILES` 一致。当前占位素材映射如下：

```text
character_face_base.svg
character_face_shadow.svg
character_eyes_neutral.svg
character_eyes_squint.svg
character_eyes_shock.svg
character_mouth_neutral.svg
character_mouth_smile.svg
character_mouth_worried.svg
tongue_neutral.svg
tongue_stretch_1.svg
tongue_stretch_2.svg
tongue_stretch_3.svg
tongue_stretch_4.svg
```

素材缺失时游戏会自动使用手绘 fallback，不会黑屏，也不会阻塞云端联调。

运行时会优先加载 `config/parts/tongue_main.part.json`。视觉或动画专家可以在调参工具里调整手感，然后导出 JSON 作为下一版 preset。

## 文件结构

```text
index.html                         页面和 HUD
styles.css                         响应式布局与视觉样式
src/main.js                        玩法、素材加载、渲染和调参工具
config/parts/tongue_main.part.json 默认舌头 preset
assets/                            可替换 PNG 素材
vercel.json                        Vercel 静态托管配置
```

## 快速检查

```bash
npm run check
```
