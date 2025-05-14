import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import process from 'node:process'
import { Readable, Writable } from 'node:stream'
import { INestApplication, Logger } from '@nestjs/common'
import { init } from '@paralleldrive/cuid2'
import { Prisma, Proxy, ProxyProtocol } from '@prisma/client'
import * as argon2 from 'argon2'
import dayjs from 'dayjs'
import duration, { Duration } from 'dayjs/plugin/duration'
import ExcelJS from 'exceljs'
import { Request } from 'express'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { seconds } from 'itty-time'
import { compact, isNaN } from 'lodash'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { z } from 'zod'
import { TF_TYPE } from '../app.constant'
import { env } from '../env'

dayjs.extend(duration)

// region token

const i12 = init({ length: 12 })
const i16 = init({ length: 16 })
const i24 = init({ length: 24 })
const i32 = init({ length: 32 })
const i64 = init({ length: 64 })

export const token12 = (prefix = ''): string =>
	prefix.length ? `${prefix}_${i12()}` : i12()

export const token16 = (prefix = ''): string =>
	prefix.length ? `${prefix}_${i16()}` : i16()

export const token24 = (prefix = ''): string =>
	prefix.length ? `${prefix}_${i24()}` : i24()

export const token32 = (prefix = ''): string =>
	prefix.length ? `${prefix}_${i32()}` : i32()

export const token64 = (prefix = ''): string =>
	prefix.length ? `${prefix}_${i64()}` : i64()

export const extractTokenFromHeader = (
	reqToken?: string,
): string | undefined => {
	const [type, token] = reqToken?.split(' ') ?? []
	return type === 'Bearer' ? token : undefined
}

const algorithm = 'aes-256-cbc'
const ivHex = '170db75102f33d94d5cd1192521b57e0'
export const encrypt = (data: unknown): string => {
	const key = Buffer.from(env.AES_KEY, 'hex')
	const iv = Buffer.from(ivHex, 'hex')
	const cipher = crypto.createCipheriv(algorithm, key, iv)
	return (
		cipher.update(JSON.stringify(data), 'utf8', 'hex') + cipher.final('hex')
	)
}

export const decrypt = <T>(encrypted: string): T => {
	const key = Buffer.from(env.AES_KEY, 'hex')
	const iv = Buffer.from(ivHex, 'hex')
	const decipher = crypto.createDecipheriv(algorithm, key, iv)
	const decrypted =
		decipher.update(encrypted, 'hex', 'utf-8') + decipher.final('utf8')
	return JSON.parse(decrypted)
}

// region datetime
export const isExpired = (
	expired: dayjs.Dayjs | number | Date,
	tolerance?: Duration,
): boolean => (tolerance ? dayjs().add(tolerance) : dayjs()).isAfter(expired)

export const isValidJsonDateTime = (dateStr: string): boolean => {
	const date = new Date(dateStr)
	return !isNaN(date.getTime()) && dateStr.includes('T')
}

export const generateTimeFrame = (
	from: Date,
	to: Date,
	frameType: TF_TYPE,
): { date0: Date; date1: Date }[] => {
	let frames: { date0: Date; date1: Date }[] = []

	if (frameType === TF_TYPE.DAY) {
		const days = Math.ceil(dayjs.duration(dayjs(to).diff(from)).asDays())
		frames = Array.from({ length: days }, (_, n) => {
			const start = dayjs(from).add(n, 'days').startOf('day')
			return {
				date0: start.toDate(),
				date1: start.endOf('day').toDate(),
			}
		})
	} else if (frameType === TF_TYPE.HOUR) {
		const hours = Math.ceil(dayjs.duration(dayjs(to).diff(from)).asHours())
		frames = Array.from({ length: hours }, (_, n) => {
			const start = dayjs(from).add(n, 'hours').startOf('hour')
			return {
				date0: start.toDate(),
				date1: start.endOf('hour').toDate(),
			}
		})
	}

	return frames
}

// region kill app
export function killAppWithGrace(app: INestApplication): void {
	process.on('SIGINT', async () => {
		gracefulShutdown(app, 'SIGINT')
	})

	process.on('SIGTERM', async () => {
		gracefulShutdown(app, 'SIGTERM')
	})
}

export function gracefulShutdown(app: INestApplication, code: string): void {
	const logger = new Logger('App:Utils')

	setTimeout(() => process.exit(1), 3000)
	logger.warn(`Signal received with code ${code} ⚡.`)
	logger.warn('❗Closing http server with grace.')
	app.close().then(() => {
		logger.warn('✅ Http server closed.')
		process.exit(0)
	})
}

// region zod
export type CompatibleZodInfer<T extends CompatibleZodType> = T['_output']
export type CompatibleZodType = Pick<
	z.ZodType<unknown>,
	'_input' | '_output' | 'parse' | 'safeParse'
>
export type EnforceOptional<ObjectType> = Simplify<
	{
		[Key in keyof ObjectType as RequiredFilter<
			ObjectType,
			Key
		>]: ObjectType[Key]
	} & {
		[Key in keyof ObjectType as OptionalFilter<ObjectType, Key>]?: Exclude<
			ObjectType[Key],
			undefined
		>
	}
