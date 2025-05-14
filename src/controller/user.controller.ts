import {
	Body,
	Controller,
	Get,
	Inject,
	Param,
	Post,
	Query,
} from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { Prisma } from '@prisma/client'
import { isNil } from 'lodash'
import { CurrentUserCache } from '../cache'
import {
	ACTIVITY_TYPE,
	ADMIN_USER_ID,
	BadReqRErr,
	ERR_CODE,
	IPagingData,
	IReqApp,
	NotFoundErr,
	SYS_USER_ID,
	UnAuthErr,
	createPassword,
	token12,
} from '../common'
import {
	IdDto,
	UserPaginateDto,
	UserUpdateRoleDto,
	UserUpsertReqDto,
} from '../dto'
import { PermsGuard } from '../guard'
import { ActivityService, PrismaService } from '../service'
import { ControllerBase } from './base.controller'

@Controller('users')
export class UserController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly db: PrismaService,
		private readonly activityService: ActivityService,
		private readonly currentUserCache: CurrentUserCache,
	) {
		super(request)
	}

	@PermsGuard('USER.VIEW')
	@Get()
	async paginate(
		@Query() {
			skip,
			take,
			created1,
			created0,
			mfaTelegramEnabled,
			mfaTotpEnabled,
			username,
			roleIds,
			enabled,
		}: UserPaginateDto,
	): Promise<
		IPagingData<{
			id: string
			username: string
			enabled: boolean
			created: Date
			modified: Date
		}>
	> {
		const where: Prisma.UserWhereInput[] = [
			{ created: { gte: created0, lte: created1 } },
			{ id: { not: SYS_USER_ID } },
		]
		if (!isNil(enabled)) {
			where.push({ enabled: enabled })
		}
		if (username) {
			where.push({ username: { contains: username } })
		}
		if (!isNil(mfaTelegramEnabled)) {
			where.push({ mfaTelegramEnabled: mfaTelegramEnabled })
		}
		if (!isNil(mfaTotpEnabled)) {
			where.push({ mfaTotpEnabled: mfaTotpEnabled })
		}
		if (roleIds?.length) {
			where.push({ roles: { some: { roleId: { in: roleIds } } } })
		}
		const [users, count] = await Promise.all([
			this.db.user.findMany({
				where: { AND: where },
				take,
				skip,
				select: {
					id: true,
					enabled: true,
					created: true,
					username: true,
					modified: true,
					mfaTelegramEnabled: true,
					mfaTotpEnabled: true,
					sessions: {
						take: 1,
						orderBy: { created: 'desc' },
						select: { created: true },
					},
					roles: { select: { role: { select: { id: true, title: true } } } },
				},
			}),
			this.db.user.count(),
		])
		return {
			docs: users.map(({ roles, ...user }) => ({
				...user,
				roles: roles.map(r => r.role),
			})),
			count,
		}
	}

	@PermsGuard('USER.VIEW')
	@Get('/:id')
	async getById(@Param() { id }: IdDto): Promise<{
		id: string
		username: string
		enabled: boolean
		created: Date
		modified: Date
		sessions: { created: Date }[]
	}> {
		const user = await this.db.user.findUnique({
			where: { id },
			select: {
				id: true,
				enabled: true,
				created: true,
				username: true,
				modified: true,
				sessions: {
					take: 1,
					orderBy: { created: 'desc' },
					select: { created: true },
				},
			},
		})
		if (!user) {
			throw new NotFoundErr(ERR_CODE.ITEM_NOT_FOUND)
		}
		return user
	}

	@Post()
	@PermsGuard('USER.UPDATE')
	async upsert(
		@Body() { id, username, enabled, roleIds, password }: UserUpsertReqDto,
	): Promise<void> {
		if (id) {
			if (id === ADMIN_USER_ID) {
				throw new UnAuthErr(ERR_CODE.PERMISSION_DENIED)
			}

			const data: Prisma.UserUpdateInput = {
				username,
				enabled,
				roles: {
					deleteMany: {
						playerId: id,
						roleId: { notIn: roleIds },
					},
					createMany: {
						skipDuplicates: true,
						data: roleIds.map(roleId => ({
							roleId,
							id: token12(),
						})),
					},
				},
			}

			if (password) {
				const p = await createPassword(password)
				data.password = p.password
				data.passwordCreated = p.passwordCreated
				data.passwordExpired = p.passwordExpired
				data.passwordAttempt = p.passwordAttempt
			}

			await this.db.$transaction([
				this.db.user.update({
					where: { id },
					data,
					select: { id: true },
				}),
				this.activityService.create(
					ACTIVITY_TYPE.UPDATE_USER,
					{ id, enabled, roleIds, username },
					this.getActivitySession(true),
				),
			])
			await this.currentUserCache.del(id)
		} else {
			if (!password) {
				throw new BadReqRErr(ERR_CODE.VALIDATION_ERROR)
			}

			await this.db.$transaction(async tx => {
				const newUser = await tx.user.create({
					data: {
						id: token12(),
						username,
						enabled,
						...(await createPassword(password)),
						roles: {
							createMany: {
								data: roleIds.map(roleId => ({
									roleId,
									id: token12(),
								})),
							},
						},
					},
					select: { id: true },
				})
				await this.activityService.create(
					ACTIVITY_TYPE.CREATE_USER,
					{ id: newUser.id, enabled, roleIds, username },
					this.getActivitySession(true),
					tx,
				)
			})
		}
	}

	@Post('role')
	@PermsGuard('USER.UPDATE')
	async updateRoles(
		@Body() { playerId, roleIds }: UserUpdateRoleDto,
	): Promise<void> {
		if (ADMIN_USER_ID === playerId) {
			throw new UnAuthErr(ERR_CODE.PERMISSION_DENIED)
		}
		await this.db.$transaction([
			this.db.rolePlayer.deleteMany({
				where: {
					playerId,
					roleId: { notIn: roleIds },
				},
			}),
			this.db.rolePlayer.createMany({
				data: roleIds.map(roleId => ({
					id: token12(),
					playerId,
					roleId,
				})),
				skipDuplicates: true,
			}),
			this.activityService.create(
				ACTIVITY_TYPE.UPDATE_USER,
				{ id: playerId, roleIds },
				this.getActivitySession(true),
			),
		])
	}
}
