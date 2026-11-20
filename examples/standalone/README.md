# 独立组件系统验收应用

这是一个真实浏览器应用。构建仅导入六个已安装的 `@tingtalk` 包与声明的开发依赖；运行期不导入 Now SDK、仓库 helper、测试 DOM、空控制器或其他源码。输入、交互与表单使用基础组件包公开的实际实现。

在仓库根目录运行：

```sh
node scripts/check-standalone-components.cjs /tmp/ting-components-acceptance
```

目标目录必须为空。脚本复制本目录的应用文件，将六模块分别 `npm pack` 后安装到新目录，移除 `NODE_PATH`，核对实际模块解析路径，使用应用 lockfile 执行 npm ci，再检查类型、构建并运行 Chrome 验收。需要可用的 npm registry 及已安装的 Google Chrome。验收结果保留在新目录的 `dist/acceptance.json`，完整 lockfile 与 tarballs 也保留，便于复现。

新目录可脱离本仓库直接运行：

```sh
npm ci
npm run typecheck
npm run build
npm test
```

应用涵盖模板引用、条件节点消失期间的原生点击、父子属性、真实原生输入、表单提交、具名/默认 slot、Shadow DOM 样式隔离、keyed 重排时 DOM/实例身份、提交后回调与销毁。编译在 Node 构建阶段完成；浏览器不使用 eval/Function，沿用显式 CSP。销毁场景额外挂起一次应用自有渲染回执，确认迟到回调受到抑制。

新增 `?catalog` 页面逐项覆盖公开目录中的 41 个基础标签。构建时核对标签目录、观察项和 WXML 标签集合，缺项会直接失败；浏览器逐项检查创建、更新时节点身份、移除和重建，并检查原生表单、Canvas 2D 查询、弹层清理与视口响应。`dist/acceptance.json` 包含每个标签的观察节点和通过阶段。

41 标签覆盖指生命周期基线，不代表所有属性、事件、宿主服务、Worker/跨进程协议或 GlassEasel 互换性均已验收。相机保持隐藏，不请求真实采集；键盘附件通过显式注入宿主键盘几何信息激活，未使用真实软键盘；editor-portal 检查停放节点，不包含自定义区块插入；不触发实际导航，也不加载外部图片。

模板求值与兄弟节点协调通过 `component-engine` 的公开工厂接入；DOM backend 只执行物理操作。应用类型检查同时检查只读节点序列、协调结果类型和平台展开策略的参数约束。

复杂控制器也使用包内实际实现：picker弹窗、editor输入/context、scroll-view与有界虚拟窗口、地图标记/状态、视频属性与弹幕清理、无障碍和默认样式。WXS使用模板编译器的纯浏览器runtime子入口。销毁验证会保留旧context，确认操作失效、弹窗/覆盖节点/地图状态/滚动登记都已清理。视频检查仅验证浏览器属性与控制器生命周期，没有媒体解码或播放质量验收；相机未请求真实采集权限，宿主授权/采集服务仍需外部注入。

后端装配类型使用随包声明，不需要运行期或额外类型peer。contracts.ts只作为noEmit类型验收，包含真实工厂连接和带@ts-expect-error的负向装配示例，不进入浏览器bundle；选择器、Canvas、页面资源配对与协议完成回调也有检查。打包脚本会先验证声明生成物和依赖闭包。

类型验收同时覆盖虚拟事件节点/文本投影和普通DOM节点，确认节点泛型不会丢失viewNodeId等元数据。单独backend声明验收在仓库unit中执行；该目录的六包组合验收继续检查各真实工厂的结构兼容性。

目录页通过应用自己的 `platform.request` 服务将 `page.meta` 的标题配置写入 `document.title`，并验证更新及移除后恢复。实际控制器仍全部来自安装的基础组件包；浏览器服务不提供原生导航栏呈现或真实相机能力。

web-view 使用包内真实控制器，但保持隐藏；页面注入服务记录 update/remove 请求并在 owner 释放时清理。验收其 src 更新、DOM占位不进入图片资源解析、异步提交、移除/重建和服务清理，不包含 iframe、WKWebView、网页桥接或导航实现。