>
export type Merge<Destination, Source> = EnforceOptional<
	SimpleMerge<PickIndexSignature<Destination>, PickIndexSignature<Source>> &
		SimpleMerge<OmitIndexSignature<Destination>, OmitIndexSignature<Source>>
>
export type MergeZodSchemaOutput<T extends CompatibleZodType> =
	T extends z.ZodDiscriminatedUnion<string, infer Options>
		? Merge<
				object,
				TupleToUnion<{
					[X in keyof Options]: Options[X] extends z.ZodType
						? Options[X]['_output']
						: Options[X]
				}>
			>
		: T extends z.ZodUnion<infer UnionTypes>
			? UnionTypes extends z.ZodType[]
				? Merge<
						object,
						TupleToUnion<{
							[X in keyof UnionTypes]: UnionTypes[X] extends z.ZodType
								? UnionTypes[X]['_output']
								: UnionTypes[X]
						}>
					>
				: T['_output']
			: T['_output']
export type OmitIndexSignature<ObjectType> = {
	[KeyType in keyof ObjectType as object extends Record<KeyType, unknown>
		? never
		: KeyType]: ObjectType[KeyType]
}
export type OptionalFilter<
	Type,
	Key extends keyof Type,
> = undefined extends Type[Key]
	? Type[Key] extends undefined
		? never
		: Key
	: never
export type PickIndexSignature<ObjectType> = {
	[KeyType in keyof ObjectType as object extends Record<KeyType, unknown>
		? KeyType
		: never]: ObjectType[KeyType]
}
export type RequiredFilter<
	Type,
	Key extends keyof Type,
> = undefined extends Type[Key]
	? Type[Key] extends undefined
		? Key
		: never
	: Key
export type SimpleMerge<Destination, Source> = {
	[Key in keyof Destination | keyof Source]: Key extends keyof Source
		? Source[Key]
		: Key extends keyof Destination
			? Destination[Key]
			: never
}
export type Simplify<T> = {
	[KeyType in keyof T]: T[KeyType]
}
export type TupleToUnion<ArrayType> = ArrayType extends readonly unknown[]
	? ArrayType[number]
	: never
export interface ZodDto<T extends CompatibleZodType = CompatibleZodType> {
	new (): MergeZodSchemaOutput<T>
	schema: T
	create(input: unknown): CompatibleZodInfer<T>
}
export function createZodDto<T extends z.ZodTypeAny>(s: T): ZodDto<T> {
	class AugmentedZodDto {
		public static schema = s
		public static create(input: unknown) {
			return this.schema.parse(input)
		}
	}

	return AugmentedZodDto as unknown as ZodDto<T>
}

// region bytes
const map: Record<string, number> = {
	b: 1,
	kb: 1 << 10,
	mb: 1 << 20,
	gb: 1 << 30,
	tb: 1024 ** 4,
	pb: 1024 ** 5,
}
const parseRegExp = /^(([-+])?(\d+(?:\.\d+)?)) *(kb|mb|gb|tb|pb)$/i

export function parseBytes(val: string | number): number | null {
	if (typeof val === 'number' && !Number.isNaN(val)) return val
	if (typeof val !== 'string') return null
	const results = parseRegExp.exec(val)
	const floatValue = results
		? Number.parseFloat(results[1])
		: Number.parseInt(val, 10)
	const unit = results ? results[4].toLowerCase() : 'b'
	return Number.isNaN(floatValue) ? null : Math.floor(map[unit] * floatValue)
}

export async function sequential<T, R>(
	items: T[],
	callback: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	return items.reduce<Promise<R[]>>(async (prevPromise, item, index) => {
		const results = await prevPromise
		const result = await callback(item, index)
		return results.concat(result)
	}, Promise.resolve([]))
}

// region password
export const createPassword = async (
	password: string,
): Promise<{
	password: string
	passwordExpired: Date
	passwordCreated: Date
	passwordAttempt: number
}> => {
	const passwordWithPepper = env.PASSWORD_PEPPER
		? password + env.PASSWORD_PEPPER
		: password

	const passwordHash = await argon2.hash(passwordWithPepper, {
		type: argon2.argon2id,
	})

	const passwordExpired = dayjs()
		.add(seconds(env.PASSWORD_EXPIRED), 's')
		.toDate()
	const passwordCreated = new Date()

	return {
		password: passwordHash,
		passwordExpired,
		passwordCreated,
		passwordAttempt: 0,
	}
}

export const comparePassword = async (
	password: string,
	passwordHash: string,
): Promise<boolean> => {
	const passwordWithPepper = env.PASSWORD_PEPPER
		? password + env.PASSWORD_PEPPER
		: password
	return await argon2.verify(passwordHash, passwordWithPepper)
}

export const tempDir = async (): Promise<string> =>
	await fs.realpath(os.tmpdir())

