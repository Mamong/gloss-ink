# @tingtalk/builtin-components

基础组件 schema、注册器和浏览器基础实现。没有组件引擎、SDK、宿主或编译器依赖。

- `createBuiltinCatalog()` 提供现有标签、属性、事件、DOM 节点映射和图标枚举；编译器读取同一份 schema。
- `createBuiltinRegistry()` 注册具体节点与 create / created / attributes / remove 钩子，后端无需内嵌 icon 等分支。
- `createBrowserComponents(root, services)` 提供默认 DOM 映射、icon、slider、progress 及通用属性同步。资源、输入和 Canvas 由显式服务接口提供。
- 现有 input/editor/picker/媒体等较复杂控制器仍通过 backend 的 capability factories 装配。

注册替换只影响之后创建的元素。已创建元素固定使用原定义，属性更新和清理保持同一归属。重复注册默认失败，可用 `{replace:true}` 显式替换。

```js
const {createBrowserComponents}=require('./index');
const components=createBrowserComponents({document});
const node={tag:'icon',attrs:{type:'success',size:24,color:'#09bb07'},dataset:{}};
const element=document.createElement(components.nodeName(node.tag));
components.create(element,node);
components.created(element,node);
components.attributes(element,undefined,node);
```

应用在 Now 环境下使用 manifest 资源解析与实例作用域；独立使用时须提供相关资源服务。默认 icon 的图形仍为既有 Unicode 实现，本次拆分没有改变外观兼容等级。

## 浏览器输入、交互与表单

`createTextInputRuntime(root, options)`、`createWeappInteractions(root, options)`、`createFormRuntime(root, ErrorType, settings)` 公开原有真实控制器。它们处理 DOM 输入/IME/选区、hover/手势以及表单字段/提交/重置，且各自保留原有资源清理与宿主键盘信息接入点。原 SDK 源码地址仅保留 Node 适配，浏览器构建按逻辑源名序列化同一份实现。

表单服务直接接收 Error 构造器，不接受 SDK。媒体、picker、editor、scroll-view 等浏览器控制器已迁入本包；宿主采集/授权和所有基础标签的完整验收仍未完成。完整组合应用见 `examples/standalone`。

## 复杂控制器与默认样式

本包现公开 picker、editor、scroll-view/swiper/rich-text、交互组件、层组件、虚拟列表、camera、keyboard-accessory、page-meta、match-media、返回顶部和无障碍控制器，以及从 DOM driver 提取的 video/map 控制器。公开入口和各自选项见 index.d.ts；所有实现均可独立加载，不导入 SDK、宿主或其他源码目录。

| 入口 | 负责 | 外部服务 |
| --- | --- | --- |
| createPickerRuntime / createEditorRuntime | 选择弹窗、富文本模型与原生输入 | 事件/可见性、可选地区数据；编辑器资源与context装配 |
| createNativeComponents / createInteractiveComponents / createLayerComponents | 滚动、轮播、富文本呈现、可移动/选择、弹层 | 资源、节点查询、事件、样式、页面/样式根 |
| createVirtualLists / createBackToTop | 真实布局窗口、测量、返回顶部仲裁 | invalidate；可选publish几何状态 |
| createCameraRuntime / createVideoRuntime / createMapRuntime | 相机视图、视频操作/事件详情/弹幕、本地地图呈现与操作 | 相机host authority；视频/地图的作用域查询、live和事件 |
| createKeyboardAccessoryRuntime / createPageMeta / matchesViewport / createAccessibility | 键盘附件、页面配置、视口条件、无障碍关系和键盘激活 | DOM/布局、显式页面配置send；Error和事件 |

`createBackToTop(root, {publish})` 不访问原生消息桥；Now 的 back-to-top 适配层把 publish 接到 WebKit。camera 的采集/授权和 page-meta 的宿主导航操作仍由显式服务负责，不能仅凭控制器导出宣称相机或所有宿主功能通过。

video 控制器在隐藏、移除和销毁时清理自己创建的弹幕节点与计时器，并拒绝隐藏/销毁后的操作。map 控制器清理其持有的呈现层和状态。视频原生解码/播放能力和第三方地图瓦片不由本包提供。

`styles.css` 是 SDK 与独立应用共用的默认基础样式源。应用可在页面加载，也可与组件自有样式一起放入 Shadow DOM；宿主/应用仍决定是否采用这些默认外观。旧 runtime/base.css 只保留兼容导入。

