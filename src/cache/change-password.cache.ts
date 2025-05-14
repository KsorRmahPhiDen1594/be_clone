import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { seconds } from 'itty-time'
import { env } from '../common'
import { Cacher } from './cacher'

@Injectable()
export class ChangePasswordCache extends Cacher<{
	userId: string
}> {
	constructor(@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache) {
		super('CHANGE_PASSWORD__', seconds(env.JWT_ACCESS_TOKEN_EXPIRED) / 60)
	}
}
