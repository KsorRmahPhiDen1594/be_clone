import { CustomDecorator, SetMetadata, applyDecorators } from '@nestjs/common'
import { METADATA_KEY, UPermission } from '../common'

export const PermsGuard = (...permissions: UPermission[]): MethodDecorator =>
	applyDecorators(SetMetadata(METADATA_KEY.PERMISSION, permissions))

export const Public = (): CustomDecorator =>
	SetMetadata(METADATA_KEY.IS_PUBLIC_KEY, true)
