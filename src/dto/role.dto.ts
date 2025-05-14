import z from 'zod'
import { createZodDto } from '../common'
import { offsetPaginationSchema } from './dto'

export class UpsertRoleReqDto extends createZodDto(
	z.object({
		id: z.string().optional(),
		description: z.string(),
		title: z.string(),
		permissionIds: z.array(z.string()).min(1),
		playerIds: z.array(z.string()).min(0),
	}),
) {}

export class RolePagingDto extends createZodDto(
	z
		.object({
			userId: z.string().optional(),
			title: z.string().optional(),
		})
		.extend(offsetPaginationSchema),
) {}

export class PermissionPagingDto extends createZodDto(
	z.object({
		roleId: z.string().optional(),
	}),
) {}
