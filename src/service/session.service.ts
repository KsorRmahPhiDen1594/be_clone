import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AccessTokenCache } from '../cache'
import { PrismaService } from './prisma.service'

@Injectable()
export class SessionService {
	constructor(
		private readonly db: PrismaService,
		private readonly accessTokenCache: AccessTokenCache,
	) {}

	async revoke(userId: string, sessionIds: string[] = []): Promise<void> {
		const whereCondition: Prisma.SessionWhereInput = {
			createdById: userId,
			revoked: { not: { equals: true } },
		}

		if (sessionIds.length > 0) {
			whereCondition.id = {
				in: sessionIds,
			}
		}

		const sessions = await this.db.session.findMany({
			where: whereCondition,
			select: { id: true },
		})

		if (sessions.length > 0) {
			await Promise.all([
				this.db.session.updateMany({
					where: {
						id: { in: sessions.map(session => session.id) },
					},
					data: { revoked: true },
				}),
				sessions.map(session => this.accessTokenCache.del(session.id)),
			])
		}
	}
}
