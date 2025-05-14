import { Body, Controller, Inject, Post } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { authenticator } from 'otplib'
import { MFASetupCache, ResetMFACache } from '../cache'
import {
	ACTIVITY_TYPE,
	BadReqRErr,
	ERR_CODE,
	IReqApp,
	MFA_METHOD,
	UnAuthErr,
	comparePassword,
	token16,
} from '../common'
import {
	MfaConfirmReqDto,
	MfaResetConfirmReqDto,
	MfaResetReqDto,
	MfaSetupReqDto,
} from '../dto'
import { PermsGuard, Public } from '../guard'
import {
	ActivityService,
	MfaService,
	PrismaService,
	SessionService,
} from '../service'
import { ControllerBase } from './base.controller'

@Controller('mfa')
export class MfaController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly mfaSetupCache: MFASetupCache,
		private readonly resetMfaCache: ResetMFACache,
		private readonly db: PrismaService,
		private readonly sessionService: SessionService,
		private readonly activityService: ActivityService,
		private readonly mfaService: MfaService,
	) {
		super(request)
	}

	@Post('setup/request')
	async setupMFARequest(
		@Body() { password, method, telegramUsername }: MfaSetupReqDto,
	): Promise<{ mfaToken: string; totpSecret?: string }> {
		const { currentUser } = this.getActivitySession(true)
		if (!(await comparePassword(password, currentUser.password))) {
			throw new BadReqRErr(ERR_CODE.PASSWORD_NOT_MATCH)
		}

		const mfaToken = token16()
		const totpSecret = authenticator.generateSecret().toUpperCase()

		if (method === MFA_METHOD.TELEGRAM && !currentUser.mfaTelegramEnabled) {
			if (!telegramUsername) {
				throw new BadReqRErr(ERR_CODE.VALIDATION_ERROR)
			}

			authenticator.options = { digits: 6, step: 300 }
			const secret = authenticator.generateSecret()
			const otp = authenticator.generate(secret)

			await this.mfaSetupCache.setCache(mfaToken, {
				method,
				userId: currentUser.id,
				sessionId: currentUser.sessionId,
				telegramUsername,
				otp,
				totpSecret,
			})

			return {
				mfaToken,
			}
		}

		if (method === MFA_METHOD.TOTP && !currentUser.mfaTotpEnabled) {
			const totpSecret = authenticator.generateSecret().toUpperCase()
			await this.mfaSetupCache.setCache(mfaToken, {
				method,
				totpSecret,
				userId: currentUser.id,
				sessionId: currentUser.sessionId,
			})

			return {
				mfaToken,
				totpSecret,
			}
		}

		throw new BadReqRErr(ERR_CODE.MFA_METHOD_UNAVAILABLE)
	}

	@Public()
	@Post('setup/confirm')
	async setupMFAConfirm(
		@Body() { mfaToken, otp }: MfaConfirmReqDto,
	): Promise<void> {
		const cachedData = await this.mfaSetupCache.getCache(mfaToken)
		if (!cachedData) {
			throw new UnAuthErr(ERR_CODE.SESSION_EXPIRED)
		}

		if (cachedData.method === MFA_METHOD.TELEGRAM) {
			if (
				!authenticator.verify({ secret: cachedData.totpSecret, token: otp })
			) {
				throw new BadReqRErr(ERR_CODE.INVALID_OTP)
			}

			await this.db.user.update({
				where: { id: cachedData.userId },
				data: {
					telegramUsername: cachedData.telegramUsername,
					mfaTelegramEnabled: true,
				},
				select: { id: true },
			})
		} else {
			if (
				!authenticator.verify({ secret: cachedData.totpSecret, token: otp })
			) {
				throw new BadReqRErr(ERR_CODE.INVALID_OTP)
			}

			await this.db.user.update({
				where: { id: cachedData.userId },
				data: {
					totpSecret: cachedData.totpSecret,
					mfaTotpEnabled: true,
				},
				select: { id: true },
			})
		}

		if (cachedData.sessionId) {
			await this.sessionService.revoke(cachedData.userId, [
				cachedData.sessionId,
			])
			await this.activityService.create(
				ACTIVITY_TYPE.SETUP_MFA,
				{
					method: cachedData.method,
					telegramUsername:
						cachedData.method === MFA_METHOD.TELEGRAM
							? cachedData.telegramUsername
							: undefined,
				},
				this.getActivitySession(true),
			)
		}
	}

	@PermsGuard('USER.RESET_MFA')
	@Post('reset-mfa/request')
	async createResetMFARequest(
		@Body() { method, userIds }: MfaResetReqDto,
	): Promise<{ mfaToken: string; token: string }> {
		const token = token16()
		const mfaToken = await this.mfaService.createSession({
			method,
			user: this.getActivitySession(true).currentUser,
			referenceToken: token,
		})

		await this.resetMfaCache.setCache(token, {
			userIds,
		})

		return {
			mfaToken,
			token,
		}
	}

	@PermsGuard('USER.RESET_MFA')
	@Post('reset-mfa/confirm')
	async confirmResetMFA(
		@Body() { otp, token, mfaToken }: MfaResetConfirmReqDto,
	): Promise<void> {
		const cacheData = await this.resetMfaCache.getCache(token)
		if (!cacheData) {
			throw new UnAuthErr(ERR_CODE.SESSION_EXPIRED)
		}

		const session = this.getActivitySession(true)
		const isVerified = await this.mfaService.verifySession({
			mfaToken,
			otp,
			referenceToken: token,
			user: session.currentUser,
		})
		if (!isVerified) {
			throw new BadReqRErr(ERR_CODE.INVALID_OTP)
		}

		await this.db.$transaction([
			this.db.user.updateMany({
				where: {
					id: {
						in: cacheData.userIds,
					},
				},
				data: {
					mfaTelegramEnabled: false,
					mfaTotpEnabled: false,
					totpSecret: null,
					telegramUsername: null,
				},
			}),
			this.activityService.create(
				ACTIVITY_TYPE.RESET_MFA,
				{ userIds: cacheData.userIds },
				session,
			),
		])

		await Promise.all(
			cacheData.userIds.map(userId => this.sessionService.revoke(userId)),
		)
	}
}
