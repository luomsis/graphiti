# Schema 管理页面优化 Spec

## 文件
`web_service/app/settings/schemas/page.tsx`

## 问题清单与修复方案

### P1: 编辑保存后 Dialog 残留（已在浏览器测试中复现）
**现象**: 编辑保存后关闭当前 Dialog，但一个空白 Dialog 立即弹出，点击取消/关闭均超时无响应。

**根因**: `handleSave` 先 `setEditing(null)` 再 `setRefreshKey(k => k+1)`，两次状态更新触发 re-render。Dialog 的 `onOpenChange` 回调 `(open) => !open && setEditing(null)` 在过渡期被二次触发，加上 `editing !== null` 的 open 绑定在 null 和新对象间闪烁。

**修复**: 在 `handleSave` 中先标记 `setSaving(true)`，保存成功后一次性 `setEditing(null)` + `setRefreshKey` 合并为单次更新；用 `requestAnimationFrame` 确保 Dialog 关闭动画完成后再刷新列表。

### P2: openEdit 的冗余字段映射（L101-131）
**现象**: `SchemaDetail extends SchemaForm`，数据结构完全一致，但 openEdit 手动逐字段映射 `entity_types` 和 `edge_types`。

**修复**: 直接 `setEditing({ id: detail.id, form: { ...detail, id: undefined, created_at: undefined, updated_at: undefined } })`，仅对 `attributes` 做 `?? []` 兜底。

### P3: openEdit 无加载状态（L101）
**现象**: 点击编辑按钮后异步 fetch 数据，期间无任何视觉反馈。

**修复**: 新增 `editingLoadingId` 状态，点击时设置目标 id，fetch 完成后清除。编辑按钮显示 spinner。

### P4: 保存错误使用 window.alert（L150）
**现象**: 保存失败时 `window.alert(err.error)` 打断用户体验。

**修复**: 在 Dialog 内新增 `saveError` 状态，渲染为红色提示条；成功后清空。

### P5: 删除无加载状态且无错误处理（L158-165）
**现象**: 确认删除后按钮无 loading 反馈；删除失败时静默忽略。

**修复**: 新增 `deleting` 状态，删除按钮显示 spinner；失败时设置 `deleteError`。

### P6: 无表单校验
**现象**: 可以提交空类型名称、空属性名称的 schema，导致后端存储无效数据。

**修复**: 保存前过滤掉 `name` 为空的类型和属性，并在 UI 上对空名称输入框添加 `border-destructive` 高亮提示。

### P7: 返回按钮指向 /knowledge（L318）
**现象**: Schema 管理是设置子页面，返回到 `/knowledge` 语义不合理。

**修复**: 改为 `router.back()`，让用户回到来源页。

### P8: 成功操作无反馈
**现象**: 创建/编辑/删除成功后直接刷新列表，用户不知道是否成功。

**修复**: 新增 `toast` 消息状态，在页面顶部显示绿色成功提示，3 秒后自动消失。

## 不做的事项
- 不拆分为独立子组件（TypeEditor 抽取），保持单文件可维护性
- 不引入搜索/过滤功能（当前 schema 数量少，过度设计）
- 不添加创建/更新时间展示（列表项已足够简洁）
