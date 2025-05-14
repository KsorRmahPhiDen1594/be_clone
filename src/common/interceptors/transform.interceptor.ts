import fs from 'node:fs'
import { isRabbitContext } from '@golevelup/nestjs-rabbitmq'
import {
	CallHandler,
	ExecutionContext,
	NestInterceptor,
	StreamableFile,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { RES_CODE } from '../../common'

export class TransformInterceptor implements NestInterceptor {
	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const request = context.switchToHttp().getRequest()

		if (isRabbitContext(context)) {
			return next.handle()
		}
		const acceptHeader = request.get('accept')

		return next.handle().pipe(
			map(data =>
				data instanceof StreamableFile ||
				data instanceof fs.ReadStream ||
				acceptHeader === 'text/event-stream'
					? data
					: {
							code: RES_CODE.SUCCESS,
							data,
							t: new Date(),
						},
			),
		)
	}
}
