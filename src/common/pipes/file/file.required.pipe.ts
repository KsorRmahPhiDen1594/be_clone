import { Injectable, PipeTransform } from '@nestjs/common'
import { BadReqRErr, ERR_CODE, IFile } from '../../../common'

@Injectable()
export class FileRequiredPipe implements PipeTransform {
	transform(value: IFile | IFile[]): IFile | IFile[] {
		this.validate(value)

		return value
	}

	validate(value: IFile | IFile[]): void {
		if (!value || (Array.isArray(value) && value.length === 0)) {
			throw new BadReqRErr(ERR_CODE.FILE_IS_REQUIRED)
		}
	}
}
