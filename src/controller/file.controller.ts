import {
	Controller,
	Get,
	Logger,
	Param,
	StreamableFile,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { IStorageBackend, SETTING } from '../common'
import { PermsGuard, Public } from '../guard'
import {
	FileStorageBackend,
	S3StorageBackend,
	SettingService,
} from '../service'

@Controller('files')
export class FileController {
	private readonly logger = new Logger(FileController.name)
	constructor(private readonly settingService: SettingService) {}

	private storageBackend: IStorageBackend | null = null
	private storageBackendInitPromise: Promise<IStorageBackend> | null = null
	private lastInitAttemptTime = 0
	private readonly RETRY_INTERVAL = 60_000

	private async initializeStorageBackend(
		forceRetry = false,
	): Promise<IStorageBackend> {
		if (
			this.storageBackend &&
			!(this.storageBackend instanceof FileStorageBackend) &&
			!forceRetry
		) {
			return this.storageBackend
		}

		const now = Date.now()
		if (
			forceRetry ||
			(this.storageBackend instanceof FileStorageBackend &&
				now - this.lastInitAttemptTime > this.RETRY_INTERVAL)
		) {
			this.storageBackend = null
		}
		if (this.storageBackendInitPromise) {
			return this.storageBackendInitPromise
		}

		this.storageBackendInitPromise = (async () => {
			try {
				this.lastInitAttemptTime = now

				const [endpoint, accessKey, secretKey, bucket, region] =
					await Promise.all([
						this.settingService.getOrThrow<string>(SETTING.S3_ENDPOINT),
						this.settingService.getOrThrow<string>(SETTING.S3_ACCESS_KEY),
						this.settingService.getOrThrow<string>(SETTING.S3_SECRET_KEY),
						this.settingService.getOrThrow<string>(SETTING.S3_BUCKET),
						this.settingService.getOrThrow<string>(SETTING.S3_REGION),
					])

				this.storageBackend = new S3StorageBackend({
					endpoint,
					accessKey,
					secretKey,
					bucket,
					region,
				})
				this.logger.log('S3 initialized successfully')
				return this.storageBackend
			} catch (e) {
				this.logger.error(`S3 initialization failed: ${e}`)
				if (!this.storageBackend) {
					this.logger.log('Falling back to FileStorage')
					this.storageBackend = new FileStorageBackend()
				}
				return this.storageBackend
			} finally {
				this.storageBackendInitPromise = null
			}
		})()

		return this.storageBackendInitPromise
	}

	@UseInterceptors(FileInterceptor('file'))
	@PermsGuard('FILE.UPLOAD')
	@Get('image-upload')
	async upload(
		@UploadedFile() file: Express.Multer.File,
	): Promise<{ url: string }> {
		const storageBackend = await this.initializeStorageBackend()
		const fileName = await storageBackend.upload(file.path, {
			mime: file.mimetype,
			ext: file.originalname.split('.').pop() ?? '',
		})
		return {
			url: `/api/file/${fileName}`,
		}
	}

	@Public()
	@Get('retry-s3')
	async retryS3(): Promise<{ status: string }> {
		await this.initializeStorageBackend(true)
		return { status: 'Retry initiated' }
	}

	@Public()
	@Get('/:filename')
	async file(@Param('filename') fileName: string): Promise<StreamableFile> {
		const storageBackend = await this.initializeStorageBackend()
		const { content, contentType } = await storageBackend.download(fileName)

		return new StreamableFile(content, {
			type: contentType.mime,
			disposition: `attachment; filename="${fileName}"`,
		})
	}
}
