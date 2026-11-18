# Gloss Ink

独立组件引擎与浏览器组件工具链。组件状态和逻辑树核心、浏览器基础组件、DOM 后端、WXML/WXS 编译器和 WXSS/LESS 编译器分别作为五个 npm 包维护，可以按需要组合。

组件逻辑核心不读取 DOM；三个运行期包没有外部 npm 依赖。模板和样式编译器通过显式 schema/标签表配置。宿主资源、导航、相机授权和页面配置等服务由应用注入。

## 包结构

| 包 | 目录 | 职责 |
| --- | --- | --- |
| `@tingtalk/component-engine` | [packages/component-engine](packages/component-engine) | 数据、Behavior、实例树、逻辑事件、模板求值和节点协调 |
| `@tingtalk/builtin-components` | [packages/builtin-components](packages/builtin-components) | 40 个公开标签的目录、真实浏览器控制器及基础样式 |
| `@tingtalk/component-backend-dom` | [packages/component-backend-dom](packages/component-backend-dom) | DOM 投影、事件、布局、查询、Canvas 和提交协议 |
| `@tingtalk/template-compiler` | [packages/template-compiler](packages/template-compiler) | 构建期 WXML/受限 WXS 编译；纯浏览器 WXS runtime 子入口 |
| `@tingtalk/stylesheet-compiler` | [packages/stylesheet-compiler](packages/stylesheet-compiler) | WXSS、标签选择器、rpx 与 LESS 编译 |

保留 `@tingtalk/*` 包名和 `0.1.0` 版本以兼容已有消费者。仓库根是私有 workspace，不作为单一运行包发布；本次迁移没有向 npm registry 发布任何包。

## 开发

需要 Node.js 22.22.2+（22 系列）、24.15.0+（24 系列）或 26+，以及 npm。

```sh
git clone https://github.com/Mamong/gloss-ink.git
cd gloss-ink
npm ci
npm test
npm run pack:modules
```

`npm test` 检查包依赖/声明闭包和生成声明漂移，并运行独立的 Node 单元测试，包括无 DOM 核心、模板协调、实例重连、实际控制器清理和严格类型正反例。测试使用本仓库安装的 jsdom，不加载 Now SDK 或原项目测试 helper。通用语义回归同时覆盖 CommonJS 和无 DOM 的内嵌表达式：55 个场景各运行两次，包含数据观察器、Behavior、relations/generics 和逻辑事件；两处已知差异也逐项固定预期。详见 [语义回归说明](docs/component-semantics.md)。另外使用真实 Node Worker 与 MessagePort 验证重连身份、回执等待、回调取消和资源清理，见 [Worker 验收说明](docs/component-worker.md)。后续优先级与验收条件见 [路线图](docs/ROADMAP.md)。

`npm run pack:modules` 在 `artifacts/packages` 输出五个 tarball 和包含 SHA-256、integrity 与文件清单的 manifest。消费者可安装这些本地 tarball；不需要把整个 workspace 作为依赖。

```sh
npm install /path/to/gloss-ink/artifacts/packages/tingtalk-component-engine-0.1.0.tgz
```

核心的完整最小用例见 [component-engine README](packages/component-engine/README.md)。浏览器应用的真实工厂装配见 [examples/standalone/app.js](examples/standalone/app.js)。

## 独立浏览器验收

需要可用的 npm registry、已安装的 Google Chrome 和本地监听权限。

```sh
npm run test:browser
```

脚本将五模块分别打包，在全新目录复制验收应用，通过锁文件 `npm ci` 安装，清除 `NODE_PATH`，核对依赖真实解析路径，再执行严格 TypeScript、WXML/WXSS 构建和 Chrome 验收。输出最后一行给出应用及 `dist/acceptance.json` 所在目录。也可指定一个空目录：

```sh
node scripts/check-standalone-components.cjs artifacts/standalone
```

目录页逐项验证 40 个公开标签的创建、更新、移除和重建；组合页验证 slot、Shadow DOM 样式、原生输入/表单、keyed 重排及提交回调。扩展行为包含 Canvas 真实像素、弹层滚动锁、视口响应和页面字体/标题恢复。

40 标签覆盖是生命周期基线。相机保持隐藏；键盘附件使用显式注入的宿主几何信息；editor-portal 检查停放节点；视频没有真实解码检查。没有声称全属性/事件、全部原生设备或 GlassEasel ABI 互换通过。详细边界见 [验收应用说明](examples/standalone/README.md)。

## 声明与 CI

DOM 后端随包携带归属模块生成的声明端口，不需要额外安装核心/基础组件类型包。修改归属声明后执行：

```sh
npm run types:component-ports
npm run types:check
```

GitHub Actions 配置 Node 24/26 的单元/打包检查，以及安装 Chrome 后的独立应用验收。每个 Node job 同时保存离线语义报告、单元日志及五包 manifest；`npm test` 已包含语义测试。CI 不发布 npm 包、不部署站点。迁移来源和输入哈希见 [ORIGIN.md](ORIGIN.md)。

## License

ISC，见 [LICENSE](LICENSE)。
