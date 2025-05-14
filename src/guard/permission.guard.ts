import {
	CanActivate,
	ExecutionContext,
	Injectable,
	Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
	ERR_CODE,
	IReqApp,
	METADATA_KEY,
	UPermission,
	UnAuthErr,
	getRealIp,
} from '../common'

@Injectable()
export class PermissionGuard implements CanActivate {
	private readonly logger = new Logger(PermissionGuard.name)

	constructor(private readonly reflector: Reflector) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const requiredPermissions = this.reflector.getAllAndOverride<UPermission[]>(
			METADATA_KEY.PERMISSION,
			[context.getHandler(), context.getClass()],
		)
		if (!requiredPermissions || requiredPermissions.length === 0) {
			return true
		}

		const request = context.switchToHttp().getRequest<IReqApp>()
		const { user, url } = request
		if (
			user &&
			requiredPermissions.every(perm => user.permissions.includes(perm))
		) {
			return true
		}

		const clientIp = getRealIp(request)
		this.logger.log(
			user
				? `User ${user.username}@${clientIp} tried to access ${url} without sufficient permissions.`
				: `Anonymous user @${clientIp} tried to access ${url} without sufficient permissions.`,
		)
		throw new UnAuthErr(ERR_CODE.PERMISSION_DENIED)
	}
}
