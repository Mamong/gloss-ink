# @tingtalk/component-engine

组件逻辑核心。可以从本目录单独加载或 `npm pack`，不依赖 Now SDK、DOM、微信基础库、网络或宿主桥。源码在 Gloss Ink 独立仓库维护；Now SDK 可消费打包产物或同步源码快照，核心没有反向引用。

```js
const {ComponentError, createComponentEngine} = require('./index');
const engine = createComponentEngine();
const behavior = engine.Behavior({data: {count: 0}});
const controller = engine.create(
  {behaviors: [behavior]},
  'components/counter',
  {attached: () => false},
  {}, {},
  () => {}, // 自定义事件出口
  () => {}, // 状态变化通知
);
controller.instance.setData({count: 1});
controller.destroy();
```

## 职责

- `components.js`：组件数据、properties、observer、生命周期、纯数据、更新与提交回调。
- `behaviors.js`：Behavior 定义、依赖合并、definitionFilter、内置 form-field / component-export 语义。
- `instances.js`：实例 ID、逻辑树索引、查询、关系、泛型绑定、快照及视图重连。业务实例只在逻辑侧解析。
- `data.js`：既有 JSON 数据限制、路径检查和 patch 语义。
- `selectors.js`：逻辑节点选择器，不读取 DOM。
- `events.js` / `projection.js`：不读取 DOM 的逻辑事件路径与 slot 分配规则。
- `reconciliation.js`：兄弟节点的 key/静态身份/匿名位置匹配与提前删除计划，不读取或移动物理节点。
- `template.js`：编译模板的条件、循环、引用展开、依赖与稳定 key；平台通过显式策略选择可见性和布局窗口。
- `view-connection.js`：渲染提交回执契约与连接检查。
- `error.js`：继承原生 Error 的 ComponentError；构造错误不会自动上报。

WXML/WXSS 编译器、基础组件库和 DOM backend 已分别独立为相邻模块。本包包含 slot 分配、逻辑事件、模板展开与节点匹配规则，物理投影、DOM 监听、样式和布局由 backend 执行。模块边界不等于 GlassEasel backend ABI。

## 执行与提交

`createComponentEngine({execution})` 和 `createInstanceRegistry({execution, ...})` 接受同一执行上下文，只有 `run(owner, callback)` 和 `dispose(owner)` 两项职责。Now 的 source timers 负责业务定时器的归属和取消；核心的标准微任务调度留在核心。无需业务资源管理时可以省略 execution。

controller 通过 `setView(view)` 接收渲染连接。`render()` 返回既有的 `{settled, done}` receipt，`settled: false` 时 `done` 必须是 Promise。ready / setData 回调等待相应提交，销毁抑制迟到回调。receipt 表示后端提交完成，不表示像素已上屏。Worker 的 generation、RPC 和 ViewProtocol 仍由外部适配层管理。

## 实例端口与平台服务

registry 的必填 `port` 是小型 codec 契约：`snapshot(value)`、`inputResult(value)`、`limits.nodes`。snapshot 必须执行可信 JSON 校验及拷贝；Now 适配层复用已有 ViewProtocol codec，核心不导入它。跨环境时显式传递错误字段，不依赖 Error 子类的原型传输。

可选 `platform` 负责注册页面、释放实例资源、导航、扩展端口方法和本地可视钩子。它接收受当前 registry 限定的 owner/page，而不获得可变实例表。异步任务必须尊重 `scope.live()`，并在 `release(id)` 中取消。

图片队列、相机、地图、视频、页面元信息及 SDK 错误转换都在 `../runtime/miniapp/` 的 Now 适配层。独立使用核心时抛出 ComponentError；通过 Now 适配层调用时转换为 NowAppError，保留 code 和 cause，业务自行抛出的其他异常保持原对象。`scope(target)` 是可信逻辑侧 API，不经 JSON 端口暴露。

## 源码打包

`source.js` 只用于构建期，把同一份导出函数序列化成闭包表达式，供现有 SDK / 编译器嵌入；运行期不需要 Node 模块加载器、eval 或 Function 构造器。独立 Node 入口与内嵌浏览器入口共用实现。

历史语义参考为原 ting-talk-now 仓库锁定的 glass-easel 1.2.1 源码及 adapter 审阅记录；来源与迁移边界见仓库根目录 `ORIGIN.md`。借鉴了核心自有 Error、Behavior 和异步 backend render 边界；保留本项目既有异常传播、数据差异及 receipt / 重连契约。

## 模板展开与协调端口

`createTemplateEvaluator(template, {element})` 接收编译后的模板程序，返回 `evaluate(data, changedRoots)`。每次求值重新建立模板调用计数，条件/循环/模板引用生成不带物理节点的树；循环 key 校验覆盖被虚拟窗口省略的条目。`element(node, context)` 可返回 skip、flatten、range、before/after 或扩展 metadata。视口判断、虚拟滚动布局和 spacer 外观由平台提供，核心只执行通用展开。WXS reset 和模板工厂装配仍由调用方负责。

`createChildReconciler().plan(previous, next)` 返回 removeFirst、entries 和 removeLast。entries 保留原始对象引用，一个旧节点最多匹配一次；同 key 不同 tag 会替换，匿名位置匹配不会复用已安排提前删除的节点。backend 按三阶段执行删除、patch/移动、末尾清理，自己判断物理移动并分发生命周期。计划不读取 element、DOM、样式或布局。

两端口都可通过 CommonJS 或 source.js 的内嵌表达式加载；类型声明不需要 DOM lib。它们沿用本项目编译模板语义，不表示接受官方编译器字节码。

逻辑事件的original参数使用平台无关的结构化能力声明（停止传播、阻止默认行为等），无需DOM lib也能接收原生Event。编译事件显式声明capture；模板程序可携带具有reset端口的WXS状态。后端使用生成的本地声明快照对齐这些边界，核心仍无DOM/SDK依赖。

## 后端契约

核心拥有最小 `RenderBackend` 接口：`render(): RenderReceipt | void`。`ComponentView` 在此基础上增加逻辑组件需要的变更、查询和销毁接口；`createViewConnection` 保持原来的回执检查行为。核心不依赖任何后端实现。`@tingtalk/component-backend` 提供可选的提交/事件协议，`@tingtalk/component-backend-dom` 执行 DOM 渲染。
