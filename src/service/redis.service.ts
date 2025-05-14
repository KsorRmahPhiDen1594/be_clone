import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common'
import Redis from 'ioredis'
import { env } from '../common'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
	private readonly client?: Redis
	private readonly logger = new Logger(RedisService.name)

	constructor() {
		if (env.REDIS_URL) {
			this.client = new Redis(env.REDIS_URL)
		}
	}

	async onModuleInit() {
		try {
			await this.getClient.ping()
			this.logger.log('✅ Redis connected')
			await this.deleteSettingKeys()
		} catch (error) {
			this.logger.error('❌ Redis connection failed:', error)
		}
	}

	onModuleDestroy() {
		this.getClient.quit()
	}

	private async deleteSettingKeys(): Promise<void> {
		let cursor = '0'
		do {
			const [newCursor, keys] = await this.getClient.scan(
				cursor,
				'MATCH',
				'SETTING_*',
				'COUNT',
				100,
			)
			cursor = newCursor
			if (keys.length > 0) {
				await this.getClient.del(...keys)
			}
		} while (cursor !== '0')
	}

	get getClient(): Redis {
		if (!this.client) {
			throw new Error('Redis is not configured')
		}
		return this.client
	}
}
