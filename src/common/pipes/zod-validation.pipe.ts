import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common'
import { ZodSchema } from 'zod'
import { BadReqRErr, ERR_CODE } from '../../common'

@Injectable()
export class ZodValidationPipe implements PipeTransform {
	transform(value: unknown, metadata: ArgumentMetadata): unknown {
		const { metatype } = metadata
		if (metatype && (metatype as any).schema) {
			const schema: ZodSchema = (metatype as any).schema
			const result = schema.safeParse(value)
			if (result.success) {
				return result.data
			}
			throw new BadReqRErr(ERR_CODE.VALIDATION_ERROR, {
				stack: result.error.issues,
			})
		}
		return value
	}
}
