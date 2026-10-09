/**
 * Projects bundle, browser half. Iteration 2: the real 「项目区」 tree.
 *
 * Two slot registrations, both under the id `projects`:
 *   - `sidebar.panellist` (kind `list`): the icon the sidebar renders; each
 *     list id addresses the matching main panel.
 *   - `main` (kind `keyed`): the panel body the sidebar entry opens.
 *
 * The panel reads live Host data through the `main` slot's *standard props*
 * (declared as global standard props by their owning plugins, so they are on
 * every root-scope panel's props — `materializeStandardBinding` +
 * `StandardPropsOf<'main'>`, packages/client/ui-slots/src/index.ts:527 and
 * packages/client/ui-renderer/src/client/scoped-slots.tsx:448):
 *
 *   useWorkspaces  WorkspaceSnapshot  <- ctx.slots.provideRoot({ hooks: {
 *                                         workspaces } }) in ui-workspace
 *                                         (packages/client/ui-workspace/src/
 *                                         client/index.ts:121)
 *   useSessions    SessionListState   <- provideRoot({ hooks: { sessions } })
 *                                         in ui-session
 *                                         (packages/client/ui-session/src/
 *                                         client/index.ts:672)
 *
 * No persistence domain and no project registry are added: "project-ness" is
 * derived from the live workspace snapshot alone (see `deriveTree`). The
 * derivation rules are the pure functions below so that
 * `test/verify.mjs` can exercise them without a DOM.
 *
 * Navigation (requirement 2 and 3) goes through the client service
 * `uiWorkspace`, read lazily with `ctx.get` exactly like the Remote namespace
 * below, so a missing service is an explicit panel error rather than a boot
 * failure (`assertEntriesActive` treats a permanently pending inject as a
 * fatal web-boot error — packages/client/web/src/boot-client.ts:66):
 *
 *   startSession(workspaceId?)  packages/client/ui-workspace/src/client/navigation.ts:229
 *   openSession(sessionId)      packages/client/ui-workspace/src/client/navigation.ts:206
 *   declared on the service     packages/client/ui-workspace/src/client/navigation.ts:34-113
 *   called verbatim by the shipped sidebar shell
 *                               packages/client/ui-sidebar/src/client/index.ts:46,68
 *
 * The Host half is called through the Remote namespace this module mounts
 * itself:
 *
 *   ctx.remote.$mount({ package, descriptors })
 *
 * Descriptors are hand-written because a plain-JavaScript plugin has no
 * generated `typert.remote-client.js`. The Client mount requires every
 * *parameter* codec to be `mode: 'strict'` with a nonempty `typeSymbol` and a
 * `create()` factory (`requireStrictInputs`, packages/api/gateway/src/client/
 * index.ts:790; `validateCodec`, packages/typert/registry/src/service.ts:725).
 * The result codec may stay `src-json`: the Host's source-mode descriptor
 * produces exactly that.
 */

