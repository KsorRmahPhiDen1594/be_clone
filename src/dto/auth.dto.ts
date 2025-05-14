import z from 'zod'
import { MFA_METHOD, createZodDto } from '../common'

export class LoginReqDto extends createZodDto(
	z.object({
		username: z.string().min(1),
		password: z.string().min(1),
	}),
) {}

export class LoginConfirmReqDto extends createZodDto(
	z.object({
		mfaToken: z.string().min(1),
		otp: z.string().min(1),
		token: z.string().min(1),
	}),
) {}

export class RefreshTokenReqDto extends createZodDto(
	z.object({
		token: z.string().min(1),
	}),
) {}

export class ChangePasswordReqDto extends createZodDto(
	z.object({
		oldPassword: z.string().min(1),
		method: z.nativeEnum(MFA_METHOD).optional(),
	}),
) {}

export class ChangePasswordConfirmReqDto extends createZodDto(
	z.object({
		newPassword: z.string().min(1),
		token: z.string().min(1),
		mfaToken: z.string().optional(),
		otp: z.string().optional(),
	}),
) {}
