# 通用组件语义回归

2026-11-18。独立仓库在原有 30 项 Node 测试之上，增加 135 项语义、提交回执及验收器负向测试，首批完整 `npm test` 为 165 项；后续增加真实 Worker 验收后共 193 项，见 [Worker 说明](component-worker.md)。两种加载方式使用完全相同的应用操作与预期：CommonJS 公开入口，以及 `source()` 生成、在没有 DOM/SDK 全局对象的 VM 中加载的内嵌表达式。

```sh
npm test
npm run test:semantics
npm run check:semantics
npm run check:semantics -- --out artifacts/semantics.json
```

| 语义集合 | 独立场景数 | 说明 |
| --- | ---: | --- |
| 数据/观察器 | 7 | 属性初始化、同值/批量观察、嵌套路径、级联、实例默认值隔离 |
| Behavior/relations/generics | 21 | 合并及优先级、菱形行为、互向关系、移动/删除、泛型默认/覆盖/转发 |
| 逻辑事件 | 27 | capture/bubble、composed 边界、target 重定向、投影改派、未匹配/移除/恢复 slot |
| 合计 | 55 | 每种加载方式分别执行；53 项双参考一致，2 项保留已审阅差异 |

这些 55 个场景在两种加载方式下形成 110 项逐场景测试，另有 6 项集合/策略校验、6 项提交回执/事件 detail 隔离测试和 13 项验收器负向测试，合计 135 项新增测试。集合与逐场景测试有覆盖重叠，不能把 110 写成 110 个不同场景。

参考数据从 Now 的既有测试迁入，采集于 2026-11-17，参考版本为 miniprogram-exparser 2.29.1 和 glass-easel 1.2.1；本批只使用离线采集记录，没有重新执行这两个上游引擎，也没有下载或内置其实现。原始 `references.json` 继续保留上游来源、许可证、入口哈希与历史 Now 集成策略；本仓库只消费 data/extensions/treeEvents 三个集合。逐文件来源与适配哈希见 [semantics-origin.json](semantics-origin.json)。

已审阅差异为 numeric dot path 的数组存储和 Behavior 数组合并。`reviewed-differences.json` 固定现有输出，由来源提交的既有 Now 适配器采集。验收同时要求明确策略、非空理由以及当前结果严格匹配；写了理由仍不能放行其他变化。命令没有更新或重录模式。负向测试验证观察顺序变化、差异输出变化、参考分歧、丢失/多余/同数重命名场景、孤立策略及错误 CLI 参数会失败。

实例注册通过公开 `createInstanceRegistry` 注入测试自身的 JSON snapshot/inputResult/节点预算端口，未加载 Now 的视图协议。该端口只用于这里的合法场景，不能代替 Now 对协议预算、校验和宿主边界的集成验收。

逻辑事件直接调用 `createLogicalEvents`。带 virtual-host 名称的场景只验证逻辑组件边界不变，没有验证物理 DOM range 或可见投影；这部分继续由独立浏览器应用和 Now 集成验收承担。编译页面的 keyed 生命周期、Worker 跨线程调度、真实软键盘、相机、视频解码及宿主桥接没有迁入这批通用用例。两种 VM/模块加载方式也不是独立 Worker 验收。

CI 的 Node 24/26 job 执行语义门禁、完整测试和五包打包，使用 `always()` 上传各自语义报告、单元日志及 manifest，matrix 禁用 fail-fast，便于分别发现两条 Node 版本线的失败。Chrome job 保留现有全新安装与 28 场景/40 标签应用验收。本地验收与 GitHub 远端执行状态分别记录；配置正确不代表远端已经通过。
