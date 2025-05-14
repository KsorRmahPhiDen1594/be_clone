import z from 'zod'
import { createZodDto } from '../common'
import { boolStrSchema } from '../common/function/zod'
import { cursorPaginationSchema } from './dto'

export class MySessionReqDto extends createZodDto(
	z
		.object({
			ip: z.string().optional(),
			revoked: boolStrSchema,
			created0: z.string().datetime(),
			created1: z.string().datetime(),
		})
		.extend(cursorPaginationSchema),
) {}
