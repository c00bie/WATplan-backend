import Fastify from 'fastify'
import { PrismaClient } from '@prisma/client'
import { readFile } from 'fs/promises'
import axios from 'axios'
import dotenv from 'dotenv'
dotenv.config()

const prisma = new PrismaClient()
const fastify = Fastify({
  logger: true
})

await fastify.register(import('@fastify/cors'), {
  origin: ['https://watplan.coobie.dev', 'https://api.watplan.coobie.dev'],
  methods: ['GET', 'POST', 'OPTIONS']
})
await fastify.register(import('@fastify/rate-limit'), {
  max: 100
})
await fastify.register(import('@fastify/formbody'))

fastify.get('/register', async function (request, reply) {
  const register = await readFile('./public/register.html', 'utf8');
  reply.type('text/html').send(register)
});

fastify.post('/register', async function (request, reply) {
  try {
    const uid = (request.body as any).uid as string
    const response = (request.body as any)['g-recaptcha-response'] as string;
    if (!uid || !response)
      return reply.status(400).send({ success: false, error: 'Missing uid or captcha' })
    const formdata = new FormData()
    formdata.append('secret', process.env.RECAPTCHA_SECRET as string)
    formdata.append('response', response)
    const { data } = await axios.post('https://www.google.com/recaptcha/api/siteverify', formdata)
    if (data.success == true) {
      await prisma.settings.create({
        data: {
          id: uid,
          settings: '{}',
          notes: '[]'
        }
      })
      reply.send({ success: true })
    }
    else {
      reply.status(400).send({ success: false, error: 'Invalid captcha' })
      request.log.info(data)
    }
  } catch (e: any) {
    reply.status(400).send({ success: false, error: e.message })
  }
})

fastify.get('/:uid', async function (request, reply) {
  const { uid } = request.params as { uid: string }
  var settings = await prisma.settings.findUnique({ where: { id: uid } })
  if (!settings || !settings.settings)
    return reply.status(404).send({ success: false, error: 'User not found' })
  settings.settings = JSON.parse(settings.settings)
  settings.notes = JSON.parse(settings.notes)
  reply.send({
    success: true,
    data: settings
  })
})

fastify.post('/:uid', async function (request, reply) {
  try {
    const { uid } = request.params as { uid: string }
    const settings = await prisma.settings.findUnique({ where: { id: uid } })
    if (!settings || !settings.settings)
      return reply.status(404).send({ success: false, error: 'User not found' })
    const newSettings = JSON.parse(settings.settings)
    const body = request.body as any
    if (body.settings)
      newSettings.settings = body.settings
    if (body.notes)
      newSettings.notes = body.notes
    await prisma.settings.update({
      where: { id: uid },
      data: {
        settings: JSON.stringify(newSettings.settings),
        notes: JSON.stringify(newSettings.notes)
      }
    })
    reply.send({ success: true })
  } catch (e: any) {
    reply.status(400).send({ success: false, error: e.message })
  }
})

fastify.listen({ port: 3000, host: '0.0.0.0' }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})