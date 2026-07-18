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

---

## 一、create 命名空间

### 待修复方块（子模型缺失或旋转不正确）

| # | Block ID | 缺失子模型 | 状态 |
|---|----------|-----------|------|
| 1 | create:cogwheel | 传动杆 shaft（独立齿轮应有轴） | ❌ 未修复 |
| 2 | create:large_cogwheel | 传动杆 shaft（大齿轮应有轴） | ❌ 未修复 |
| 3 | create:shaft | 无（方块本身即为传动杆） | ✅ 已有旋转 |
| 4 | create:powered_shaft | 传动杆 shaft（应与 shaft 同理） | ❌ 未修复 |
| 5 | create:encased_fan | 风扇叶片 fan（应有旋转叶片子模型） | ❌ 未修复 |
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
| 37 | create:spout | 出液口模型 | ❌ 未修复 |
| 38 | create:sequenced_gearshift | 传动杆 shaft | ❌ 未修复 |
| 39 | create:adjustable_chain_gearshift | 传动杆 shaft + 链条 | ❌ 未修复 |
| 40 | create:weighted_ejector | 弹射机构模型 | ❌ 未修复 |

---

## 二、aeronautics 命名空间

### 待修复方块

| # | Block ID | 缺失子模型 | 状态 |
|---|----------|-----------|------|
| 41 | aeronautics:wooden_propeller | propeller + reversed multipart 注入 | ❌ 未修复 |
| 42 | aeronautics:smart_propeller | propeller + reversed multipart 注入 | ❌ 未修复 |
| 43 | aeronautics:propeller_bearing | 传动杆 shaft（轴承轴） | ❌ 未修复 |
| 44 | aeronautics:gyroscopic_propeller_bearing | 传动杆 shaft（陀螺轴承轴） | ❌ 未修复 |
| 45 | aeronautics:mounted_potato_cannon | 内部传动模型 | ❌ 未修复 |
| 46 | aeronautics:steam_vent | 通风口模型 | ❌ 未修复 |
| 47 | aeronautics:black_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 48 | aeronautics:blue_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 49 | aeronautics:brown_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 50 | aeronautics:cyan_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 51 | aeronautics:gray_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 52 | aeronautics:green_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 53 | aeronautics:light_blue_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 54 | aeronautics:light_gray_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 55 | aeronautics:lime_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 56 | aeronautics:magenta_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 57 | aeronautics:orange_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 58 | aeronautics:pink_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 59 | aeronautics:purple_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 60 | aeronautics:red_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 61 | aeronautics:white_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |
| 62 | aeronautics:yellow_envelope_encased_shaft | 传动杆 shaft（信封内轴） | ❌ 未修复 |

---

## 三、simulated 命名空间

### 待修复方块

| # | Block ID | 缺失子模型 | 状态 |
|---|----------|-----------|------|
| 63 | simulated:auger_shaft | 螺旋钻轴 + 齿轮（multipart 已有模型，需检查渲染） | ❌ 未修复 |
| 64 | simulated:auger_cog | 螺旋钻齿轮 cog（multipart 已有模型，需检查渲染） | ❌ 未修复 |
| 65 | simulated:directional_gearshift | 传动杆 shaft（转向齿轮箱，multipart 已有模型） | ❌ 未修复 |
| 66 | simulated:black_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 67 | simulated:blue_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 68 | simulated:brown_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 69 | simulated:cyan_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 70 | simulated:gray_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 71 | simulated:green_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 72 | simulated:light_blue_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 73 | simulated:light_gray_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 74 | simulated:lime_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 75 | simulated:magenta_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 76 | simulated:orange_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 77 | simulated:pink_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 78 | simulated:purple_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 79 | simulated:red_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 80 | simulated:white_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 81 | simulated:yellow_portable_engine | 便携引擎内部传动模型 | ❌ 未修复 |
| 82 | simulated:swivel_bearing | 旋转轴承传动杆 shaft | ❌ 未修复 |
| 83 | simulated:swivel_bearing_link_block | 轴承连接块传动模型 | ❌ 未修复 |
| 84 | simulated:rope_winch | 绞盘模型 | ❌ 未修复 |
| 85 | simulated:torsion_spring | 扭转弹簧模型 | ❌ 未修复 |
| 86 | simulated:spring | 弹簧模型 | ❌ 未修复 |
| 87 | simulated:steering_wheel | 方向盘 handle 模型 | ❌ 未修复 |
| 88 | simulated:throttle_lever | 节流阀 handle（multipart 已注入，需检查旋转） | ❌ 未修复 |
| 89 | simulated:linked_typewriter | 打字机模型（multipart 已注入，需检查渲染） | ❌ 未修复 |
| 90 | simulated:physics_assembler | 物理组装器传动模型 | ❌ 未修复 |
| 91 | simulated:docking_connector | 对接连接器传动模型 | ❌ 未修复 |
| 92 | simulated:paired_docking_connector | 配对对接连接器传动模型 | ❌ 未修复 |
| 93 | simulated:navigation_table | 导航台模型 | ❌ 未修复 |
| 94 | simulated:redstone_magnet | 红石磁铁模型 | ❌ 未修复 |
| 95 | simulated:redstone_inductor | 红石电感器模型 | ❌ 未修复 |
| 96 | simulated:redstone_accumulator | 红石蓄电器模型 | ❌ 未修复 |

---

## 已修复方块

| # | Block ID | 修复内容 | 状态 |
|---|----------|---------|------|
| 1 | create:belt | 对角渲染 start/end 交换 + pulley 注入 + vertical 注入 | ✅ 已修复 |
| 2 | create:gearbox | 4× shaft_half 注入 + 交叉旋转 | ✅ 已修复 |
| 3 | create:creative_motor | shaft_half 注入 + facing 旋转 | ✅ 已修复 |
| 4 | create:andesite_encased_cogwheel | 齿轮子模型注入 | ✅ 已修复 |
| 5 | create:brass_encased_cogwheel | 齿轮子模型注入 | ✅ 已修复 |
| 6 | create:andesite_encased_large_cogwheel | 大齿轮子模型注入 | ✅ 已修复 |
| 7 | create:brass_encased_large_cogwheel | 大齿轮子模型注入 | ✅ 已修复 |
| 8 | create:andesite_encased_shaft | 传动杆子模型注入 | ✅ 已修复 |
| 9 | create:brass_encased_shaft | 传动杆子模型注入 | ✅ 已修复 |
| 10 | create:steam_engine | 连杆/活塞子模型注入 | ✅ 已修复 |
| 11 | create:analog_transmission | 齿轮子模型注入 | ✅ 已修复 |
| 12 | create:mechanical_mixer | 搅拌头旋转 | ✅ 已修复 |
| 13 | aeronautics:andesite_propeller | propeller + reversed multipart 注入 | ✅ 已修复 |
