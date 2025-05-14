import { TELEGRAM_CHAT_TYPE } from '@prisma/client'
import z from 'zod'
import { createZodDto } from '../common'

export class TelegramBotDto extends createZodDto(
	z.object({
		id: z.string().optional(),
		enabled: z.boolean(),
		name: z.string().min(1),
		description: z.string().optional(),
		token: z.string().min(1),
	}),
) {}

export class TelegramChatDto extends createZodDto(
	z.object({
		id: z.string().optional(),
		name: z.string().min(1),
		description: z.string().optional(),
		chatId: z.string().min(1),
		type: z.nativeEnum(TELEGRAM_CHAT_TYPE),
	}),
) {}

const telegramTemplateSchema = z.object({
	id: z.string().optional(),
	name: z.string().min(1),
	description: z.string().optional(),
	message: z.string().optional(),
	photos: z.array(z.string().min(1)).optional(),
	videos: z.array(z.string().min(1)).optional(),
	buttons: z
		.array(
			z.array(
				z.object({
					text: z.string().min(1),
					url: z.string().url(),
				}),
			),
		)
		.optional(),
})
export class TelegramTemplateDto extends createZodDto(telegramTemplateSchema) {}

export class SendTelegramTemplateDto extends createZodDto(
	z.object({
		telegramTemplateId: z.string().min(1),
		telegramChatIds: z.array(z.string().min(1)).min(1),
		telegramBotId: z.string().optional(),
	}),
) {}

export class SendTelegramMessageDto extends createZodDto(
	telegramTemplateSchema
		.omit({ id: true, name: true, description: true })
		.extend({
			telegramBotId: z.string().optional(),
			chatIds: z.array(z.string().min(1)).min(1),
		}),
) {}
