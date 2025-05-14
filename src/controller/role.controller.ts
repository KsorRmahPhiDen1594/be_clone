import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { Prisma } from '@prisma/client'
import {
	ACTIVITY_TYPE,
	CoreErr,
	ERR_CODE,
	IPagingData,
	IReqApp,
	UnAuthErr,
	defaultRoles,
	token12,
} from '../common'
import { IdsDto, RolePagingDto, UpsertRoleReqDto } from '../dto'
import { PermsGuard } from '../guard'
import { ActivityService, PrismaService } from '../service'
import { ControllerBase } from './base.controller'

@Controller('roles')
export class RoleController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly db: PrismaService,
		private readonly activityService: ActivityService,
	) {
		super(request)
	}

	@Get()
	@PermsGuard('ROLE.VIEW')
	async paginate(
		@Query() { userId, skip, title, take }: RolePagingDto,
	): Promise<
		IPagingData<{
			id: string
			title: string
			description: string | null
			permissionIds: string[]
			players: { username: string }[]
		}>
	> {
		const where: Prisma.RoleWhereInput = {}

		if (userId) {
			where.players = { some: { player: { id: userId } } }
		}
		if (title) {
			where.title = { contains: title }
		}

		const [roles, count] = await Promise.all([
			this.db.role.findMany({
				where,
				take,
				skip,
				select: {
					id: true,
					title: true,
					description: true,
					permissions: { select: { permissionId: true } },
					players: { select: { player: { select: { username: true } } } },
				},
			}),
			this.db.role.count({ where }),
		])

		return {
			docs: roles.map(role => ({
				id: role.id,
				title: role.title,
				description: role.description,
				permissionIds: role.permissions.map(p => p.permissionId),
				players: role.players.map(p => p.player),
			})),
			count,
		}
	}

	@Post()
	@PermsGuard('ROLE.UPDATE')
	async upsert(
		@Body() {
			id,
			description,
			title,
			permissionIds,
			playerIds,
		}: UpsertRoleReqDto,
	): Promise<void> {
		if (id) {
			if (id === defaultRoles.administrator.id) {
				throw new CoreErr(ERR_CODE.PERMISSION_DENIED)
			}

			await this.db.$transaction([
				this.db.role.update({
					where: { id },
					data: {
						description,
						title,
						permissions: {
							deleteMany: {
								roleId: id,
								permissionId: { notIn: permissionIds },
							},
							createMany: {
								skipDuplicates: true,
								data: permissionIds.map(permId => ({
									id: token12(),
									permissionId: permId,
								})),
							},
						},
						players: {
							deleteMany: {
								roleId: id,
								playerId: { notIn: playerIds },
							},
							createMany: {
								skipDuplicates: true,
								data: playerIds.map(playerId => ({
									id: token12(),
									playerId,
								})),
							},
						},
					},
					select: { id: true },
				}),
				this.activityService.create(
					ACTIVITY_TYPE.UPDATE_ROLE,
					{ id, description, title, permissionIds, playerIds },
					this.getActivitySession(true),
				),
			])
		} else {
			await this.db.$transaction(async tx => {
				const newRole = await tx.role.create({
					data: {
						id: token12(),
						description,
						title,
						permissions: {
							createMany: {
								data: permissionIds.map(permId => ({
									id: token12(),
									permissionId: permId,
								})),
							},
						},
						players: {
							createMany: {
								data: playerIds.map(playerId => ({
									id: token12(),
									playerId,
								})),
							},
						},
					},
					select: { id: true },
				})

				await this.activityService.create(
					ACTIVITY_TYPE.CREATE_ROLE,
					{ id: newRole.id, description, title, permissionIds, playerIds },
					this.getActivitySession(true),
					tx,
				)
			})
		}
	}

	@PermsGuard('ROLE.DELETE')
	@Post('del')
	async del(@Body() { ids }: IdsDto): Promise<void> {
		const existUserRole = await this.db.rolePlayer.findFirst({
			where: { roleId: { in: ids } },
		})
		if (existUserRole) {
			throw new UnAuthErr(ERR_CODE.PERMISSION_DENIED)
		}

		await this.db.$transaction([
			this.db.role.deleteMany({ where: { id: { in: ids } } }),
			this.activityService.create(
				ACTIVITY_TYPE.DEL_ROLE,
				{ roleIds: ids },
				this.getActivitySession(true),
			),
		])
	}
}
