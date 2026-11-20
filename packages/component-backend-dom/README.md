# @tingtalk/component-backend-dom

DOM 渲染后端，从 Now 的视图驱动中提取。入口为 `createDomBackend(environment)`；另导出 DOM 事件监听、范围节点和样式应用工具 `createComponentViews`，以及可独立使用的 `createViewProtocol` / `createSelectorQueryTools`。

后端不接收 SDK 对象。运行环境提供 document/定时器、编译后的模板与视图配置、基础组件注册器、逻辑实例端口、可视连接及提交跟踪接口。`Error` 默认为原生 Error；Now 的薄适配层提供 NowAppError 和 trackCommit；表单服务直接接收 Error 构造器。

逻辑事件路径、slot 分配、模板展开和兄弟节点匹配通过核心的 logicalEvents/projectionPlanner/templateEvaluator/childReconciler 接口提供；DOM 监听、物理节点移动、Shadow DOM、样式与资源呈现由本包处理。实例端口与 ViewProtocol 仍显式注入且可替换。ViewProtocol 的实现归属 `@tingtalk/component-backend`，本包显式依赖该包，并保留 `createViewProtocol` 和 `protocol.js` 的兼容导出。协议继续使用 now-view-v1；它不属于组件逻辑核心，也不导入宿主、路由或网络实现。

基础组件库通过 `config.builtinComponents` 提供节点映射、初始化和属性更新。输入、表单、原生媒体、手势等可视功能仍通过具名 capability factories 配置；它们不是本包的 npm 依赖。

这是当前 DOM 实现的模块边界，不是 GlassEasel backend ABI。替换成 GlassEasel 需要适配模板产物、事件/slot、样式和提交语义，现有受限开发后端继续保留。

## 独立验收与类型边界

仓库示例 `examples/standalone` 只通过六包 npm 产物与声明依赖构建，覆盖原生输入、表单、slot、Shadow DOM 样式和 keyed 重排。`npm run test:component-standalone` 在全新目录安装并运行严格 TypeScript 检查及真实 Chrome 验收。

`DomBackendConfig` 的全部工厂采用明确的输入与返回端口，已移除 CapabilityFactory / never[] 占位。模板、事件、查询、Canvas、资源租约与 ViewProtocol 均有具名接口；`schedule` 接收 registry 回调令牌，`render/show` 允许销毁后的 void。协议包和业务数据仍以 unknown 进入运行期校验。

## 物理执行与平台策略

DOM driver 只按核心的协调计划执行删除、patch、物理移动和生命周期通知；虚拟投影的声明顺序、Shadow DOM、原生事件绑定、提交协议和资源清理留在本包。模板的条件、循环、引用及 key 展开已迁至核心；driver 为 match-media 提供视口策略，为虚拟列表提供布局窗口与 spacer，同时保留页面配置节点的页面/组件限制。

装配时必须显式提供 `config.templateEvaluator` 和 `config.childReconciler`。SDK、分析/正式编译、Worker 和独立验收应用均使用核心导出的对应工厂。两包之间没有隐式相对导入。

实例端口确认 `component.attach` 的 `attached: true` 后，driver 在该组件 DOM 仍连接时复用此确认，避免后续渲染重复发送相同的连接状态。未确认的挂载仍重试；DOM 断开会重新通知逻辑端，之后重连和新建组件必须重新确认。首次挂载的提交回执仍参与渲染完成等待，属性、子视图渲染、树提交和生命周期语义保持。

## 控制器装配

picker/editor/nativeComponents/interactiveComponents/layerComponents/virtualList/cameraRuntime/keyboardAccessory/pageMeta/backToTop/matchMedia/accessibility 均由基础组件包提供实际实现。videoRuntime/mapRuntime 也通过配置注入；driver 只保留作用域节点查询、实例/宿主请求与事件连接，视频事件详情和地图绘制已归属相应控制器。未提供某项能力时，对该能力的调用明确失败。

控制器选项的公开声明由基础组件包维护，后端从归属模块生成随包的本地类型声明。装配层不需要外部类型peer，也不加载这些声明作为运行代码。宿主相机authority、资源、页面元信息send与错误转换保持在外部适配层。

## 类型声明生成与独立性

`ports/backend.d.ts`、`ports/engine.d.ts`、`ports/builtin.d.ts` 与 `ports/wxs.d.ts` 由对应归属模块的公开声明生成，包含规范化LF文本的SHA-256。它们是分发所需的类型快照，避免消费者为了检查backend配置而额外安装类型依赖；运行时仍需安装声明的通用 backend 依赖。手写契约只维护backend自己的view/query/canvas类型，其余直接引用本地生成声明。

```sh
node scripts/build-component-ports.cjs
node scripts/build-component-ports.cjs --check
```

在仓库根目录可用 `npm run types:component-ports`。架构/组件专项及独立打包验收会检查快照；归属声明变化未重新生成时直接失败。声明依赖检查拒绝外部包、跨目录逃逸与未列入tarball的引用。当前归属声明是自包含文件；若未来拆出内部引用，生成器会要求补齐声明闭包。

`DomBackendConfig = DomBackendFactories & PageResourceBinding`：配置pageResources时必须同时给出具有route/template/styles的pageEntries。资源lease返回释放函数；视图查询需要fields或显式node模式；逻辑协议可单独创建而不携带视图render，render提交回调返回void/完成Promise。事件、输入及浏览器属性服务保留具体节点泛型，能够连接逻辑路径与原生DOM事件，避免扩大成只有基础属性的节点。

严格类型验收包含真实六包组合和backend单包空目录检查，并通过负向示例确认控制器接错位置、缺失生命周期、SDK对象代替服务、无效模板/WXS/查询/绘图参数都会在编译时失败。运行期JSON限制、权限、生命周期和资源authority仍按原实现执行；本批未改浏览器执行代码。

事件工具同时声明普通HTMLElement事件节点、虚拟range及其文本子节点；父路径保持同一种逻辑事件节点结构。查询工具提供节点/测量操作的判别联合、编辑器context和旧版Canvas接口；本地Canvas解析器与远程执行端口有明确互斥要求。业务/传输消息仍通过unknown进入JSON与生命周期检查，未用宽泛函数签名替代这些运行期边界。

发送事件的source/target也保留DomEventNode类型，原始事件提供结构化触点/坐标信息；虚拟节点的父链仍能保留这些元数据，不需要把它们扩大成没有viewNodeId的基础节点或强制转换成原生HTMLElement。

Unchanged logical node indexes reuse only a matching `tree.commit` revision acknowledgment. Node order, IDs, classes, component identity, parent topology and movement notifications still commit; a new view starts without cached topology. Data snapshots, child rendering and render receipt/callback waits remain unchanged.
