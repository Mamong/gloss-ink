# 来源与迁移边界

Gloss Ink 于 2026-11-18 从 `Mamong/ting-talk-now` 的组件系统工作区提取。原路径为 `packages/now-weapp/src/{component-engine,builtin-components,component-backend-dom,template-compiler,stylesheet-compiler}`。

原项目的基准提交是 `563b1cb`；组件独立化及其后续验收当时仍是未提交的工作区修改，所以基准提交本身不包含全部迁出源码。`docs/extraction-manifest.json` 记录实际提取时每个源文件的 SHA-256、对应目标和迁入版本哈希，不能仅凭基准提交重建本次输入。

五模块运行期 JavaScript 原样迁入。迁移调整包的 repository 元信息、README 路径，以及生成声明顶部的再生成命令；类型正文和运行语义保持现有接口。新增完整 ISC 许可证文件、workspace 锁文件、独立脚本和 CI。

单元测试保留无 DOM 核心/内嵌表达式、实例重连、模板展开与协调、包闭包和控制器清理等用例；把原项目 DOM 测试 helper 替换成声明依赖 jsdom，并显式指定 TypeScript 模块解析。Now 专有错误适配层测试继续属于原项目。

浏览器应用直接迁自 `examples/component-system-standalone`，只依赖五个实际 npm 产物和自身声明的开发依赖。仓库外安装与 40 标签生命周期验收在新仓库重新执行，结果见 `docs/initial-verification.json`。

历史语义研究参考包括原项目审阅的 glass-easel 1.2.1 和 adapter 版本记录；本仓库没有引入 GlassEasel 的 vendored 实现，也未声称二进制、模板产物或后端 ABI 互换。原项目集成、宿主设备验证和性能研究不随本次提取自动扩展。

原 Now 项目中的源码仍作为当前集成快照保留；独立仓库可通过 `npm run pack:modules` 交付五包。更新 Now 的快照或依赖时需要执行其自身的 SDK/CLI/宿主检查。

2026-11-18 继续迁入通用数据、Behavior、relations/generics 与逻辑事件语义用例及已冻结双参考观察记录，来源 Now 提交 `e77e240`。场景定义和参考 JSON 原样复制，适配器改用本仓库公开工厂；无 SDK、DOM 或跨仓库路径。逐文件来源哈希见 [语义来源清单](docs/semantics-origin.json)，覆盖边界见 [语义说明](docs/component-semantics.md)。引擎运行文件及五包内容均未改变。

同日新增独立编写的 Node Worker/MessagePort 验收用例，直接使用公开 component-engine 工厂，覆盖两种加载方式的 14 个场景（28 项测试）。测试后端和 RPC 只属于验收 fixture，没有作为生产传输实现加入任何运行包；运行包仍保持相同内容。说明与边界见 [Worker 验收](docs/component-worker.md)。
