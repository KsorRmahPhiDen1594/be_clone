import { Readable } from 'node:stream'
import {
	Body,
	Controller,
	Get,
	Post,
	Query,
	Res,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { I18n, Prisma } from '@prisma/client'
import { Response } from 'express'
import {
	BadReqRErr,
	ERR_CODE,
	FILE_MIME,
	IPagingData,
	exportExcel,
	readExcel,
	token12,
} from '../common'
import { FileRequiredPipe, FileSizePipe, FileTypePipe } from '../common/pipes'
import {
	I18nPaginationReqDto,
	I18nUpsertDto,
	IdsDto,
	i18nImportSchema,
} from '../dto'
import { PermsGuard, Public } from '../guard'
import { PrismaService } from '../service'

@Controller('i18n')
export class I18nController {
	constructor(private readonly db: PrismaService) {}

	@Public()
	@Get()
	async paginate(
		@Query() { skip, take, key }: I18nPaginationReqDto,
	): Promise<IPagingData<I18n>> {
		const where: Prisma.I18nWhereInput = key ? { key: { contains: key } } : {}
		const [docs, count] = await Promise.all([
			this.db.i18n.findMany({
				where,
				orderBy: { key: 'asc' },
				skip,
				take,
			}),
			this.db.i18n.count({ where: { key: { contains: key } } }),
		])

		return { docs, count }
	}

	@PermsGuard('I18N.UPDATE')
	@Post()
	async upsert(@Body() data: I18nUpsertDto): Promise<void> {
		const where: Prisma.I18nWhereInput[] = [{ key: data.key }]
		if (data.id) {
			where.push({ id: { not: data.id } })
		}
		const exist = await this.db.i18n.findFirst({
			where: { AND: where },
			select: { id: true },
		})
		if (exist) {
			throw new BadReqRErr(ERR_CODE.I18N_EXISTED)
		}

		if (data.id) {
			await this.db.i18n.update({
				where: { id: data.id },
				data,
				select: { id: true },
			})
		} else {
			await this.db.i18n.create({
				data: { ...data, id: token12() },
				select: { id: true },
			})
		}
	}

	@PermsGuard('I18N.DELETE')
	@Post('del')
	async del(@Body() { ids }: IdsDto): Promise<void> {
		await this.db.i18n.deleteMany({
			where: { id: { in: ids } },
		})
	}

	@PermsGuard('I18N.VIEW')
	@Get('export')
	async export(@Res() res: Response): Promise<void> {
		const translations = await this.db.i18n.findMany()
		res.set({
			'Content-Type': 'application/vnd.ms-excel',
			'Content-Disposition': `attachment; filename="i18n_${Date.now()}.xlsx"`,
		})
		await exportExcel(
			[
				{
					name: 'i18n',
					headers: Object.keys(i18nImportSchema.shape),
					data: Readable.from(
						translations.map(e => [e.key, e.en, e.zh, e.ko, e.vi]),
					),
				},
			],
			res,
		)
	}

	@PermsGuard('I18N.UPDATE')
	@UseInterceptors(FileInterceptor('file'))
	@Post('import')
	async import(
		@UploadedFile(
			FileRequiredPipe,
			new FileTypePipe([FILE_MIME.CSV, FILE_MIME.XLSX]),
			FileSizePipe,
		)
		file: Express.Multer.File,
	): Promise<void> {
		const headersMap: Record<number, string> = {}
		await readExcel(
			Readable.from(file.buffer),
			async ({ rowIndex, rowValues }) => {
				if (rowIndex === 1) {
					rowValues.forEach((value, index) => {
						headersMap[index] = value as string
					})
				} else {
					const rowData: Record<string, string> = {}
					rowValues.forEach((value, index) => {
						rowData[headersMap[index]] = value as string
					})
					const parsed = i18nImportSchema.safeParse(rowData)
					if (parsed.success) {
						await this.db.i18n.upsert({
							where: { key: parsed.data.key },
							create: {
								id: token12(),
								key: parsed.data.key,
								en: parsed.data.en,
								zh: parsed.data.zh,
								vi: parsed.data.vi,
								ko: parsed.data.ko,
							},
							update: {
								en: parsed.data.en,
								zh: parsed.data.zh,
								vi: parsed.data.vi,
								ko: parsed.data.ko,
							},
						})
					}
				}
			},
		)
	}
}
