/**
 * Verification harness for the `dsh-projects` bundle (iteration 2).
 *
 * It does NOT install anything. It drives the REAL built DSH packages from the
 * read-only checkout (cordis, @deepseek-ai/dsh-typert-registry,
 * @deepseek-ai/dsh-api-gateway, @deepseek-ai/dsh-typert-protocol) against the
 * bundle's own `index.js` (Host half) and `client.js` (browser half), so the
 * Gateway's source-mode export path, the marker descriptor, the parameter-name
 * parsing and the Client-side contribution validation are all exercised for
 * real. The client half's tree derivation and its click handlers are exercised
 * through a tiny stateful React double, so 「新建项目」 -> input -> 确定 is a
 * real interaction, not a static render.
 *
 * The bundle's halves are resolved from THIS file's location, not from the
 * process working directory, so the harness runs from anywhere:
 *
 *   node test/verify.mjs          (from the package root)
 *   node dsh-projects/test/verify.mjs   (from the workspace root)
 *
 * Run: node test/verify.mjs
 */

import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Read-only checkout holding the built DSH packages this harness drives. */
const CHECKOUT = 'A:/DSH/deepseek-harness'
/** Package root = the parent directory of this file's `test/` directory. */
const BUNDLE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fromCheckout = (relative) => pathToFileURL(`${CHECKOUT}/${relative}`).href

let failures = 0
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

const { Context } = await import(fromCheckout('vendor/cordis/lib/index.js'))
const { TypertRegistry } = await import(fromCheckout('packages/typert/registry/lib/index.js'))
const { TypertGatewayService } = await import(fromCheckout('packages/api/gateway/lib/index.js'))
const { remoteMethods } = await import(fromCheckout('packages/typert/protocol/lib/index.js'))
const host = await import(pathToFileURL(`${BUNDLE}/index.js`).href)

console.log('1. Host half: real Gateway source-mode export and invocation')
const ctx = new Context()
const created = []
ctx.provide('workspaceRegistry', {
  create: async (path) => {
    created.push(path)
    return { id: 'ws-1', path, title: 'Stub Workspace' }
  },
})
await ctx.plugin(TypertRegistry)

// Stand in for the real Connection carrier so the Gateway's /api interceptor
// registers; this is the exact seam the browser's RPC call travels through.
const intercept = {}
ctx.provide('connection', {
  rpc: {
    intercept: (channel, claim, dispatch) => { intercept.channel = channel; intercept.claim = claim; intercept.dispatch = dispatch },
  },
})
await ctx.plugin(TypertGatewayService, {})

const pluginFiber = ctx.plugin({ apply: host.apply, inject: host.inject })
await pluginFiber

const service = ctx.get('projects')
check('ctx.provide("projects") registered a Service', service !== undefined)
check(
  'reflect.props.projects.type is "service" (what the Gateway scans)',
  ctx.reflect.props.projects?.type === 'service',
  JSON.stringify(ctx.reflect.props.projects),
)
check(
  'the real remoteMethods() reads the hand-written prototype marker',
  JSON.stringify(remoteMethods(service)) === JSON.stringify([{ method: 'createProject', invocation: { kind: 'direct' } }]),
  JSON.stringify(remoteMethods(service)),
)
const binding = service.typertRemote
check(
  'typertRemote binding matches readBinding() requirements',
  binding !== undefined && binding.service === service && binding.serviceKey === 'projects' && binding.namespace === 'projects',
  JSON.stringify({ serviceKey: binding?.serviceKey, namespace: binding?.namespace, sameService: binding?.service === service }),
)

const sandbox = await mkdtemp(join(tmpdir(), 'dsh-projects-verify-'))
const invoke = (args) => ctx.typertGateway.invoke({ namespace: 'projects', method: 'createProject', args })

check('the gateway registered its /api interceptor on the Connection', intercept.channel === '/api' && typeof intercept.claim === 'function')
check('the /api interceptor CLAIMS the projects/createProject endpoint', intercept.claim('projects/createProject') === true)

