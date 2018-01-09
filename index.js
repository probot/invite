
const path = require('path')
const express = require('express')
const hbs = require('hbs')
const jwt = require('jsonwebtoken')
const cookieSession = require('cookie-session')
const bodyParser = require('body-parser')

const oauth = require('./lib/oauth')

async function authenticate (req, res, next) {
  if (!req.session.token) {
    req.session = {}
    req.session.redirect = req.originalUrl
    res.redirect('/github/login')
  } else {
    next()
  }
}

async function getInstallations (req, res, next) {
  let { installations } = (await req.github.users.getInstallations({})).data

  // Filter out User installations
  installations = installations.filter(installation => {
    return installation.account.type === 'Organization'
  })

  // Only show installations that the current user is an admin on
  installations = await Promise.all(installations.map(async installation => {
    const github = await req.robot.auth(installation.id)
    try {
      const membership = (await github.orgs.getOrgMembership({
        org: installation.account.login,
        username: req.session.login
      })).data

      return membership.role === 'admin' ? installation : false
    } catch (err) {
      req.log(err)
      return false
    }
  }))

  // Remove null
  installations = installations.filter(installation => installation)

  res.locals.installations = installations
  next()
}

async function findInstallation (req, res, next) {
  const installation = res.locals.installations.find(i => {
    return i.account.login === req.params.owner
  })

  if (installation) {
    res.locals.installation = installation
    next()
  } else {
    res.status(404).send('Not Found')
  }
}

module.exports = (robot) => {
  const app = express()

  app.set('view engine', 'hbs')
  app.set('views', path.join(__dirname, 'views'))
  hbs.registerPartials(path.join(__dirname, 'views', 'partials'))

  if (process.env.FORCE_HTTPS) {
    app.use(require('helmet')())
    app.use(require('express-sslify').HTTPS({ trustProtoHeader: true }))
  }

  app.use(bodyParser.urlencoded({extended: true}))

  app.use(cookieSession({
    name: 'session',
    keys: [process.env.WEBHOOK_SECRET],
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }))

  app.use(async (req, res, next) => {
    req.robot = robot

    if (req.session.token) {
      req.github = await robot.auth()
      req.github.authenticate({ type: 'token', token: req.session.token })
      if (!req.session.login) {
        req.session.login = (await req.github.users.get({})).data.login
      }
    }

    next()
  })

  app.use('/static/', express.static(path.join(__dirname, 'static')))

  oauth(app)

  app.get('/', authenticate, getInstallations, async (req, res) => {
    const { installations } = res.locals
    const info = (await (await robot.auth()).apps.get({})).data

    // Setup URL - GitHub will redirect here after installation
    if (req.query.installation_id) {
      const installation = installations.find(installation => {
        return installation.id === Number(req.query.installation_id)
      })
      res.redirect(`/${installation.account.login}`)
    } else {
      res.render('index', {installations, info})
    }
  })

  app.get('/:owner', authenticate, getInstallations, findInstallation, (req, res) => {
    const { installation } = res.locals
    res.render('new', {installation})
  })

  app.post('/:owner', authenticate, getInstallations, findInstallation, (req, res) => {
    const { installation } = res.locals
    const options = {
      sub: installation.account.login,
      iss: installation.id,
      role: req.body.role
    }

    if (req.body.exp) {
      options.exp = Number(req.body.exp)
    }

    const token = jwt.sign(options, process.env.WEBHOOK_SECRET)

    const link = `${req.protocol}://${req.get('host')}/join/${token}`

    req.log({link, options}, 'Generating new token')
    res.send(link)
  })

  app.get('/join/:token', authenticate, async (req, res) => {
    const options = jwt.verify(req.params.token, process.env.WEBHOOK_SECRET)

    req.log(options, 'Accepting invitation')

    const user = (await req.github.users.get({})).data

    req.log({user, options}, 'Adding user to organization')

    const github = await robot.auth(options.iss)

    await github.orgs.addOrgMembership({
      org: options.sub,
      username: user.login,
      role: options.role
    })

    res.redirect(`https://github.com/orgs/${options.sub}/invitation`)
  })

  robot.router.use(app)
}
