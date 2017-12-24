const request = require('request')
const querystring = require('querystring')
const {promisify} = require('util')

const post = promisify(request.post)

module.exports = router => {
  router.get('/github/login', (req, res) => {
    const params = querystring.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      redirect_uri: `${req.protocol}://${req.get('host')}/github/callback`
    })
    res.redirect(`https://github.com/login/oauth/authorize?${params}`)
  })

  router.get('/github/callback', async (req, res) => {
    // complete OAuth dance
    const tokenRes = await post({
      url: `https://github.com/login/oauth/access_token`,
      form: {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: req.query.code,
        state: req.query.state
      },
      json: true
    })

    if (tokenRes.statusCode === 200) {
      req.session.token = tokenRes.body.access_token
      res.redirect(req.session.redirect || '/')
    } else {
      res.status(500)
      res.send('Invalid code')
    }
  })
}
