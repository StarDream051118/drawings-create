#!/usr/bin/env node
/**
 * 将 linked_typewriter 的 14 个按键合并到主模型 (block.json) 中
 *
 * 依据 LinkedTypewriterRenderer.java：
 *
 * 渲染器坐标系:
 *   中心: ps.translate(0.5, 4*s, 0.5)  →  模型像素 (8, 4, 8)
 *   s = 0.0625 = 1/16 (1 像素)
 *
 * 渲染器对 facing=north 应用 rotateY(180°)，将 offset(dx,dy,dz) 变换到模型空间：
 *   offset_model = (-dx, dy, -dz) 从中心 (8,4,8) 起算
 *
 * pushPose/popPose 追踪：
 *   1. center = (8, 4, 8)
 *   2. 顶行: pushPose → translate(-7, 1, 2) → pushPose → loop 6×
 *   3. popPose → 回到 (-7, 1, 2) 从中心
 *   4. 底行: translate(-1, -1, 2) → pushPose → loop 7×
 *   5. popPose → 回到 (-8, 0, 4) 从中心
 *   6. 空格: translate(8, -1, 2) → pushPose → render
 *
 * key.json 元素（相对键位原点）：
 *   Button: [-1,0,-1] ~ [1,1,1]
 *   Stem:   [0,-1,-3] ~ [0,0,0]
 * key_spacebar.json:
 *   Button: [-5,0,-1] ~ [5,1,1]
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ASSETS = 'examples/minimal/assets/simulated';

// 加载模型
const keyModel = JSON.parse(readFileSync(join(ASSETS, 'models/block/linked_typewriter/key.json'), 'utf-8'));
const sbModel = JSON.parse(readFileSync(join(ASSETS, 'models/block/linked_typewriter/key_spacebar.json'), 'utf-8'));
const blockModel = JSON.parse(readFileSync(join(ASSETS, 'models/block/linked_typewriter/block.json'), 'utf-8'));

function offsetElement(el, dx, dy, dz) {
  return {
    from: [ el.from[0] + dx, el.from[1] + dy, el.from[2] + dz ],
    to:   [ el.to[0]   + dx, el.to[1]   + dy, el.to[2]   + dz ],
    faces: el.faces,
    rotation: el.rotation,
    shade: el.shade,
    name: el.name
  };
}

// 渲染器偏移量（在 rotated 坐标系中）
const CENTER = [8, 4, 8];

// 模拟 pushPose/popPose 追踪当前 position
let current = [...CENTER];

// ========== 顶行 ==========
// pushPose → translate(-7, 1, 2)
current[0] += -7;
current[1] += 1;
current[2] += 2;
const topStart = [...current];  // pushPose: (1, 5, 10)

const allKeys = [];

for (let i = 0; i < 6; i++) {
  current[0] += 2;   // translate(2, 0, 0)
  // 渲染器坐标系 offset = (current - CENTER) = (dx, dy, dz)
  // 模型空间 offset_model = (-dx, dy, -dz) 因为 rotateY(180°)
  const dx = current[0] - CENTER[0];
  const dy = current[1] - CENTER[1];
  const dz = current[2] - CENTER[2];
  const anchor = [CENTER[0] - dx, CENTER[1] + dy, CENTER[2] - dz];
  keyModel.elements.forEach(el => allKeys.push(offsetElement(el, ...anchor)));
  console.log(`顶行按键${i}: rotated=(${current}) anchor=(${anchor})`);
}

// popPose
current = [...topStart];  // (1, 5, 10)

// ========== 底行 ==========
// translate(-1, -1, 2) from current (1,5,10)
current[0] += -1;
current[1] += -1;
current[2] += 2;
const botStart = [...current];  // pushPose: (0, 4, 12)

for (let i = 0; i < 7; i++) {
  current[0] += 2;   // translate(2, 0, 0)
  const dx = current[0] - CENTER[0];
  const dy = current[1] - CENTER[1];
  const dz = current[2] - CENTER[2];
  const anchor = [CENTER[0] - dx, CENTER[1] + dy, CENTER[2] - dz];
  keyModel.elements.forEach(el => allKeys.push(offsetElement(el, ...anchor)));
  console.log(`底行按键${i}: rotated=(${current}) anchor=(${anchor})`);
}

// popPose
current = [...botStart];  // (0, 4, 12)

// ========== 空格键 ==========
// translate(8, -1, 2) from current (0,4,12)
current[0] += 8;
current[1] += -1;
current[2] += 2;
const dx = current[0] - CENTER[0];
const dy = current[1] - CENTER[1];
const dz = current[2] - CENTER[2];
const anchor = [CENTER[0] - dx, CENTER[1] + dy, CENTER[2] - dz];
sbModel.elements.forEach(el => allKeys.push(offsetElement(el, ...anchor)));
console.log(`空格键: rotated=(${current}) anchor=(${anchor})`);

// 构建合并模型
const merged = {
  credit: "Merged from block.json + keys",
  textures: blockModel.textures,
  elements: [
    ...blockModel.elements,
    ...allKeys
  ],
  groups: [
    ...(blockModel.groups || []),
    { name: "Keys", origin: [8, 4, 8], color: 0, children: [] }
  ]
};

const outPath = join(ASSETS, 'models/block/linked_typewriter/block_with_keys.json');
writeFileSync(outPath, JSON.stringify(merged, null, 2));
console.log(`已生成: ${outPath}`);
console.log(`元素总数: ${merged.elements.length}（原始+${allKeys.length}个按键元素）`);
