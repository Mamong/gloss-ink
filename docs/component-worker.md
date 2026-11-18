# 独立 Worker 验收

2026-11-18。使用真实 `node:worker_threads.Worker`，通过转移的 `MessageChannel` 通信。组件引擎、实例注册表、业务对象和回调都在 Worker 内；主线程只持有结构化克隆的数据与测试命令。CommonJS 公开入口和 `source()` 内嵌表达式分别运行相同的 14 个场景，共 **28 项**。本批完整 `npm test` 为 **193/193**（前批 165 项加本批 28 项）。

```sh
npm run test:worker
npm test
```

测试入口为 `test/component-worker.test.js`，Worker 启动文件和主线程控制器分别为 `test/helpers/component-worker-runtime.cjs`、`test/helpers/component-worker.cjs`。只引用本仓库公开组件包与 Node 内建模块，不导入 Now SDK、视图桥或原项目测试 helper。每个用例核对 Worker 的 threadId 与测试线程不同；清理关闭 MessagePort 并 terminate 线程。用消息屏障和显式 ack 调度，无 sleep 或轮询。

| 场景 | 验收行为 |
| --- | --- |
| 初次 attach | ready 和 attach RPC 等待父线程确认回执 |
| 数据隔离 | 入参、渲染 payload 和 data 返回值均独立克隆 |
| 同轮批量更新 | 合并一次 render，回调保持调用顺序 |
| 多个待确认回执 | 分别释放所属回调；后确认的回执可先完成 |
| 首次确认前销毁 | 抑制 ready，调用后端清理，attach 请求失败 |
| 更新确认前销毁 | 取消迟到 setData 回调和实例 token |
| 重连认领 | 新 nodeId 认领相同 key，保留对象引用、私有字段、业务数据及 token |
| 携带待确认更新重连 | 已认领实例的回调继续等待其回执 |
| 重连裁剪 | connected 清理未认领实例及其后端资源 |
| 回调 token | 限定 owner、单次执行、显式 cancel |
| 协议失败 | 旧 tree revision/无效 version/未知 method 保留错误 code，原树保持可查 |
| 自定义事件 | detail 与组件/页面 owner 经 MessagePort 到达父线程 |
| 快照恢复 | 恢复数据触发异步后端 render |
| 页面卸载 | 清空实例、placements、待确认回执；迟到回调不执行 |

## 责任边界

注入的测试 backend 用 `RenderReceipt.done` 等待父线程 ack。其 destroy 方法取消自己持有的 pending receipt；重复 ack 的过滤也由测试控制器完成。被验证的组件引擎负责等待回执、抑制已销毁实例的回调，注册表负责身份认领、拓扑校验、token 和实例清理。测试没有声称核心自带 generation、RPC、重试或网络容错策略。

这里的 reconnect 是**同一存活 Worker 中的逻辑视图重连**。携带待确认更新的用例保留原 receipt，验证实例认领不会提前放行业务回调；不验证旧 generation ack 拒绝或恢复后整棵 DOM 树提交的门禁。后两项仍属于外部传输/渲染适配器的下一批验收。

没有使用浏览器 Web Worker、真实 DOM backend 或浏览器渲染帧，没有测新线程重建、Worker crash/丢消息/超时恢复。Node 线程验证不能替代 CSP、DOM/逻辑双端连接和宿主设备验收。receipt 表示适配器声明的提交完成，不表示像素已上屏。

现有 CI 的 Node 24/26 job 通过 `npm test` 自动发现本文件，逐场景结果随 `artifacts/unit.log` 归档；未另行重复跑 Worker 专项。Node 26 本地已验证，GitHub 远端及 Node 24 的实际执行尚未确认。前批 `docs/semantics-2026-11-18` 是冻结历史，本批证据保存到 `docs/worker-2026-11-18`。