// Exactly what ctx.remote.projects.createProject(parentPath, name) sends.
const rpc = await intercept.dispatch(
  'projects/createProject',
  { args: { parentPath: sandbox, name: 'over-the-wire' } },
  new AbortController().signal,
  undefined,
)
check(
  'the /api wire payload ({ args }) resolves over the real dispatch path',
  rpc.ok === true && rpc.value.title === 'Stub Workspace' && rpc.value.path === join(sandbox, 'over-the-wire'),
  JSON.stringify(rpc),
)

const value = await invoke({ parentPath: sandbox, name: 'demo' })
check(
  'invoke() resolves the SRC descriptor and returns the plain projection',
  JSON.stringify(value) === JSON.stringify({ workspaceId: 'ws-1', path: join(sandbox, 'demo'), title: 'Stub Workspace' }),
  JSON.stringify(value),
)
check('the directory exists on disk', (await stat(join(sandbox, 'demo'))).isDirectory())
const beforeRepeat = created.length
const again = await invoke({ parentPath: sandbox, name: 'demo' })
check(
  'mkdir(recursive) is idempotent for the same project',
  again !== undefined && created.length === beforeRepeat + 1 && (await stat(join(sandbox, 'demo'))).isDirectory(),
)

async function expectReject(label, args, needle) {
  try {
    await invoke(args)
    check(label, false, 'resolved instead of rejecting')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    check(label, message.includes(needle), message)
  }
}
await expectReject('rejects a blank name', { parentPath: sandbox, name: '   ' }, 'must not be blank')
await expectReject('rejects "."', { parentPath: sandbox, name: '.' }, 'must not be "."')
await expectReject('rejects ".."', { parentPath: sandbox, name: '..' }, 'must not be ".."')
await expectReject('rejects "/"', { parentPath: sandbox, name: 'a/b' }, 'must not contain')
await expectReject('rejects "\\"', { parentPath: sandbox, name: 'a\\b' }, 'must not contain')
await expectReject('rejects ":"', { parentPath: sandbox, name: 'a:b' }, 'must not contain')
await expectReject('rejects a blank parentPath', { parentPath: '  ', name: 'ok' }, 'parentPath must be a non-blank string')

console.log('2. Client half: module registration, contribution validation, mount')
let registration
globalThis.window = { __ModuleLoader__: { load: (value) => { registration = value } } }
const client = await import(pathToFileURL(`${BUNDLE}/client.js`).href)
check('client.js registers one module under the package id', registration?.id === '@local/dsh-projects', String(registration?.id))
check('client.js exports nothing but the loader call', Object.keys(client).length === 0, JSON.stringify(Object.keys(client)))

/* ------------------------------------------------------------------ *
 * A tiny stateful React: same positional hook store across re-renders,
 * so a click -> setState -> re-render is a real interaction here.
 * ------------------------------------------------------------------ */
function createFakeReact() {
  const hooks = []
  let cursor = 0
  let changed = false
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (initial) => {
      const index = cursor
      cursor += 1
      if (!(index in hooks)) hooks[index] = initial
      return [hooks[index], (next) => {
        hooks[index] = typeof next === 'function' ? next(hooks[index]) : next
        changed = true
      }]
    },
  }
  return {
    React,
    render: (component, props) => { cursor = 0; changed = false; return component(props) },
    changed: () => changed,
    reset: () => { hooks.length = 0; cursor = 0; changed = false },
  }
}

const fake = createFakeReact()

/** Walk a rendered element tree (children may nest arrays). */
function nodesOf(tree, predicate) {
  const found = []
  const walk = (node) => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) { for (const child of node) walk(child); return }
    if (typeof node !== 'object') return
    if (predicate(node)) found.push(node)
    const children = Array.isArray(node.children) ? node.children : []
    for (const child of children) walk(child)
  }
  walk(tree)
  return found
}

