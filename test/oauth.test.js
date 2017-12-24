const request = require('supertest')
const nock = require('nock')
const {probot} = require('.')

describe('OAuth', () => {
  describe('GET /github/login', () => {
    test('redirects to github', async () => {
      await request(probot.server).get('/github/login')
        .expect(302)
        .expect('Location', /^https:\/\/github.com\/login\/oauth\/authorize/)
    })
  })

  describe('GET /github/callback', () => {
    test('redirects to github', async () => {
      nock('https://github.com').post('/login/oauth/access_token')
        .reply(200, { access_token: 'testing123', token_type: 'bearer' })

      await request(probot.server).get('/github/callback')
        .expect(302)
        .expect('Location', '/')
    })
  })
})
