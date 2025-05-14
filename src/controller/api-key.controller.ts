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
import { API_KEY_TYPE, Prisma } from '@prisma/client'
import * as argon2 from 'argon2'
import {
	ACTIVITY_TYPE,
	ERR_CODE,
	IPagingData,
	IReqApp,
	NotFoundErr,
	env,
	token12,
	token16,
	token32,
} from '../common'
import { IdDto, IdsDto, PaginationReqDto, UpsertApiKeyDto } from '../dto'
import { PermsGuard } from '../guard'
import { ActivityService, PrismaService } from '../service'
import { ControllerBase } from './base.controller'

const apikeySelect = {
	id: true,
	type: true,
	name: true,
	key: true,
	enabled: true,
	startDate: true,
	endDate: true,
	created: true,
	user: { select: { username: true } },
} satisfies Prisma.ApiKeySelect

@Controller('api-keys')
export class ApiKeyController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly db: PrismaService,
		private readonly activityService: ActivityService,
	) {
		super(request)
	}

	@Get()
	@PermsGuard('API_KEY.VIEW')
	async paginate(
		@Query() { take, skip }: PaginationReqDto,
	): Promise<
		IPagingData<Prisma.ApiKeyGetPayload<{ select: typeof apikeySelect }>>
	> {
		const { currentUser } = this.getActivitySession(true)
		let where: Prisma.ApiKeyWhereInput = {}
		if (!currentUser.permissions.includes('API_KEY.VIEW_ALL')) {
			where = { userId: currentUser.id }
		}
		const [docs, count] = await Promise.all([
			this.db.apiKey.findMany({
				where,
				take,
				skip,
				select: apikeySelect,
			}),
			this.db.apiKey.count(),
		])

		return { docs, count }
	}

	@PermsGuard('API_KEY.UPDATE')
	@Post()
	async upsert(
		@Body() { name, startDate, enabled, endDate, id }: UpsertApiKeyDto,
	): Promise<{ secret: string; key: string } | undefined> {
		const session = this.getActivitySession(true)
		if (!id) {
			const key = token16(env.NODE_ENV)
			const secret = token32().toUpperCase()
			const hash = await argon2.hash(secret, {
				type: argon2.argon2id,
			})
			await this.db.$transaction(async tx => {
				const newKey = await tx.apiKey.create({
					data: {
						id: token12(),
						name,
						startDate,
						endDate,
						key,
						hash,
						enabled,
						type: API_KEY_TYPE.PUBLIC,
						userId: session.currentUser.id,
					},
					select: { id: true },
				})
				this.activityService.create(
					ACTIVITY_TYPE.CREATE_API_KEY,
					{ id: newKey.id },
					session,
					tx,
				)
			})
			return { secret, key }
		}
		await this.db.$transaction([
			this.db.apiKey.update({
				where: { id },
				data: {
					name,
					startDate,
					endDate,
					enabled,
				},
				select: { id: true },
			}),
			this.activityService.create(
				ACTIVITY_TYPE.UPDATE_API_KEY,
				{ id },
				session,
			),
		])
	}

	@PermsGuard('API_KEY.UPDATE')
	@Post('reset/:id')
	async reset(
		@Param() { id }: IdDto,
	): Promise<{ secret: string; key: string }> {
		const apiKey = await this.db.apiKey.findFirst({ where: { id } })
		if (!apiKey) {
			throw new NotFoundErr(ERR_CODE.API_KEY_NOT_FOUND)
		}
		const secret = token32().toUpperCase()
		const hash = await argon2.hash(secret, {
			type: argon2.argon2id,
		})
		await this.db.$transaction([
			this.db.apiKey.update({
				where: { id },
				data: { hash },
				select: { id: true },
			}),
			this.activityService.create(
				ACTIVITY_TYPE.UPDATE_API_KEY,
				{ id },
				this.getActivitySession(true),
			),
		])
		return { secret, key: apiKey.key }
	}

	@PermsGuard('API_KEY.DELETE')
	@Post('del')
	async del(@Body() { ids }: IdsDto): Promise<void> {
		await this.db.$transaction([
			this.db.apiKey.deleteMany({ where: { id: { in: ids } } }),
			this.activityService.create(
				ACTIVITY_TYPE.DEL_API_KEY,
				{ apiKeyIds: ids },
				this.getActivitySession(true),
			),
		])
	}
}