const byAction = (tree, action, workspace) => nodesOf(tree, (node) => node.props['data-action'] === action
  && (workspace === undefined || node.props['data-workspace'] === workspace))[0]

const dictionaries = {}
const captured = { main: [], panellist: [], mounted: null, effects: 0 }
const slotRegister = (options, component) => {
  captured[options.name === 'main' ? 'main' : 'panellist'].push({ options, component })
  return () => {}
}
const remoteCalls = []
const remoteDouble = {
  fail: null,
  createProject: async (parentPath, name) => {
    remoteCalls.push([parentPath, name])
    if (remoteDouble.fail !== null) throw new Error(remoteDouble.fail)
    return { ok: true, value: { workspaceId: 'ws-new', path: `${parentPath}/${name}`, title: name } }
  },
}
const navigationCalls = { started: [], opened: [] }
const uiWorkspaceDouble = {
  startSession: (workspaceId) => { navigationCalls.started.push(workspaceId) },
  openSession: (target) => { navigationCalls.opened.push(target) },
}
const serviceOf = (key) => {
  if (key === 'remote.projects') return remoteDouble
  if (key === 'uiWorkspace') return uiWorkspaceDouble
  return undefined
}
const fakeCtx = {
  effect: (fn) => { captured.effects += 1; return fn() },
  locale: {
    register: (ns, dicts) => { dictionaries[ns] = dicts; return () => {} },
    bind: (ns) => (key) => dictionaries[ns].zh[key],
  },
  inject: (deps, callback) => callback({ remote: { $mount: async (contribution) => { captured.mounted = contribution; return async () => {} } } }),
  slots: { inject: (owner, callback) => callback(), register: slotRegister },
  get: serviceOf,
}
const module_ = registration.factory((id) => {
  if (id === 'react') return fake.React
  throw new Error(`unexpected require(${JSON.stringify(id)})`)
})
check('the client plugin injects slots and locale', JSON.stringify(module_.inject) === JSON.stringify(['slots', 'locale']), JSON.stringify(module_.inject))
module_.apply(fakeCtx)
check('the locale dictionary registers with zh + en', dictionaries.projects?.zh?.panel === '项目区' && dictionaries.projects?.en?.panel === 'Projects')

const entry = captured.panellist[0]
check('one sidebar.panellist entry is registered', captured.panellist.length === 1)
check('its id is "projects"', entry?.options.id === 'projects' && entry?.options.name === 'sidebar.panellist', JSON.stringify(entry?.options))
check('its label thunk resolves the zh label 项目区', entry?.options.label() === '项目区', String(entry?.options.label()))
check('its component is a function (icon)', typeof entry?.component === 'function')

const panel = captured.main[0]
check('the matching main panel registers under key "projects"', panel?.options.key === 'projects' && panel?.options.name === 'main', JSON.stringify(panel?.options))
check('the main panel declares the client locale namespace', panel?.options.locale === 'projects')
check('the main panel exposes an inject face', typeof panel?.options.inject === 'function')

const contribution = captured.mounted
check('$mount received the hand-written contribution', contribution?.package === '@local/dsh-projects' && contribution?.descriptors?.length === 1)
const descriptor = contribution?.descriptors?.[0]
check('every parameter codec is mode "strict" (the Client mount requirement)', descriptor?.parameters?.every((parameter) => parameter.codec.mode === 'strict'))
check(
  'every strict codec has a nonempty typeSymbol and a create() factory',
  descriptor?.parameters?.every((parameter) => parameter.codec.typeSymbol.length > 0 && typeof parameter.codec.create === 'function'),
)
const strict = await ctx.typert.remotes.register(contribution)
check('the real TypertRemoteRegistry accepts the contribution', ctx.typert.remotes.list().some((item) => item.namespace === 'projects' && item.method === 'createProject'))
await strict()

