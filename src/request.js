'use strict'
const pick = require('lodash/pick')
const mapValues = require('lodash/mapValues')
const Promise = require('bluebird')
const honeybee = require('honeybee')

const createRequester = (user, token) => honeybee.withBindings(Promise, {
  parseError: parseGitHubError,
  headers: {
    'accept': 'application/vnd.github.v3+json',
    'authorization': 'Basic ' + new Buffer(user + ':' + token).toString('base64'),
  }
})

/**
 * Errors may come as:
 * - {message}
 * - {message, errors: [{code, resource, field}, ...]}
 * - {message, errors: [{code: 'custom', resource, field, message}, ...]}
 * @example
 *   { message: 'Validation Failed',
 *     errors: [{
 *       code: 'custom',
 *       resource: 'CommitComment',
 *       field: 'body',
 *       message: 'body is too long (maximum is 65536 characters)' }]
 */
function parseGitHubError(req, res) {
  let payload = honeybee.parseJSON(res.body.toString())
  let message = payload && payload.message
  if (payload) {
    let detail = payload.errors && payload.errors.map(err => {
      if (err.code === 'custom') {
        return `${err.resource}.${err.field}: ${err.message}`
      }
      return `${err.code}: ${err.resource}.${err.field}`
    }).join('\n')
    if (detail && message) {
      message += '\n' + detail
    }
    else if (detail) {
      message = detail
    }
  }
  return new honeybee.Error(res.statusCode, message)
}

/**
 * Generate an API request method
 * @param {function} url(props) => string
 * @param {string[]|object|function?} query Allowed query-string params
 * @param {string[]|object|function?} body Allowed POST/PATCH body params
 * @param {string[]?} required
 * @param {function?} transform(res, props) => object
 *
 * If `query` or `body` is a function then it should take the form: `(props) => object`
 * If `query` or `body` is an object then it will be used to transform property names.
 * e.g. `{prop1: 'x', prop2: 'y'}` will transform `({prop1: true, prop2: 11}) => {x: true, y: 11}`
 */
const createAPIMethod = (request) => (config) => {
  let pickQuery = getPicker(config.query)
  let pickBody = getPicker(config.body)
  /**
   * Configured API request
   * @param {object} props
   * @return {Promise} => parsedResponseBody
   */
  return function (props) {
    if (config.required) for (let index = 0; index < config.required.length; index++) {
      let propName = config.required[index]
      if (!props[propName]) {
        return Promise.reject(new request.Error(400, `.${propName} is null or undefined`))
      }
    }
    let pending = request({
      auth: this.auth,
      url: config.url(props, this.auth),
      query: pickQuery(props, config.query),
      body: pickBody(props, config.body),
      method: config.method,
      headers: config.headers,
      parseResponse: config.parseResponse,
      low: config.low,
      high: config.high,
      timeout: config.timeout,
      serialize: config.serialize,
    })
    if (config.transform) {
      return pending.then(res => config.transform(res, props))
    }
    return pending.then(res => res.body)
  }
}

function getPicker(val) {
  if (typeof val == 'function') return val
  if (Array.isArray(val)) return pick
  if (val) return transform
  return Function.prototype
}

function transform(src, keys) {
  let acc = {}
  for (let lk in keys) if (keys.hasOwnProperty(lk)) {
    acc[keys[lk]] = src[lk]
  }
  return acc
}

module.exports = (config) => (user, token) => {
  let request = createRequester(user, token)
  return mapValues(config, createAPIMethod(request))
}
