const request = require('supertest')
const { probot } = require('.')

describe('Invitations', () => {
  describe('GET /', () => {
    test('redirects to login', async () => {
      await request(probot.server).get('/')
        .expect(302)
        .expect('Location', '/github/login')
    })
  })
})
