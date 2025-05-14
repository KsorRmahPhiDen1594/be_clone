import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { Cacher } from './cacher'

@Injectable()
export class LoginCache extends Cacher<{ userId: string }> {
	constructor(@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache) {
		super('LOGIN__', 5)
	}
}
