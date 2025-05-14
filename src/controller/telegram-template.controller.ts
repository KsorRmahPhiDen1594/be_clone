import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { TelegramTemplate } from '@prisma/client'
import { InlineKeyboardButton } from 'node-telegram-bot-api'
import { IPagingData, decrypt, token12 } from '../common'
import {
	IdsDto,
	PaginationReqDto,
	SendTelegramMessageDto,
	SendTelegramTemplateDto,
	TelegramTemplateDto,
} from '../dto'
import { PermsGuard } from '../guard'
import { PrismaService, TelegramService } from '../service'

@Controller('telegram-template')
export class TelegramTemplateController {
	constructor(
		private readonly db: PrismaService,
		private readonly telegramService: TelegramService,
	) {}

	private async getBotToken(
		id: string | undefined,
	): Promise<string | undefined> {
		if (!id) return
		let botToken: string | undefined
		if (id) {
			const bot = await this.db.telegramBot.findUnique({
				where: { id },
				select: { token: true },
			})
			botToken = bot?.token && decrypt(bot.token)
		}
		return botToken
	}

	@Get()
	@PermsGuard('TELE_TEMPLATE.VIEW')
	async paginate(
		@Query() { take, skip }: PaginationReqDto,
	): Promise<IPagingData<TelegramTemplate>> {
		const [docs, count] = await Promise.all([
			this.db.telegramTemplate.findMany({
				take,
				skip,
			}),
			this.db.telegramTemplate.count(),
		])

		return {
			docs,
			count,
		}
	}

	@Post()
	@PermsGuard('TELE_TEMPLATE.UPDATE')
	async upsert(
		@Body() {
			id,
			name,
			description,
			message,
			videos,
			photos,
			buttons,
		}: TelegramTemplateDto,
	): Promise<void> {
		if (id) {
			await this.db.telegramTemplate.update({
				where: { id: id },
				data: {
					name,
					description,
					message,
					videos: videos?.length ? videos : [],
					photos: photos?.length ? photos : [],
					buttons: buttons?.length ? buttons : [],
				},
				select: { id: true },
			})
		} else {
			await this.db.telegramTemplate.create({
				data: {
					name,
					description,
					message,
					videos: videos?.length ? videos : [],
					photos: photos?.length ? photos : [],
					buttons: buttons?.length ? buttons : [],
					id: token12(),
				},
				select: { id: true },
			})
		}
	}

	@Post('send')
	@PermsGuard('TELE_TEMPLATE.SEND')
	async sendTemplate(
		@Body() {
			telegramBotId,
			telegramChatIds,
			telegramTemplateId,
		}: SendTelegramTemplateDto,
	): Promise<void> {
		const [template, chats] = await Promise.all([
			this.db.telegramTemplate.findUnique({
				where: { id: telegramTemplateId },
			}),
			this.db.telegramChat.findMany({
				where: { id: { in: telegramChatIds } },
			}),
		])
		if (!template || !chats.length) {
			return
		}

		await this.telegramService.sendMessage(
			chats.map(x => x.chatId),
			template.message ?? '',
			{
				videos: template.videos,
				photos: template.photos,
				reply_markup: {
					inline_keyboard:
						template.buttons as unknown as InlineKeyboardButton[][],
				},
				botToken: await this.getBotToken(telegramBotId),
			},
		)
	}

	@Post('manual-send')
	@PermsGuard('TELE_TEMPLATE.SEND')
	async manualSendMessage(
		@Body() {
			chatIds,
			message,
			buttons,
			videos,
			photos,
			telegramBotId,
		}: SendTelegramMessageDto,
	): Promise<void> {
		await this.telegramService.sendMessage(chatIds, message ?? '', {
			photos,
			videos,
			reply_markup: {
				inline_keyboard: buttons as unknown as InlineKeyboardButton[][],
			},
			botToken: await this.getBotToken(telegramBotId),
		})
	}

	@PermsGuard('TELE_TEMPLATE.DELETE')
	@Post('del')
	async del(@Body() { ids }: IdsDto): Promise<void> {
		await this.db.telegramTemplate.deleteMany({
			where: { id: { in: ids } },
		})
	}
}
