import { Body, Controller, Get, Inject, Param, Patch } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import { Setting } from '@prisma/client'
import { SettingCache } from '../cache'
import {
	ACTIVITY_TYPE,
	BadReqRErr,
	ERR_CODE,
	IReqApp,
	NotFoundErr,
	encrypt,
} from '../common'
import { UpdateSettingReqDto } from '../dto'
import { PermsGuard, Public } from '../guard'
import { ActivityService, PrismaService, SettingService } from '../service'
import { ControllerBase } from './base.controller'

@Controller('settings')
export class SettingController extends ControllerBase {
	constructor(
		@Inject(REQUEST) request: IReqApp,
		private readonly db: PrismaService,
		private readonly settingService: SettingService,
		private readonly activityService: ActivityService,
		private readonly settingCache: SettingCache,
	) {
		super(request)
	}

	@Get()
	@Public()
	async getAll(): Promise<Setting[]> {
		const settings = await this.db.setting.findMany()
		return settings.map(s => ({
			...s,
			value: s.isSecret && s.value ? '********' : s.value,
		}))
	}

	@PermsGuard('SETTING.UPDATE')
	@Patch('/:id')
	async update(
		@Param('id') id: string,
		@Body() { value }: UpdateSettingReqDto,
	): Promise<void> {
		const setting = await this.db.setting.findUnique({
			where: { id },
			select: { type: true, key: true, isSecret: true },
		})
		if (!setting) {
			throw new NotFoundErr(ERR_CODE.SETTING_NOT_FOUND)
		}
		if (!this.settingService.checkValue(value, setting.type)) {
			throw new BadReqRErr(ERR_CODE.INVALID_SETTING_VALUE)
		}

		await this.db.$transaction([
			this.db.setting.update({
				where: { id },
				data: { value: setting.isSecret ? encrypt(value) : value },
				select: { key: true },
			}),
			this.activityService.create(
				ACTIVITY_TYPE.UPDATE_SETTING,
				{ key: setting.key, value: setting.isSecret ? '********' : value },
				this.getActivitySession(true),
			),
		])
		await this.settingCache.del(setting.key)
	}
}
