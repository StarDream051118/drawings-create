# 方块子模型注入状态

> 传送带 belt 对角渲染 + pulley 注入已基本完成
> 齿轮箱 gearbox: 4× shaft_half 注入 + 旋转 ✅
> 创造马达 creative_motor: shaft_half 注入 + 旋转 ✅
> 机壳齿轮 encased_cogwheel/large_cogwheel: 子模型注入 ✅
> 机壳传动杆 encased_shaft: 子模型注入 ✅
> 蒸汽引擎 steam_engine: 子模型注入 ✅
> 模拟传动 analog_transmission: 齿轮注入 ✅
> 搅拌器 mechanical_mixer: head 旋转 ✅
> 螺旋桨 andesite_propeller: multipart 注入 + reversed ✅
> 方向齿轮箱 directional_gearshift: barrel + barrel_shaft + shaft_half 注入 ✅
> 便携引擎 portable_engine: shaft_half + 子模型注入 ✅
> 轴承 bearing: shaft_half + top 注入 ✅

---

## 一、已修复方块（子模型注入完成）

### create 命名空间

| # | Block ID | 修复内容 | 状态 |
|---|----------|---------|------|
| 1 | create:belt | 对角渲染 start/end 交换 + pulley 注入 + vertical 注入 | ✅ |
| 2 | create:gearbox | 4× shaft_half 注入 + 交叉旋转 | ✅ |
| 3 | create:creative_motor | shaft_half 注入 + facing 旋转 | ✅ |
| 4 | create:andesite_encased_cogwheel | 齿轮子模型注入 | ✅ |
| 5 | create:brass_encased_cogwheel | 齿轮子模型注入 | ✅ |
| 6 | create:andesite_encased_large_cogwheel | 大齿轮子模型注入 | ✅ |
| 7 | create:brass_encased_large_cogwheel | 大齿轮子模型注入 | ✅ |
| 8 | create:andesite_encased_shaft | 传动杆子模型注入 | ✅ |
| 9 | create:brass_encased_shaft | 传动杆子模型注入 | ✅ |
| 10 | create:steam_engine | 连杆/活塞子模型注入 | ✅ |
| 11 | create:mechanical_mixer | 搅拌头旋转 | ✅ |
| 12 | create:mechanical_crafter | 齿轮子模型注入 | ✅ |
| 13 | create:mechanical_arm | 齿轮子模型注入 | ✅ |
| 14 | create:fluid_pipe | 管道连接规则注入 | ✅ |
| 15 | create:encased_fluid_pipe | 机壳管道子模型注入 | ✅ |
| 16 | create:spout | 喷嘴子模型注入 | ✅ |

### aeronautics 命名空间

| # | Block ID | 修复内容 | 状态 |
|---|----------|---------|------|
| 17 | aeronautics:andesite_propeller | propeller + reversed multipart 注入 | ✅ |
| 18 | aeronautics:brass_propeller | propeller + reversed multipart 注入 | ✅ |
| 19 | aeronautics:wooden_propeller | propeller + reversed multipart 注入 | ✅ |
| 20 | aeronautics:smart_propeller | propeller + reversed multipart 注入 | ✅ |

### simulated 命名空间

| # | Block ID | 修复内容 | 状态 |
|---|----------|---------|------|
| 21 | simulated:directional_gearshift | barrel + barrel_shaft + shaft_half 注入，12种state独立XYZ旋转，spin轴独立配置 | ✅ |
| 22 | simulated:*_portable_engine (16色) | shaft_half + 6个子模型(exhaust_outlet_left/right, exhaust_pipe_left/right, hatch_bottom/top) 注入 | ✅ |
| 23 | simulated:*_bearing (含 swivel_bearing) | shaft_half + top(ironcog) 注入 | ✅ |
| 24 | simulated:analog_transmission | 齿轮子模型注入 | ✅ |

---

## 二、create 命名空间 — 待修复方块

