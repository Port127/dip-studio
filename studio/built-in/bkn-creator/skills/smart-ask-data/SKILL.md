---
name: smart-ask-data
version: "1.0.0"
user-invocable: true
description: >-
  问数端到端编排：若已指定 KN 或仅一个候选 KN 则直接使用，否则先用 kn_select 选定知识网络，再用 text2sql 的 show_ds 发现候选表与表结构、
  gen_exec 生成并执行 SQL 取数，按需调用 execute_code_sync 做二次计算，按需 json2plot 出图，
  最后输出中文结论与口径说明。
  当用户需要指标、统计、趋势、SQL 取数、数据分析或图表时使用。
metadata:
  openclaw:
    skillKey: smart_ask_data
argument-hint: [中文问数问题；可选已有 kn_id 或候选 kn 列表]
---

# Smart Ask Data（问数）

本 skill 定义 **固定先后顺序** 的问数工具链；各工具的参数细节、Header/Body 与配置文件路径以 **同名子 skill** 为准，本仓库在 `references/` 中为每一步提供 **编排说明 + 跳转链接**。

**OpenClaw**：`metadata.openclaw.skillKey` 为 `smart_ask_data`。编排元数据与流水线声明见 [config.json](config.json)。

在数据分析员工体系中，本 skill **宜由** [smart-data-analysis](../smart-data-analysis/SKILL.md) **总入口完成意图与 KN 编排后再进入执行**。

## 必读 references（按步骤）

| 步骤 | 说明 | Reference |
|------|------|-----------|
| 1 | 知识网络选择（条件执行 `kn_select`） | [references/kn-select.md](references/kn-select.md) |
| 2 | `text2sql` → `show_ds`（候选表/结构） | [references/text2sql.md](references/text2sql.md)（临时 Python 须与样例同构、单文件无外部依赖，见文内「临时 text2sql Python 脚本规范」） |
| 3 | `text2sql` → `gen_exec`（SQL + 数据） | 同上 |
| 4 | `execute_code_sync`（可选） | [references/execute-code-sync.md](references/execute-code-sync.md) |
| 5 | `json2plot`（可选） | [references/json2plot.md](references/json2plot.md) |
| — | 端到端顺序示例 | [references/tool-examples.md](references/tool-examples.md) |


## 主流程（必须按序；可选步骤注明）

复制进度：

```text
问数进度：
- [ ] 1. 解析 kn_id：若已指定或仅 1 个候选 KN 则直用；仅当候选 KN > 1 时调用 kn_select（见 kn-select reference）
- [ ] 2. text2sql show_ds：候选表与字段 → 整理为 gen_exec 的 background
- [ ] 3. text2sql gen_exec：生成 SQL、取数；保留 tool_result_cache_key（若有）
- [ ] 4. （可选）execute_code_sync：仅当需代码二次加工时
- [ ] 5. （可选）json2plot：仅当用户要图且字段与缓存键就绪时
- [ ] 6. 总结：结论 + 口径 + 依据（KN/表）+ 图表说明（若有）
```

### 知识网络约束（问数）

- **来源强约束**：问数使用的 `kn_id`（含直传 `kn_id`、候选 `kn_ids`、最终写入 `text2sql.data_source.kn` 的网络）必须来自 `SOUL.md` 已配置知识网络。
- **缺失处理**：若 `SOUL.md` 缺失或未配置可用知识网络，必须先提醒用户配置 `SOUL.md`，并暂停 `show_ds` / `gen_exec` 执行。
- **禁止元数据知识网络**：问数链路（`kn_select` 候选、`text2sql` 的 `data_source.kn`）**不得**使用元数据类 KN（用于目录/对象检索，非业务事实取数）。当前平台示例中元数据 KN 的 id 为 `idrm_metadata_kn_object_lbb`，与 [config.json](config.json) → `tools.kn_select.forbidden_ask_data_kn_ids` 对齐。
- **配置与调用**：默认 `tools.kn_select.kn_ids` **已排除**上述 id；若调用方自行传入候选 `kn_ids`，须先 **剔除** `forbidden_ask_data_kn_ids` 中的全部项再调用 `kn_select`。
- **结果校验**：若 `kn_select` 返回的 `kn_id` 仍落在禁止列表中，**不得**继续 `show_ds` / `gen_exec`，应改候选或引导用户指定业务 KN。

