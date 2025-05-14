import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { Prisma, ProxyProtocol } from '@prisma/client'
import { omit } from 'lodash'
import {
	ACTIVITY_TYPE,
	BadReqRErr,
	ERR_CODE,
	IPagingData,
	IReqApp,
	NotFoundErr,
	encrypt,
	proxySelect,
	token12,
} from '../common'
import {
	BatchAddProxyDto,
	IdsDto,
	PaginationReqDto,
	UpsertProxyDto,
} from '../dto'
import { PermsGuard } from '../guard'
import { ActivityService, PrismaService, ProxyService } from '../service'
import { ControllerBase } from './base.controller'

@Controller('proxies')
export class ProxyController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly db: PrismaService,
		private readonly proxyService: ProxyService,
		private readonly activityService: ActivityService,
	) {
		super(request)
	}

	@Post('batch')
	@PermsGuard('PROXY.UPSERT')
	async batch(@Body() body: BatchAddProxyDto): Promise<void> {
		const proxyDataList = body.proxies.map(proxyString => {
			const match = proxyString.match(
				/^(http|https|socks5|socks4):\/\/([a-zA-Z0-9._%+-]+):([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+):(\d+)$/,
			)
			if (!match) {
				throw new Error(`Invalid proxy format: ${proxyString}`)
			}
			const [_, protocol, username, password, host, port] = match
			return {
				id: token12(),
				protocol: protocol.toUpperCase() as ProxyProtocol,
				password: encrypt(password),
				username,
				host,
				port: Number(port),
				enabled: true,
			}
		})
		await this.db.proxy.createMany({
			data: proxyDataList,
			skipDuplicates: true,
		})
		await this.proxyService.refreshProxies()
	}

	@Get()
	@PermsGuard('PROXY.VIEW')
	async paginate(
		@Query() { skip, take }: PaginationReqDto,
	): Promise<
		IPagingData<Prisma.ProxyGetPayload<{ select: typeof proxySelect }>>
	> {
		const [docs, count] = await Promise.all([
			this.db.proxy.findMany({
				select: proxySelect,
				skip,
				take,
			}),
			this.db.proxy.count(),
		])
		return { docs, count }
	}

	@Post()
	@PermsGuard('PROXY.UPSERT')
	async upsert(
		@Body() { id, password, ...data }: UpsertProxyDto,
	): Promise<void> {
		if (id) {
			const existingProxy = await this.db.proxy.findUnique({
				where: { id },
				select: { password: true },
			})
			if (!existingProxy) {
				throw new NotFoundErr(ERR_CODE.PROXY_NOT_FOUND)
			}
			await this.db.$transaction([
				this.db.proxy.update({
					where: { id },
					data: {
						...data,
						password: password ? encrypt(password) : existingProxy.password,
					},
					select: { id: true },
				}),
				this.activityService.create(
					ACTIVITY_TYPE.UPDATE_PROXY,
					{ id, ...omit(data, 'password') },
					this.getActivitySession(true),
				),
			])
		} else {
			if (!password) {
				throw new BadReqRErr(ERR_CODE.VALIDATION_ERROR)
			}
			await this.db.$transaction(async tx => {
				const newProxy = await tx.proxy.create({
					data: {
						id: token12(),
						...data,
						password: encrypt(password),
					},
					select: { id: true },
				})
				this.activityService.create(
					ACTIVITY_TYPE.CREATE_PROXY,
					{ id: newProxy.id, ...omit(data, 'password') },
					this.getActivitySession(true),
					tx,
				)
			})
		}
		await this.proxyService.refreshProxies()
	}

	@PermsGuard('PROXY.DELETE')
	@Post('del')
	async del(@Body() { ids }: IdsDto): Promise<void> {
		const proxies = await this.db.proxy.findMany({
			where: { id: { in: ids } },
			select: { id: true, host: true, port: true, protocol: true },
		})
		await this.db.$transaction([
			this.db.role.deleteMany({ where: { id: { in: ids } } }),
			this.activityService.create(
				ACTIVITY_TYPE.DEL_PROXY,
				{ proxies },
				this.getActivitySession(true),
			),
		])
	}
}
