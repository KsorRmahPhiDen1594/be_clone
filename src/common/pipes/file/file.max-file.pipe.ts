import { Injectable, PipeTransform, Scope } from '@nestjs/common'
import { BadReqRErr, ERR_CODE, FILE_MIME, IFile, env } from '../../../common'

// only for multiple upload
@Injectable({ scope: Scope.REQUEST })
export class FileMaxFilesPipe implements PipeTransform {
	transform(value: IFile[]): IFile[] {
		if (!value) {
			return value
		}
		this.validate(value)
		return value
	}

	validate(value: IFile[]): void {
		if (!value.length) {
			return
		}
		let maxFiles: number

		const mimetype = value[0].mimetype.toLowerCase()
		switch (mimetype) {
			case FILE_MIME.CSV:
			case FILE_MIME.XLSX:
				maxFiles = env.FILE_EXCEL_MAX_FILES
				break

			case FILE_MIME.JPG:
			case FILE_MIME.JPEG:
			case FILE_MIME.PNG:
				maxFiles = env.FILE_IMAGE_MAX_FILES
				break

			case FILE_MIME.PDF:
				maxFiles = env.FILE_DOC_MAX_FILES
				break

			case FILE_MIME.MPEG:
			case FILE_MIME.MP3:
			case FILE_MIME.M4A:
				maxFiles = env.FILE_AUDIO_MAX_FILES
				break

			case FILE_MIME.MP4:
				maxFiles = env.FILE_VIDEO_MAX_FILES
				break

			default:
				maxFiles = 1
				break
		}

		if (value.length > maxFiles) {
			throw new BadReqRErr(ERR_CODE.FILE_RICH_MAX_FILE, {
				stack: { files: maxFiles },
			})
		}
	}
}
