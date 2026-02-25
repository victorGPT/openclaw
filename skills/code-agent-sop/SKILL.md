# Code Agent 强制 SOP

> 基于 Boris Tane 方法论，适配 OpenClaw + Discord 环境
> 适用 Agent：codex-dev, codex-review
> 触发条件：所有代码相关任务（实现、修复、重构、优化）

---

## ⚠️ 硬规则（Hard Rules）

违反以下任何一条，**必须显式说明理由并获得用户批准**，否则自动回滚：

1. **未经批准的 plan 不写代码**
2. **未通过 review 不合并**
3. **发现问题不自己 patch**（必须停止等批准）
4. **中途 scope creep 必须回到 planning 阶段**

---

## 🎯 设计三原则（Planning 阶段强制检查）

每个 plan 必须通过这三项检查，否则不进入执行阶段：

### 1. 第一性原理 (First Principles)
**定义**：从根本需求出发，不被现有实现绑架。

**检查点**：
- [ ] 如果忽略现有代码，理想方案是什么？
- [ ] 现有方案是"因为需要"还是"因为一直有"？
- [ ] 是否有更本质的解决路径？

**Plan 中必须包含**：
```
第一性分析：
• 根本问题：用户需要 X，不是因为现有代码做了 X
• 理想方案：如果不考虑迁移成本，应该...
• 现实妥协：本次方案选择 Y，原因...
```

### 2. 拒绝向后兼容 (No Backward Compatibility)
**定义**：默认不考虑兼容旧逻辑，除非有显式理由。

**检查点**：
- [ ] 旧接口是否必须保留？（默认删除）
- [ ] 旧数据是否必须迁移？（默认不迁，重设计）
- [ ] 旧行为是否必须保留？（默认废弃）

**Plan 中必须包含**：
```
兼容性声明：
• 破坏性变更：是 / 否
• 旧接口处理：删除 / 保留（原因：...）
• 迁移策略：自动迁移 / 手动迁移 / 不迁移（重新设计）
```

**强制规则**：
- 默认策略：**不兼容，直接替换**
- 如需兼容：**必须用户显式批准**，并说明代价

### 3. 唯一事实性原则 (Single Source of Truth)
**定义**：同一信息只存一处，不复制、不缓存、不派生。

**检查点**：
- [ ] 是否有数据重复存储？
- [ ] 是否有缓存可能失效？
- [ ] 是否有派生状态可能不一致？

**Plan 中必须包含**：
```
事实性分析：
• 核心数据源：X 表 / X 文件 / X 服务
• 只读副本：无 / 有（原因：...）
• 派生状态：实时计算 / 事件驱动更新（非定时刷新）
```

---

## 阶段 1：研究（Research）

### 触发条件
任何非 trivial 的代码任务：
- 变更 >50 行
- 跨文件修改
- 涉及核心逻辑
- 用户明确说"先研究"

### 操作步骤

**Step 1：用户触发**
- 用户在频道说：`开子区研究 X 功能/修复`
- 或：`研究一下 X 方案`

**Step 2：主 Agent 开子区**
- 创建 Discord thread
- 子区名称：`研究/实现：X 功能`
- 子区初始状态：🟡 研究中

**Step 3：codex-dev 进子区执行**

```bash
# 深度阅读代码库
find src -name "*.ts" -o -name "*.tsx" | xargs grep -l "keyword"
# 理解依赖关系
# 识别风险点
```

**Step 4：输出研究结论**

必须发一条结构化消息：

```
📋 研究结论（research）

当前现状：
• 相关文件：src/auth.ts, src/middleware.ts
• 核心逻辑：JWT 验证在 middleware 层
• 依赖关系：依赖 session-store, user-service

风险点：
⚠️ 改动可能影响 session 刷新逻辑
⚠️ 与 OAuth 回调有耦合

建议方案：
A. 推荐：提取验证逻辑到独立模块（改动小，风险低）
B. 备选：重构整个 auth 流程（改动大，长期更优）

下一步：进入计划阶段 / 直接写 plan / 需要更多信息
```

### 退出条件
- 用户说：`进入计划阶段`
- 或：`直接写 plan`
- 或：`跳过研究，直接执行`（需用户显式确认）

---

## 阶段 2：计划 + 标注循环（Planning + Annotation Cycle）

### 核心原则
**计划文档只保留一个：`plan.md`。每轮批注后覆盖同一文件，不新建 `plan-v2.md/plan-v3.md`。**

评审方式优先级：
1. **首选：GitHub PR 按行评论**（真正 inline，最接近 Boris 原版）
2. 备选：**Discord Quote Reply**（当无法走 PR 时）

### 操作步骤

**Step 1：codex-dev 产出/覆盖 `plan.md`（唯一 SoT）**

- 路径建议：`docs/<topic>/plan.md`
- 首版写入后，不再创建平行版本文件。
- 文档内可标 `版本: v1/v2/v3`，但文件名不变。

**Step 2：用户批注（Annotation）**

**方式 A（推荐）：GitHub PR 按行批注**
- 对 `plan.md` 发 line comment。
- 每条批注必须包含：`章节`、`级别(P0/P1/P2)`、`建议`、`是否阻塞`。