const face = panel.options.inject()
check('the inject face exposes createProject/startSession/openSession',
  typeof face.createProject === 'function' && typeof face.startSession === 'function' && typeof face.openSession === 'function',
  JSON.stringify(Object.keys(face)))

/* ------------------------------------------------------------------ *
 * 3. The derivation rules (pure, no React).
 * ------------------------------------------------------------------ */
console.log('3. Derivation: workspaces -> projects -> conversations')
const internals = module_.__testInternals
check('client.js exposes the pure derivation seam', internals !== undefined && typeof internals.deriveTree === 'function', JSON.stringify(Object.keys(internals ?? {})))

const { folderPath, pathKey, parentFolderOf, baseName, deriveTree } = internals
const W = (workspaceId, path, title = workspaceId, sessionIds = []) => ({ workspaceId, path, title, sessionIds })
const S = (id, cwd, extra = {}) => ({ id, cwd, displayTitle: extra.displayTitle ?? id, blank: false, updatedAt: 0, ...extra })
const idsOf = (rows) => rows.map((row) => row.id).join(',')

check('folderPath folds Windows separators and drops trailing slashes', folderPath('C:\\work\\A\\') === 'C:/work/A', folderPath('C:\\work\\A\\'))
check('folderPath keeps POSIX backslashes literal', folderPath('/home/u/we\\ird') === '/home/u/we\\ird', folderPath('/home/u/we\\ird'))
check('pathKey is case-insensitive on Windows spellings', pathKey('C:\\Work\\A') === 'c:/work/a', pathKey('C:\\Work\\A'))
check('pathKey is case-sensitive on POSIX spellings', pathKey('/Work/A') === '/Work/A', pathKey('/Work/A'))
check('parentFolderOf stops at a POSIX root', parentFolderOf('/home') === undefined && parentFolderOf('/home/u') === '/home', String(parentFolderOf('/home')))
check('parentFolderOf stops at a drive root', parentFolderOf('C:/') === undefined && parentFolderOf('C:/x') === undefined && parentFolderOf('C:/x/y') === 'C:/x', String(parentFolderOf('C:/x')))
check('parentFolderOf stops at a UNC share root', parentFolderOf('//server/share') === undefined && parentFolderOf('//server/share/dir') === '//server/share', String(parentFolderOf('//server/share')))
check('baseName returns the last segment', baseName('C:/work/A/P1') === 'P1', baseName('C:/work/A/P1'))

const workspaces = [
  W('ws-a', 'C:/work/A', '工作区 A'),
  W('ws-p1', 'C:/work/A/P1', 'P1'),
  W('ws-p2', 'C:/work/A/P2', 'P2'),
  W('ws-b', 'C:/work/B', '工作区 B'),
]
const sessions = [
  S('s-a', 'C:/work/A', { updatedAt: 10 }),
  S('s-p1', 'C:/work/A/P1', { updatedAt: 20 }),
  S('s-p1-sub', 'C:/work/A/P1/src', { updatedAt: 30 }),
  S('s-b', 'C:/work/B', { updatedAt: 5 }),
  S('s-loose', 'C:/tmp/loose', { updatedAt: 1 }),
  S('s-none', undefined, { updatedAt: 0 }),
  S('s-child', 'C:/work/A/P1', { origin: 'subagent' }),
  S('s-blank', 'C:/work/A/P2', { blank: true, updatedAt: 40 }),
]
const tree = deriveTree(workspaces, sessions, ['s-b'])

