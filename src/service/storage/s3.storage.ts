import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'
import { createReadStream, createWriteStream } from 'fs-extra'
import {
	BadReqRErr,
	ERR_CODE,
	IContentType,
	IDownloadRes,
	IStorageBackend,
	NotFoundErr,
	S3Config,
	esModule,
	tempDir,
	token16,
} from '../../common'

export class S3StorageBackend implements IStorageBackend {
	private client: S3Client
	private configs: S3Config

	constructor(configs: S3Config) {
		this.configs = configs

		this.client = new S3Client({
			endpoint: this.configs.endpoint,
			credentials: {
				accessKeyId: this.configs.accessKey,
				secretAccessKey: this.configs.secretKey,
			},
			region: this.configs.region ?? 'default',
			forcePathStyle: true,
		})
	}

	async upload(filePath: string, options: IContentType): Promise<string> {
		const fileName = `${token16()}.${options.ext}`

		const putObjectCommand = new PutObjectCommand({
			Bucket: this.configs.bucket,
			Key: fileName,
			Body: createReadStream(filePath),
			ContentType: options.mime,
			Metadata: {
				name: Buffer.from(fileName).toString('hex'),
				ext: Buffer.from(options.ext).toString('hex'),
			},
		})

		await this.client.send(putObjectCommand)
		return fileName
	}

	async download(fileName: string): Promise<IDownloadRes> {
		const getObjectCommand = new GetObjectCommand({
			Bucket: this.configs.bucket,
			Key: fileName,
		})

		const response = await this.client.send(getObjectCommand)

		if (!response.Body) {
			throw new NotFoundErr(ERR_CODE.FILE_NOT_FOUND)
		}

		const tempFilePath = join(
			await tempDir(),
			`app/${this.configs.bucket}/${fileName}`,
		)
		await pipeline(
			[response.Body.transformToWebStream()],
			createWriteStream(tempFilePath),
		)

		const fileType = await esModule.fileType.fileTypeFromStream(
			createReadStream(tempFilePath),
		)
		if (!fileType) {
			throw new BadReqRErr(ERR_CODE.INVALID_FILE)
		}

		return {
			content: createReadStream(tempFilePath),
			contentType: fileType,
		}
	}
}
