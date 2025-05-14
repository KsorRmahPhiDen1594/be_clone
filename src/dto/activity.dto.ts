import z from 'zod'
import { createZodDto } from '../common'
import { cursorPaginationSchema } from './dto'

export class ActivityPaginateReqDto extends createZodDto(
	z
		.object({
			type: z.string().optional(),
			ip: z.string().optional(),
			sessionId: z.string().optional(),
			created0: z.coerce.date(),
			created1: z.coerce.date(),
		})
		.extend(cursorPaginationSchema),
) {}
