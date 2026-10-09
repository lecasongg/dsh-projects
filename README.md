# dsh-projects

A DSH bundle (`@local/dsh-projects`) that fills one gap in the shipped
Workspaces sidebar and adds one auxiliary overview panel:

1. **Create the directory *and* register it.** `ctx.workspaceRegistry.create(path)`
   requires the directory to already exist, and the `fs` service has no
   `mkdir`; on Windows the composed `-auto` directory picker resolves to the
   *native* picker, which cannot create a directory either. So "type a name,
   get a one-level child directory registered as a workspace" is impossible
   with shipped machinery alone. The Host half of this bundle does exactly
   that with `node:fs/promises`.
2. **An auxiliary 「项目区」 (Projects) panel** that renders a derived
   工作区 → 项目 → 会话 tree and can create projects, start conversations and
   open conversations.

> Chinese readers: [`README.zh.md`](./README.zh.md) is the fuller document.
> The design record (in Chinese) is [`docs/design-notes.zh.md`](./docs/design-notes.zh.md).

## The two-surface model

This plugin does **not** own the project structure. It supplies the missing
step and a secondary view.

| Surface | Owner | What it is |
|---|---|---|
| Primary | **shipped** DSH sidebar, grouping mode **「按工作区树」** | Nests a registered child-directory workspace under its registered parent directory. 工作区 → 子目录(项目) → 会话 is official, existing behaviour. |
| Auxiliary | **this plugin**, sidebar icon + main panel `projects` | A read-mostly overview of the same derived tree, with the 新建项目 / 新建对话 / open-conversation affordances. |

The shipped sidebar has no extension point inside its workspace list
(`sidebar.workspaces` is a `single` slot with an occupant and
`replaceRisk: "shadows-shipped-ui"`), so a plugin cannot inject a third tree
level into it. Sideloading a panel — `sidebar.panellist` +
`main`, both `replaceRisk: "none"` — is the only additive route.

## Install

The bundle is already installed and linked in the `web` profile. To reinstall
or install it elsewhere, point `plugin_manager` at the **package directory**
(not at a tarball, not at the workspace root):

```
plugin_manager  action: "install_bundle"
                target: "C:\\Users\\ZHKJE\\Documents\\deepseek-harness\\default-workspace\\dsh-projects"
```

The bundle patch it applies is `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-projects
      name: '@local/dsh-projects'
```

`dsh.client` declares `platform: "web"`, `immediately: true` and injects
`@deepseek-ai/dsh-api-remotes`, `@deepseek-ai/dsh-client-locale`,
`@deepseek-ai/dsh-client-ui-layout`, `@deepseek-ai/dsh-client-ui-sidebar` and
`@deepseek-ai/dsh-client-ui-workspace`.

### Disable / uninstall

```
plugin_manager  action: "set_bundle",    target: "@local/dsh-projects", enabled: false
plugin_manager  action: "remove_bundle", target: "@local/dsh-projects"
```

`remove_bundle` removes the bundle from the profile's composition. This source
directory is an ordinary directory in the workspace; nothing here deletes it.
There are no install scripts and no dependencies, so enabling or disabling is
side-effect free.

## Switch the sidebar to 「按工作区树」

The shipped grouping default is flat, which is why a freshly created project
first shows up as a *sibling* workspace. One click fixes it:

1. Find the **view-options button** in the header of the workspace section of
   the sidebar (`t('viewOptions.label')`).
2. Open **分组方式** / *Group by*.
3. Choose **按工作区树** / *Group by workspace tree*.

The choice persists in browser storage (`dsh.workspace.view.v5`, field
`groupBy` ∈ `'workspace' | 'workspace-tree' | 'flat'`), per browser, across
refresh and restart. Ancestor groups auto-expand. The plugin has no say in
this setting and never writes it.

## How "project-ness" is derived

Nothing is persisted, and no `parentId` is added to any shipped schema.

> A registered workspace is a **project** when another registered workspace's
> path is its **immediate parent directory**.

- The **two-level cap**: a project is owned only by a *top-level* workspace.
  A workspace whose own direct parent is itself a project stays top-level
  instead of nesting a third level, so every registered workspace appears
  exactly once.
- Two spellings of the same directory (`C:\Work\A` vs `c:/work/a/`) collapse to
  one row.
- Windows and UNC paths compare case-insensitively; POSIX paths compare
  case-sensitively.
- Sessions are attached to the *deepest* registered workspace whose path
  contains the session's `cwd`, falling back to the workspace that accounts for
  the session id; sessions with neither land in the panel's
  「临时对话 / 未分组」 bucket. Subagent children are not rows.

## Honest limitations

