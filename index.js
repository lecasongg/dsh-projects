/**
 * Projects bundle, Host half.
 *
 * Exposes exactly ONE callable Remote method to this bundle's browser half:
 *
 *   createProject(parentPath: string, name: string)
 *     -> { workspaceId: string, path: string, title: string }
 *
 * A hand-written plugin has no TypeScript decorator and no build-time Typert
 * generator, so this file uses the Gateway's *source-mode* (SRC) export path
 * instead of `ctx.typert.register()`. Two visible things make a provided
 * Cordis Service callable over `/api`:
 *
 *   1. `typertRemote` on the Service — `{ service, serviceKey, namespace }`,
 *      read by the Gateway through `readBinding()`
 *      (packages/api/gateway/src/index.ts:1408) and mandated for every Remote
 *      dispatch by `validateBinding()` (same file, line 1387).
 *   2. the `@deepseek-ai/dsh-typert-protocol/remote-methods` prototype
 *      descriptor, read by `remoteMethods()`
 *      (packages/typert/protocol/src/index.ts:265). It is a module-private
 *      string constant there (line 140), so it is reproduced verbatim here.
 *
 * With both in place the Gateway derives the invocation descriptor itself
 * (`resolveSrcDescriptor`, packages/api/gateway/src/index.ts:769), including
 * `src-json` codecs, and `methodParameterNames()` (same file, line 1434) reads
 * the parameter list from the method's own source text — hence plain
 * identifier parameters with no defaults, destructuring or rest.
 */

import { mkdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

/** Cordis service key; also the Remote namespace and the sidebar list id. */
const SERVICE_KEY = 'projects'

/**
 * Prototype-owned marker key read by the Gateway's source-mode discovery.
 * Kept in sync with `REMOTE_METHOD_DESCRIPTOR` in
 * `@deepseek-ai/dsh-typert-protocol` (packages/typert/protocol/src/index.ts:140),
 * which is not part of that package's public exports.
 */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** Required service: the durable registry a project directory is registered with. */
export const inject = ['workspaceRegistry']

/**
 * Validate one project name.
 * @param name - caller-supplied single path segment.
 * @returns the trimmed name when it is exactly one ordinary segment.
 */
function projectSegment(name) {
  if (typeof name !== 'string') throw new TypeError('createProject: name must be a string')
  const trimmed = name.trim()
  if (trimmed.length === 0) throw new Error('createProject: name must not be blank')
  if (trimmed === '.' || trimmed === '..') {
    throw new Error(`createProject: name must not be ${JSON.stringify(trimmed)}`)
  }
  if (/[/\\:]/.test(trimmed)) throw new Error('createProject: name must not contain "/", "\\" or ":"')
  return trimmed
}

/**
 * Resolve `<parentPath>/<name>` and prove it stays inside `parentPath`.
 * @param parentPath - already-registered workspace directory.
 * @param name - validated single path segment.
 * @returns the absolute target directory.
 */
function projectTarget(parentPath, name) {
  if (typeof parentPath !== 'string' || parentPath.trim().length === 0) {
    throw new Error('createProject: parentPath must be a non-blank string')
  }
  const parent = resolve(parentPath)
  const target = resolve(parent, name)
  const inside = relative(parent, target)
  if (inside.length === 0 || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error(`createProject: ${JSON.stringify(name)} escapes ${JSON.stringify(parent)}`)
  }
  return target
}

/** Host service backing the `projects` Remote namespace. */
class ProjectsService {
  /**
   * @param ctx - owning plugin Context, used to reach `workspaceRegistry`.
   */
  constructor(ctx) {
    this.ctx = ctx
  }

  /** Visible Service-to-Gateway binding consumed by source-mode discovery. */
  get typertRemote() {
    return { service: this, serviceKey: SERVICE_KEY, namespace: SERVICE_KEY }
  }

  /**
   * Create the project directory and register it as a workspace.
   * @param parentPath - already-registered workspace directory.
   * @param name - one-level child directory name.
   * @returns the registered workspace projection.
   */
  async createProject(parentPath, name) {
    const segment = projectSegment(name)
    const target = projectTarget(parentPath, segment)
    await mkdir(target, { recursive: true })
    const workspace = await this.ctx.workspaceRegistry.create(target)
    return {
      workspaceId: String(workspace.id),
      path: workspace.path,
      title: workspace.title,
    }
  }
}

Object.defineProperty(ProjectsService.prototype, REMOTE_METHOD_DESCRIPTOR, {
  configurable: true,
  value: Object.freeze({
    version: 1,
    methods: Object.freeze([
      Object.freeze({ method: 'createProject', invocation: Object.freeze({ kind: 'direct' }) }),
    ]),
  }),
})

/**
 * Provide the projects Service; the Gateway exports it as `projects/createProject`.
 * @param ctx - the plugin's Host Context.
 */
export function apply(ctx) {
  ctx.provide(SERVICE_KEY, new ProjectsService(ctx))
}
