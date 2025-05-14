import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { TelegramChat } from '@prisma/client'
import { IPagingData, token12 } from '../common'
import { IdsDto, PaginationReqDto, TelegramChatDto } from '../dto'
import { PermsGuard } from '../guard'
import { PrismaService } from '../service'

@Controller('telegram-chat')
export class TelegramChatController {
	constructor(private readonly db: PrismaService) {}

	@Get()
	@PermsGuard('TELE_CHAT.VIEW')
	async paginate(
		@Query() { take, skip }: PaginationReqDto,
	): Promise<IPagingData<TelegramChat>> {
		const [docs, count] = await Promise.all([
			this.db.telegramChat.findMany({
				take,
				skip,
			}),
			this.db.telegramChat.count(),
		])

		return {
			docs,
			count,
		}
	}

	@Post()
	@PermsGuard('TELE_CHAT.UPDATE')
	async upsert(@Body() data: TelegramChatDto): Promise<void> {
		if (data.id) {
			await this.db.telegramChat.update({
				where: { id: data.id },
				data,
				select: { id: true },
			})
		} else {
			await this.db.telegramChat.create({
				data: {
					...data,
					id: token12(),
				},
				select: { id: true },
			})
		}
	}

	@PermsGuard('TELE_CHAT.DELETE')
	@Post('del')
	async del(@Body() { ids }: IdsDto): Promise<void> {
		await this.db.telegramChat.deleteMany({
			where: { id: { in: ids } },
		})
	}
}
