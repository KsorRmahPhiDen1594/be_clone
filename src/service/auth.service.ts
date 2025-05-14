import { Inject, Injectable, Optional } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { User } from '@prisma/client'
import axios from 'axios'
import dayjs from 'dayjs'
import { seconds } from 'itty-time'
import jwt, { SignOptions } from 'jsonwebtoken'
import { AccessTokenCache } from '../cache'
import {
	ACTIVITY_TYPE,
	ADMIN_USER_ID,
	ERR_CODE,
	ILoginRes,
	ITokenDecoded,
	ITokenPayload,
	LOGIN_RES_TYPE,
	MODULE_OPTIONS_PROVIDER,
	ModuleOptions,
	SETTING,
	UnAuthErr,
	createPassword,
	encrypt,
	env,
	isExpired,
	token12,
} from '../common'
import { ActivityService } from './activity.service'
import { PermissionService } from './permission.service'
import { PrismaService } from './prisma.service'
import { SessionService } from './session.service'
import { SettingService } from './setting.service'
import { TelegramService } from './telegram.service'

@Injectable()
export class AuthService {
	constructor(
		@Optional()
		@Inject(MODULE_OPTIONS_PROVIDER)
		private readonly options: ModuleOptions,
		private readonly db: PrismaService,
		private readonly activityService: ActivityService,
		private readonly sessionService: SessionService,
		private readonly accessTokenCache: AccessTokenCache,
		private readonly settingService: SettingService,
		private readonly permissionService: PermissionService,
		private readonly telegramService: TelegramService,
	) {}

	@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
	protected async resetAdmin(): Promise<void> {
		if (
			(await this.settingService.get<boolean>(
				SETTING.ENB_ROTATE_ADMIN_PASSWORD,
				false,
			)) &&
			env.INSTANCE_ID === 0
		) {
			const newPassword = token12()
			await this.db.user.update({
				where: { id: ADMIN_USER_ID },
				data: { ...(await createPassword(newPassword)) },
			})
			await this.telegramService.sendToOperator(
				`New password: ${newPassword}`,
				{
					emoji: 'sos',
					disable_notification: true,
					pinMessage: true,
					unPinAllMessage: true,
				},
			)
			await this.sessionService.revoke(ADMIN_USER_ID)
		}
	}

	// region token tool
	async createAccessToken(payload: ITokenPayload): Promise<{
		accessToken: string
		expirationTime: Date
	}> {
		const cachedToken = await this.accessTokenCache.getCache(payload.sessionId)
		if (cachedToken) {
			const { exp } = jwt.decode(cachedToken) as { exp: number }
			if (
				!isExpired(
					exp * 1000,
					dayjs.duration({ seconds: seconds(env.EXPIRED_TOLERANCE) }),
				)
			) {
				return {
					accessToken: cachedToken,
					expirationTime: new Date(exp),
				}
			}
		}

		const accessToken = jwt.sign(payload, env.JWT_KEY, {
			algorithm: 'HS512',
			expiresIn: seconds(env.JWT_ACCESS_TOKEN_EXPIRED),
		} as SignOptions)
		await this.accessTokenCache.setCache(payload.sessionId, accessToken)
		return {
			accessToken,
			expirationTime: dayjs()
				.add(seconds(env.JWT_ACCESS_TOKEN_EXPIRED), 's')
				.toDate(),
		}
	}

	async verifyAccessToken(token: string): Promise<ITokenDecoded> {
		let decodedToken: ITokenDecoded
		try {
			decodedToken = jwt.verify(token, env.JWT_KEY, {
				ignoreExpiration: true,
			}) as ITokenDecoded
		} catch {
			throw new UnAuthErr(ERR_CODE.INVALID_TOKEN)
		}

		if (
			isExpired(
				(decodedToken.exp ?? 0) * 1000,
				dayjs.duration({ seconds: seconds(env.EXPIRED_TOLERANCE) }),
			)
		) {
			throw new UnAuthErr(ERR_CODE.EXPIRED_TOKEN)
		}

		const cachedToken = await this.accessTokenCache.getCache(
			decodedToken.sessionId,
		)
		if (!cachedToken) {
			throw new UnAuthErr(ERR_CODE.EXPIRED_TOKEN)
		}

		return decodedToken
	}

	private createRefreshToken(payload: ITokenPayload): {
		refreshToken: string
		expirationTime: Date
	} {
		const expiredAt = dayjs()
			.add(seconds(env.JWT_REFRESH_TOKEN_EXPIRED), 's')
			.toDate()
		return {
			refreshToken: encrypt({ ...payload, expired: expiredAt.getTime() }),
			expirationTime: expiredAt,
		}
	}

	async completeLogin(
		user: User & { roles: { roleId: string }[] },
		session: { clientIp: string; userAgent: string },
	): Promise<ILoginRes> {
		if (await this.settingService.enbOnlyOneSession) {
			await this.sessionService.revoke(user.id)
		}

		const sessionId = token12()
		const payload: ITokenPayload = {
			userId: user.id,
			loginDate: new Date(),
			sessionId,
			ip: session.clientIp,
		}

		const { accessToken, expirationTime } =
			await this.createAccessToken(payload)
		const { refreshToken, expirationTime: refreshTokenExpirationTime } =
			this.createRefreshToken(payload)

		await this.db.session.create({
			data: {
				id: sessionId,
				device: session.userAgent,
				ip: session.clientIp,
				createdById: user.id,
				expired: refreshTokenExpirationTime,
				token: refreshToken,
			},
			select: { id: true },
		})
		await Promise.all([
			this.activityService.create(
				ACTIVITY_TYPE.LOGIN,
				{},
				{
					...session,
					currentUser: { id: user.id, sessionId },
				},
			),
		])

		let userRes = {
			id: user.id,
			mfaTelegramEnabled: user.mfaTelegramEnabled,
			mfaTotpEnabled: user.mfaTotpEnabled,
			telegramUsername: user.telegramUsername,
			enabled: user.enabled,
			created: user.created,
			username: user.username,
			modified: user.modified,
			permissions: await this.permissionService.getPermissions(user),
		}

		if (this.options.getResultUser) {
			userRes = await this.options.getResultUser(userRes)
		}

		if (await this.settingService.get<boolean>(SETTING.ENB_NOTI_LOGIN, false)) {
			let serverInfo = ''
			try {
				const ipApiResponse = await axios.get('http://ip-api.com/json')
				serverInfo = Object.entries(ipApiResponse.data)
					.map(([key, value]) => `${key}: ${value}`)
					.join('\n')
			} catch {}
			const messageParts = [
				'New login:',
				`User: ${user.username}`,
				`Server:\n${serverInfo}`,
				`Headers:\n${Object.entries({
					clientIp: session.clientIp,
					userAgent: session.userAgent,
				})
					.map(([key, value]) => `${key}: ${value}`)
					.join('\n')}`,
			]
			await this.telegramService.sendToOperator(messageParts.join('\n\n'), {
				emoji: 'sos',
			})
		}

		return {
			type: LOGIN_RES_TYPE.COMPLETED,
			accessToken,
			refreshToken,
			exp: expirationTime.getTime(),
			expired: dayjs(expirationTime).format(),
			user: userRes,
		}
	}
}
