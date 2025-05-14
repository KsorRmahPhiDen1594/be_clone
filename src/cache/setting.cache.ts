import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import {
	Inject,
	Injectable,
	Logger,
	OnApplicationBootstrap,
} from '@nestjs/common'
import { Setting } from '@prisma/client'
import { SETTING, env } from '../common'
import { Cacher } from './cacher'

@Injectable()
export class SettingCache
	extends Cacher<Setting>
	implements OnApplicationBootstrap
{
	private readonly logger = new Logger(SettingCache.name)
	constructor(@Inject(CACHE_MANAGER) protected readonly cacheManager: Cache) {
		super('SETTING__', 5)
	}

	async onApplicationBootstrap(): Promise<void> {
		if (env.INSTANCE_ID === 0) {
			await this.cacheManager.mdel(
				Object.values(SETTING).map(x => `SETTING__${x}`),
			)
			this.logger.log('SETTING_CACHE cleared')
		}
	}
}
