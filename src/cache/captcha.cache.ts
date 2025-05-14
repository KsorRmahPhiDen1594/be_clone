import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { Cacher } from './cacher'

@Injectable()
export class CaptchaCache extends Cacher<string> {
	constructor(@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache) {
		super('CAPTCHA__', 5)
	}
}