check('two top-level workspaces, in snapshot order', tree.roots.map((root) => root.workspaceId).join(',') === 'ws-a,ws-b', tree.roots.map((root) => root.workspaceId).join(','))
const rootA = tree.roots[0]
check('A owns P1 and P2 as projects, in snapshot order', rootA.projects.map((project) => project.workspaceId).join(',') === 'ws-p1,ws-p2', rootA.projects.map((project) => project.workspaceId).join(','))
check('A shows its own directory sessions directly', idsOf(rootA.sessions) === 's-a', idsOf(rootA.sessions))
check('P1 shows only its own subtree sessions, newest first', idsOf(rootA.projects[0].sessions) === 's-p1-sub,s-p1', idsOf(rootA.projects[0].sessions))
check('a blank session is kept and flagged', rootA.projects[1].sessions[0]?.blank === true, JSON.stringify(rootA.projects[1].sessions))
check('B has no project', tree.roots[1].projects.length === 0, String(tree.roots[1].projects.length))
check('the archive set marks a row instead of hiding it', tree.roots[1].sessions[0]?.archived === true, JSON.stringify(tree.roots[1].sessions))
check('a subagent child is not a tree row', tree.sessionCount === 7, String(tree.sessionCount))
check('sessions outside every workspace fall to ungrouped, newest first', idsOf(tree.ungrouped) === 's-loose,s-none', idsOf(tree.ungrouped))

const fallback = deriveTree([W('ws-a', 'C:/work/A', 'A', ['s-member'])], [S('s-member', undefined)], [])
check('membership is the fallback owner when no path contains the cwd', idsOf(fallback.roots[0].sessions) === 's-member', idsOf(fallback.roots[0].sessions))

const capped = deriveTree(
  [W('ws-a', 'C:/work/A'), W('ws-p1', 'C:/work/A/P1'), W('ws-deep', 'C:/work/A/P1/deep')],
  [S('s-deep', 'C:/work/A/P1/deep')],
  [],
)
check('two-level cap: a project never nests under another project', capped.roots.map((root) => root.workspaceId).join(',') === 'ws-a,ws-deep', capped.roots.map((root) => root.workspaceId).join(','))
check('the capped deep workspace keeps its own sessions', idsOf(capped.roots[1].sessions) === 's-deep', idsOf(capped.roots[1].sessions))
check('a three-level grandchild still appears exactly once', capped.roots.length + capped.roots[0].projects.length === 3)

const windows = deriveTree(
  [W('ws-a', 'C:\\Work\\A', 'A'), W('ws-p', 'c:/work/a/Proj', 'Proj')],
  [S('s-win', 'C:\\WORK\\A\\PROJ\\src')],
  [],
)
check('a project is recognized across separator and case spelling', windows.roots.length === 1 && windows.roots[0].projects[0]?.workspaceId === 'ws-p', JSON.stringify(windows.roots.map((root) => root.workspaceId)))
check('a Windows cwd resolves to the deepest containing workspace', idsOf(windows.roots[0].projects[0].sessions) === 's-win', idsOf(windows.roots[0].projects[0].sessions))

const orphan = deriveTree([W('ws-a', 'C:/work/A'), W('ws-orphan', 'C:/work/A/nope/deep')], [], [])
check('a workspace whose direct parent is unregistered stays top-level', orphan.roots.map((root) => root.workspaceId).join(',') === 'ws-a,ws-orphan', orphan.roots.map((root) => root.workspaceId).join(','))

const deduped = deriveTree([W('ws-1', 'C:/work/A'), W('ws-2', 'C:\\work\\a\\')], [], [])
check('one directory registered twice renders one row', deduped.roots.length === 1, String(deduped.roots.length))

check('empty inputs derive an empty tree', JSON.stringify(deriveTree([], [], undefined)) === JSON.stringify({ roots: [], ungrouped: [], sessionCount: 0 }))

/* ------------------------------------------------------------------ *
 * 4. Panel render + real click flow.
 * ------------------------------------------------------------------ */
console.log('4. Panel: render, empty states, and the click flow')
const liveWorkspaces = [W('ws-a', 'C:/work/A', '工作区 A')]
const liveSessions = []
const t = (key) => dictionaries.projects.zh[key]
const panelProps = () => ({
  t,
  useWorkspaces: (selector) => selector({ items: liveWorkspaces, archivedSessionIds: [] }),
  useSessions: (selector) => selector({
    ids: liveSessions.map((session) => session.id),
    byId: Object.fromEntries(liveSessions.map((session) => [session.id, session])),
  }),
  ...face,
})

