const nock = require('nock')
const createProbot = require('probot')

const app = require('..')

const probot = createProbot({})
const robot = probot.load(app)

nock.enableNetConnect('127.0.0.1')

module.exports = { probot, robot }
