import { Injectable } from '@nestjs/common'
import { SETTING_DATA_TYPE, Setting } from '@prisma/client'
import dayjs from 'dayjs'
import { isNil } from 'lodash'
import { z } from 'zod'
import { SettingCache } from '../cache'
import { SETTING, decrypt } from '../common'
import { PrismaService } from './prisma.service'

@Injectable()
export class SettingService {
	constructor(
		private readonly db: PrismaService,
		private readonly settingCache: SettingCache,
	) {}

	private async getValue<T>(
		setting: Setting | null,
		raw = false,
	): Promise<T | undefined> {
		if (!setting) return undefined
		if (raw) {
			return setting.value as T
		}
		const schema = {
			[SETTING_DATA_TYPE.BOOLEAN]: z
				.enum(['true', 'false'])
				.transform(val => val === 'true'),
			[SETTING_DATA_TYPE.NUMBER]: z
				.string()
				.regex(/^-?\d+(\.\d+)?$/)
				.transform(Number),
			[SETTING_DATA_TYPE.DATE]: z
				.string()
				.datetime()
				.transform(val => new Date(val)),
			[SETTING_DATA_TYPE.STRING]: z.string(),
		}[setting.type]
		let value: string
		try {
			value =
				setting.value && setting.isSecret
					? decrypt(setting.value)
					: setting.value
		} catch {
			value = ''
		}
		const parseRes = schema.safeParse(value)
		return parseRes.success ? (parseRes.data as T) : undefined
	}

	checkValue = (value: string, type: SETTING_DATA_TYPE): boolean => {
		if (!value) return true
		const schema = {
			[SETTING_DATA_TYPE.BOOLEAN]: z.enum(['true', 'false']),
			[SETTING_DATA_TYPE.NUMBER]: z.string().regex(/^-?\d+(\.\d+)?$/),
			[SETTING_DATA_TYPE.STRING]: z.string(),
			[SETTING_DATA_TYPE.DATE]: z.string().datetime(),
		}[type]

		return schema?.safeParse(value).success ?? false
	}

	async getOrThrow<T>(key: string): Promise<T> {
		let setting = await this.settingCache.getCache(key)
		if (!setting) {
			setting = await this.db.setting.findUnique({ where: { key } })
			if (!setting) {
				throw new Error(`Missing setting key: ${key}`)
			}
			await this.settingCache.setCache(key, setting)
		}

		const value = await this.getValue<T>(setting)
		if (isNil(value)) {
			throw new Error(`Missing setting key: ${key}`)
		}

		return value
	}

	async get<T>(key: string): Promise<T | undefined>
	async get<T>(key: string, defaultVal: T): Promise<T>
	async get<T>(key: string, defaultVal?: T): Promise<T | undefined> {
		try {
			return await this.getOrThrow<T>(key)
		} catch (error) {
			return defaultVal
		}
	}

	async password(): Promise<{
		enbAttempt: boolean
		enbExpired: boolean
	}> {
		const [enbAttempt, enbExpired] = await Promise.all([
			this.getOrThrow<boolean>(SETTING.ENB_PASSWORD_ATTEMPT),
			this.getOrThrow<boolean>(SETTING.ENB_PASSWORD_EXPIRED),
		])
		return {
			enbAttempt,
			enbExpired,
		}
	}

	get mfaRequired(): Promise<boolean> {
		return this.get<boolean>(SETTING.MFA_REQUIRED, false)
	}

	get operatorChatId(): Promise<string | undefined> {
		return this.get<string>(SETTING.TELEGRAM_OPERATOR_CHAT_ID)
	}

	get telegramBotToken(): Promise<string | undefined> {
		return this.get<string>(SETTING.TELEGRAM_BOT_TOKEN)
	}

	get enbOnlyOneSession(): Promise<boolean> {
		return this.get<boolean>(SETTING.ENB_ONLY_ONE_SESSION, false)
	}

	get enbIpWhitelist(): Promise<boolean> {
		return this.get<boolean>(SETTING.ENB_IP_WHITELIST, false)
	}

	get maintenanceEndDate(): Promise<Date> {
		return this.get<Date>(SETTING.MAINTENANCE_END_DATE, dayjs(0).toDate())
	}
}
