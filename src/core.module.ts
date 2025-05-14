import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq'
import KeyvRedis from '@keyv/redis'
import { HttpModule } from '@nestjs/axios'
import { CacheModule } from '@nestjs/cache-manager'
import {
	DynamicModule,
	FactoryProvider,
	Global,
	MiddlewareConsumer,
	Module,
	NestModule,
	Provider,
	RequestMethod,
} from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { MulterModule } from '@nestjs/platform-express'
import { ScheduleModule } from '@nestjs/schedule'
import { PrometheusModule } from '@willsoto/nestjs-prometheus'
import {
	AccessTokenCache,
	CaptchaCache,
	ChangePasswordCache,
	CurrentUserCache,
	IpWhitelistCache,
	LoginCache,
	MFACache,
	MFASetupCache,
	ResetMFACache,
	SettingCache,
} from './cache'
import {
	ErrorFilter,
	MODULE_OPTIONS_PROVIDER,
	ModuleOptions,
	ReqUser,
	SETTING,
	UserResult,
	env,
} from './common'
import { TransformInterceptor } from './common/interceptors'
import { MaintenanceMiddleware } from './common/middlewares'
import { ZodValidationPipe } from './common/pipes'
import {
	ActivityController,
	ApiKeyController,
	AuthController,
	CaptchaController,
	FileController,
	I18nController,
	IpWhitelistController,
	MfaController,
	MiscController,
	PermissionController,
	ProxyController,
	RoleController,
	SessionController,
	SettingController,
	TelegramBotController,
	TelegramChatController,
	TelegramTemplateController,
	UserController,
} from './controller'
import { AuthGuard, PermissionGuard } from './guard'
import {
	ActivityService,
	AuthService,
	CaptchaService,
	LockService,
	MfaService,
	MiscService,
	PermissionService,
	PrismaService,
	ProxyService,
	RedisService,
	SessionService,
	SettingService,
	SseService,
	TelegramService,
} from './service'

const providers = [
	LockService,
	PrismaService,
	AuthService,
	MiscService,
	SettingService,
	SessionService,
	ActivityService,
	TelegramService,
	PermissionService,
	MfaService,
	RedisService,
	CaptchaService,
	ProxyService,
	SseService,

	AccessTokenCache,
	CurrentUserCache,
	IpWhitelistCache,
	LoginCache,
	MFACache,
	MFASetupCache,
	ChangePasswordCache,
	ResetMFACache,
	SettingCache,
	CaptchaCache,
]

const controllers = [
	AuthController,
	MiscController,
	SettingController,
	I18nController,
	UserController,
	SessionController,
	ActivityController,
	MfaController,
	RoleController,
	PermissionController,
	IpWhitelistController,
	FileController,
	TelegramBotController,
	TelegramChatController,
	TelegramTemplateController,
	ApiKeyController,
	CaptchaController,
	ProxyController,
]

@Global()
@Module({
	imports: [
		HttpModule.register({
			timeout: 9000,
			maxRedirects: 5,
			withCredentials: false,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'user-agent':
					'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
			},
		}),
		PrometheusModule.register(),
		ScheduleModule.forRoot(),
		CacheModule.register({
			stores: env.REDIS_URL
				? [new KeyvRedis({ url: env.REDIS_URL })]
				: undefined,
			isGlobal: true,
		}),
		MulterModule.register(),
		...(env.RABBITMQ_URL
			? [
					RabbitMQModule.forRoot({
						name: 'core',
						uri: env.RABBITMQ_URL ?? '',
						connectionInitOptions: { wait: false },
						channels: { telegram: { prefetchCount: 3 } },
						exchanges: [
							{
								name: 'telegram',
								type: 'direct',
								createExchangeIfNotExists: true,
								options: {
									autoDelete: false,
									durable: true,
								},
							},
						],
					}),
				]
			: []),
	],
	controllers,
	providers: [
		...providers,
		{
			provide: APP_FILTER,
			useClass: ErrorFilter,
		},
		{
			provide: APP_INTERCEPTOR,
			useClass: TransformInterceptor,
		},
		{
			provide: APP_PIPE,
			useClass: ZodValidationPipe,
		},
		{
			provide: APP_GUARD,
			useClass: AuthGuard,
		},
		{
			provide: APP_GUARD,
			useClass: PermissionGuard,
		},
	],
	exports: [HttpModule, ScheduleModule, MulterModule, ...providers],
})
export class CoreModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		consumer
			.apply(MaintenanceMiddleware)
			.exclude({ path: 'misc/health-check', method: RequestMethod.ALL })
			.forRoutes('{*splat}')
	}

	static forRootAsync<
		T extends Record<string, string> = typeof SETTING,
		TRU extends ReqUser = ReqUser,
		TUR extends UserResult = UserResult,
	>(
		factory?: Pick<
			FactoryProvider<ModuleOptions<T, TRU, TUR>>,
			'inject' | 'useFactory'
		>,
		providers?: Provider[],
	): DynamicModule {
		const moduleOptionsProvider = factory
			? Object.assign({ provide: MODULE_OPTIONS_PROVIDER }, factory)
			: { provide: MODULE_OPTIONS_PROVIDER, useValue: {} }
		const customProviders = providers || []

		return {
			global: true,
			module: CoreModule,
			providers: [moduleOptionsProvider, ...customProviders],
			exports: customProviders,
		}
	}
}
