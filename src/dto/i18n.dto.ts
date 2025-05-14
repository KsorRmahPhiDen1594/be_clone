import z from 'zod'
import { createZodDto } from '../common'
import { offsetPaginationSchema } from './dto'

export class I18nPaginationReqDto extends createZodDto(
	z
		.object({
			key: z.string().optional(),
		})
		.extend(offsetPaginationSchema),
) {}

export class I18nUpsertDto extends createZodDto(
	z.object({
		id: z.string().optional(),
		key: z.string().min(1),
		en: z.string(),
		zh: z.string(),
		vi: z.string(),
		ko: z.string(),
	}),
) {}

export const i18nImportSchema = z.object({
	key: z.string().min(1).trim(),
	en: z.string().trim().default(''),
	zh: z.string().trim().default(''),
	ko: z.string().trim().default(''),
	vi: z.string().trim().default(''),
})
