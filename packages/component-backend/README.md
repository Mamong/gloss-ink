# @tingtalk/component-backend

平台无关的视图提交与事件协议。导出 `createViewProtocol()`，提供本地连接以及可分别运行的逻辑端和接收端；不依赖 DOM、组件核心、基础组件或 Now SDK，声明可在只有 ES2020 lib 的环境中检查。

协议维护 revision、提交回执、ack、超时、reset、销毁及事件绑定 epoch。消息格式继续使用 `now-view-v1`，本次抽取不改变协议行为。`render` 完成表示后端提交已确认，不保证像素已显示；原生后端可以复用该协议，也可以直接实现核心需要的渲染接口。

`setTimeout` / `clearTimeout` 可由宿主注入，句柄允许数字或对象。省略时使用运行环境的全局定时器。

核心需要的最小 `RenderBackend` 契约由 component-engine 自己定义。该包不包含节点树协调、DOM 查询、样式、Canvas、宿主桥或路由。DOM 实现位于 `@tingtalk/component-backend-dom`，其旧 `createViewProtocol` 导出和 `protocol.js` 路径保留为转发入口。

## rpx 单位策略

统一采用 `layout-pixel-v1`：750rpx 对应当前内容视口宽度；每个非零 rpx 长度按绝对值向下取整，最少 1 CSS px，再恢复符号；0 为 0。DPR 不参与布局取整，px/% 不取整。CSS 结果保留视口变量，resize 时重新计算；数值属性使用相同的 `createRpxUnits().pixels()`。CSS 呈现需要浏览器支持 `round()`。