- **The shipped sidebar still lists a project as an ordinary workspace row.**
  A project *is* a registered workspace; in 「按工作区树」 it is drawn nested
  under its parent, but in the flat and default grouping modes it is a peer.
  A plugin cannot hide or re-badge one entry inside a shipped list.
- **The sidebar groups case-sensitively and has no two-level cap**, while the
  panel's derivation is Windows-case-insensitive and capped at two levels. On
  edge inputs the two surfaces therefore disagree: `C:\Work\A` +
  `c:/work/a/P1` nest in the panel but not in the sidebar, and a three-level
  grandchild stays top-level in the panel while the sidebar may nest it.
- **Archived sessions**: the panel marks them as "已归档" and keeps them
  visible; the shipped sidebar hides them.
- The panel is an **overview**, not the primary list: it has no drag-reorder,
  rename, pin, archive or delete, and it never removes a directory.
- **Creating a project is one level deep**, under an already-registered
  workspace, with a single path segment as the name (`/`, `\` and `:` are
  rejected). `mkdir` is recursive, so an existing directory is accepted and
  registered as-is.
- Removing a project means removing that workspace in the shipped sidebar; the
  directory on disk is never deleted by this plugin.
- Derivation is recomputed from the live snapshot on every render. Unregister
  the parent workspace and its projects stop being projects.

## RPC mechanism (host ↔ browser)

A hand-written JavaScript plugin has no `@Remote` decorator and no build-time
Typert generation, so the call rides the Gateway's **source-mode (SRC)** path.

Host half (`index.js`), service `projects`:

- `get typertRemote()` → `{ service, serviceKey: 'projects', namespace: 'projects' }`.
  The Gateway reads this through `readBinding()` and `validateBinding()`.
- a prototype descriptor under the marker key
  `'@deepseek-ai/dsh-typert-protocol/remote-methods'`, read by
  `remoteMethods()`.
- `async createProject(parentPath, name)` — plain identifier parameters only:
  the Gateway's `methodParameterNames()` parses the parameter list **from the
  method's own source text**, so the file must not be minified and the
  parameters must not use defaults, destructuring or rest.
  `createProject(parentPath, name)` → `{ workspaceId, path, title }`.

Browser half (`client.js`):

- `ctx.remote.$mount({ package, descriptors })` with **hand-written**
  descriptors. Every *parameter* codec must be `mode: 'strict'` with a
  non-empty `typeSymbol` and a `create()` factory (`requireStrictInputs`,
  `validateCodec`); the result codec stays `src-json`, which is exactly what
  the Host's source-mode descriptor produces.

**The one non-public coupling**: the marker string
`@deepseek-ai/dsh-typert-protocol/remote-methods` is a module-private constant
in `packages/typert/protocol/src/index.ts`, not a public export. It is
reproduced verbatim in `index.js`. A second, softer coupling is the
source-text parameter parsing described above. Both are covered by
`test/verify.mjs`, which imports the *real* protocol, registry and gateway
packages and would fail loudly if either constant or that parsing changed.

## File map

| Path | Role |
|---|---|
| `index.js` | **Host half.** Cordis service `projects`; `createProject(parentPath, name)` = `mkdir` + `workspaceRegistry.create`. |
| `client.js` | **Browser half.** Registers `sidebar.panellist` id `projects` (order 10) + `main` panel key `projects`; mounts the Remote namespace; contains the pure `deriveTree` derivation. |
| `cordis.patch.yml` | Bundle patch: inserts id `dsh-projects` → `@local/dsh-projects`. |
| `package.json` | `exports`, `files`, `dsh.bundle.patch`, `dsh.client`. No dependencies, no scripts. |
| `icon.svg` | Bundle icon. |
| `locale/zh.json`, `locale/en.json` | Bundle-manager metadata (title / description). The panel's own strings live in `client.js`. |
| `test/verify.mjs` | The 91-check verification harness. **Not shipped** (excluded from `files`). |
| `docs/design-notes.zh.md` | The design record (Chinese), reproduced verbatim from the workspace root. |

## Running the verifier

```
cd dsh-projects
node test/verify.mjs
```

It installs nothing and touches nothing in the profile. It drives the **real**
built DSH packages from the read-only checkout (`CHECKOUT` near the top of the
file, currently `A:/DSH/deepseek-harness`) against this bundle's `index.js` and
`client.js`: Gateway source-mode export, the marker descriptor, parameter-name
parsing, Client-side contribution validation, the pure derivation rules, and a
real click flow (`新建项目` → name → `确定`, `新建对话`, open a conversation)
through a small stateful React double. It creates and removes one temporary
directory under the OS temp dir. Success prints `ALL CHECKS PASSED` and exits 0.
