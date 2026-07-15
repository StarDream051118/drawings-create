#!/usr/bin/env node
/**
 * 将 Blockbench 导出的 {x, y, z} 旋转格式转回 {angle, axis} 格式
 * 用法: node tools/fix-blockbench-model.js <模型json路径>
 */

import { readFileSync, writeFileSync } from 'fs';

const path = process.argv[2];
if (!path) {
  console.error('用法: node tools/fix-blockbench-model.js <模型json路径>');
  process.exit(1);
}

const model = JSON.parse(readFileSync(path, 'utf-8'));

// 移除 Blockbench 添加的 format_version
delete model.format_version;

let fixed = 0;
for (const el of model.elements || []) {
  if (!el.rotation) continue;
  const r = el.rotation;
  // Blockbench 格式: { x, y, z, origin } → 需要转成 { angle, axis, origin }
  // 找到非零角度
  if ('x' in r || 'y' in r || 'z' in r) {
    let axis = 'y';
    let angle = (r.x ?? 0) || (r.y ?? 0) || (r.z ?? 0);
    if (r.x) axis = 'x';
    else if (r.y) axis = 'y';
    else if (r.z) axis = 'z';
    // 取非零的那个
    if (r.x) { axis = 'x'; angle = r.x; }
    else if (r.y) { axis = 'y'; angle = r.y; }
    else if (r.z) { axis = 'z'; angle = r.z; }
    el.rotation = { angle, axis, origin: r.origin };
    fixed++;
  }
}

writeFileSync(path, JSON.stringify(model, null, 2));
console.log(`已修复 ${fixed} 个元素的旋转格式: ${path}`);
