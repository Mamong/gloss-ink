# 开发约定

- 使用根目录 `npm ci` 安装锁定依赖，执行 `npm test`。
- 在 `packages/` 中维护模块实现。核心不访问 DOM；运行期包不导入 SDK 或原生消息桥；DOM backend 唯一的运行期包依赖是通用 backend，其余运行期包没有 npm 依赖；跨模块能力通过具名工厂和服务注入。
- 修改公开归属类型后运行 `npm run types:component-ports`；不要手改 `component-backend-dom/ports/`。`npm run check` 会核对漂移、声明闭包和包依赖。
- 改动浏览器行为或编译产物时运行 `npm run test:browser`。保留每个标签的生命周期观察和原 CSP，不用空控制器替代实际实现。
- `npm run pack:modules` 生成可安装 tarball；默认不提交 `artifacts/`、`node_modules/`、编译结果或 npm 缓存。
- `docs/extraction-manifest.json` 和 `docs/initial-verification.json` 是初次迁移的冻结记录。后续行为修改应记录新验证结果，不覆盖历史输入。

- 引擎语义修改先跑 `npm run test:semantics` 和 `npm run check:semantics`。参考记录及已审阅差异都是只读验收输入；不要在测试命令中自动重写它们。修改需说明来源、原因及实际消费者影响，见 [语义回归说明](docs/component-semantics.md)。

- 修改实例连接、回调或提交回执时执行 `npm run test:worker`。用例使用真实 Node 线程和可控测试后端，不代表浏览器 Worker/真实 DOM 或新 Worker 进程恢复已经通过。

## 新增测试和 demo 的位置

| 变更 | 维护位置 | 验证 |
| --- | --- | --- |
| 核心数据、Behavior、实例树、模板和逻辑事件 | `test/` 的 core 组 | `npm run test:core` |
| 通用协议、DOM backend、提交、协调和跨线程连接 | `test/` 的 backend 组 | `npm run test:backend` |
| 内置组件属性、事件、交互、样式和资源清理 | `test/` 的 builtins 组 | `npm run test:builtins` |
| 浏览器工厂组合、公共标签和真实 DOM 行为 | `examples/standalone/` | `npm run test:component-standalone` |
| Now SDK 错误转换、桥接、权限或应用生命周期接线 | 对应 SDK/消费项目 | 该项目的集成测试 |

新增 `test/*.test.js` 后，同时更新 `scripts/component-test-suites.json`。每个测试文件应只属于一个分组，三组应覆盖全部通用测试文件；`npm test` 会自动发现全部文件，单独分组不替代完整回归。

测试直接使用本仓库组件包、jsdom、Node Worker 或显式的受控服务，不导入 Now SDK、原项目 helper 或本机绝对路径。无布局的 DOM 环境需要显式给出测量值；受控服务成功不能当作真实账号、相机、支付或设备验收。

通用组件回归先在此处修复，不复制回 SDK；混合用例应把 SDK 独有断言留在 SDK。验收脚本、公开标签观察项与 demo 随组件实现维护。详见[验证归属说明](docs/verification-ownership.md)。
