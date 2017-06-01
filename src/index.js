'use strict'
const crypto = require('crypto')
const Promise = require('bluebird')
const flatten = require('lodash/flatten')
const createGithubClient = require('./github')
const EVENT_NAME = 'pull_request' // https://developer.github.com/webhooks/#events
const VALID_ACTIONS = ['opened', 'synchronize'] // List of event subtypes to accept
const DEPENDENCY_KEYS = [
  'bundledDependencies',
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
]
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)

const run = Promise.coroutine(function* (ctx) {
  assertRequestAuth(ctx)
  let github = createGithubClient(ctx.secrets.GH_USER, ctx.secrets.GH_TOKEN)
  let base = ctx.body.pull_request.base
  let head = ctx.body.pull_request.head
  let diff = yield github.compare({
    repo: base.repo.full_name,
    base: base.sha,
    head: head.sha
  })

  // We could be dealing with some kind of monorepo that has several package.json files
  let files = diff.files.filter(el => el.status === 'modified' && /^package\.json$/.test(el.filename))

  if (!files.length) {
    return {message: 'no dependencies changed'}
  }
  let newBlobs = yield Promise.all(files.map(file => github.blob({
    repo: head.repo.full_name,
    ref: head.sha,
    path: file.filename
  })))
  let oldBlobs = yield Promise.all(files.map(file => github.blob({
    repo: head.repo.full_name,
    ref: base.sha,
    path: file.filename
  })))
  files = files.map((file, index) => ({
    name: file.filename,
    original: JSON.parse(oldBlobs[index].toString()),
    current: JSON.parse(newBlobs[index].toString())
  })).map(file => {
    let dependencies = DEPENDENCY_KEYS.map(key => diffdeps(file.original[key], file.current[key]))
    dependencies = flatten(dependencies).filter(Boolean)
    return {name: file.name, dependencies}
  })

  for (let index = 0; index < files.length; index++) {
    if (!files[index].dependencies.length) {
      return {message: 'no dependencies changed'}
    }
  }

  let commentBody = formatResponse(files, base, head)

  // dry-run
  if (ctx.query.dry) {
    return {message: commentBody}
  }

  let comment = yield github.comment({
    repo: base.repo.full_name,
    sha: head.sha,
    body: commentBody
  })
  return comment
})

function diffdeps(original, current) {
  let dependencies = []
  let key
  if (!original || !current) {
    return null
  }
  for (key in current) if (hasOwn(current, key) && !hasOwn(original, key)) {
    dependencies.push({
      name: key,
      current: current[key]
    })
  }
  for (key in original) if (hasOwn(original, key) && !hasOwn(current, key)) {
    dependencies.push({
      name: key,
      previous: original[key]
    })
  }
  for (key in original) if (hasOwn(original, key) && hasOwn(current, key) && original[key] !== current[key]) {
    dependencies.push({
      name: key,
      current: current[key],
      previous: original[key]
    })
  }
  return dependencies
}

function formatResponse(files, base, head) {
  let text = `${base.sha}...${head.sha} includes dependency changes!\n`
  files.forEach(file => {
    let added = file.dependencies.filter(pkg => !pkg.previous && pkg.current)
    let changed = file.dependencies.filter(pkg => pkg.previous && pkg.current)
    let removed = file.dependencies.filter(pkg => pkg.previous && !pkg.current)
    let header = `\n${JSON.stringify(file.name)} *(${changed.length} modified, ${added.length} added, ${removed.length} removed)*:\n`
    let block = []
    changed.forEach(pkg => block.push(`+ ${pkg.name}@${pkg.current} (from ${pkg.previous})`))
    added.forEach(pkg => block.push(`+ ${pkg.name}@${pkg.current}`))
    removed.map(pkg => block.push(`- ${pkg.name}@${pkg.previous}`))
    text = text + header + '```\n' + block.join('\n') + '\n```'
  })
  return text
}

// Perform the necessary verification for a GitHub webhook
function assertRequestAuth(ctx) {
  let incomingEventName = ctx.headers['x-github-event']
  let expectedSignature = ctx.headers['x-hub-signature']
  if (incomingEventName !== EVENT_NAME) {
    throw new Error(`github event not supported: "${incomingEventName}"`)
  }
  let actualSignature = sign(JSON.stringify(ctx.body), ctx.secrets.SHARED_SECRET)
  if (!equal(actualSignature, expectedSignature)) {
    throw new Error('invalid signature')
  }
  if (VALID_ACTIONS.indexOf(ctx.body.action) === -1) {
    throw new Error(`action not supported: "${incomingEventName}.${ctx.body.action}"`)
  }
}

/**
 * Constant time equality between Buffers.
 * It shortcuts on length, but that doesn't leak the contents
 * node 7 has this available in "crypto"
 */
function equal(actual, expected) {
  if (!actual || !expected) return false
  let acc = 0
  let index = actual.length
  if (index !== expected.length) return false
  while (index--) acc |= actual[index] ^ expected[index]
  return !acc
}

function sign(payload, secret) {
  return 'sha1=' + crypto.createHmac('sha1', secret).update(payload).digest('hex')
}

module.exports = (ctx, done) => run(ctx).asCallback(done)
