# dsh-projects（「项目区」插件）

一个 DSH bundle（包名 `@local/dsh-projects`），只做两件事：

1. **补上官方缺的那一环**：「建目录 **并且** 把它注册成工作区」。
   官方的 `workspaceRegistry.create(path)` **要求目录已经存在**（只有
   `initializeDefault` 会 `mkdir`），而 `fs` 服务里根本没有 mkdir，
   `createDirectory` 只存在于 `directoryPickerController` 中，Windows 上
   组合出来的 `-auto` 选择器又会解析成**原生**选择器，原生选择器同样不会
   建目录。所以"输入一个名字，得到一级子目录并被登记为工作区"这件事，
   只用官方现成能力做不到。本 bundle 的**宿主半边**用
   `node:fs/promises` 完成它。
2. **一个辅助的「项目区」面板**：把派生出来的「工作区 → 项目 → 会话」树
   画出来，并且可以新建项目、新建对话、打开已有对话。

> 英文版（较简略）：[`README.md`](./README.md)。
> 架构决策记录（中文，本文档的术语与结论来源）：
> [`docs/design-notes.zh.md`](./docs/design-notes.zh.md)。

## 一、术语（与决策记录保持一致）

| 术语 | 含义 |
|---|---|
| **工作区** | 官方 `workspaceRegistry` 里登记的一个目录，官方侧边栏的「工作区」列表项就是它。 |
| **项目** | **派生**出来的概念：某个已登记工作区的路径，正好是另一个已登记工作区的**直接父目录**时，后者就是前者下的一个项目。没有 `parentId`、没有落盘、没有任何官方 schema 改动。 |
| **会话** | 官方的一条 conversation，归属到**按 id 记账它为成员**（`sessionIds`）的那个工作区——与官方侧边栏 `groupByWorkspace` 完全同一套规则。子代理（subagent）子会话不算行。 |
| **临时对话** | 面板里「临时对话 / 未分组」桶：**没有被任何工作区记账为成员**的会话。`cwd` 落在某个工作区路径里也**不算**成员。 |
| **按工作区树** | 官方侧边栏内置的**分组方式**（`groupBy: 'workspace-tree'`），按路径父子关系把子目录工作区嵌到父工作区下面。**主结构就是它。** |

## 二、两个界面面（two-surface model）

**本插件不拥有项目结构**。它只提供"缺失的那一步"和一个辅助视图。

| 界面面 | 归属 | 是什么 |
|---|---|---|
| **主结构** | **官方**侧边栏，分组方式「按工作区树」 | 把子目录工作区嵌到它的父工作区下。「工作区 → 子目录（项目） → 会话」是官方**现成**行为，一行代码都不用写。 |
| **辅助面** | **本插件**：侧边栏图标 + 主列面板 `projects` | 同一棵派生树的只读为主的总览，提供「新建项目」「新建对话」「打开对话」。 |

为什么不能用插件往官方那棵树里塞第三层（实测结论，见决策记录 §3）：

- `sidebar.workspaces`（官方工作区/会话列表所在槽位）是 `kind: "single"`，
  **已有占用者**，系统标记 `replaceRisk: "shadows-shipped-ui"`；它声明的 5 个
  子槽位（`session.menu.item`、`session.row.action`、`session.row.leading`、
  `session.row.hover`、`directoryFlow`）没有一个能插入「项目」节点。
- 上层 `sidebar` 同样是 `single`，注册即**整体替换**导航列。
- 真正可叠加（`replaceRisk: "none"`）的座位只有 `sidebar.footer.action`、
  `sidebar.panellist`、`settings.section`、`settings.general.item`。

所以本插件走的是 `sidebar.panellist`（图标）+ `main`（面板体）这一对注册，
`id` 与 `key` 必须一致（都叫 `projects`），不一致不是"没反应"而是抛错。

## 三、安装

先把本仓库克隆到任意目录：

```sh
git clone https://github.com/lecasongg/dsh-projects.git
```

再让 `plugin_manager` 指向**克隆下来的包目录**（不是 tarball，也不是工作区根目录）：

```
plugin_manager  action: "install_bundle"
                target: "<克隆下来的 dsh-projects 目录的绝对路径，例如 D:\\plugins\\dsh-projects>"
```

本机当前的 `web` profile 里已经装好并链接了本目录，所以这台机器上不必再装一次。

安装时应用的 bundle patch 是 `cordis.patch.yml`：

```yaml
- insert:
    - id: dsh-projects
      name: '@local/dsh-projects'
```

`package.json` 里的 `dsh.client` 声明了 `platform: "web"`、
`immediately: true`，并注入 `@deepseek-ai/dsh-api-remotes`、
`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-layout`、
`@deepseek-ai/dsh-client-ui-sidebar`、`@deepseek-ai/dsh-client-ui-workspace`。

