# 验证归属与维护入口

维护说明：2026-11-26。

Gloss Ink 维护六个组件包及其通用测试、脚本和独立 demo。消费方通过锁定源码或 npm 产物接入，维护自己的适配和产品验收；通用组件缺陷应在本仓库修复，避免两套测试和 demo 分别演进。

## 仓库布局

| 路径 | 职责 |
| --- | --- |
| `packages/component-engine/` | 无 DOM 组件逻辑核心 |
| `packages/builtin-components/` | 内置组件目录、控制器和默认样式 |
| `packages/component-backend/`、`packages/component-backend-dom/` | 通用协议与 DOM 实现 |
| `packages/template-compiler/`、`packages/stylesheet-compiler/` | 模板与样式编译 |
| `test/` | 组件本身的语义、控制器和多包组合回归 |
| `scripts/component-test-suites.json` | core/backend/builtins 的唯一分组清单 |
| `scripts/test-components.cjs` | 分组执行、参数转发和退出码 |
| `scripts/check-component-engine.js`、`scripts/build-component-ports.cjs` | 包边界与生成声明 |
| `scripts/pack-modules.cjs` | 六包打包与哈希 manifest |
| `scripts/check-standalone-components.cjs` | 全新目录安装、类型、构建和浏览器验收 |
| `examples/standalone/` | 直接装配六个已安装包的独立浏览器应用 |

## 选择验证命令

```sh
npm ci
npm run test:core
npm run test:backend
npm run test:builtins
npm test
npm run pack:modules
```

core 组检查数据、Behavior、逻辑树、模板规则及逻辑事件；backend 组检查协议、回执、DOM 装配、缓存和 Worker 连接；builtins 组检查输入/表单/picker/editor/媒体等控制器。三个分组按测试文件的主要职责划分，组合测试允许跨多个组件包；每份文件只列入一组。

引擎语义修改还应执行 `npm run check:semantics`，公开声明修改应执行 `npm run types:component-ports` 和 `npm run types:check`。修改浏览器行为或编译产物时执行：

```sh
npm run test:component-standalone
```

该命令与 `npm run test:browser` 等价，需要 npm registry、Google Chrome 和本地监听权限。demo 覆盖 42 个公开标签的创建、更新、移除与重建；功能页组件还验证鼠标/键盘激活、参数转发及 success/cancel/fail。实际权限、身份、支付或地址服务不由测试替代。详见[独立应用说明](../examples/standalone/README.md)。

## 与消费 SDK 的边界

Gloss Ink 测试使用自身模块，不导入 Now SDK 或消费项目 helper。SDK 仍需核验来源锁和所消费的源码/声明，并验证错误转换、Promise 身份、桥接、Worker、页面与宿主接线；这些消费检查不替代上游通用组件测试。

Now 产品侧的文档 profile、平台能力说明与服务授权验收仍由 Now 维护。Now 可以通过显式 `GLOSS_INK_ROOT` 转发上游验证命令，但测试清单和 demo 只在 Gloss Ink 维护；运行本仓库命令本身无需设置该变量。

## 历史记录与验证范围

2026-11-18 的 extraction、semantics、Worker、web-view 报告属于各自冻结版本，五包及 40/41 标签等历史数字不重写。当前维护入口是本页、根 README 和 CONTRIBUTING；旧报告不自动证明后续代码。

2026-11-26 本批验证为 Node 363/363、六包打包及独立 Chrome 42 标签验收。Node/jsdom/受控服务与 Chrome 的结果分别记录，不能据此宣称全部属性、真实软键盘/相机、所有原生平台或 GlassEasel ABI 已验收。CI 配置存在不代表远端指定提交已经通过。
