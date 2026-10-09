# 「项目区」插件架构决策（2026-10-09）

> 本文档取代 `docs/superpowers/specs/2026-10-09-dsh-projects-design.md` 的**实现面**（数据模型落在哪个包、Remote verb 加在哪个控制器）。
> 原始规格里的**设计面**（归属规则、折叠规则、四个概念的定义、界面结构意图）继续有效，本文档只重写"代码放在哪里"。

## 1. 决策

**「项目」做成一个独立插件，不修改官方仓库 `deepseek-ai/deepseek-harness` 的任何文件。**

## 2. 为什么（证据，全部来自官方文档与运行时实测）

| 证据 | 出处 | 结论 |
|---|---|---|
| "It is built on an **everything-is-a-plugin** architecture" | 官方 `README.md` | 插件是官方架构主张，不是权宜之计 |
| "**Create a plugin that excites you** and share it with others — Associate your GitHub project with the `dsh-plugin` topic" | 官方 `CONTRIBUTING.md:13-15` | 官方**指定**的用户扩展路径就是自己写插件 |
| "we **cannot accept external pull requests** at the moment" | 官方 `CONTRIBUTING.md:9` | 改官方仓库的改动**永远不会被上游接纳** |
| "**We do not believe that packages in the official repository are inherently more important than packages created by the community.**" | 官方 `CONTRIBUTING.md:19` | 官方明确否认"官方包更正统" |
| 在工作区写 bundle → `plugin_manager install_bundle` → 对该 profile 的每个会话生效并跨重启保留 | `cordis-plugin-development` 技能 | 已有一条成熟的、受支持的落盘通道 |
| "THERE WILL BE **COMPATIBILITY-BREAKING CHANGES**" | 官方 `README.md`（developer preview） | 补丁式分叉的维护成本是**持续**的，不是一次性的 |

**决定性的用户输入**：用户明确表示**会跟着上游更新**。在这一前提下，改 clone 意味着每次 `git pull` 都要在约 10 个官方源码文件上解冲突，且上游一旦改动 `workspace` 域的 schema 或启动期校验，补丁可能让 `dsh web` 起不来。插件路径把这份成本降到接近零。

## 3. 为什么"项目树放侧边栏里"这条路在插件形态下走不通（实测）

用 `cordis_inspect_query` 查了**活的**槽位拓扑：

- `sidebar.workspaces`（官方的工作区/会话列表所在）是 `kind: "single"`，**已有一个占用者**，系统标记 `replaceRisk: "shadows-shipped-ui"`。它声明的 5 个子槽位是：`session.menu.item`、`session.row.action`、`session.row.leading`、`session.row.hover`、`directoryFlow` —— **没有一个能往那棵树里插入"项目"节点**。
- 上层 `sidebar` 也是 `single`，官方注释原文：*"registering here replaces the navigation column outright rather than adding to it, and the seats it declares disappear with it."*
- 侧边栏里真正 `replaceRisk: "none"`（即可叠加）的座位只有：`sidebar.footer.action`、`sidebar.panellist`、`settings.section` / `settings.general.item`。

**结论**：插件无法"加进"官方那棵树做出 `工作区 > 项目 > 对话` 的三级嵌套。要么用一个**自己的面板**承载"项目区"，要么整体覆盖官方浏览器（把搜索、置顶、归档、拖拽排序、重命名弹框全部重写，且其它插件注入那 5 个子槽位的内容会一起消失）。**本决策选前者。**

## 4. 新的界面形态

用 `sidebar.panellist` 注册一个自己的面板（该槽位 `replaceRisk: "none"`，官方已占用 `plugins`、`schedules` 两个 id，新增 id 是纯增量）：

- 侧边栏底部出现一个「项目区」图标按钮（官方侧边栏负责渲染按钮与选中态）。
- 点击后主列打开「项目区」面板，面板内是 `工作区 > 项目 > 对话` 的三级结构（沿用原规格的归属与折叠规则）。
- 官方侧边栏的会话列表**保持原样不动**。

**注册必须是"一对"**（实测，两个槽位的活契约）：

```ts
// 1) 侧边栏的图标按钮：kind 'list'，replaceRisk 'none'
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
  name: 'sidebar.panellist', id: 'projects', order: 20,
  label: () => t('panel'), locale: NS,
}, ProjectsPanelIcon))

// 2) 主列的面板内容：kind 'keyed'，注册项【只有 key】这一个选项
ctx.slots.register({ name: 'main', key: 'projects' }, ProjectsPanelPage)
```

- `main` 的 `keyDomain` 明写 `open: any string the owner dispatches`，已占用 `conversation`（保留给会话）、`plugins`、`schedules`；`key` 即 `MainPanelId`，**必须**与 `sidebar.panellist` 的 `id` 一致。不一致不是"没反应"而是**抛错**：`ctx.layout.selectPanel` 的守卫是 `if (panelId !== null && !this.hasMainPanel(panelId)) throw new Error('layout.selectPanel: main panel "..." is not registered')`。
- 侧边栏会按 `order` 升序排列图标，标签用 `resolveSlotLabel(options.label) ?? id`，并订阅 `sidebar.panellist` 与 locale 变化重算，所以 `label` 传函数即可跟随语言切换。
- 面板被移除时 `retainMainPanels` 会把 `activePanelId` 归零（避免选中一个不存在的面板）。

