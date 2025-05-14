import { LoggerService } from '@nestjs/common'
import { WinstonModule, utilities } from 'nest-winston'
import * as winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { env } from './env'
import { esModule } from './function'

export const createLogger = (context: string): LoggerService =>
	WinstonModule.createLogger({
		transports: [
			new winston.transports.Console({
				format: winston.format.combine(
					winston.format.timestamp(),
					winston.format.ms(),
					utilities.format.nestLike(context, {
						colors: true,
						prettyPrint: true,
					}),
				),
			}),
			env.LOG_FOLDER
				? new DailyRotateFile({
						dirname: env.LOG_FOLDER,
						filename: `${esModule.transliterate(context).toLowerCase()}-%DATE%.log`,
						datePattern: 'YYYY-MM-DD',
						zippedArchive: true,
						maxSize: '100m',
						maxFiles: '30d',
						level: 'warn',
						format: winston.format.combine(
							winston.format.timestamp(),
							winston.format.ms(),
							winston.format.json(),
						),
					})
				: undefined,
		].filter(Boolean) as winston.transport[],
	})
