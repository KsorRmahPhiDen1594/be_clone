import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { ReqUser } from '../common'
import { Cacher } from './cacher'

@Injectable()
export class CurrentUserCache extends Cacher<ReqUser> {
	constructor(@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache) {
		super('CURRENT_USER__', 5)
	}
}
