import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { MFA_METHOD } from '../common'
import { Cacher } from './cacher'

@Injectable()
export class MFACache extends Cacher<
	| {
			userId: string
			referenceToken: string
			type: MFA_METHOD.TOTP
	  }
	| {
			userId: string
			referenceToken: string
			type: MFA_METHOD.TELEGRAM
			secret: string
	  }
> {
	constructor(@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache) {
		super('MFA__', 5)
	}
}

@Injectable()
export class MFASetupCache extends Cacher<
	| {
			method: MFA_METHOD.TELEGRAM
			totpSecret: string
			userId: string
			sessionId?: string
			telegramUsername: string
			otp: string
	  }
	| {
			method: MFA_METHOD.TOTP
			totpSecret: string
			userId: string
			sessionId?: string
	  }
> {
	constructor(@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache) {
		super('MFA_SETUP__', 15)
	}
}

@Injectable()
export class ResetMFACache extends Cacher<{
	userIds: string[]
}> {
	constructor(@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache) {
		super('RESET_MFA__', 15)
	}
}
