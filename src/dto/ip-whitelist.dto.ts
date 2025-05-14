import z from 'zod'
import { createZodDto } from '../common'

export class CreateIpWhitelistReq extends createZodDto(
	z.object({
		ip: z.string().min(1),
		note: z.string().optional(),
	}),
) {}
