import { AmqpConnection, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq'
import { Injectable, Logger, Optional } from '@nestjs/common'
import TelegramBot, {
	ForceReply,
	InlineKeyboardMarkup,
	InputMedia,
	ReplyKeyboardMarkup,
	ReplyKeyboardRemove,
} from 'node-telegram-bot-api'
import { SettingService } from './setting.service'

type ITeleOptions = {
	emoji?: 'check' | 'block' | 'refresh' | 'sos' | (string & {})
	reply_markup?:
		| InlineKeyboardMarkup
		| ReplyKeyboardMarkup
		| ReplyKeyboardRemove
		| ForceReply
	photos?: string[]
	videos?: string[]
	botToken?: string
	pinMessage?: boolean
	disable_notification?: boolean
}

@Injectable()
export class TelegramService {
	private readonly logger = new Logger(TelegramService.name)
	constructor(
		private readonly settingService: SettingService,
		@Optional() private readonly amqpConnection?: AmqpConnection,
	) {
		this.amqpConnection = amqpConnection
	}

	private async bot(botToken?: string): Promise<TelegramBot | undefined> {
		const token = botToken ?? (await this.settingService.telegramBotToken)
		if (!token) {
			this.logger.error('Telegram bot is not initialized')
			return
		}
		return new TelegramBot(token, {
			polling: false,
			request: {
				url: 'https://api.telegram.org',
				agentOptions: {
					keepAlive: true,
					family: 4,
				},
			},
		})
	}

	@RabbitSubscribe({
		exchange: 'telegram',
		queue: 'telegram',
		routingKey: 'telegram',
		queueOptions: {
			autoDelete: false,
			channel: 'telegram',
			consumerOptions: { noAck: false },
			durable: true,
		},
	})
	private async internalSend(payload: {
		userId: TelegramBot.ChatId | TelegramBot.ChatId[]
		message: string
		options?: ITeleOptions
	}): Promise<void> {
		const { userId, message, options } = payload
		const {
			emoji,
			photos,
			videos,
			reply_markup,
			botToken,
			pinMessage,
			disable_notification,
		} = options || {}
		const bot = await this.bot(botToken)
		if (!bot) {
			return
		}
		let emojiMessage = message
		if (emoji) {
			switch (emoji) {
				case 'check':
					emojiMessage = `✅✅✅ ${message}`
					break
				case 'block':
					emojiMessage = `⛔⛔⛔ ${message}`
					break
				case 'refresh':
					emojiMessage = `♻️♻️♻️ ${message}`
					break
				case 'sos':
					emojiMessage = `🆘🆘🆘 ${message}`
					break
				default:
					emojiMessage = `${emoji} ${message}`
			}
		}
		const userIds = Array.isArray(userId) ? userId : [userId]

		await Promise.allSettled(
			userIds.map(async userId => {
				try {
					let sentMessage: TelegramBot.Message
					if (photos?.length === 1 && !videos?.length) {
						sentMessage = await bot.sendPhoto(userId, photos[0], {
							...options,
							caption: emojiMessage,
							disable_notification,
						})
					} else if (videos?.length === 1 && !photos?.length) {
						sentMessage = await bot.sendVideo(userId, videos[0], {
							...options,
							caption: emojiMessage,
							disable_notification,
						})
					} else {
						const totalMediaCount =
							(photos?.length ?? 0) + (videos?.length ?? 0)
						if (totalMediaCount > 1) {
							await bot.sendMediaGroup(
								userId,
								[
									...(photos?.map(media => ({
										type: 'photo' as const,
										media,
										parse_mode: 'HTML' as const,
										caption: emojiMessage,
									})) ?? []),
									...(videos?.map(media => ({
										type: 'video' as const,
										media,
										parse_mode: 'HTML' as const,
										caption: emojiMessage,
									})) ?? []),
								] satisfies InputMedia[],
								{ disable_notification },
							)
						}
						sentMessage = await bot.sendMessage(userId, emojiMessage, {
							parse_mode: 'HTML',
							reply_markup,
							disable_notification,
						})
					}
					this.logger.log(`Send message to chat ID ${userId}`)
					if (pinMessage && sentMessage) {
						try {
							await bot.pinChatMessage(userId, sentMessage.message_id, {
								disable_notification,
							})
							this.logger.log(
								`Pin message ${sentMessage.message_id} in ${userId}`,
							)
						} catch (pinError) {
							this.logger.error(`Error pin message in ${userId}:`, pinError)
						}
					}
				} catch (error) {
					this.logger.error(
						`Error sending message to chat ID ${userId}:`,
						error,
					)
				}
			}),
		)
	}

	async sendMessage(
		userId: TelegramBot.ChatId | TelegramBot.ChatId[],
		message: string,
		options?: ITeleOptions,
	): Promise<void> {
		if (this.amqpConnection) {
			await this.amqpConnection.publish(
				'telegram',
				'telegram',
				{
					userId,
					message,
					options,
				},
				{
					persistent: true,
					deliveryMode: 2,
				},
			)
		} else {
			await this.internalSend({ userId, message, options })
		}
	}

	async sendToOperator(
		message: string,
		options?: ITeleOptions & { unPinAllMessage?: boolean },
	): Promise<void> {
		const operatorId = await this.settingService.operatorChatId
		if (!operatorId) {
			this.logger.warn('Telegram operator id not set')
			return
		}
		if (options?.unPinAllMessage) {
			await this.unPinAllMessage(operatorId, options?.botToken)
		}
		await this.sendMessage(operatorId, message, options)
	}

	async unPinAllMessage(
		userId: TelegramBot.ChatId | TelegramBot.ChatId[],
		botToken?: string,
	): Promise<void> {
		const bot = await this.bot(botToken)
		if (!bot) {
			return
		}
		const userIds = Array.isArray(userId) ? userId : [userId]
		await Promise.allSettled(
			userIds.map(userId => bot.unpinAllChatMessages(userId)),
		)
	}
}
