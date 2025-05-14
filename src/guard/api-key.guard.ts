import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import * as argon2 from 'argon2'
import dayjs from 'dayjs'
import { ERR_CODE, IReqApp, NotFoundErr, UnAuthErr } from '../common'
import { PrismaService } from '../service'

@Injectable()
export class ApiKeyGuard implements CanActivate {
	constructor(private readonly db: PrismaService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<IReqApp>()
		const { 'x-api-key': xApiKey, 'x-api-secret': xApiSecret } = request.headers

		if (!xApiKey || !xApiSecret) {
			throw new NotFoundErr(ERR_CODE.API_KEY_NOT_FOUND)
		}

		const apiKey = await this.db.apiKey.findFirst({
			where: { key: xApiKey.toString() },
			select: {
				hash: true,
				id: true,
				name: true,
				userId: true,
				enabled: true,
				startDate: true,
				endDate: true,
			},
		})

		if (!apiKey) {
			throw new NotFoundErr(ERR_CODE.API_KEY_NOT_FOUND)
		}

		if (
			!apiKey.enabled ||
			this.isApiKeyInactive(apiKey.startDate, apiKey.endDate)
		) {
			throw new UnAuthErr(ERR_CODE.API_KEY_NOT_ACTIVE)
		}

		const isSecretValid = await argon2.verify(
			apiKey.hash,
			xApiSecret.toString(),
		)
		if (!isSecretValid) {
			throw new UnAuthErr(ERR_CODE.INVALID_API_KEY)
		}

		request.apiKey = apiKey
		return true
	}

	private isApiKeyInactive(startDate?: Date, endDate?: Date | null): boolean {
		const now = dayjs()
		return !!(
			(startDate && now.isBefore(dayjs(startDate))) ||
			(endDate && now.isAfter(dayjs(endDate)))
		)
	}
}
