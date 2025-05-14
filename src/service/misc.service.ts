import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { inRange, isIP, isPrivateIP, isRange } from 'range_check'
import { IpWhitelistCache } from '../cache'
import { token12 } from '../common'
import { PrismaService } from './prisma.service'
import { SettingService } from './setting.service'

@Injectable()
export class MiscService {
	private readonly logger = new Logger(MiscService.name)

	constructor(
		private readonly ipWhitelistCache: IpWhitelistCache,
		private readonly db: PrismaService,
		private readonly settingService: SettingService,
	) {}

	private canIPAccess(ip: string, whitelist: string[]): boolean {
		if (isPrivateIP(ip)) return true

		return whitelist.some(entry =>
			isRange(entry) ? inRange(ip, entry) : isIP(entry) && ip === entry,
		)
	}

	async createDefaultWhitelistIP(ip: string): Promise<string> {
		await this.db.iPWhitelist.create({
			data: { id: token12(), ip },
			select: { id: true },
		})
		return ip
	}

	async getWhitelistIPs(ip: string): Promise<string[]> {
		let whitelistIPs = await this.ipWhitelistCache.getCache('IPS')

		if (!whitelistIPs?.length) {
			const dbWhitelist = await this.db.iPWhitelist.findMany()
			whitelistIPs = dbWhitelist.map(entry => entry.ip)
			if (!whitelistIPs.length) {
				const defaultIP = await this.createDefaultWhitelistIP(ip)
				whitelistIPs = [defaultIP]
			}
			await this.ipWhitelistCache.setCache('IPS', whitelistIPs)
		}

		return whitelistIPs
	}

	async preflight(ip?: string): Promise<void> {
		if (!ip) throw new UnauthorizedException('exception.permission-denied')
		const enbIpWhitelist = await this.settingService.enbIpWhitelist
		if (isPrivateIP(ip) || !enbIpWhitelist) return
		const whitelistIPs = await this.getWhitelistIPs(ip)
		if (!this.canIPAccess(ip, whitelistIPs)) {
			this.logger.warn(
				`IP ${ip} preflight failed, whitelist IPs: ${whitelistIPs.join(', ')}`,
			)
			throw new UnauthorizedException('exception.permission-denied')
		}
	}
}
