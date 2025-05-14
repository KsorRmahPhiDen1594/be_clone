import { Body, Controller, Get, Inject, Optional, Post } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import dayjs from 'dayjs'
import { seconds } from 'itty-time'
import { compact } from 'lodash'
import { ChangePasswordCache, LoginCache } from '../cache'
import {
	ACTIVITY_TYPE,
	BadReqRErr,
	ERR_CODE,
	ILoginMFARes,
	ILoginMFASetupRes,
	ILoginRes,
	IReqApp,
	ITokenPayload,
	LOGIN_RES_TYPE,
	MFA_METHOD,
	MODULE_OPTIONS_PROVIDER,
	ModuleOptions,
	NotFoundErr,
	UnAuthErr,
	UserResult,
	comparePassword,
	createPassword,
	env,
	isExpired,
	token12,
	token16,
	userRestSelect,
} from '../common'
import {
	ChangePasswordConfirmReqDto,
	ChangePasswordReqDto,
	LoginConfirmReqDto,
	LoginReqDto,
	RefreshTokenReqDto,
} from '../dto'
import { Public } from '../guard'
import {
	ActivityService,
	AuthService,
	MfaService,
	PermissionService,
	PrismaService,
	SessionService,
	SettingService,
} from '../service'
import { ControllerBase } from './base.controller'

