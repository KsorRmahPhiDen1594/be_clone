import { Injectable, NestMiddleware } from '@nestjs/common'
import dayjs from 'dayjs'
import type { NextFunction, Request, Response } from 'express'
import { SettingService } from '../../service'
import { ERR_CODE } from '../app.constant'
import { CoreErr } from '../error'

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
	constructor(private readonly settingService: SettingService) {}
	async use(
		_request: Request,
		_response: Response,
		next: NextFunction,
	): Promise<void> {
		const maintenanceEndDate = await this.settingService.maintenanceEndDate
		if (maintenanceEndDate && dayjs(maintenanceEndDate).isAfter(dayjs())) {
			throw new CoreErr(ERR_CODE.SERVICE_UNAVAILABLE)
		}

		next()
	}
}
