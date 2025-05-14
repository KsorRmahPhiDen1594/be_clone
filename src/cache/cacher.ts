import { Injectable } from '@nestjs/common'
import { Cache } from 'cache-manager'

@Injectable()
export abstract class Cacher<TCache> {
	protected readonly keyPrefix: string
	protected readonly ttlInMinutes: number
	protected abstract readonly cacheManager: Cache

	protected constructor(keyPrefix = '', ttlInMinutes = 5) {
		this.keyPrefix = keyPrefix
		this.ttlInMinutes = ttlInMinutes
	}

	async setCache(key: string, value: TCache): Promise<void> {
		await this.cacheManager.set(
			`${this.keyPrefix}${key}`,
			value,
			this.ttlInMinutes * 60 * 1000,
		)
	}

	async getCache(key: string): Promise<TCache | null> {
		return this.cacheManager.get<TCache>(`${this.keyPrefix}${key}`)
	}

	async del(key: string): Promise<void> {
		await this.cacheManager.del(`${this.keyPrefix}${key}`)
	}
}