主 browser 工厂的源码序列化只包含注册/属性所需实现；复杂控制器由各自逻辑源名单独注入，避免重复嵌入。地区参考数据仍由应用显式提供。独立验收中的真实 picker/editor/虚拟滚动/map/video/WXS 与销毁场景不代表全部40标签或原生设备已验收。

事件交互、文本输入、浏览器属性和键盘附件的声明保留节点泛型，便于装配层传递具体的逻辑事件节点。后端分发包通过生成本地声明快照引用这些服务选项，快照一致性由构建检查维护，不新增运行期依赖。

控制器元数据还声明虚拟宿主的最小物理标记与文本子节点，使逻辑父链和投影内容可保持类型；实际操作原生控件的方法仍接收对应DOM元素。类型不要求基础组件包导入某个DOM backend。

## web-view 服务委托

`createWebViewRuntime(root, {Error, request})` 导出 web-view 控制器。DOM backend 通过 `webViewRuntime` 工厂注入，向实例所属平台服务发出 `webview.update` / `webview.remove`；update 包含 scoped nodeId、src、visible、元素 id/dataset 及 load/error/message 绑定。src 不走图片资源解析。

控制器维护 DOM 占位与请求委托，不创建嵌入浏览器。网页容器、URL策略、消息交付、前后台和页面卸载时的服务资源释放由宿主拥有；controller.dispose 清除本地记录，不向已卸载实例发出RPC。41标签独立目录应用使用显式服务记录器验证这一边界。

## rpx 单位策略

统一采用 `layout-pixel-v1`：750rpx 对应当前内容视口宽度；每个非零 rpx 长度按绝对值向下取整，最少 1 CSS px，再恢复符号；0 为 0。DPR 不参与布局取整，px/% 不取整。CSS 结果保留视口变量，resize 时重新计算；数值属性使用相同的 `createRpxUnits().pixels()`。CSS 呈现需要浏览器支持 `round()`。

## selection 与 editor-portal

selection 默认采用行内布局，业务 class/行内 display 可覆盖；hidden 始终隐藏。selectionchange 的 selectedString 只拼接范围内可选 text/rich-text 文本，单一 editor 子节点沿用原生选区字符串；firstRangeRect 使用完整 Range 外接矩形，覆盖多行与跨节点范围。重复有效载荷去重，移到区域外发送折叠状态，隐藏/销毁后不发送。

editor-portal 保留区块节点身份、原生输入和各自编辑器归属。区块内部的输入、粘贴、IME 和键盘事件在 portal 处停止原生冒泡，监听器随移除/销毁释放；逻辑 input/change/confirm/focus/blur 可传到 portal 本身，随后终止，tap 等普通业务事件仍沿原有投影路径传播。编辑器 Delta、历史与区块控件状态继续由各自控制器维护。

## 宿主组件外框

map 默认外框为 300×150 CSS px；本地模拟内容在内部裁剪层绘制，不覆写业务外框的 background/overflow/position。地图数据、瓦片与投影精度仍由宿主能力边界说明。

camera 在尚无预览的浏览器回退中采用自动宽、22px 高的透明外框；成功连接后恢复 100% 宽、240px 高的预览默认，业务尺寸/背景继续覆盖。预览图不隐藏，停止/隐藏/失败时清除就绪标记。回退尺寸仅表示当前浏览器兼容配置，不代表原生摄像头画面规格。

web-view 是行内 DOM 占位，包含空块标记以保留文档流，真实网页由显式宿主服务绘制。更新不覆写业务 style，hidden 同时进入服务 visible 状态；不会在本组件创建 iframe 或加载网页。keyboard-accessory 保留原有焦点和键盘几何门控、停放、hold-keyboard、200px 上限与生命周期；无键盘时不虚构固定投影尺寸。

## picker 响应式交互

picker 以所属视图内容宽度640px为界：小屏使用底部滚动列，大屏保留居中对话框与浏览器原生选择/日期时间控件。切换视口时保留当前草稿。两种布局都在每次确认时发送一次change（包括未改值确认），取消不提交；既有数值/字符串载荷类型保持。小屏滚动、点选、键盘、日期/时间边界及多列/地区联动共用原有模型和校验；内部原生控件持有规范值，显示列不直接改写提交值。

## Page 文档默认值

业务文档只保留16px基础字号，不强设body的文字色、背景、font-family或line-height。Page默认继承浏览器/宿主环境；app.wxss与页面样式按正常级联覆盖。生成的微信小程序分析/编译视图默认不指定html语言，避免预设zh-CN影响CJK字体回退；用户明确指定的语言与宿主字体仍保留。