// region string
export const cleanVietnamese = (text: string): string => {
	let res = text.replace(/[AÁÀÃẠÂẤẦẪẬĂẮẰẴẶ]/g, 'A')
	res = res.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
	res = res.replace(/[EÉÈẼẸÊẾỀỄỆ]/, 'E')
	res = res.replace(/[èéẹẻẽêềếệểễ]/g, 'e')
	res = res.replace(/[IÍÌĨỊ]/g, 'I')
	res = res.replace(/[ìíịỉĩ]/g, 'i')
	res = res.replace(/[OÓÒÕỌÔỐỒỖỘƠỚỜỠỢ]/g, 'O')
	res = res.replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
	res = res.replace(/[UÚÙŨỤƯỨỪỮỰ]/g, 'U')
	res = res.replace(/[ùúụủũưừứựửữ]/g, 'u')
	res = res.replace(/[YÝỲỸỴ]/g, 'Y')
	res = res.replace(/[ỳýỵỷỹ]/g, 'y')
	res = res.replace(/Đ/g, 'D')
	res = res.replace(/đ/g, 'd')
	res = res.replace(/[\u0300\u0301\u0303\u0309\u0323]/g, '')
	res = res.replace(/\u02C6|\u0306|\u031B/g, '')
	return res
}

export const normalizedKeyword = (text: string): string => {
	if (!text) {
		return ''
	}
	const res = cleanVietnamese(text)
	return [text, res].join(' ').toLowerCase()
}

export function urlJoin(...parts: (string | undefined | null)[]): string {
	return compact(parts)
		.join('/')
		.replace(/(?<!:)\/{2,}/g, '/')
		.replace(/\/+$/, '')
}

// region number
export const toDecimal = (
	value: Prisma.Decimal | number | string | null | undefined,
): Prisma.Decimal => {
	return value ? new Prisma.Decimal(value) : new Prisma.Decimal(0)
}

export const toNumber = (
	value: Prisma.Decimal | number | string | null | undefined,
): number => {
	return toDecimal(value).toNumber()
}

// region excel
function createWorksheet(
	name: string,
	headers: string[],
	workbook: ExcelJS.stream.xlsx.WorkbookWriter,
): ExcelJS.Worksheet {
	const worksheet = workbook.addWorksheet(name)
	worksheet.columns = headers.map(header => ({ header, key: header }))
	return worksheet
}

export const exportExcel = async (
	sheets: {
		name: string
		headers: string[]
		data: Readable
	}[],
	outputStream: Writable,
): Promise<void> => {
	const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
		stream: outputStream,
		useStyles: true,
	})
	workbook.created = new Date()

	await Promise.all(
		sheets.map(sheet => {
			let rowCount = 0
			let sheetIndex = 0
			let worksheet = createWorksheet(sheet.name, sheet.headers, workbook)

			sheet.data.on('data', (row: any) => {
				rowCount += 1
				if (rowCount > 1000000) {
					worksheet.name = `${sheet.name} - ${sheetIndex + 1}`
					worksheet.commit()
					worksheet = createWorksheet(
						`${sheet.name} - ${sheetIndex + 1}`,
						sheet.headers,
						workbook,
					)
					rowCount = 0
					sheetIndex += 1
				}
				worksheet.addRow(row).commit()
			})

			return new Promise<void>(resolve => {
				sheet.data.on('end', () => {
					worksheet.commit()
					resolve()
				})
			})
		}),
	)

	await workbook.commit()
}

export const readExcel = async (
	inputStream: Readable,
	onRow: (row: {
		rowIndex: number
		rowValues: ExcelJS.CellValue[]
	}) => Promise<void> | void,
): Promise<void> => {
	const workbook = new ExcelJS.stream.xlsx.WorkbookReader(inputStream, {})

	for await (const worksheet of workbook) {
		for await (const row of worksheet) {
			await onRow({
				rowIndex: row.number,
				rowValues: row.values as ExcelJS.CellValue[],
			})
		}
	}
}

export const getRealIp = (req: Request): string => {
	return (
		req.clientIp ??
		req.ips?.[0] ??
		req.ip ??
		(() => {
			throw new Error('Client IP not detected')
		})()
	)
}

export function formatProxy(proxy: Proxy): string {
	const protocolPrefix =
		proxy.protocol === ProxyProtocol.HTTP ||
		proxy.protocol === ProxyProtocol.HTTPS
			? 'http'
			: 'socks'

	return `${protocolPrefix}://${proxy.host}:${proxy.port}`
}

export function getProxyAgent(
	proxy: Proxy,
): HttpsProxyAgent<string> | SocksProxyAgent {
	const baseOptions = {
		timeout: 10000,
	}
	if (
		proxy.protocol === ProxyProtocol.HTTP ||
		proxy.protocol === ProxyProtocol.HTTPS
	) {
		const auth =
			proxy.username && proxy.password
				? `${proxy.username}:${decrypt(proxy.password)}@`
				: ''

		return new HttpsProxyAgent(
			`http://${auth}${proxy.host}:${proxy.port}`,
			baseOptions,
		)
	}

	const auth =
		proxy.username && proxy.password
			? `${proxy.username}:${decrypt(proxy.password)}@`
			: ''
	return new SocksProxyAgent(
		`socks://${auth}${proxy.host}:${proxy.port}`,
		baseOptions,
	)
}
