import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import {
	Inject,
	Injectable,
	Logger,
	OnApplicationBootstrap,
} from '@nestjs/common'
import { env } from '../common'
import { Cacher } from './cacher'

@Injectable()
export class IpWhitelistCache
	extends Cacher<string[]>
	implements OnApplicationBootstrap
{
	private readonly logger = new Logger(IpWhitelistCache.name)
	constructor(@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache) {
		super('IP_WHITELIST__', 10)
	}

	async onApplicationBootstrap(): Promise<void> {
		if (env.INSTANCE_ID === 0) {
			await this.cacheManager.del('IP_WHITELIST__IPS')
			this.logger.log('IP_WHITELIST cleared')
		}
	}
}