fake.reset()
remoteCalls.length = 0
let ui = fake.render(panel.component, panelProps())
let text = JSON.stringify(ui)
check('the panel renders the heading', text.includes('项目区'))
check('the panel renders the top-level workspace title', text.includes('工作区 A'))
check('the panel renders the top-level workspace path', text.includes('C:/work/A'))
check('the placeholder workspace list heading is gone', dictionaries.projects.zh.workspaces === undefined)
check('an empty workspace shows its empty state', text.includes('该工作区下还没有项目或对话。'))
check('every top-level row has a 新建项目 affordance', byAction(ui, 'new-project', 'ws-a') !== undefined)
check('every top-level row has a 新建对话 affordance', byAction(ui, 'new-session', 'ws-a') !== undefined)

// 新建项目 -> name only -> 确定.
byAction(ui, 'new-project', 'ws-a').props.onClick()
check('clicking 新建项目 marks the panel dirty (state changed)', fake.changed() === true)
ui = fake.render(panel.component, panelProps())
const nameInput = nodesOf(ui, (node) => node.props['data-field'] === 'project-name')[0]
check('the 新建项目 affordance opens a name input', nameInput !== undefined && nameInput.type === 'input')
nameInput.props.onChange({ target: { value: 'P1' } })
ui = fake.render(panel.component, panelProps())
check('the name input is controlled', nodesOf(ui, (node) => node.props['data-field'] === 'project-name')[0]?.props.value === 'P1')
byAction(ui, 'confirm-project').props.onClick()
await new Promise((resolve) => { setTimeout(resolve, 0) })
check('确定 calls createProject with the row path and the typed name only',
  JSON.stringify(remoteCalls) === JSON.stringify([['C:/work/A', 'P1']]), JSON.stringify(remoteCalls))
ui = fake.render(panel.component, panelProps())
check('a successful creation is reported', JSON.stringify(ui).includes('已创建项目：P1'))
check('the input closes after success', nodesOf(ui, (node) => node.props['data-field'] === 'project-name').length === 0)

// The host registers the new directory as a workspace; the live snapshot now
// contains it and a conversation inside it.
liveWorkspaces.push(W('ws-p1', 'C:/work/A/P1', 'P1'))
liveSessions.push(S('s-1', 'C:/work/A/P1', { displayTitle: '重构项目区', updatedAt: 7 }))
ui = fake.render(panel.component, panelProps())
text = JSON.stringify(ui)
check('the new project appears as a project row under its workspace', text.includes('P1') && text.includes('C:/work/A/P1'))
check('the session appears under the project', text.includes('重构项目区'))
check('the project row carries its own 新建对话 affordance', byAction(ui, 'new-session', 'ws-p1') !== undefined)
check('a project without sessions shows its empty state', JSON.stringify(fake.render(panel.component, {
  ...panelProps(),
  useWorkspaces: (selector) => selector({ items: [W('ws-a', 'C:/work/A', '工作区 A'), W('ws-empty', 'C:/work/A/P2', 'P2')], archivedSessionIds: [] }),
})).includes('该项目下还没有对话。'))

// 新建对话 on the project row -> startSession(project workspace id).
navigationCalls.started.length = 0
byAction(ui, 'new-session', 'ws-p1').props.onClick()
check('新建对话 starts a session on the project workspace id', JSON.stringify(navigationCalls.started) === JSON.stringify(['ws-p1']), JSON.stringify(navigationCalls.started))
byAction(ui, 'new-session', 'ws-a').props.onClick()
check('新建对话 on a top-level row starts a session on that workspace', JSON.stringify(navigationCalls.started) === JSON.stringify(['ws-p1', 'ws-a']), JSON.stringify(navigationCalls.started))

