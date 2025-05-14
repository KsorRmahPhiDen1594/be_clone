import { Controller, Get, Inject, Param, Post, Query } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { Prisma } from '@prisma/client'
import {
	ACTIVITY_TYPE,
	ERR_CODE,
	ICursorPagingData,
	IReqApp,
	NotFoundErr,
	UnAuthErr,
} from '../common'
import { MySessionReqDto } from '../dto'
import { PermsGuard } from '../guard'
import { ActivityService, PrismaService, SessionService } from '../service'
import { ControllerBase } from './base.controller'

const sessionSelect = {
	id: true,
	created: true,
	ip: true,
	revoked: true,
	createdById: true,
	expired: true,
} satisfies Prisma.SessionSelect

@Controller('sessions')
export class SessionController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly db: PrismaService,
		private readonly activityService: ActivityService,
		private readonly sessionService: SessionService,
	) {
		super(request)
	}

	@PermsGuard('SESSION.VIEW')
	@Get()
	async mySessions(
		@Query() { created0, created1, revoked, ip, take, cursor }: MySessionReqDto,
	): Promise<
		ICursorPagingData<
			Prisma.SessionGetPayload<{ select: typeof sessionSelect }>
		>
	> {
		const { currentUser } = this.getActivitySession(true)
		const conditions: Prisma.SessionWhereInput[] = [
			{
				created: {
					gte: new Date(created0),
					lte: new Date(created1),
				},
			},
		]

		if (!currentUser.permissions.includes('SESSION.VIEW_ALL')) {
			conditions.push({ createdById: currentUser.id })
		}

		if (ip) {
			conditions.push({ ip })
		}

		if (revoked !== undefined) {
			conditions.push({ revoked })
		}

		const sessions = await this.db.session.findMany({
			select: sessionSelect,
			where: { AND: conditions },
			take,
			orderBy: { created: 'desc' },
			cursor: cursor ? { id: cursor } : undefined,
			skip: cursor ? 1 : 0,
		})
		const hasNext = sessions.length === take

		return {
			docs: sessions,
			hasNext,
			nextCursor: hasNext ? sessions[sessions.length - 1].id : undefined,
		}
	}

	@PermsGuard('SESSION.REVOKE')
	@Post('/:id/revoke')
	async revokeSession(@Param('id') sessionId: string): Promise<void> {
		const session = await this.db.session.findUnique({
			where: { id: sessionId },
			select: { createdById: true },
		})

		if (!session) {
			throw new NotFoundErr(ERR_CODE.SESSION_NOT_FOUND)
		}

		const ss = this.getActivitySession(true)
		if (
			!ss.currentUser.permissions.includes('SESSION.REVOKE_ALL') &&
			session.createdById !== ss.currentUser.id
		) {
			throw new UnAuthErr(ERR_CODE.PERMISSION_DENIED)
		}

		await Promise.all([
			this.sessionService.revoke(ss.currentUser.id, [sessionId]),
			this.activityService.create(
				ACTIVITY_TYPE.REVOKE_SESSION,
				{ sessionId },
				ss,
			),
		])
	}
}
