import { Controller, Post } from '@nestjs/common'
import { createMathExpr } from 'svg-captcha'
import { CaptchaCache } from '../cache'
import { token16 } from '../common'
import { Public } from '../guard'

@Controller('captcha')
@Public()
export class CaptchaController {
	constructor(private readonly captchaCache: CaptchaCache) {}

	@Post()
	async generate(): Promise<{ imageUrl: string; token: string }> {
		const { data: imageData, text: captchaText } = createMathExpr({
			color: true,
			mathMax: 29,
			mathMin: 11,
			noise: 0,
		})

		const token = token16()
		await this.captchaCache.setCache(token, captchaText)

		return {
			token,
			imageUrl: `data:image/svg+xml;base64,${Buffer.from(imageData).toString('base64')}`,
		}
	}
}
