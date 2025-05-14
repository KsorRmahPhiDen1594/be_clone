import { Injectable } from '@nestjs/common'
import { CaptchaCache } from '../cache'

@Injectable()
export class CaptchaService {
	constructor(private readonly captchaCache: CaptchaCache) {}

	async validate(token: string, captcha: string): Promise<boolean> {
		const cachedText = await this.captchaCache.getCache(token)
		return cachedText !== null && cachedText === captcha
	}
}
