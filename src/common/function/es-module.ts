import { ReadStream } from 'fs-extra'

interface IEsModule {
	fileType: {
		fileTypeFromStream: (stream: ReadStream) => Promise<
			| {
					mime: string
					ext: string
			  }
			| undefined
		>
	}
	transliterate: (str: string) => string
}

export const esModule: IEsModule = {
	fileType: {
		fileTypeFromStream: () => {
			throw new Error('Module file-type not loaded')
		},
	},
	transliterate: () => {
		throw new Error('Module transliterate not loaded')
	},
}

export const loadEsModule = async (): Promise<void> => {
	const res = await Promise.all([
		import('file-type'),
		await import('@sindresorhus/transliterate'),
	])
	esModule.fileType = res[0]
	esModule.transliterate = res[1].default
}