| # | Block ID | 缺失子模型 | 状态 |
|---|----------|-----------|------|
| 1 | create:cogwheel | 传动杆 shaft | ❌ 未修复 |
| 2 | create:large_cogwheel | 传动杆 shaft | ❌ 未修复 |
| 3 | create:shaft | 无（方块本身即为传动杆） | ✅ 已有旋转 |
| 4 | create:powered_shaft | 传动杆 shaft | ❌ 未修复 |
| 5 | create:encased_fan | 风扇叶片 fan 旋转 | ❌ 未修复 |
| 6 | create:millstone | 内部传动杆 shaft | ❌ 未修复 |
| 7 | create:water_wheel | 传动杆 shaft（轮轴） | ❌ 未修复 |
| 8 | create:large_water_wheel | 传动杆 shaft（轮轴） | ❌ 未修复 |
| 9 | create:windmill_bearing | 传动杆 shaft | ❌ 未修复 |
| 10 | create:mechanical_bearing | 传动杆 shaft | ❌ 未修复 |
| 11 | create:clockwork_bearing | 传动杆 shaft | ❌ 未修复 |
| 12 | create:rotation_speed_controller | 传动杆 shaft（输出轴） | ❌ 未修复 |
| 13 | create:gearshift | 传动杆 shaft（输入/输出轴） | ❌ 未修复 |
| 14 | create:clutch | 传动杆 shaft（输入/输出轴） | ❌ 未修复 |
| 15 | create:gantry_shaft | 传动杆 shaft | ❌ 未修复 |
| 16 | create:mechanical_saw | 内部齿轮/传动杆 | ❌ 未修复 |
| 17 | create:mechanical_press | 内部齿轮/传动杆 | ❌ 未修复 |
| 18 | create:mechanical_drill | 内部齿轮/传动杆 | ❌ 未修复 |
| 19 | create:deployer | 内部齿轮/传动杆 | ❌ 未修复 |
| 20 | create:mechanical_pump | 内部齿轮/传动杆 | ❌ 未修复 |
| 21 | create:chain_conveyor | 链条传动模型 | ❌ 未修复 |
| 22 | create:encased_chain_drive | 链条传动模型 | ❌ 未修复 |
| 23 | create:mechanical_roller | 滚轴模型 | ❌ 未修复 |
| 24 | create:mechanical_piston | 活塞杆模型 | ❌ 未修复 |
| 25 | create:sticky_mechanical_piston | 活塞杆模型 | ❌ 未修复 |
| 26 | create:mechanical_harvester | 收割机构模型 | ❌ 未修复 |
| 27 | create:mechanical_plough | 犁机构模型 | ❌ 未修复 |
| 28 | create:small_bogey | 车轮模型 | ❌ 未修复 |
| 29 | create:large_bogey | 车轮模型 | ❌ 未修复 |
| 30 | create:turntable | 传动杆 shaft | ❌ 未修复 |
| 31 | create:hose_pulley | 滑轮 pulley 模型 | ❌ 未修复 |
| 32 | create:rope_pulley | 滑轮 pulley 模型 | ❌ 未修复 |
| 33 | create:elevator_pulley | 滑轮 pulley 模型 | ❌ 未修复 |
| 34 | create:hand_crank | 摇杆 handle 模型 | ❌ 未修复 |
| 35 | create:flywheel | 飞轮模型（已有旋转但无内部轴） | ❌ 未修复 |
| 36 | create:nozzle | 喷嘴模型 | ❌ 未修复 |
| 37 | create:sequenced_gearshift | 传动杆 shaft | ❌ 未修复 |
| 38 | create:adjustable_chain_gearshift | 传动杆 shaft + 链条 | ❌ 未修复 |
| 39 | create:weighted_ejector | 弹射机构模型 | ❌ 未修复 |

---

## 三、aeronautics 命名空间 — 待修复方块

| # | Block ID | 缺失子模型 | 状态 |
|---|----------|-----------|------|
| 1 | aeronautics:propeller_bearing | 传动杆 shaft（轴承轴） | ❌ 未修复 |
| 2 | aeronautics:gyroscopic_propeller_bearing | 传动杆 shaft（陀螺轴承轴） | ❌ 未修复 |
| 3 | aeronautics:mounted_potato_cannon | 内部传动模型 | ❌ 未修复 |
| 4 | aeronautics:steam_vent | 通风口模型 | ❌ 未修复 |
| 5-18 | aeronautics:*_envelope_encased_shaft (14色) | 传动杆 shaft（信封内轴） | ❌ 未修复 |

---

## 四、simulated 命名空间 — 待修复方块

| # | Block ID | 缺失子模型 | 状态 |
|---|----------|-----------|------|
| 1 | simulated:auger_shaft | 螺旋钻轴 + 齿轮 | ❌ 未修复 |
| 2 | simulated:auger_cog | 螺旋钻齿轮 cog | ❌ 未修复 |
| 3 | simulated:swivel_bearing_link_block | 轴承连接块传动模型 | ❌ 未修复 |
| 4 | simulated:rope_winch | 绞盘模型 | ❌ 未修复 |
| 5 | simulated:torsion_spring | 扭转弹簧模型 | ❌ 未修复 |
| 6 | simulated:spring | 弹簧模型 | ❌ 未修复 |
| 7 | simulated:steering_wheel | 方向盘 handle 模型 | ❌ 未修复 |
| 8 | simulated:throttle_lever | 节流阀 handle | ❌ 未修复 |
| 9 | simulated:linked_typewriter | 打字机模型 | ❌ 未修复 |
| 10 | simulated:physics_assembler | 物理组装器传动模型 | ❌ 未修复 |
| 11 | simulated:docking_connector | 对接连接器传动模型 | ❌ 未修复 |
| 12 | simulated:paired_docking_connector | 配对对接连接器传动模型 | ❌ 未修复 |
| 13 | simulated:navigation_table | 导航台模型 | ❌ 未修复 |
| 14 | simulated:redstone_magnet | 红石磁铁模型 | ❌ 未修复 |
| 15 | simulated:redstone_inductor | 红石电感器模型 | ❌ 未修复 |
| 16 | simulated:redstone_accumulator | 红石蓄电器模型 | ❌ 未修复 |

---

## 五、渲染管线（renderPlan.ts）

### 已实现的渲染特性

| 功能 | 描述 | 状态 |
|------|------|------|
| barrel 旋转 | 12种state独立XYZ旋转（BARREL_EXTRA_ROT 配置表） | ✅ |
| barrel_shaft 旋转 | 12种state跟随主模型facing旋转 + 4种状态额外旋转 + 对称面 | ✅ |
| barrel_shaft spin排除 | barrel_shaft不参与旋转动画 | ✅ |
| shaft_half spin轴 | directional_gearshift 12种state独立spin轴配置 | ✅ |
| belt UV滚动 | 水平/对角belt纹理滚动 | ✅ |
| shaft 旋转 | gearbox shaft_half交叉旋转 | ✅ |
| mechanical_saw 倾斜 | up/down facing时刀片模型倾斜90° | ✅ |
| ironcog Y偏移 | swivel_bearing ironcog向外偏移2像素 | ✅ |
| 模型加载延迟 | RotatingVisual 200ms延迟启动旋转 | ✅ |
| instancer唯一ID | barrel使用customId避免instancer合并 | ✅ |
