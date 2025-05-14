import dayjs from 'dayjs'
import z from 'zod'
import { createZodDto } from '../common'
import { boolStrSchema, cuidSchema } from '../common/function/zod'
import { offsetPaginationSchema } from './dto'

export class UserUpsertReqDto extends createZodDto(
	z.object({
		id: z.string().optional(),
		username: z.string().min(1),
		password: z.string().optional(),
		enabled: z.boolean(),
		roleIds: z.array(z.string()).min(1),
	}),
) {}

export class UserUpdateRoleDto extends createZodDto(
	z.object({
		playerId: z.string().min(1),
		roleIds: z.array(z.string().min(1)).min(1),
	}),
) {}

export class UserPaginateDto extends createZodDto(
	z
		.object({
			username: z.string().optional(),
			roleIds: z.array(cuidSchema).optional(),
			mfaTelegramEnabled: boolStrSchema.optional(),
			mfaTotpEnabled: boolStrSchema.optional(),
			enabled: boolStrSchema.optional(),
			created0: z.coerce.date(),
			created1: z.coerce.date(),
		})
		.extend(offsetPaginationSchema)
		.refine(
			({ created0, created1 }) =>
				dayjs(created0).isSame(created1) || dayjs(created0).isBefore(created1),
			{
				message: 'created0 must be the same as or before created1',
				path: ['created0'],
			},
		),
) {}
