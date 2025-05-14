import { Prisma } from '@prisma/client'

export const userRestSelect: Prisma.UserSelect = {
	id: true,
	username: true,
	enabled: true,
	created: true,
	modified: true,
	roles: { select: { roleId: true } },
	mfaTelegramEnabled: true,
	mfaTotpEnabled: true,
	totpSecret: true,
	telegramUsername: true,
}

export const proxySelect: Prisma.ProxySelect = {
	id: true,
	protocol: true,
	host: true,
	port: true,
	username: true,
	enabled: true,
	created: true,
	modified: true,
}