### 步骤约束（摘要）

1. **KN 解析（条件路由）**：
   - 已明确传入 `kn_id`：仅当该值在 `SOUL.md` 已配置网络中时可直接使用（且仍需校验不在 `forbidden_ask_data_kn_ids` 中）。
   - 未传 `kn_id` 但候选 `kn_ids` 仅 1 个：仅当该候选属于 `SOUL.md` 配置网络时可直接使用（且仍需校验）。
   - 候选 `kn_ids` > 1：仅在 `SOUL.md` 配置网络集合内调用 `kn_select` 选定后再继续。
   - **不得**在未知 KN 上直接 text2sql。
2. **show_ds 先于 gen_exec**：先缩小表与字段空间，再把摘要写入 `background`，降低 SQL 幻觉。
3. **gen_exec**：`input` 中文；`kn_id` 与第 1 步一致，且 **非**元数据 KN；结果用于回答或进入可选后处理。
4. **execute_code_sync**：将上游结果经 `event` 传入 handler；遵守子 skill 的 poll/sync 参数。
5. **json2plot**：优先用 `tool_result_cache_key` 引用 text2sql 结果；**不向用户堆砌原始 JSON**。
6. **结果展示硬约束**：若 `text2sql gen_exec` 返回非空数据（如有行记录/聚合结果），最终回复中**必须同时展示**：
   - 生成并执行的 SQL（可做脱敏，不可省略）；
   - 关键结果数据（表格或要点汇总，不可仅给口头结论）。
7. **总结**：明确时间范围、指标定义；不暴露 token 与完整调试 URL。

## 注意事项（必须遵守）

1. 所有信息**必须完全来自查询结果**，不允许添加任何结果中不存在的内容。
2. 不允许猜测、推断、脑补、编造数据。
3. 不允许改写、美化、夸张、虚构企业信息。
4. 不使用不确定词汇，如“可能”“大概”“应该”“据悉”。
5. 若结果为空，直接说明“未查询到符合条件的数据”，不得自行编造。
6. 只做结构化整理、排序、计数、分段展示，不做逻辑外扩。
7. 严格按原始数据呈现，不修改数字、名称、顺序。

## 与 smart-data-analysis 的关系

由 [smart-data-analysis](../smart-data-analysis/SKILL.md) 做顶层路由时，进入本 skill 表示用户 **主意图为问数**；若上下文已含 `kn_id_ask_data`，优先直接使用；仅当存在多个候选 KN 且未明确时再用 kn_select 对齐（最终以业务规则确认为准）。

## 配置

- 本 skill **统一默认配置**：[config.json](config.json)
  - **`defaults`**：全链路共享的 **`user_id`**、HTTP Header **`x_business_domain`**（与 department_duty_query / 各子 skill 对齐；生产环境可改为平台真实业务域）。
  - **`base_url`**：平台网关域名（与各工具的 `url_path` 拼接得到完整请求地址）。
  - **`tools`**：按工具聚合的默认 **`url_path`**（相对路径）、**`user_id`**，以及 **`kn_select.kn_ids`**、**`kn_select.forbidden_ask_data_kn_ids`**（问数禁止使用的元数据等 KN）、**`text2sql.kn_id`**（问数默认 KN；当已指定或仅一个候选 KN 时可直接使用，若多候选经 `kn_select` 选定后应覆盖传入）、**`execute_code_sync` / `json2plot` 的 `kn_id`**（可为空字符串）。
  - **`pipeline`**：每步通过 **`defaults_key`** 指向 `tools` 中对应键，便于实现侧一次读取本文件完成装配；子目录 `skills/<tool>/config.json` 仍可单独覆盖或与 `tools` 保持同步（部署时建议二选一为主，避免漂移）。

## 调用示例

```text
/smart-ask-data 上个月各区域销售额占比多少，用饼图展示
/smart-ask-data 在候选知识网络里自动选 KN，查库存周转相关明细并给结论
```
