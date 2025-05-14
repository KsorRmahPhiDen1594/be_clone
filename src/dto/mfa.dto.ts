import z from 'zod'
import { MFA_METHOD, createZodDto } from '../common'

export class MfaResetReqDto extends createZodDto(
	z.object({
		method: z.nativeEnum(MFA_METHOD),
		userIds: z.array(z.string().min(1)).min(1),
	}),
) {}

export class MfaResetConfirmReqDto extends createZodDto(
	z.object({
		mfaToken: z.string().min(1),
		otp: z.string().min(1),
		token: z.string().min(1),
	}),
) {}

export class MfaSetupReqDto extends createZodDto(
	z.object({
		password: z.string().min(1),
		method: z.nativeEnum(MFA_METHOD),
		telegramUsername: z.string().optional(),
	}),
) {}

export class MfaConfirmReqDto extends createZodDto(
	z.object({
		mfaToken: z.string().min(1),
		otp: z.string().min(1),
	}),
) {}