**两个槽位的标准 props 都直接带** `useWorkspaces`（`SnapshotSelectorHook<WorkspaceSnapshot>`）、`useSessions`、`useSessionStatus`、`usePanelInfo`、`useSessionRetainInfo`，所以面板读工作区与会话数据**不需要自建数据通道**。

**这是相对原批准草图的唯一 UX 偏差，用户已知悉并接受**（选择"会跟着上游更新"时即接受"项目树在独立面板里"这一代价）。

## 5. 宿主能力与约束（实测）

`ctx.workspaceRegistry` 是公开 Service，方法含：

```
create(path: string, title?: string): Promise<Workspace>   // 要求目录【已存在】
list(): readonly Workspace[]
get(id): Workspace | undefined
delete(id): Promise<boolean>
resolveByPath(path): Promise<Workspace | undefined>
insertBefore(id, beforeId?): Promise<readonly WorkspaceId[]>
archiveSession / unarchiveSession / pinSession / unpinSession
```

**两个硬约束**：

1. `create` **要求目录已存在** —— 只有 `initializeDefault` 会 `mkdir`。而 `fs` 服务的目录里**没有 mkdir**（只有 `readDirectory`/`readText`/`writeText`/`stat`/`listDir`/`watch` 之类），`createDirectory` 只存在于 `directoryPickerController`，而 Windows 上组合出的 `-auto` 选择器解析为**原生**选择器，原生选择器不具备建目录能力。
   → **"输入名字自动建一级子目录"必须由插件自己的宿主半边用 `node:fs/promises` 完成**（插件的宿主半身在宿主进程里跑，就是普通 Node 代码）。
2. 因此插件**必须有宿主半边**，并且必须存在一条**可被客户端调用的 host↔client 通道**。手写插件的宿主半边是纯 JS，用不了 TS 的 `@Remote` 装饰器 + 构建期 typert 生成 —— **这条通道的确切机制是当前唯一的技术未知，正在核实中**。

## 6. 项目归属的持久化：**已定 A1（插件自有的宿主存储域）**

「一个工作区是不是项目」需要一个**显式**记录（原始 Q8 的选择是"只认显式创建的项目"，排除了"凡是子目录都算"的隐式推导）。

**已验证可行**（`cordis_inspect_query` 读 `storageDomain` 与 `storage` 的活契约）：

```ts
// ctx.storageDomain 是可注入的公开 Service：
//   access: { optional: ctx.get("storageDomain"), hardDependency: inject: ["storageDomain"] }
//   open<S extends DomainSpec>(spec: S): Promise<Domain<S>>
//   get(name): DomainImpl | undefined
//   closeAll(): Promise<void>
//
// Domain<S> 上：table(name) → KvTable，提供 get / entries / keys / size / put / delete / update。
// 生命周期由【调用方】自己持有：用 ctx.effect(() => () => domain.close()) 释放。
```

- `spec` 来自 `defineDomain`（照 `@deepseek-ai/dsh-workspace` 的 `workspaceDomainSpec` 的写法），本插件声明自己的域 `dsh-projects`，一张表 `projects`：`workspaceId → parentWorkspaceId`。
- **不需要额外配置路由**：`open()` 解析的是设施上的**默认后端**，`routes` 只是按域名的覆盖表；`ctx.storage.backend.names()` 已经有 profile 装配好的后端。
- 域名必须与已开域不同（"single-open per domain name"），所以用 `dsh-projects` 而不是 `projects`。
- 域的 `version` 从 1 开始，schema 用 zod；这是**我们自己的**域，所以加字段、升版本完全由我们掌握，不受上游影响。

被否掉的两个候选，理由保留在此备查：

| 方案 | 被否原因 |
|---|---|
| A2. 在 `$DSH_HOME` 下自写 JSON 数据文件 | 绕开 DSH 自己的持久化设施；技能明确要求不要手工写 profile 目录 |
| A3. 客户端持久化 store（浏览器本地） | 仅当前浏览器，换浏览器或清缓存即丢；与用户此前"宿主侧落盘最正确"的选择相悖 |

## 7. 原规格中被保留 / 被废弃的部分

**保留（设计面）**：

