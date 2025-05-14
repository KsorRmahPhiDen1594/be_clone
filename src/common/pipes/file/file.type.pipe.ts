import { Injectable, PipeTransform } from '@nestjs/common'
import { BadReqRErr, ERR_CODE, FILE_MIME, IFile } from '../../../common'

@Injectable()
export class FileTypePipe implements PipeTransform {
	constructor(
		readonly type: FILE_MIME[],
		readonly field?: string,
	) {}

	transform(value: any): IFile | IFile[] {
		if (!value) {
			return value
		}

		let fieldValue = value
		if (this.field) {
			fieldValue = value[this.field]
		}

		if (
			!fieldValue ||
			Object.keys(fieldValue).length === 0 ||
			(Array.isArray(fieldValue) && fieldValue.length === 0)
		) {
			return value
		}

		if (Array.isArray(fieldValue)) {
			for (const val of fieldValue) {
				this.validate(val.mimetype)
			}

			return value
		}

		const file: IFile = fieldValue as IFile
		this.validate(file.mimetype)

		return value
	}

	validate(mimetype: string): void {
		if (!this.type.find(val => val === mimetype.toLowerCase())) {
			throw new BadReqRErr(ERR_CODE.INVALID_FILE, {
				stack: { type: this.type.join(', ') },
			})
		}

		return
	}
}
