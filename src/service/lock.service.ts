import { Injectable, Logger } from '@nestjs/common'
import { LockOptions, Mutex } from 'redis-semaphore'
import { BadReqRErr, ERR_CODE } from '../common'
import { RedisService } from './redis.service'

@Injectable()
export class LockService {
	private readonly logger = new Logger(LockService.name)
	private LOCK_OPTIONS: LockOptions = {
		lockTimeout: 2000, // optional ms, time after mutex will be auto released
		acquireTimeout: 10_000, // optional ms, max timeout for .acquire() call
		retryInterval: 10, // optional ms, time between acquire attempts if resource locked
		refreshInterval: 5000 * 0.8, // optional ms, auto-refresh interval; to disable auto-refresh behaviour set 0
	}

	constructor(private readonly redisService: RedisService) {}

	newMutex(key: string): Mutex {
		return new Mutex(this.redisService.getClient, key, this.LOCK_OPTIONS)
	}

	async acquire(key: string): Promise<Mutex> {
		const mutex = new Mutex(this.redisService.getClient, key, this.LOCK_OPTIONS)
		try {
			await mutex.acquire()
		} catch (e: any) {
			this.logger.error(`acquireLock ${key} \n ${e?.message}`)
			throw new BadReqRErr(ERR_CODE.TOO_MANY_REQUEST)
		}
		return mutex
	}

	async release(lock: Mutex): Promise<void> {
		try {
			await lock.release()
		} catch (e: any) {
			this.logger.error(`releaseLock ${lock.identifier} \n ${e?.message}`)
		}
	}

	async lock<T>(key: string, func: () => Promise<T>): Promise<T> {
		const lock = await this.acquire(key)
		let responseData: T
		try {
			responseData = await func()
		} finally {
			await this.release(lock)
		}
		return responseData
	}
}
