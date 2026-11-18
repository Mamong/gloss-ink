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
