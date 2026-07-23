# Drawings - Create Mod Structure Viewer

基于 [schematicannon](https://github.com/Slipn3r/schematicannon) 修改的 Create Mod 结构可视化库，在浏览器中渲染 NBT/Litematic 蓝图文件，支持机械动力模组的动画效果。

> 本项目基于 [schematicannon](https://github.com/Slipn3r/schematicannon) (by Slipn3r) 修改开发，原项目采用 MIT 许可证。
> 原始仓库：https://github.com/Slipn3r/schematicannon

## 相对原版的修改

### 动画系统
- **传送带滚动动画**（belt UV scroll）：水平、对角、下层传送带独立纹理与 UV 截取
- **齿轮/传动杆旋转动画**（spin）：支持多轴旋转
- **动能控制面板**：RPM 滑块、动画开关

### 渲染增强
- **WebGL 2.0** 升级（原版 WebGL 1.0 + ANGLE_instanced_arrays）
- **Atlas min filter** 修复（原版 deepslate 未设置 TEXTURE_MIN_FILTER 导致模糊）
- **Casing 类型区分**：从 block entity NBT 读取 `Casing` 字段，自动切换 andesite/brass 材质
- **对角传送带模型修正**：facing=west 的 start/end 交换 + 方向修复

### 蓝图加载
- **Litematic 格式支持**
- **Block entity NBT 解析**（TileEntities）
- **Aeronautics 等扩展模组模型注入**

### 纹理系统
- Belt 纹理独立加载（非图集），支持 GL_REPEAT
- 对角 belt 独立纹理（belt_diagonal_scroll.png）
- 下层 belt 独立纹理（belt_offset.png）
- UV 截取可独立调整（`setBeltDiagonalUV` / `setBeltBottomUV`）

## 快速开始

```bash
pnpm install
```

### 1. 生成资源文件

```bash
pnpx schematicannon generate-assets -d ./assets
```

### 2. 启动开发服务器

```bash
pnpm examples/minimal
```

### 3. 加载蓝图

拖拽 `.nbt` 或 `.litematic` 文件到页面即可预览。

## API 使用

```typescript
import { createStructureViewer } from 'schematicannon';

const viewer = createStructureViewer({
  canvas: document.getElementById('viewport'),
  createAssetsBase: '/assets/create/6.0.9/',
  vanillaAssetsBase: '/assets/minecraft/1.21.1/',
  addons: [aeronauticsAddon] // 可选：扩展模组
});

const response = await fetch('/path/to/blueprint.nbt');
await viewer.loadStructure(await response.arrayBuffer());
```

## 调试开关

```typescript
// renderPlan.ts
LOG_MODEL_REFS = true;  // 方块模型引用
LOG_UV = true;          // UV 截取详情
LOG_TEXTURES = true;    // 面纹理引用

// textureLoader.ts
LOG_BELT_TEXTURES = false; // belt 纹理加载
```

## 许可证

MIT License - 详见 [LICENCE](./LICENCE)

基于 [schematicannon](https://github.com/Slipn3r/schematicannon) (by Slipn3r) 修改。