**方式 B（备选）：Discord Quote Reply**
- 引用计划片段并回复批注。
- 格式同上，避免只说“改一下”这类模糊反馈。

**Step 3：codex-dev 处理批注并覆盖同一份 `plan.md`**

- 仅修改 `plan.md`，不新增平行计划文件。
- 在文末维护“批注处理表（采纳/驳回/待定）”。
- 对 GitHub 批注逐条回复并标注 resolved（如适用）。

**Step 4：发布修订摘要（可在 Discord 发）**

- 允许在 Discord 发“本轮修订摘要”。
- 但摘要不是 SoT，SoT 永远是 `plan.md`。

**Step 5：循环迭代**

重复「用户批注 → 覆盖同一 plan.md → 回传修订摘要」直到批准。

### 退出条件
用户明确批准（如 `plan approved` / `可以执行了` / `执行吧`）。
---

## 阶段 3：执行（Implementation）

### 触发指令
用户说：
```
执行计划。遵守：
1. 逐项完成并勾选 plan 中的 checkbox
2. 每完成一步运行 typecheck/test
3. 发现问题立即停止，不要自己 patch
4. 完成后 push 分支，准备 review
```

### 进度心跳（强制）

**每 30-60 秒必须发一条进度消息**，避免沉默窗口：

```
⏳ 步骤 1/3 进行中...
   - 已创建 src/auth/verify.ts
   - 运行 typecheck...
✅ 步骤 1 完成（typecheck 通过）
⏳ 步骤 2/3 进行中...
```

### 完成输出

```
✅ 全部完成

分支：feature/auth-refactor
Commit：abc1234
变更：+55/-25

检查点状态：
✅ typecheck 通过
✅ 单测覆盖 85%
✅ 接口签名未变更

准备 review，请说 "开始 review"
```

---

## 阶段 4：评审（Review）

### 触发条件
- 用户说：`开始 review`
- 或：`review 一下`
- 或 codex-dev 执行完成后自动触发

### 执行者
codex-review（强制，不能是 codex-dev 自评）

### Review 输出

```
🔍 代码评审（Review）

变更范围：src/auth/verify.ts, src/middleware/auth.ts

检查项：
□ 代码风格        - PASS
□ 类型安全        - PASS  
□ 测试覆盖        - MISSING（edge case：空 token）
□ 接口兼容性      - PASS
□ 无重复代码      - PASS

发现的问题：
1. 缺少空 token 测试（MINOR）
2. 错误 message 格式不统一（MINOR）

结论：MINOR
- 修复上述 2 个问题后可合并
- 或用户确认"先合并后续修"
```

### Review 结论等级

| 等级 | 含义 | 操作 |
|------|------|------|
| **PASS** | 无问题，可直接合并 | 用户说`合并` |
| **MINOR** | 小问题，可后续修 | 用户说`先合并`或`修一下` |
| **MAJOR** | 中等问题，建议修复 | 必须修复后重新 review |
| **BLOCKING** | 严重问题，不能合并 | 必须修复，强制回滚 |

### 循环直到 PASS

```
codex-dev 修复 → 用户说"修好了" → codex-review 再审 → PASS
```

---

## 异常处理

### 执行中发现问题
**必须立即停止**，发消息：
```
⚠️ 执行受阻

步骤：2/3
问题：发现 middleware 有循环依赖，按 plan 无法实现
建议：
A. 回滚，回到 planning 阶段重新设计
B. 用户批准临时方案（说明具体方案）

等待指示...
```

### 用户中途改需求
用户说：`再加个功能 Y`

**必须拒绝直接加**，回复：
```
⚠️ Scope Creep 检测

当前处于执行阶段，新增功能 Y 需要：
1. 暂停当前执行
2. 回到 Planning 阶段，更新 plan
3. 用户批准新 plan 后继续

请确认：
- [ ] 暂停当前，更新 plan
- [ ] 保持当前，Y 放到下个迭代
```

---

## Discord 状态 Emoji

| 阶段 | Emoji | 含义 | 谁更新 |
|------|-------|------|--------|
| 研究中 | 🟡 | Research 进行中 | codex-dev |
| 计划中 | 🟠 | Plan 待批注 | codex-dev |
| 执行中 | 🔵 | Implementation 进行中 | codex-dev |
| 评审中 | 🟣 | Review 进行中 | codex-review |
| 需修复 | 🟤 | 有问题待修复 | codex-review |
| 已完成 | ✅ | PASS，可合并 | codex-review |

**更新方式**：修改子区名称前缀
- 从 `🟡 研究：X 功能` → `🔵 实现：X 功能`

---

## 检查清单（Checklist）

每次任务必须完成：

- [ ] 非 trivial 任务有 research 阶段
- [ ] Plan 有用户批准才执行
- [ ] 执行中有进度心跳（30-60s）
- [ ] 执行完成有 commit/分支信息
- [ ] Review 有明确结论（PASS/MINOR/MAJOR/BLOCKING）
- [ ] BLOCKING/MAJOR 必须修复后重新 review

---

## 关联技能

- `codex-review-code-loop` - Code Review 循环
- `pre-change-check` - 变更前检查
- `verification-before-completion` - 完成前验证

---

## 版本历史

- v1.0 (2026-02-23): 初始版本，基于 Boris Tane 方法论
