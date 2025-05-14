import z from 'zod'
import { createZodDto } from '../common'

export class UpdateSettingReqDto extends createZodDto(
	z.object({
		value: z.string(),
	}),
) {}
