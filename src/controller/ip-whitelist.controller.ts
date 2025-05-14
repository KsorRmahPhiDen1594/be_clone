import { Body, Controller, Get, Inject, Post } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { IPWhitelist } from '@prisma/client'
import { IpWhitelistCache } from '../cache'
import { ACTIVITY_TYPE, IReqApp, token12 } from '../common'
import { CreateIpWhitelistReq, IdsDto } from '../dto'
import { PermsGuard } from '../guard'
import { ActivityService, PrismaService } from '../service'
import { ControllerBase } from './base.controller'

@Controller('ipwhitelist')
export class IpWhitelistController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly activityService: ActivityService,
		private readonly db: PrismaService,
		private readonly ipWhitelistCache: IpWhitelistCache,
	) {
		super(request)
	}

	@PermsGuard('IPWHITELIST.VIEW')
	@Get()
	paginate(): Promise<IPWhitelist[]> {
		return this.db.iPWhitelist.findMany()
	}

	@PermsGuard('IPWHITELIST.CREATE')
	@Post()
	async create(@Body() body: CreateIpWhitelistReq): Promise<void> {
		await this.db.$transaction([
			this.db.iPWhitelist.create({
				data: { id: token12(), ...body },
				select: { id: true },
			}),
			this.activityService.create(
				ACTIVITY_TYPE.CREATE_IP_WHITELIST,
				body,
				this.getActivitySession(true),
			),
		])
		await this.ipWhitelistCache.del('IPS')
	}

	@PermsGuard('IPWHITELIST.DELETE')
	@Post('del')
	async del(@Body() { ids }: IdsDto): Promise<void> {
		const ips = await this.db.iPWhitelist.findMany({
			where: { id: { in: ids } },
		})
		await this.db.$transaction([
			this.db.iPWhitelist.deleteMany({ where: { id: { in: ids } } }),
			this.activityService.create(
				ACTIVITY_TYPE.DEL_IP_WHITELIST,
				{ ips: ips.map(x => x.ip) },
				this.getActivitySession(true),
			),
		])
		await this.ipWhitelistCache.del('IPS')
	}
}