包里**没有依赖、没有 install script**，所以安装/卸载不会有副作用脚本。

### 停用 / 卸载

```
plugin_manager  action: "set_bundle",    target: "@local/dsh-projects", enabled: false
plugin_manager  action: "remove_bundle", target: "@local/dsh-projects"
```

- `set_bundle enabled: false`：从该 profile 的装配里停用，源码不动，随时可再开。
- `remove_bundle`：把 bundle 从该 profile 的装配里移除。**本目录是工作区里的
  普通源码目录**，插件管理器不会（也不应该）删它；确认不再需要时自行清理。

## 四、把官方侧边栏切到「按工作区树」

官方默认的分组方式是**扁平**的，所以刚建出来的项目会先以**同级工作区**的样子
出现——这正是"工作区里多了一个我刚创建的项目"的原因。一次点击即可：

1. 找到侧边栏**工作区分区标题**处的**视图选项按钮**
   （官方文案 `t('viewOptions.label')`）。
2. 打开菜单里的「**分组方式**」。
3. 选择「**按工作区树**」。

选择结果写入浏览器本地存储（`dsh.workspace.view.v5` 的 `groupBy`，取值
`'workspace' | 'workspace-tree' | 'flat'`），**每个浏览器一份**，刷新与重启
都保留。祖先分组会自动展开。插件完全不参与这个设置，也从不写它。

## 五、「项目」是怎么判定的（推导规则）

**不落盘、不加 `parentId`、不改官方任何文件。** 一切都从活的
`WorkspaceSnapshot` 现算：

> 一个**已登记工作区**，如果它的路径正好是**另一个已登记工作区的直接父目录**，
> 它就是那个工作区下的一个**项目**。

细则（全部有回归测试）：

- **两级上限**：项目只挂在**顶层**工作区下。如果某个工作区的直接父目录本身
  也是项目，它自己就留在顶层，不再往下嵌第三级——所以每个已登记工作区
  **恰好出现一次**。
- **同一目录的两种写法**（`C:\Work\A` 与 `c:/work/a/`）折叠成一行。
- **Windows / UNC 路径大小写不敏感，POSIX 路径大小写敏感。**
- **会话归属：只看成员关系。** 工作区的 `sessionIds` 记账了这条会话，它就属于
  该工作区；没有记账的一律进「临时对话 / 未分组」。这与官方侧边栏
  （`groupByWorkspace`）**完全一致**。即使某条会话的 `cwd` 正好落在某个工作区
  路径里，只要没被记账，它就**不是**该工作区的成员——这条规则是 2026-10-09
  按实测修正的，起因见下文局限第 3 条。子代理子会话不显示。
- 会话行按 `updatedAt` 倒序，同值用 id 保证确定性排序。
- 面板把**归档**会话标注为「已归档」并继续显示（官方侧边栏是隐藏）。

## 六、诚实的局限

1. **官方侧边栏仍会把项目当成一个普通工作区行列出。** 项目本来就**是**一个
   已登记工作区：「按工作区树」下它被画成嵌套在父工作区里的子项，但在扁平
   与默认分组下它就是同级的一行。插件**无法**从官方列表里隐藏或改写某一行
   ——那需要一个能替换 `sidebar.workspaces` 的整树覆盖，代价是搜索、置顶、
   归档、拖拽排序、重命名弹框以及其它插件注入那 5 个子槽位的内容一起消失。
2. **两面的推导不完全一致。** 官方侧边栏的分组是**大小写敏感**的，并且
   **没有两级上限**；面板的推导在 Windows 拼写下**大小写不敏感**、并且有
   「项目不再嵌项目」的上限。于是边界输入下两面会不一致：
   `C:\Work\A` + `c:/work/a/P1` 在面板里是父子、在侧边栏里不是；三级孙目录
   在面板里留在顶层，侧边栏却可能继续嵌。
3. **归档会话的可见性不同**：面板显示（暗色 + 已归档），官方侧边栏隐藏。
   同理，面板会显示**空白且未记账**的游离会话（在「未分组」桶里），官方侧边栏
   在它未被选中时会把整个「未分组」桶隐藏掉。2026-10-09 的实测修正前，面板还
   会按 `cwd` 把这种游离会话归进某个工作区组，于是同一个会话在两面出现在不同
   位置（现在不会了，归属规则已与官方对齐）。
4. **面板只是总览，不是主列表**：没有拖拽排序、重命名、置顶、归档、删除；
   它也**从不会删除磁盘目录**。
