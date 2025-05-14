import {
	Body,
	Controller,
	Get,
	Inject,
	Logger,
	Post,
	Query,
} from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { TelegramBot } from '@prisma/client'
import {
	ACTIVITY_TYPE,
	IPagingData,
	IReqApp,
	decrypt,
	encrypt,
	token12,
} from '../common'
import { IdsDto, PaginationReqDto, TelegramBotDto } from '../dto'
import { PermsGuard } from '../guard'
import { ActivityService, PrismaService } from '../service'
import { ControllerBase } from './base.controller'

@Controller('telegram-bot')
export class TelegramBotController extends ControllerBase {
	private readonly logger = new Logger(TelegramBotController.name)
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly db: PrismaService,
		private readonly activityService: ActivityService,
	) {
		super(request)
	}

	@Get()
	@PermsGuard('TELE_BOT.VIEW')
	async paginate(
		@Query() { take, skip }: PaginationReqDto,
	): Promise<IPagingData<TelegramBot>> {
		const [docs, count] = await Promise.all([
			this.db.telegramBot.findMany({
				take,
				skip,
			}),
			this.db.telegramBot.count(),
		])

		return {
			docs: docs.map(x => {
				let token: string = x.token
				try {
					token = decrypt(x.token)
				} catch (error) {
					this.logger.error(`Wrong decrypt telegram bot token: ${x.id}`, error)
				}
				return { ...x, token }
			}),
			count,
		}
	}

	@Post()
	@PermsGuard('TELE_BOT.UPDATE')
	async upsert(@Body() data: TelegramBotDto): Promise<void> {
		const session = this.getActivitySession(true)
		if (data.id) {
			await this.db.$transaction([
				this.db.telegramBot.update({
					where: { id: data.id },
					data: { ...data, token: encrypt(data.token) },
					select: { id: true },
				}),
				this.activityService.create(
					ACTIVITY_TYPE.UPDATE_TELEGRAM_BOT,
					{ id: data.id },
					session,
				),
			])
		} else {
			await this.db.$transaction(async tx => {
				const createData = await tx.telegramBot.create({
					data: {
						...data,
						id: token12(),
						token: encrypt(data.token),
					},
					select: { id: true },
				})
				await this.activityService.create(
					ACTIVITY_TYPE.CREATE_TELEGRAM_BOT,
					{ id: createData.id },
					session,
					tx,
				)
			})
		}
	}

	@PermsGuard('TELE_BOT.DELETE')
	@Post('del')
	async del(@Body() { ids }: IdsDto): Promise<void> {
		await this.db.$transaction([
			this.db.telegramBot.deleteMany({
				where: { id: { in: ids } },
			}),
			this.activityService.create(
				ACTIVITY_TYPE.DEL_TELEGRAM_BOT,
				{ botIds: ids },
				this.getActivitySession(true),
			),
		])
	}
}
