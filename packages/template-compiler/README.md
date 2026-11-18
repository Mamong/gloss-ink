# @tingtalk/template-compiler

构建期 WXML / 受限 WXS 编译器，只依赖 acorn 和 Node 标准路径接口。

```js
const {createTemplateCompiler}=require('./index');
const compiler=createTemplateCompiler(schema);
const code=compiler.compile('<icon type="success"/>','page.wxml',diagnostic);
```

schema 由调用方显式提供，包含标签、事件、公共属性、各标签属性及 icon 枚举。默认 Now 工具链从基础组件库获取 schema；本包不导入基础组件库、SDK、运行时或渲染后端。

`compile` 保留已有模板 factory 源码格式，调用方负责在构建产物中注册。运行时接收模板工厂，WXS 继续使用受限解释器。import/include、表达式检查、WXS 预算与诊断语义保持原实现。

应用扫描、文件读写权限、项目模块、页面配置和打包由上层 importer 负责。本包的模板产物不是 GlassEasel 编译器产物，两者需要适配，不能直接混用。

## 独立浏览器运行时

编译出的 WXS 模板可使用 `require('@tingtalk/template-compiler/runtime')` 得到 createWxsRuntime，并作为 DOM backend 的 wxsRuntime 注入。此子入口只导入纯解释器，不加载 Node 编译器、acorn 或 SDK；它沿用既有步数、深度、分配与对象成员限制，不使用 eval/Function。Node 构建仍从主入口取得 createTemplateCompiler。
