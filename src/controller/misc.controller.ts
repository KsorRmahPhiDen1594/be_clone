import { Controller, Get, Headers, Inject, Query, Req } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { init } from '@paralleldrive/cuid2'
import dayjs from 'dayjs'
import { Request } from 'express'
import { CoreErr, ERR_CODE, IReqApp, env } from '../common'
import { CuidDto } from '../dto'
import { Public } from '../guard'
import { MiscService, PrismaService, RedisService } from '../service'
import { ControllerBase } from './base.controller'

@Controller('misc')
@Public()
export class MiscController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly miscService: MiscService,
		private readonly db: PrismaService,
		private readonly redisService: RedisService,
	) {
		super(request)
	}

	@Get('preflight')
	async preflight(): Promise<void> {
		await this.miscService.preflight(this.getActivitySession().clientIp)
	}

	@Get('healthcheck')
	async healthCheck(): Promise<void> {
		try {
			await Promise.all([
				this.db.$queryRaw`SELECT 1`,
				this.redisService.getClient.ping(),
			])
		} catch (e) {
			throw new CoreErr(ERR_CODE.INTERNAL_SERVER_ERROR)
		}
	}

	@Get('time')
	getTime(): { t: number; time: string } {
		const timestamp = Date.now()
		const formattedTime = dayjs().format('ddd, D MMM, H:m:s z')

		return {
			t: timestamp,
			time: formattedTime,
		}
	}

	@Get('whoami')
	getWhoAmI(
		@Headers() headers: Record<string, string>,
		@Req() request: Request,
	): string {
		const headersToDisplay = headers || request.headers
		return Object.entries(headersToDisplay)
			.map(([key, value]) => `${key}: ${value}`)
			.join('\n')
	}

	@Get('cuid')
	cuid(@Query() { length, amount }: CuidDto): string[] {
		const generator = init({ length })
		return Array(amount)
			.fill(0)
			.map(() => generator())
	}

	@Get('ip')
	ip(): string {
		return this.getActivitySession().clientIp
	}

	@Get('version')
	version(): {
		commitHash: string
		buildDate: number
		buildNumber: string
	} {
		return {
			commitHash: env.COMMIT_HASH ?? '',
			buildDate: env.BUILD_DATE ?? 0,
			buildNumber: env.BUILD_NUMBER ?? '',
		}
	}
}
