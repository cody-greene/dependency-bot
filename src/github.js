'use strict'
const createClient = require('./request')
const API_ORIGIN = 'https://api.github.com'

module.exports = createClient({
  /**
   * @param {string} opt.repo e.g. "cody-greene/eslint-bot"
   * @param {string} opt.base A commit ref/tag/sha
   * @param {string} opt.head A commit ref/tag/sha
   */
  compare: {
    required: ['repo', 'base', 'head'],
    url: opt => `${API_ORIGIN}/repos/${opt.repo}/compare/${opt.base}...${opt.head}`
  },
  /**
   * @param {string} opt.repo e.g. "cody-greene/eslint-bot"
   * @param {string?} opt.ref An commit ref/tag/sha
   * @param {string} opt.path e.g. "lib/index.js"
   * @return {Buffer}
   */
  blob: {
    required: ['repo', 'path'],
    url: opt => `${API_ORIGIN}/repos/${opt.repo}/contents/${opt.path}`,
    query: ['ref'],
    parseResponse: 'raw',
    headers: {
      accept: 'application/vnd.github.v3.raw+json'
    }
  },
  /**
   * Use either {repo, parent} or {repo, sha, path, position}
   * @param {string} opt.repo e.g. "cody-greene/eslint-bot"
   * @param {string} opt.body
   * @param {string} opt.sha The SHA of the commit to comment on
   * @param {string?} opt.path The file to comment on
   * @param {number?} opt.position The line index in the diff to comment on
   */
  comment: {
    required: ['repo', 'sha', 'body'],
    method: 'POST',
    url: opt => `${API_ORIGIN}/repos/${opt.repo}/commits/${opt.sha}/comments`,
    body: ['body', 'path', 'position']
  },
})
