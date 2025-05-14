import { isRabbitContext } from '@golevelup/nestjs-rabbitmq'
import {
	CanActivate,
	ExecutionContext,
	Inject,
	Injectable,
	Optional,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { uniq } from 'lodash'
import { CurrentUserCache } from '../cache'
import {
	ERR_CODE,
	IReqApp,
	METADATA_KEY,
	MODULE_OPTIONS_PROVIDER,
	ModuleOptions,
	NotFoundErr,
	ReqUser,
	UPermission,
	UnAuthErr,
	env,
	extractTokenFromHeader,
	getRealIp,
	userRestSelect,
} from '../common'
import {
	AuthService,
	MiscService,
	PrismaService,
	SettingService,
} from '../service'

@Injectable()
export class AuthGuard implements CanActivate {
	constructor(
		@Optional()
		@Inject(MODULE_OPTIONS_PROVIDER)
		private readonly options: ModuleOptions,
		private readonly reflector: Reflector,
		private readonly db: PrismaService,
		private readonly currentUserCache: CurrentUserCache,
		private readonly authService: AuthService,
		private readonly miscService: MiscService,
		private readonly settingService: SettingService,
	) {}

	private async checkIpWhitelist(context: ExecutionContext): Promise<void> {
		const enbIpWhitelist = this.settingService.enbIpWhitelist
		if (!enbIpWhitelist) {
			return
		}
		const request = context.switchToHttp().getRequest<IReqApp>()
		const clientIp = getRealIp(request)
		await this.miscService.preflight(clientIp)
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		if (isRabbitContext(context)) {
			return true
		}
		const isPublic = this.reflector.getAllAndOverride<boolean>(
			METADATA_KEY.IS_PUBLIC_KEY,
			[context.getHandler(), context.getClass()],
		)

		const url = context.switchToHttp().getRequest<IReqApp>().url
		if (isPublic || url.includes(env.METRIC_EP)) {
			return true
		}

		await this.checkIpWhitelist(context)
		const request = context.switchToHttp().getRequest<IReqApp>()
		const token = extractTokenFromHeader(request.headers.authorization)
		if (!token) {
			throw new UnAuthErr(ERR_CODE.INVALID_TOKEN)
		}
		const decodedToken = await this.authService.verifyAccessToken(token)

		let userPayload: ReqUser
		const cachedUser = await this.currentUserCache.getCache(
			decodedToken.sessionId,
		)

		if (cachedUser) {
			userPayload = cachedUser
		} else {
			const user = await this.db.user.findUnique({
				where: { id: decodedToken.userId },
				select: {
					...userRestSelect,
					password: true,
				},
			})

			if (!user || !user.enabled) {
				throw new UnAuthErr(ERR_CODE.EXPIRED_TOKEN)
			}

			const permissions = await this.db.rolePermission.findMany({
				where: { roleId: { in: user.roles.map(x => x.roleId) } },
				select: { permission: { select: { title: true } } },
			})

			userPayload = {
				id: user.id,
				username: user.username,
				sessionId: decodedToken.sessionId,
				mfaTelegramEnabled: user.mfaTelegramEnabled,
				mfaTotpEnabled: user.mfaTotpEnabled,
				totpSecret: user.totpSecret,
				telegramUsername: user.telegramUsername,
				password: user.password,
				enabled: user.enabled,
				created: user.created,
				modified: user.modified,
				permissions: uniq(
					permissions.map(x => x.permission.title),
				) as UPermission[],
			}
			if (this.options.getReqUser) {
				userPayload = await this.options.getReqUser(userPayload)
			}

			await this.currentUserCache.setCache(decodedToken.sessionId, userPayload)
		}

		if (!userPayload) {
			throw new NotFoundErr(ERR_CODE.USER_NOT_FOUND)
		}

		request.user = userPayload
		return true
	}
}
