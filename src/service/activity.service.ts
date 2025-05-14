import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ACTIVITY_TYPE, ActivityTypeMap, ReqUser, token12 } from '../common'
import { PrismaService } from './prisma.service'

@Injectable()
export class ActivityService {
	constructor(private readonly db: PrismaService) {}

	create<T extends ACTIVITY_TYPE>(
		type: T,
		reference: ActivityTypeMap[T],
		session: {
			clientIp: string
			userAgent: string
			currentUser: Pick<ReqUser, 'sessionId' | 'id'>
		},
		tx?: Omit<
			PrismaService,
			| '$on'
			| '$transaction'
			| '$connect'
			| '$disconnect'
			| '$use'
			| '$extends'
			| 'onModuleInit'
			| 'onApplicationShutdown'
			| 'seedPermissions'
			| 'seedSettings'
		>,
	): Prisma.PrismaPromise<{
		id: string
	}> {
		return (tx || this.db).activity.create({
			data: {
				id: token12(),
				type,
				ip: session.clientIp,
				device: session.userAgent,
				sessionId: session.currentUser.sessionId,
				createdById: session.currentUser.id,
				reference,
			},
			select: { id: true },
		})
	}
}
