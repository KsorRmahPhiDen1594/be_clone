import { Injectable, PipeTransform, Scope } from '@nestjs/common'
import {
	BadReqRErr,
	ERR_CODE,
	FILE_MIME,
	IFile,
	env,
	parseBytes,
} from '../../../common'

@Injectable({ scope: Scope.REQUEST })
export class FileSizePipe implements PipeTransform {
	transform(value: IFile | IFile[]): IFile | IFile[] {
		if (!value) {
			return []
		}

		if (Array.isArray(value)) {
			for (const val of value) {
				this.validate(val)
			}

			return value
		}

		const file: IFile = value as IFile
		this.validate(file)

		return value
	}

	validate(file: IFile): void {
		let maxSize: string

		const mimetype = file.mimetype.toLowerCase()
		switch (mimetype) {
			case FILE_MIME.CSV:
			case FILE_MIME.XLSX:
				maxSize = env.FILE_EXCEL_MAX_SIZE
				break

			case FILE_MIME.JPG:
			case FILE_MIME.JPEG:
			case FILE_MIME.PNG:
				maxSize = env.FILE_IMAGE_MAX_SIZE
				break

			case FILE_MIME.PDF:
				maxSize = env.FILE_DOC_MAX_SIZE
				break

			case FILE_MIME.MPEG:
			case FILE_MIME.MP3:
			case FILE_MIME.M4A:
				maxSize = env.FILE_AUDIO_MAX_SIZE
				break

			case FILE_MIME.MP4:
				maxSize = env.FILE_VIDEO_MAX_SIZE
				break

			default:
				maxSize = '10MB'
				break
		}

		if (file.size > (parseBytes(maxSize) ?? 0)) {
			throw new BadReqRErr(ERR_CODE.FILE_TOO_LARGE, {
				stack: { size: maxSize },
			})
		}

		return
	}
}
