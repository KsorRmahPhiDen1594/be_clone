import path from 'node:path'
import { copyFile, createReadStream, existsSync, mkdir } from 'fs-extra'
import {
	BadReqRErr,
	ENV,
	ERR_CODE,
	IContentType,
	IDownloadRes,
	IStorageBackend,
	env,
	esModule,
	token16,
} from '../../common'

export class FileStorageBackend implements IStorageBackend {
	private readonly imageDir: string

	constructor() {
		this.imageDir =
			env.NODE_ENV === ENV.PRODUCTION
				? '/data/images'
				: path.join(process.cwd(), 'tmp/images')
	}

	async upload(filePath: string, { ext }: IContentType): Promise<string> {
		await mkdir(this.imageDir, { recursive: true })

		const fileName = `${token16()}.${ext}`
		const destinationPath = path.join(this.imageDir, fileName)

		await copyFile(filePath, destinationPath)

		return fileName
	}

	async download(fileName: string): Promise<IDownloadRes> {
		const filePath = path.join(this.imageDir, fileName)
		if (!existsSync(filePath)) {
			throw new BadReqRErr(ERR_CODE.INVALID_FILE)
		}

		const fileType = await esModule.fileType.fileTypeFromStream(
			createReadStream(filePath),
		)
		if (!fileType) {
			throw new BadReqRErr(ERR_CODE.INVALID_FILE)
		}

		return {
			content: createReadStream(filePath),
			contentType: fileType,
		}
	}
}
