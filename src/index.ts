import { HttpStatus } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import compression from 'compression'
import { json, raw, text, urlencoded } from 'express'
import helmet from 'helmet'
import requestIp from 'request-ip'
import { createLogger, env, killAppWithGrace, loadEsModule } from './common'

export async function bootstrap(
	app: NestExpressApplication,
	{ port = 8888, appName = 'APP' },
): Promise<void> {
	await loadEsModule()
	const logger = createLogger(appName)
	process.on('uncaughtException', e => {
		logger.error(e)
	})
	process.on('unhandledRejection', e => {
		logger.error(e)
	})
	app.useLogger(logger)

	app.setGlobalPrefix(env.API_PREFIX)
	app.enableCors({
		exposedHeaders: ['Content-Disposition'],
		origin: env.CORS_ALLOW_ORIGIN,
		methods: env.CORS_ALLOW_METHOD,
		allowedHeaders: env.CORS_ALLOW_HEADERS,
		preflightContinue: false,
		credentials: true,
		optionsSuccessStatus: HttpStatus.NO_CONTENT,
	})
	app.set('query parser', 'extended')
	app.set('trust proxy', true)
	app.use(json({ limit: env.BODY_JSON_MAX_SIZE }))
	app.use(urlencoded({ extended: true, limit: env.BODY_URLENCODED_MAX_SIZE }))
	app.use(raw({ limit: env.BODY_RAW_MAX_SIZE }))
	app.use(text({ limit: env.BODY_TEXT_MAX_SIZE }))
	app.use(
		helmet({
			contentSecurityPolicy: false,
			frameguard: false,
			crossOriginResourcePolicy: false,
		}),
	)
	app.use(compression())
	app.use(requestIp.mw())

	// region shutdown hooks
	app.enableShutdownHooks()
	killAppWithGrace(app)

	await app.listen(port)

	// region bootstrap log
	const appUrl = `http://localhost:${port}`
	logger.log(`Application is running on: ${appUrl}/`)
	logger.log(`Server is up. +${Math.trunc(performance.now())} ms`)
}

export * from './common'
export * from './core.module'
export * from './cache'
export * from './guard'
export * from './service'
export * from './controller/base.controller'
export * from './dto'
export * from './common/function/zod'
