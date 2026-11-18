# 开发约定

- 使用根目录 `npm ci` 安装锁定依赖，执行 `npm test`。
- 在 `packages/` 中维护模块实现。核心不访问 DOM；运行期包不导入 SDK、原生消息桥或其他 npm 包；跨模块能力通过具名工厂和服务注入。
- 修改公开归属类型后运行 `npm run types:component-ports`；不要手改 `component-backend-dom/ports/`。`npm run check` 会核对漂移、声明闭包和包依赖。
- 改动浏览器行为或编译产物时运行 `npm run test:browser`。保留每个标签的生命周期观察和原 CSP，不用空控制器替代实际实现。
- `npm run pack:modules` 生成可安装 tarball；默认不提交 `artifacts/`、`node_modules/`、编译结果或 npm 缓存。
- `docs/extraction-manifest.json` 和 `docs/initial-verification.json` 是初次迁移的冻结记录。后续行为修改应记录新验证结果，不覆盖历史输入。
