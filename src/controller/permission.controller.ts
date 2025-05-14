import { Controller, Get, Query } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PermissionPagingDto } from '../dto'
import { Public } from '../guard'
import { PrismaService } from '../service'

@Controller('permissions')
@Public()
export class PermissionController {
	constructor(private readonly db: PrismaService) {}

	@Get()
	paginate(@Query() { roleId }: PermissionPagingDto) {
		const where: Prisma.PermissionWhereInput = roleId
			? { roles: { some: { roleId } } }
			: {}
		return this.db.permission.findMany({
			where,
			orderBy: { title: 'desc' },
		})
	}
}
