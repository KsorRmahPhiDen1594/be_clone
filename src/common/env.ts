import z from 'zod'
import { ENV, REGEX_SIZE, REGEX_TIME } from './app.constant'
import { boolStrSchema, numStrSchema } from './function/zod'

const envSchema = z.object({
	NODE_ENV: z.nativeEnum(ENV).default(ENV.DEV),
	APP_NAME: z.string().optional(),
	API_PREFIX: z.string().optional().default('api'),
	ENB_HTTP: boolStrSchema.optional().default(true),
	ENB_SCHEDULE: boolStrSchema.optional().default(true),
	COMMIT_HASH: z.string().optional(),
	BUILD_DATE: numStrSchema().optional().default('0'),
	BUILD_NUMBER: z.string().optional(),
	POSTGRES_URL: z.string().min(1),
	REDIS_URL: z.string().optional(),
	CORS_ALLOW_METHOD: z.string().default('*'),
	CORS_ALLOW_HEADERS: z.string().optional(),
	CORS_ALLOW_ORIGIN: z.string().default('*'),
	BODY_URLENCODED_MAX_SIZE: z.string().regex(REGEX_SIZE).default('10MB'),
	BODY_JSON_MAX_SIZE: z.string().regex(REGEX_SIZE).default('10MB'),
	BODY_RAW_MAX_SIZE: z.string().regex(REGEX_SIZE).default('10MB'),
	BODY_TEXT_MAX_SIZE: z.string().regex(REGEX_SIZE).default('10MB'),
	FILE_IMAGE_MAX_FILES: numStrSchema({
		min: 1,
		max: 3,
		int: true,
	})
		.optional()
		.default('1'),
	FILE_EXCEL_MAX_FILES: numStrSchema({
		min: 1,
		max: 3,
		int: true,
	})
		.optional()
		.default('1'),
	FILE_DOC_MAX_FILES: numStrSchema({
		min: 1,
		max: 3,
		int: true,
	})
		.optional()
		.default('1'),
	FILE_VIDEO_MAX_FILES: numStrSchema({
		min: 1,
		max: 3,
		int: true,
	})
		.optional()
		.default('1'),
	FILE_AUDIO_MAX_FILES: numStrSchema({
		min: 1,
		max: 3,
		int: true,
	})
		.optional()
		.default('1'),
	FILE_IMAGE_MAX_SIZE: z.string().regex(REGEX_SIZE).default('10MB'),
	FILE_EXCEL_MAX_SIZE: z.string().regex(REGEX_SIZE).default('10MB'),
	FILE_DOC_MAX_SIZE: z.string().regex(REGEX_SIZE).default('10MB'),
	FILE_VIDEO_MAX_SIZE: z.string().regex(REGEX_SIZE).default('10MB'),
	FILE_AUDIO_MAX_SIZE: z.string().regex(REGEX_SIZE).default('10MB'),
	JWT_KEY: z.string().min(1),
	JWT_ACCESS_TOKEN_EXPIRED: z
		.string()
		.regex(REGEX_TIME)
		.optional()
		.default('15 minute'),
	JWT_REFRESH_TOKEN_EXPIRED: z
		.string()
		.regex(REGEX_TIME)
		.optional()
		.default('15 day'),
	EXPIRED_TOLERANCE: z
		.string()
		.regex(REGEX_TIME)
		.optional()
		.default('1 minute'),
	REQUEST_TIMEOUT: z.string().regex(REGEX_TIME).optional().default('10 second'),
	SALT_LENGTH: numStrSchema({ min: 8, max: 20, int: true })
		.optional()
		.default('10'),
	PASSWORD_MAX_ATTEMPT: numStrSchema({
		min: 1,
		max: 8,
		int: true,
	})
		.optional()
		.default('5'),
	PASSWORD_PEPPER: z.string().optional(),
	PASSWORD_EXPIRED: z.string().regex(REGEX_TIME).optional().default('180 day'),
	AES_KEY: z.string().min(1),
	METRIC_EP: z.string().default('metrics'),
	INSTANCE_ID: numStrSchema({ min: 0, int: true }).optional().default('0'),
	LOG_FOLDER: z.string().optional(),
	RABBITMQ_URL: z.string().optional(),
})

const validateEnv = (
	env: Record<string, unknown>,
): z.infer<typeof envSchema> => {
	const result = envSchema.safeParse(env)
	if (!result.success) {
		console.error('Invalid environment variables:', result.error.format())
		throw new Error('Invalid environment configuration')
	}
	return result.data
}

export const env: z.infer<typeof envSchema> = validateEnv(process.env)
export const IS_PROD = env.NODE_ENV === ENV.PRODUCTION
