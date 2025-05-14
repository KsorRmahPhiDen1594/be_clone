import { Injectable } from '@nestjs/common'
import { uniq } from 'lodash'
import { UPermission } from '../common'
import { PrismaService } from './prisma.service'

@Injectable()
export class PermissionService {
	constructor(private readonly db: PrismaService) {}

	async getPermissions(user: { roles: { roleId: string }[] }): Promise<
		UPermission[]
	> {
		const permissions = await this.db.rolePermission.findMany({
			where: { roleId: { in: user.roles.map(x => x.roleId) } },
			select: { permission: { select: { title: true } } },
		})
		return uniq(permissions.map(x => x.permission.title)) as UPermission[]
	}
}