window.__ModuleLoader__.load({
  id: '@local/dsh-projects',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Client locale namespace, shared panel id and Remote namespace. */
    const NS = 'projects'
    const PANEL_ID = 'projects'
    /** Owner package stamped into the Remote contribution and its codecs. */
    const PACKAGE = '@local/dsh-projects'

    const zh = {
      panel: '项目区',
      heading: '项目区',
      intro: '项目是某个已注册工作区下的一级子目录，用来存放其中创建的对话。',
      workspacesEmpty: '还没有已注册的工作区。先在「工作区」里添加一个，或把一个已有目录登记为工作区。',
      newProject: '新建项目',
      newSession: '新建对话',
      projectName: '项目名称',
      confirm: '确定',
      cancel: '取消',
      creating: '创建中…',
      created: '已创建项目：',
      failed: '操作失败：',
      unavailable: 'Projects 远程命名空间尚未挂载。',
      navigationUnavailable: '会话导航不可用：客户端服务 uiWorkspace 尚未就绪。',
      projectEmpty: '该项目下还没有对话。',
      workspaceEmpty: '该工作区下还没有项目或对话。',
      ungrouped: '临时对话 / 未分组',
      ungroupedEmpty: '没有未分组的对话。',
      blankSession: '新对话',
      archived: '已归档',
      sessionUnit: '个对话',
      sessionsUnavailable: '会话列表暂时不可用（缺少 useSessions 标准钩子），下面只显示工作区与项目。',
      expand: '展开',
      collapse: '收起',
    }

    const en = {
      panel: 'Projects',
      heading: 'Projects',
      intro: 'A project is a one-level child directory of a registered workspace, holding the conversations created inside it.',
      workspacesEmpty: 'No workspace is registered yet. Add one under Workspaces first, or register an existing directory.',
      newProject: 'New project',
      newSession: 'New conversation',
      projectName: 'Project name',
      confirm: 'OK',
      cancel: 'Cancel',
      creating: 'Creating\u2026',
      created: 'Created project: ',
      failed: 'Failed: ',
      unavailable: 'The Projects Remote namespace is not mounted yet.',
      navigationUnavailable: 'Conversation navigation is unavailable: the client service uiWorkspace is not ready.',
      projectEmpty: 'No conversation in this project yet.',
      workspaceEmpty: 'No project or conversation in this workspace yet.',
      ungrouped: 'Ad-hoc / ungrouped',
      ungroupedEmpty: 'No ungrouped conversation.',
      blankSession: 'New conversation',
      archived: 'archived',
      sessionUnit: 'conversations',
      sessionsUnavailable: 'The conversation list is unavailable (no useSessions standard hook); only workspaces and projects are shown.',
      expand: 'Expand',
      collapse: 'Collapse',
    }

    /**
     * Strict parameter codec: pass-through validation, materialized lazily.
     * @param field - wire field name, used only to keep type symbols unique.
     * @returns a `mode: 'strict'` TypertCodec.
     */
    function jsonCodec(field) {
      return {
        mode: 'strict',
        typeSymbol: `${PACKAGE}#${PANEL_ID}/createProject:${field}`,
        create: () => ({ parse: (value) => value }),
      }
    }

    /** Client-side mirror of the Host's source-mode `projects/createProject`. */
    const REMOTE_CONTRIBUTION = {
      package: PACKAGE,
      descriptors: [{
        id: `${PACKAGE}#${PANEL_ID}/createProject`,
        service: PANEL_ID,
        namespace: PANEL_ID,
        method: 'createProject',
        invocation: { kind: 'direct' },
        parameters: [
          { name: 'parentPath', wire: 'parentPath', source: 'json', codec: jsonCodec('parentPath') },
          { name: 'name', wire: 'name', source: 'json', codec: jsonCodec('name') },
        ],
        result: { mode: 'src-json' },
      }],
    }

    /* ------------------------------------------------------------------ *
     * Path and tree derivation (pure; no React, no services).
     * ------------------------------------------------------------------ */

    /**
     * Separator-normalized folder form, mirroring ui-workspace's own
     * `folderPath` (packages/client/ui-workspace/src/client/tree.ts:624):
     * Windows spelling (drive letter or UNC) folds `\` to `/`; trailing
     * slashes are dropped. POSIX backslashes stay literal.
     * @param path - raw directory path.
     * @returns the folder form.
     */
    function folderPath(path) {
      const windows = /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\\\')
      return (windows ? path.replaceAll('\\', '/') : path).replace(/\/+$/, '')
    }

    /**
     * Comparison key for one path: Windows and UNC paths compare
     * case-insensitively, POSIX paths case-sensitively.
     * @param path - raw directory path.
     * @returns the comparison key.
     */
    function pathKey(path) {
      const folder = folderPath(path)
      return /^[A-Za-z]:\//.test(folder) || folder.startsWith('//') ? folder.toLowerCase() : folder
    }

    /**
     * The immediate parent folder of a path.
     * @param path - raw directory path.
     * @returns the parent folder, or undefined at a filesystem root
     *   (`/`, `/home`, `C:/`, `C:/x` -> `C:/`, a UNC share root).
     */
    function parentFolderOf(path) {
      const folder = folderPath(path)
      const cut = folder.lastIndexOf('/')
      if (cut < 0) return undefined
      const parent = folder.slice(0, cut)
      if (parent === '' || /^[A-Za-z]:$/.test(parent)) return undefined
      if (parent.startsWith('//') && parent.slice(2).split('/').length < 2) return undefined
      return parent
    }

    /**
     * Display basename of a directory path.
     * @param path - raw directory path.
     * @returns the last segment, or the whole folder form when there is none.
     */
    function baseName(path) {
      const folder = folderPath(path)
      const cut = folder.lastIndexOf('/')
      return cut < 0 ? folder : folder.slice(cut + 1)
    }

    /**
     * Row label of one Workspace: its title, else the directory basename.
     * @param workspace - Workspace snapshot item.
     * @returns non-empty display label.
     */
    function workspaceLabel(workspace) {
      const title = typeof workspace.title === 'string' ? workspace.title.trim() : ''
      if (title !== '') return title
      const path = typeof workspace.path === 'string' ? workspace.path : ''
      return baseName(path) || path
    }

    /**
     * Row label of one Session: the controller's display title, else the
     * durable title, else the cwd basename, else the raw id.
     * @param session - Session summary.
     * @returns non-empty display label.
     */
    function sessionLabel(session) {
      for (const candidate of [session.displayTitle, session.title]) {
        if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim()
      }
      return baseName(typeof session.cwd === 'string' ? session.cwd : '') || String(session.id)
    }

    /** Newest first, with the Session identity as the deterministic tie-break. */
    function orderSessionRows(rows) {
      return [...rows].sort((a, b) => (a.updatedAt !== b.updatedAt ? b.updatedAt - a.updatedAt : (a.id < b.id ? -1 : 1)))
    }

    /**
     * Derive the two-level 「项目区」 tree from the live Workspace snapshot.
     *
     * Project-ness is *derived*, never stored: a registered Workspace is a
     * **project** when another registered Workspace's path is its immediate
     * parent directory. The two-level cap only lets a top-level Workspace own
     * projects, so a Workspace whose direct parent is itself a project stays
     * top-level rather than nesting a third level; every registered Workspace
     * therefore appears exactly once.
     *
     * A Session is placed under the deepest registered Workspace whose path
     * contains the Session's cwd (so a project's conversations land in the
     * project, not in its parent), falling back to the Workspace that
     * accounts for the Session id when no path contains it. Sessions with
     * neither go to the ungrouped bucket.
     * @param workspaces - Workspace snapshot items (`workspaceId`, `title`, `path`, `sessionIds`).
     * @param sessions - Session summaries; subagent children are skipped here.
     * @param archivedSessionIds - registry-global archive set (marked, not hidden).
     * @returns `roots` (each with `projects` and its own `sessions`), `ungrouped`, `sessionCount`.
     */
    function deriveTree(workspaces, sessions, archivedSessionIds) {
      const items = []
      const seen = new Set()
      for (const raw of Array.isArray(workspaces) ? workspaces : []) {
        if (raw === null || typeof raw !== 'object') continue
        const path = typeof raw.path === 'string' ? raw.path : ''
        const key = path === '' ? '' : pathKey(path)
        // A blank path cannot be a directory, and one directory registered
        // twice is one row.
        if (key === '' || seen.has(key)) continue
        seen.add(key)
        const workspaceId = String(raw.workspaceId ?? key)
        items.push({
          key: workspaceId,
          workspaceId,
          path,
          title: workspaceLabel(raw),
          sessionIds: Array.isArray(raw.sessionIds) ? raw.sessionIds.map(String) : [],
        })
      }

      const byPath = new Map(items.map(item => [pathKey(item.path), item]))
      const directParentOf = new Map()
      for (const item of items) {
        const parentFolder = parentFolderOf(item.path)
        const parent = parentFolder === undefined ? undefined : byPath.get(pathKey(parentFolder))
        if (parent !== undefined && parent !== item) directParentOf.set(item.key, parent)
      }

      // Two-level cap: a project is owned only by a top-level Workspace.
      const projectsOf = new Map()
      const roots = []
      for (const item of items) {
        const parent = directParentOf.get(item.key)
        if (parent !== undefined && !directParentOf.has(parent.key)) {
          const siblings = projectsOf.get(parent.key)
          if (siblings === undefined) projectsOf.set(parent.key, [item])
          else siblings.push(item)
        } else {
          roots.push(item)
        }
      }

      const archived = new Set((Array.isArray(archivedSessionIds) ? archivedSessionIds : []).map(String))
      const rowsByOwner = new Map()
      const ungrouped = []
      let sessionCount = 0

      /**
       * The Workspace owning one Session: deepest path containment first,
       * then the accounting Workspace.
       */
      const ownerOf = (summary) => {
        const cwd = typeof summary.cwd === 'string' ? summary.cwd : ''
        if (cwd !== '') {
          const key = pathKey(cwd)
          let best
          let bestLength = -1
          for (const item of items) {
            const itemKey = pathKey(item.path)
            if (itemKey.length <= bestLength) continue
            if (key === itemKey || key.startsWith(`${itemKey}/`)) {
              best = item
              bestLength = itemKey.length
            }
          }
          if (best !== undefined) return best
        }
        const id = String(summary.id)
        return items.find(item => item.sessionIds.includes(id))
      }

      for (const summary of Array.isArray(sessions) ? sessions : []) {
        if (summary === null || typeof summary !== 'object' || summary.origin === 'subagent') continue
        const id = String(summary.id)
        const row = {
          id,
          label: sessionLabel(summary),
          blank: summary.blank === true,
          archived: archived.has(id),
          updatedAt: typeof summary.updatedAt === 'number' ? summary.updatedAt : 0,
        }
        sessionCount += 1
        const owner = ownerOf(summary)
        if (owner === undefined) {
          ungrouped.push(row)
          continue
        }
        const rows = rowsByOwner.get(owner.key)
        if (rows === undefined) rowsByOwner.set(owner.key, [row])
        else rows.push(row)
      }

      const rowsOf = key => orderSessionRows(rowsByOwner.get(key) ?? [])

      return {
        roots: roots.map(root => ({
          key: root.key,
          workspaceId: root.workspaceId,
          title: root.title,
          path: root.path,
          sessions: rowsOf(root.key),
          projects: (projectsOf.get(root.key) ?? []).map(project => ({
            key: project.key,
            workspaceId: project.workspaceId,
            title: project.title,
            path: project.path,
            sessions: rowsOf(project.key),
          })),
        })),
        ungrouped: orderSessionRows(ungrouped),
        sessionCount,
      }
    }

    /* ------------------------------------------------------------------ *
     * Panel styles and standard-hook fallbacks.
     * ------------------------------------------------------------------ */

    const sectionStyle = { padding: '16px 20px', height: '100%', boxSizing: 'border-box', overflowY: 'auto' }
    const inputStyle = { font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid currentColor', borderRadius: '6px', padding: '4px 8px', opacity: 0.9 }
    const buttonStyle = { font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid currentColor', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', fontSize: '12px' }
    const caretStyle = { font: 'inherit', color: 'inherit', background: 'transparent', border: 'none', padding: 0, width: '16px', cursor: 'pointer' }
    const rowStyle = { padding: '10px 0', borderTop: '1px solid rgba(128, 128, 128, 0.3)' }
    const rowHeadStyle = { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }
    const dimStyle = { opacity: 0.7 }
    const pathStyle = { ...dimStyle, fontSize: '12px', wordBreak: 'break-all' }
    const emptyStyle = { ...dimStyle, fontSize: '12px', margin: '4px 0' }
    const nestedStyle = { margin: '4px 0 2px 6px', paddingLeft: '10px', borderLeft: '1px solid rgba(128, 128, 128, 0.35)' }
    const sessionListStyle = { listStyle: 'none', margin: '2px 0 2px 0', padding: 0 }
    const sessionButtonStyle = { font: 'inherit', color: 'inherit', background: 'transparent', border: 'none', padding: '2px 0', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }
    const draftStyle = { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', margin: '4px 0' }

    /** Empty inputs used only when a standard hook is absent (never in the live shell). */
    const EMPTY_WORKSPACE_STATE = Object.freeze({ items: [], archivedSessionIds: [] })
    const EMPTY_SESSION_STATE = Object.freeze({ ids: [], byId: {} })
    const emptyWorkspaces = () => EMPTY_WORKSPACE_STATE
    const emptySessions = () => EMPTY_SESSION_STATE

    /** Human-readable text of any thrown value. */
    function messageOf(error) {
      return error !== null && typeof error === 'object' && typeof error.message === 'string'
        ? error.message
        : String(error)
    }

    /**
     * The sidebar's Projects entry.
     * @param props - the sidebar's icon share: requested edge and selection.
     * @returns the icon element.
     */
    function ProjectsPanelIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 20
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, style: { display: 'block', pointerEvents: 'none' } },
        h('path', {
          d: 'M3.2 7.2a2 2 0 0 1 2-2h3.4l1.8 2h8.4a2 2 0 0 1 2 2v7.6a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: props.active === true ? 2 : 1.6,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M12 11.4v4M10 13.4h4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      )
    }

    /**
     * The Projects panel body: the derived two-level workspace/project tree
     * with a 「新建项目」 affordance on every top-level row, 「新建对话」 on
     * every workspace and project row, and clickable session rows.
     * @param props - `main` slot props: standard hooks, locale seat, inject face.
     * @returns the panel element.
     */
    function ProjectsPanel(props) {
      const t = props.t
      // Standard hooks are framework-supplied on every root-scope panel; the
      // module-level fallbacks keep hook order stable in a stripped host
      // (they are stable identities, so the call order never changes).
      const workspacesSource = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : emptyWorkspaces
      const sessionsSource = typeof props.useSessions === 'function' ? props.useSessions : emptySessions
      const workspaceState = workspacesSource(state => state) ?? EMPTY_WORKSPACE_STATE
      const sessionState = sessionsSource(state => state) ?? EMPTY_SESSION_STATE

      const [collapsed, setCollapsed] = React.useState({})
      const [draft, setDraft] = React.useState(null)
      const [busyKey, setBusyKey] = React.useState(null)
      const [notice, setNotice] = React.useState(null)

      const sessions = []
      const ids = Array.isArray(sessionState.ids) ? sessionState.ids : []
      const byId = sessionState.byId === null || typeof sessionState.byId !== 'object' ? {} : sessionState.byId
      for (const id of ids) {
        const summary = byId[id]
        if (summary !== undefined) sessions.push(summary)
      }
      const tree = deriveTree(workspaceState.items, sessions, workspaceState.archivedSessionIds)

      const report = (error) => {
        setNotice({ ok: false, text: `${t('failed')}${messageOf(error)}` })
      }

      const toggle = (key) => {
        setCollapsed(previous => ({ ...previous, [key]: previous[key] !== true }))
      }

      const openDraft = (key, path) => {
        setDraft({ key, path, value: '' })
        setNotice(null)
      }

      const submitDraft = () => {
        if (draft === null) return
        const { key, path, value } = draft
        setBusyKey(key)
        setNotice(null)
        Promise.resolve()
          .then(() => props.createProject(path, value))
          .then(
            (created) => {
              setDraft(null)
              setNotice({ ok: true, text: `${t('created')}${created.title} — ${created.path}` })
            },
            (error) => { report(error) },
          )
          .then(() => { setBusyKey(null) })
      }

      // Navigation is synchronous by contract (`startSession` and
      // `openSession` return void), so it stays inside the user gesture.
      const navigate = (action) => {
        try {
          action()
          setNotice(null)
        } catch (error) {
          report(error)
        }
      }

      const sessionRows = (rows, emptyText, key) => (rows.length === 0
        ? h('p', { key, style: emptyStyle }, emptyText)
        : h(
          'ul',
          { key, style: sessionListStyle },
          rows.map((row) => {
            const label = row.blank ? t('blankSession') : row.label
            return h(
              'li',
              { key: row.id, style: { padding: '1px 0' } },
              h(
                'button',
                {
                  type: 'button',
                  'data-action': 'open-session',
                  'data-session': row.id,
                  onClick: () => { navigate(() => props.openSession(row.id)) },
                  style: sessionButtonStyle,
                },
                row.archived ? `${label} (${t('archived')})` : label,
              ),
            )
          }),
        ))

      const draftEditor = draft === null ? null : h(
        'div',
        { key: `draft:${draft.key}`, style: draftStyle },
        h('input', {
          'data-field': 'project-name',
          'aria-label': t('projectName'),
          placeholder: t('projectName'),
          value: draft.value,
          onChange: (event) => { setDraft({ key: draft.key, path: draft.path, value: event.target.value }) },
          style: { ...inputStyle, minWidth: '140px' },
        }),
        h(
          'button',
          {
            type: 'button',
            'data-action': 'confirm-project',
            disabled: busyKey !== null,
            onClick: submitDraft,
            style: buttonStyle,
          },
          busyKey === draft.key ? t('creating') : t('confirm'),
        ),
        h(
          'button',
          {
            type: 'button',
            'data-action': 'cancel-project',
            disabled: busyKey !== null,
            onClick: () => { setDraft(null); setNotice(null) },
            style: buttonStyle,
          },
          t('cancel'),
        ),
      )

      const renderProject = (project) => {
        const open = collapsed[project.key] !== true
        return h(
          'div',
          { key: `project:${project.key}`, style: nestedStyle, 'data-role': 'project' },
          h(
            'div',
            { style: rowHeadStyle },
            h(
              'button',
              {
                type: 'button',
                'data-action': 'toggle',
                'data-workspace': project.key,
                'aria-label': open ? t('collapse') : t('expand'),
                'aria-expanded': open,
                onClick: () => { toggle(project.key) },
                style: caretStyle,
              },
              open ? '\u25be' : '\u25b8',
            ),
            h('span', { 'data-role': 'project-title', style: { fontWeight: 600, fontSize: '13px' } }, project.title),
            h('span', { style: { ...dimStyle, fontSize: '12px' } }, `${project.sessions.length} ${t('sessionUnit')}`),
            h(
              'button',
              {
                type: 'button',
                'data-action': 'new-session',
                'data-workspace': project.key,
                onClick: () => { navigate(() => props.startSession(project.workspaceId)) },
                style: buttonStyle,
              },
              t('newSession'),
            ),
          ),
          h('div', { style: pathStyle }, project.path),
          open ? sessionRows(project.sessions, t('projectEmpty'), `sessions:${project.key}`) : null,
        )
      }

      const renderRoot = (root) => {
        const open = collapsed[root.key] !== true
        const draftHere = draft !== null && draft.key === root.key
        const body = []
        if (draftHere) body.push(draftEditor)
        for (const project of root.projects) body.push(renderProject(project))
        if (root.sessions.length > 0) body.push(sessionRows(root.sessions, t('workspaceEmpty'), `sessions:${root.key}`))
        else if (root.projects.length === 0 && !draftHere) body.push(h('p', { key: `empty:${root.key}`, style: emptyStyle }, t('workspaceEmpty')))
        return h(
          'li',
          { key: `workspace:${root.key}`, style: rowStyle, 'data-role': 'workspace' },
          h(
            'div',
            { style: rowHeadStyle },
            h(
              'button',
              {
                type: 'button',
                'data-action': 'toggle',
                'data-workspace': root.key,
                'aria-label': open ? t('collapse') : t('expand'),
                'aria-expanded': open,
                onClick: () => { toggle(root.key) },
                style: caretStyle,
              },
              open ? '\u25be' : '\u25b8',
            ),
            h('span', { 'data-role': 'workspace-title', style: { fontWeight: 600, fontSize: '13px' } }, root.title),
            h(
              'button',
              {
                type: 'button',
                'data-action': 'new-project',
                'data-workspace': root.key,
                disabled: busyKey !== null,
                onClick: () => { openDraft(root.key, root.path) },
                style: buttonStyle,
              },
              t('newProject'),
            ),
            h(
              'button',
              {
                type: 'button',
                'data-action': 'new-session',
                'data-workspace': root.key,
                onClick: () => { navigate(() => props.startSession(root.workspaceId)) },
                style: buttonStyle,
              },
              t('newSession'),
            ),
          ),
          h('div', { style: pathStyle }, root.path),
          open ? body : null,
        )
      }

      const children = []
      // A stripped host without the Session root hook must say so rather than
      // silently render every project as empty.
      if (typeof props.useSessions !== 'function') {
        children.push(h('p', { key: 'no-session-hook', style: emptyStyle }, t('sessionsUnavailable')))
      }
      // No top-level Workspace at all: the tree has nothing to hang projects
      // or conversations on, so say so even when loose Sessions exist.
      if (tree.roots.length === 0) {
        children.push(h('p', { key: 'empty', style: { ...dimStyle, fontSize: '13px' } }, t('workspacesEmpty')))
      }
      if (tree.roots.length > 0) {
        children.push(h('ul', { key: 'roots', style: { listStyle: 'none', margin: 0, padding: 0 } }, tree.roots.map(renderRoot)))
      }
      if (tree.ungrouped.length > 0) {
        const open = collapsed.ungrouped !== true
        children.push(h(
          'div',
          { key: 'ungrouped', style: { ...rowStyle, marginTop: '4px' }, 'data-role': 'ungrouped' },
          h(
            'div',
            { style: rowHeadStyle },
            h(
              'button',
              {
                type: 'button',
                'data-action': 'toggle',
                'data-workspace': 'ungrouped',
                'aria-label': open ? t('collapse') : t('expand'),
                'aria-expanded': open,
                onClick: () => { toggle('ungrouped') },
                style: caretStyle,
              },
              open ? '\u25be' : '\u25b8',
            ),
            h('span', { style: { fontWeight: 600, fontSize: '13px' } }, t('ungrouped')),
            h('span', { style: { ...dimStyle, fontSize: '12px' } }, `${tree.ungrouped.length} ${t('sessionUnit')}`),
          ),
          open ? sessionRows(tree.ungrouped, t('ungroupedEmpty'), 'sessions:ungrouped') : null,
        ))
      }

      return h(
        'section',
        { style: sectionStyle },
        h('h2', { style: { margin: '0 0 4px', fontSize: '16px' } }, t('heading')),
        h('p', { style: { ...dimStyle, margin: '0 0 12px', fontSize: '13px' } }, t('intro')),
        notice === null ? null : h(
          'p',
          { 'data-role': 'notice', style: { margin: '0 0 12px', fontSize: '13px', ...dimStyle } },
          notice.text,
        ),
        children,
      )
    }

    return {
      inject: ['slots', 'locale'],
      /**
       * Register the panel and its sidebar entry, and mount the Remote namespace.
       * @param ctx - the browser plugin context.
       */
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-projects: dictionaries')
        const t = ctx.locale.bind(NS)

        // The client navigation service the tree's buttons drive. It is read
        // through `ctx.get` (no inject edge) so that a missing service is an
        // explicit panel error instead of a permanently pending plugin, which
        // the web boot audit treats as fatal
        // (packages/client/web/src/boot-client.ts:80).
        const navigation = () => {
          const service = ctx.get('uiWorkspace')
          if (service === undefined || typeof service.startSession !== 'function' || typeof service.openSession !== 'function') {
            throw new Error(t('navigationUnavailable'))
          }
          return service
        }

        // The Host callables this panel drives. `ctx.get` reads the namespace
        // service by its Cordis key without declaring it in this plugin's
        // `inject` (an inject on `remote.projects` could never be satisfied
        // before this very file mounts it); it is undefined until $mount
        // resolved, so that failure stays explicit.
        const face = {
          createProject: async (parentPath, name) => {
            const namespace = ctx.get('remote.projects')
            if (namespace === undefined || typeof namespace.createProject !== 'function') {
              throw new Error(t('unavailable'))
            }
            const result = await namespace.createProject(parentPath, name)
            if (!result.ok) throw new Error(result.error.message)
            return result.value
          },
          startSession: (workspaceId) => { navigation().startSession(workspaceId) },
          openSession: (sessionId) => { navigation().openSession(sessionId) },
        }

        ctx.inject(['remote'], (remoteCtx) => {
          remoteCtx.remote.$mount(REMOTE_CONTRIBUTION).catch((error) => {
            console.warn(`dsh-projects: Remote contribution did not mount: ${String(error)}`)
          })
        })

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => face,
        }, ProjectsPanel))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 10,
          label: () => t('panel'),
          locale: NS,
        }, ProjectsPanelIcon))
      },

      /**
       * Pure derivation seam for `verify-projects.mjs`. Not a Cordis plugin
       * field: the Loader reads only `apply`/`inject`/`name`/`Config`, so these
       * extra members are inert in the browser and testable in Node.
       */
      __testInternals: {
        folderPath,
        pathKey,
        parentFolderOf,
        baseName,
        workspaceLabel,
        sessionLabel,
        deriveTree,
      },
    }
  },
})
