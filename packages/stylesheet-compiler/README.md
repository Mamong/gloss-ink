# @tingtalk/stylesheet-compiler

构建期 WXSS 与 Less 处理模块。样式编译器接受标签集合，不依赖 template 编译器、SDK、运行时或 DOM。

```js
const {createStylesheetCompiler}=require('./index');
const compiler=createStylesheetCompiler({tags:['view','text','icon']});
const css=compiler.compile(['page.wxss'],read,asset,diagnostic,'[data-weapp-route="page"]');
```

保留既有 @import、标签选择器映射、rpx、keyframes、资源重写、owner 隔离、externalClasses 和共享样式导出语义。输出是当前 DOM backend 使用的 CSS 文本，样式应用与 stylesheet 句柄由后端负责。

`createLessCompiler` 是可选的工程预处理入口，继续在有界子进程内对输入快照编译；禁止远程导入、JavaScript 和插件。该入口与当前 read/exists/diagnostic/root 接口保持兼容。

GlassEasel 的 stylesheet/backend 协议需要独立适配，模块边界不意味着其编译产物可以直接互换。

## 隔离边界与选择器权重

页面路由边界使用 `:where(...)`，实例归属属性也放入 `:where(...)`，因此隔离标记不增加业务选择器权重。显式的 `page` 仍保留页面根节点选择器，确保其规则能覆盖页面根节点的默认样式；全局和页面规则维持原有顺序。此变更不移除页面/组件边界，也不改变现有标签到基础组件类名的转换。

默认按钮保留非 mini 规则的属性条件，防止单个业务类无意覆盖固定默认宽度。标签选择器转换和原生标签的完整权重等价性仍是独立兼容范围，不应将本修复描述为全部 WXSS 语义完全一致。

## rpx 单位策略

统一采用 `layout-pixel-v1`：750rpx 对应当前内容视口宽度；每个非零 rpx 长度按绝对值向下取整，最少 1 CSS px，再恢复符号；0 为 0。DPR 不参与布局取整，px/% 不取整。CSS 结果保留视口变量，resize 时重新计算；数值属性使用相同的 `createRpxUnits().pixels()`。CSS 呈现需要浏览器支持 `round()`。
