import z from 'zod'
import { createZodDto } from '../common'

export class UpsertApiKeyDto extends createZodDto(
	z.object({
		id: z.string().optional(),
		startDate: z.coerce.date().optional(),
		endDate: z.coerce.date().optional(),
		name: z.string().min(1),
		enabled: z.boolean(),
	}),
) {}