- 四个概念的区分：新建工作区 / 新建项目 / 项目中的对话 / 临时对话。
- 归属判定：项目 = 父工作区下的**一级**子目录；只允许两层。
- 会话归属：项目自己的会话 + 其下非项目后代的会话都归该项目；工作区自己的会话 + 其它非项目子目录的会话归"临时对话"；优先级 先项目 → 再临时 → 未分组兜底。
  - **⚠️ 已修订（2026-10-09）**：上面这条"按 `cwd` 推断归属"的规则**已废弃**。
    现在**只看成员关系**（工作区的 `sessionIds` 记账了这条会话），与官方侧边栏
    `groupByWorkspace` 完全一致。起因：`A:\projects` 里有一条会话，创建时间比
    该工作区登记早 1 分 45 秒（`session.create({ cwd })` 不登记成员），`cwd`
    落在工作区路径下却没被记账——面板按 `cwd` 把它归进项目组，官方侧边栏按
    成员关系把它放进「未分组」，同一个会话在两面出现在不同位置。回归测试：
    `test/verify.mjs` 的「a cwd inside a workspace without membership stays ungrouped」。
- 重命名只改显示名；移除项目不删目录。
- 不允许把项目嵌套进项目。

**废弃（实现面）**：

- ~~往 `workspaceRecord` 加可选 `parentId`~~ → 项目关系改由插件自己持有，**不碰官方持久化 schema**。
- ~~往 `WorkspaceCommands` 加 `createProject`、往 `WorkspaceController` 加 `@Remote('createProject')`~~ → 改为插件自己的宿主方法。
- ~~改 `feed.ts` 的两处投影~~ → 官方 `WorkspaceView` 不需要 `parentId`，插件自己算。
- ~~改官方 `ui-workspace` 的 `tree.ts` / `WorkspaceBrowser.tsx` / `Rows.tsx` / `locales.ts` / `stores.ts`~~ → 这些**一个都不动**。

## 8. 为什么这条路对你更划算（三句话）

1. 官方**不收** PR，所以改 clone 的收益永远只留在这台机器上；而插件可以进你自己的仓库、跟着 `dsh-plugin` topic 分享。
2. 官方明说会有破坏性变更；插件只依赖稳定契约（槽位、Service），官方改实现不会连带你的补丁。
3. 全部代码写在会话工作区里，**不需要对 `A:\` 提权**，也不需要那个空着的 git 身份。

---

# 9. 最终取向（2026-10-09，用户确认后追加）

用户在真机上看过两种形态后确认：**官方侧边栏的「按工作区树」分组就是他要的结构，插件面板退居辅助。**

## 9.1 主结构由官方提供，一行代码都不用写

官方 `@deepseek-ai/dsh-client-ui-workspace` 已内置按路径父子嵌套的分组模式：

| 事实 | 位置 |
|---|---|
| 分组模式有三种：`'workspace' \| 'workspace-tree' \| 'flat'` | `packages/client/ui-workspace/src/client/stores.ts:17` |
| 默认是 `'workspace'`（扁平），选择结果持久化 | 同文件 `:85`、`:91`（`persist: 'dsh.workspace.view.v5'`） |
| 选「按工作区树」时开嵌套 | `rows/WorkspaceBrowser.tsx:1392` `nestWorkspaces={groupBy === 'workspace-tree'}` |
| 父子关系按**直接父目录**推导 | 同文件 `:315-323`，用 `owningParentFolder`（`tree.ts:636`） |
| 祖先组自动展开 | 同文件 `:331-335` |
| 切换入口 | 工作区分区标题处的**视图选项按钮**（`t('viewOptions.label')`）→ 弹出的菜单里「分组方式」→「按工作区树」（`WorkspaceBrowser.tsx:120-134`） |

**所以「工作区 > 子目录(项目) > 对话」是官方现成行为**，用户的抱怨「工作区多了一个我刚创建的项目」正是缺了这个开关（默认扁平模式把它当平级工作区列出）。切换后写入浏览器本地存储，**刷新与重启都保留**（每浏览器一份）。

## 9.2 插件退化为「新建项目」入口 + 辅助总览面板

插件保留的东西：

- **宿主半边**（`index.js`）：唯一方法 `createProject(parentPath, name)` —— 建一级子目录 + `workspaceRegistry.create` 注册。这是官方缺的那一环（官方只能注册**已存在**的目录，Windows 原生目录选择器又不能建目录）。
- **辅助面板**（`client.js`）：`项目区` 图标 + 面板，列出 工作区 → 项目 → 会话，每行可「新建项目」（只问名字）／项目行可「新建对话」／点会话打开。它**不**承担主结构职责，侧边栏仍是主入口。
- 项目身份**完全从工作区快照推导**（某已注册工作区的路径是另一个已注册工作区的直接子目录），**不需要 `parentId`、不需要插件的存储域、不需要官方任何改动**。

被本轮决定作废的：

- ~~§6 的 A1 存储域方案~~ —— 推导已足够，不必落盘（`storageDomain` 的可行性结论仍有效，留作将来需要"显式项目标记"时的备选）。
- ~~原规格里的「临时对话」独立分组~~ —— `按工作区树` 模式下，工作区自己目录下的会话就显示在工作区行下，位置即原设计意图；是否还要一个显式的「临时对话」标签，待定。