5. **新建项目只有一层**，且必须挂在**已登记**的工作区下；名字必须是单个路径
   段（含 `/`、`\`、`:` 会被拒绝，`.`/`..`/纯空白同样拒绝）。建目录用的是
   `mkdir(recursive: true)`，所以**已存在的目录会被原样接受并登记**。
6. **"移除项目"不在面板里**：要移除就在官方侧边栏里移除那个工作区；本插件
   永远不删目录。
7. 推导每次渲染都从活快照重算：把父工作区取消登记，它下面的项目就不再是项目。
8. 原规格里独立的「临时对话」分组**没有**做进官方侧边栏（那里没有这个分组），
   只作为面板里的「临时对话 / 未分组」桶存在。

## 七、RPC 机制（宿主 ↔ 浏览器）

手写插件没有 TypeScript 装饰器、也没有构建期 Typert 生成，所以这次调用走的是
Gateway 的 **source-mode（SRC）** 通道。

**宿主半边（`index.js`）**，Cordis 服务 `projects`：

- `get typertRemote()` → `{ service, serviceKey: 'projects', namespace: 'projects' }`。
  Gateway 通过 `readBinding()` 读取它，并由 `validateBinding()` 强制要求。
- 原型上的描述符，键是标记字符串
  `'@deepseek-ai/dsh-typert-protocol/remote-methods'`，由 `remoteMethods()` 读取。
- `async createProject(parentPath, name)` → `{ workspaceId, path, title }`。
  参数**只能是普通标识符**：Gateway 的 `methodParameterNames()` 是**从方法自身的
  源码文本**里解析形参表的，所以这个文件**不能被压缩（minify）**，参数也不能有
  默认值、解构或 rest。

**浏览器半边（`client.js`）**：

- `ctx.remote.$mount({ package, descriptors })`，描述符是**手写**的。
  每个**参数** codec 必须是 `mode: 'strict'`，带非空 `typeSymbol` 和 `create()`
  工厂（客户端的 `requireStrictInputs` / `validateCodec`）；结果 codec 保持
  `src-json`，正好对上宿主 source-mode 描述符产出的东西。

**唯一一处非公开耦合**：标记字符串
`@deepseek-ai/dsh-typert-protocol/remote-methods` 在
`packages/typert/protocol/src/index.ts` 里是**模块私有常量**，不属于该包的公开
导出，这里逐字复刻。第二处较软的耦合是上面说的"从源码文本解析参数名"。
两者都被 `test/verify.mjs` 覆盖：它直接 import **真实**的 protocol / registry /
gateway 包，任何一处变了都会明确报错，而不是静默失效。

## 八、文件地图

| 路径 | 作用 |
|---|---|
| `index.js` | **宿主半边**。Cordis 服务 `projects`；`createProject(parentPath, name)` = `mkdir` + `workspaceRegistry.create`。 |
| `client.js` | **浏览器半边**。注册 `sidebar.panellist`（id `projects`，order 10）与 `main` 面板（key `projects`）；挂载 Remote 命名空间；内含纯函数 `deriveTree` 推导。 |
| `cordis.patch.yml` | bundle patch：插入 id `dsh-projects` → `@local/dsh-projects`。 |
| `package.json` | `exports`、`files`、`dsh.bundle.patch`、`dsh.client`。**无依赖、无脚本。** |
| `icon.svg` | bundle 图标。 |
| `locale/zh.json`、`locale/en.json` | 插件管理器的元信息（标题 / 描述）。面板自身的文案在 `client.js` 里。 |
| `test/verify.mjs` | 91 项校验的验证脚本。**不随包发布**（不在 `files` 里）。 |
| `docs/design-notes.zh.md` | 架构决策记录（中文），从工作区根目录**逐字**复制而来。 |

## 九、跑验证脚本

```
cd dsh-projects
node test/verify.mjs
```

它**不安装任何东西**，也不碰 profile。它拿只读 checkout 里**真实的**已构建
DSH 包（`CHECKOUT` 常量在文件顶部，当前是 `A:/DSH/deepseek-harness`）去驱动
本 bundle 的 `index.js` 与 `client.js`：Gateway 的 source-mode 导出、标记描述符、
参数名解析、客户端 contribution 校验、纯推导规则，以及一条**真实点击流**
（「新建项目」→ 输入名字 → 「确定」/「取消」、新建对话、点会话打开），用一个
小型有状态 React 替身实现。它会在系统临时目录下建一个临时目录并在结尾删掉。
成功时打印 `ALL CHECKS PASSED` 并以 0 退出。

路径解析基于**本文件的位置**，所以在包目录里跑 `node test/verify.mjs`、或在
工作区根目录跑 `node dsh-projects/test/verify.mjs` 都可以。