// Clicking a session row opens it.
navigationCalls.opened.length = 0
const sessionRow = nodesOf(ui, (node) => node.props['data-action'] === 'open-session' && node.props['data-session'] === 's-1')[0]
check('the session row is a button carrying its session id', sessionRow !== undefined)
sessionRow.props.onClick()
check('clicking a session row opens that conversation', JSON.stringify(navigationCalls.opened) === JSON.stringify(['s-1']), JSON.stringify(navigationCalls.opened))

// Failure and cancel paths.
remoteDouble.fail = 'boom'
byAction(ui, 'new-project', 'ws-a').props.onClick()
ui = fake.render(panel.component, panelProps())
check('a second creation opens the input again', nodesOf(ui, (node) => node.props['data-field'] === 'project-name').length === 1)
nodesOf(ui, (node) => node.props['data-field'] === 'project-name')[0].props.onChange({ target: { value: 'P3' } })
ui = fake.render(panel.component, panelProps())
byAction(ui, 'confirm-project').props.onClick()
await new Promise((resolve) => { setTimeout(resolve, 0) })
ui = fake.render(panel.component, panelProps())
check('a failed creation reports the failure message', JSON.stringify(ui).includes('操作失败：boom'), JSON.stringify(ui).slice(0, 400))
remoteDouble.fail = null
byAction(ui, 'new-project', 'ws-a').props.onClick()
ui = fake.render(panel.component, panelProps())
byAction(ui, 'cancel-project').props.onClick()
ui = fake.render(panel.component, panelProps())
check('取消 closes the input without creating anything', nodesOf(ui, (node) => node.props['data-field'] === 'project-name').length === 0)

fake.reset()
ui = fake.render(panel.component, { ...panelProps(), useWorkspaces: (selector) => selector({ items: [], archivedSessionIds: [] }) })
check('no registered workspace shows the empty state', JSON.stringify(ui).includes('还没有已注册的工作区'))

fake.reset()
ui = fake.render(panel.component, { ...panelProps(), useSessions: undefined })
check('a missing useSessions hook is reported instead of rendering every project empty',
  JSON.stringify(ui).includes('会话列表暂时不可用'), JSON.stringify(ui).slice(0, 300))

fake.reset()
ui = fake.render(panel.component, { ...panelProps(), useWorkspaces: undefined, useSessions: undefined })
check('a host with neither standard hook still renders the heading', JSON.stringify(ui).includes('项目区'))

const ungroupedTree = deriveTree([W('ws-a', 'C:/work/A', 'A', [])], [S('s-loose', 'C:/elsewhere', { displayTitle: '零散对话' })], [])
check('ungrouped sessions get their own bucket', idsOf(ungroupedTree.ungrouped) === 's-loose', idsOf(ungroupedTree.ungrouped))

async function faceFailure(overrides) {
  module_.apply({ ...fakeCtx, ...overrides })
  const latest = captured.main[captured.main.length - 1].options.inject()
  return latest
}
const noRemote = await faceFailure({ get: () => undefined })
check('an unmounted namespace fails explicitly', (await noRemote.createProject('C:/x', 'demo').catch((error) => error.message)) === 'Projects 远程命名空间尚未挂载。')
const noNavigation = await faceFailure({ get: (key) => (key === 'remote.projects' ? remoteDouble : undefined) })
check('a missing uiWorkspace fails explicitly on startSession',
  (() => { try { noNavigation.startSession('ws-a'); return 'did not throw' } catch (error) { return error.message } })() === '会话导航不可用：客户端服务 uiWorkspace 尚未就绪。')
check('a missing uiWorkspace fails explicitly on openSession',
  (() => { try { noNavigation.openSession('s-1'); return 'did not throw' } catch (error) { return error.message } })() === '会话导航不可用：客户端服务 uiWorkspace 尚未就绪。')

await rm(sandbox, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exitCode = failures === 0 ? 0 : 1
