import { Controller, Get, Inject, Query } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { Prisma } from '@prisma/client'
import { ICursorPagingData, IReqApp } from '../common'
import { ActivityPaginateReqDto } from '../dto'
import { PermsGuard } from '../guard'
import { PrismaService } from '../service'
import { ControllerBase } from './base.controller'

const activitySelect = {
	id: true,
	created: true,
	createdById: true,
	description: true,
	device: true,
	ip: true,
	reference: true,
	type: true,
	sessionId: true,
} satisfies Prisma.ActivitySelect

@Controller('activities')
export class ActivityController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly db: PrismaService,
	) {
		super(request)
	}

	@Get()
	@PermsGuard('ACTIVITY.VIEW')
	async paginate(
		@Query() {
			cursor,
			take,
			created0,
			created1,
			type,
			ip,
			sessionId,
		}: ActivityPaginateReqDto,
	): Promise<
		ICursorPagingData<
			Prisma.ActivityGetPayload<{ select: typeof activitySelect }>
		>
	> {
		const conditions: Prisma.ActivityWhereInput[] = [
			{
				created: {
					gte: new Date(created0),
					lte: new Date(created1),
				},
			},
		]

		const { currentUser } = this.getActivitySession(true)
		if (!currentUser.permissions.includes('ACTIVITY.VIEW_ALL')) {
			conditions.push({ createdById: currentUser.id })
		}
		if (ip) {
			conditions.push({ ip })
		}
		if (type) {
			conditions.push({
				type: {
					equals: type,
					mode: 'insensitive',
				},
			})
		}
		if (sessionId) {
			conditions.push({
				sessionId: {
					equals: sessionId,
					mode: 'insensitive',
				},
			})
		}

		const docs = await this.db.activity.findMany({
			select: activitySelect,
			where: { AND: conditions },
			take,
			orderBy: { created: 'desc' },
			cursor: cursor ? { id: cursor } : undefined,
			skip: cursor ? 1 : 0,
		})
		const hasNext = docs.length === take

		return {
			docs,
			hasNext,
			nextCursor: hasNext ? docs[docs.length - 1].id : undefined,
		}
	}
}