@Controller()
export class AuthController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		@Optional()
		@Inject(MODULE_OPTIONS_PROVIDER)
		private readonly options: ModuleOptions,
		private readonly db: PrismaService,
		private readonly activityService: ActivityService,
		private readonly settingService: SettingService,
		private readonly loginCache: LoginCache,
		private readonly sessionService: SessionService,
		private readonly changePasswordCache: ChangePasswordCache,
		private readonly mfaService: MfaService,
		private readonly authService: AuthService,
		private readonly permissionService: PermissionService,
	) {
		super(request)
	}

	@Public()
	@Post('login')
	async login(
		@Body() { username, password }: LoginReqDto,
	): Promise<ILoginRes | ILoginMFASetupRes | ILoginMFARes> {
		const user = await this.db.user.findUnique({
			where: { username },
			include: { roles: true },
		})
		if (!user) {
			throw new NotFoundErr(ERR_CODE.USER_NOT_FOUND)
		}

		const { enbAttempt, enbExpired } = await this.settingService.password()
		if (enbAttempt && user.passwordAttempt >= env.PASSWORD_MAX_ATTEMPT) {
			throw new BadReqRErr(ERR_CODE.PASSWORD_MAX_ATTEMPT)
		}

		if (!(await comparePassword(password, user.password))) {
			await this.db.user.update({
				where: { id: user.id },
				data: { passwordAttempt: { increment: 1 } },
				select: { id: true },
			})
			throw new BadReqRErr(ERR_CODE.PASSWORD_NOT_MATCH)
		}

		if (!user.enabled) {
			throw new BadReqRErr(ERR_CODE.USER_NOT_ACTIVE)
		}

		if (enbExpired && new Date() > new Date(user.passwordExpired)) {
			throw new BadReqRErr(ERR_CODE.PASSWORD_EXPIRED)
		}

		if (user.mfaTelegramEnabled || user.mfaTotpEnabled) {
			const loginToken = token16()
			await this.loginCache.setCache(loginToken, { userId: user.id })
			const mfaToken = await this.mfaService.createSession({
				method: MFA_METHOD.TOTP,
				user,
				referenceToken: loginToken,
			})
			return {
				type: LOGIN_RES_TYPE.MFA_CONFIRM,
				token: loginToken,
				mfaToken,
				availableMethods: compact([
					user.mfaTelegramEnabled ? MFA_METHOD.TELEGRAM : undefined,
					user.mfaTotpEnabled ? MFA_METHOD.TOTP : undefined,
				]),
			}
		}

		if (await this.settingService.mfaRequired) {
			const { totpSecret, mfaToken } = await this.mfaService.setupMfa(user.id)
			return {
				type: LOGIN_RES_TYPE.MFA_SETUP,
				totpSecret,
				mfaToken,
			}
		}

		return this.authService.completeLogin(user, this.getActivitySession())
	}

	@Public()
	@Post('login/confirm')
	async loginConfirm(
		@Body() { token, mfaToken, otp }: LoginConfirmReqDto,
	): Promise<ILoginRes> {
		const login = await this.loginCache.getCache(token)
		if (!token || !login) {
			throw new UnAuthErr(ERR_CODE.SESSION_EXPIRED)
		}
		const user = await this.db.user.findUnique({
			where: { id: login.userId },
			include: { roles: true },
		})
		if (!user || !user.enabled) {
			throw new UnAuthErr(ERR_CODE.SESSION_EXPIRED)
		}
		if (
			!(await this.mfaService.verifySession({
				mfaToken,
				otp,
				user,
				referenceToken: token,
			}))
		) {
			throw new BadReqRErr(ERR_CODE.INVALID_OTP)
		}
		return this.authService.completeLogin(user, this.getActivitySession())
	}

	@Post('logout')
	async logout(): Promise<void> {
		const session = this.getActivitySession(true)
		await Promise.all([
			this.activityService.create(ACTIVITY_TYPE.LOGOUT, {}, session),
			this.sessionService.revoke(session.currentUser.id, [
				session.currentUser.sessionId,
			]),
		])
	}

	@Public()
	@Post('register')
	async register(@Body() { username, password }: LoginReqDto): Promise<void> {
		const existingUser = await this.db.user.findFirst({
			where: { username },
			select: { id: true },
		})

		if (existingUser) {
			throw new BadReqRErr(ERR_CODE.USER_EXISTED)
		}

		await this.db.user.create({
			data: {
				id: token12(),
				username,
				...(await createPassword(password)),
				enabled: false,
			},
		})
	}

	@Public()
	@Post('refresh-token')
	async refreshToken(
		@Body() { token }: RefreshTokenReqDto,
	): Promise<ILoginRes | ILoginMFASetupRes> {
		const session = await this.db.session.findFirst({
			where: { token },
			select: {
				revoked: true,
				id: true,
				expired: true,
				createdBy: { select: userRestSelect },
			},
		})

		if (
			!session ||
			session.revoked ||
			isExpired(
				session.expired,
				dayjs.duration({ seconds: seconds(env.EXPIRED_TOLERANCE) }),
			) ||
			!session.createdBy.enabled
		) {
			throw new UnAuthErr(ERR_CODE.EXPIRED_TOKEN)
		}

		if (
			!session.createdBy.mfaTelegramEnabled &&
			!session.createdBy.mfaTotpEnabled
		) {
			if (await this.settingService.mfaRequired) {
				const { totpSecret, mfaToken } = await this.mfaService.setupMfa(
					session.createdBy.id,
				)
				return {
					type: LOGIN_RES_TYPE.MFA_SETUP,
					totpSecret,
					mfaToken,
				}
			}
		}
		const { clientIp } = this.getActivitySession()
		const payload: ITokenPayload = {
			userId: session.createdBy.id,
			loginDate: new Date(),
			sessionId: session.id,
			ip: clientIp,
		}

		const { accessToken, expirationTime } =
			await this.authService.createAccessToken(payload)

		let user = {
			id: session.createdBy.id,
			mfaTelegramEnabled: session.createdBy.mfaTelegramEnabled,
			mfaTotpEnabled: session.createdBy.mfaTotpEnabled,
			telegramUsername: session.createdBy.telegramUsername,
			enabled: session.createdBy.enabled as boolean,
			created: session.createdBy.created,
			username: session.createdBy.username,
			modified: session.createdBy.modified,
			permissions: await this.permissionService.getPermissions(
				session.createdBy,
			),
		}
		if (this.options.getResultUser) {
			user = await this.options.getResultUser(user)
		}

		return {
			type: LOGIN_RES_TYPE.COMPLETED,
			accessToken,
			refreshToken: token,
			exp: expirationTime.getTime(),
			expired: dayjs(expirationTime).format(),
			user,
		}
	}

	@Get('current-user')
	async currentUser(): Promise<UserResult> {
		const { currentUser } = this.getActivitySession(true)
		let user = {
			id: currentUser.id,
			mfaTelegramEnabled: currentUser.mfaTelegramEnabled,
			mfaTotpEnabled: currentUser.mfaTotpEnabled,
			telegramUsername: currentUser.telegramUsername || (undefined as any),
			created: currentUser.created,
			enabled: currentUser.enabled,
			username: currentUser.username,
			modified: currentUser.modified,
			permissions: currentUser.permissions,
		}
		if (this.options.getResultUser) {
			user = await this.options.getResultUser(user)
		}
		return user
	}

	@Post('change-password/request')
	async changePassword(
		@Body() { oldPassword, method }: ChangePasswordReqDto,
	): Promise<{ token: string; mfaToken?: string }> {
		const userId = this.getActivitySession(true).currentUser.id
		const user = await this.db.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				password: true,
				username: true,
				mfaTelegramEnabled: true,
				mfaTotpEnabled: true,
				totpSecret: true,
				telegramUsername: true,
			},
		})

		if (!user) {
			throw new NotFoundErr(ERR_CODE.USER_NOT_FOUND)
		}

		if (!(await comparePassword(oldPassword, user.password))) {
			throw new BadReqRErr(ERR_CODE.PASSWORD_NOT_MATCH)
		}

		if (!method && (user.mfaTelegramEnabled || user.mfaTotpEnabled)) {
			throw new BadReqRErr(ERR_CODE.MFA_REQUIRED)
		}

		const token = token16()
		await this.changePasswordCache.setCache(token, { userId })

		if (method) {
			const mfaToken = await this.mfaService.createSession({
				method,
				user,
				referenceToken: token,
			})
			return { token, mfaToken }
		}
		return { token }
	}

	@Post('change-password/confirm')
	async changePasswordConfirm(
		@Body() { mfaToken, token, otp, newPassword }: ChangePasswordConfirmReqDto,
	): Promise<void> {
		const cache = await this.changePasswordCache.getCache(token)
		if (!cache) {
			throw new UnAuthErr(ERR_CODE.SESSION_EXPIRED)
		}
		const session = this.getActivitySession(true)
		const userId = session.currentUser.id
		if (cache.userId !== userId) {
			throw new UnAuthErr(ERR_CODE.SESSION_EXPIRED)
		}

		const user = await this.db.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				password: true,
				username: true,
				mfaTelegramEnabled: true,
				mfaTotpEnabled: true,
				totpSecret: true,
				telegramUsername: true,
			},
		})

		if (!user) {
			throw new NotFoundErr(ERR_CODE.USER_NOT_FOUND)
		}

		if (mfaToken && otp) {
			const isOtpValid = await this.mfaService.verifySession({
				mfaToken,
				otp,
				user,
				referenceToken: token,
			})
			if (!isOtpValid) {
				throw new BadReqRErr(ERR_CODE.INVALID_OTP)
			}
		} else if (user.mfaTelegramEnabled || user.mfaTotpEnabled) {
			throw new BadReqRErr(ERR_CODE.MFA_REQUIRED)
		}

		await this.db.$transaction([
			this.db.user.update({
				where: { id: userId },
				data: {
					...(await createPassword(newPassword)),
				},
				select: { id: true },
			}),
			this.activityService.create(ACTIVITY_TYPE.CHANGE_PASSWORD, {}, session),
		])

		await this.sessionService.revoke(userId)
	}
}
