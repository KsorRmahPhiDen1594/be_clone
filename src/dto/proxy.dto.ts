import { ProxyProtocol } from '@prisma/client'
import { z } from 'zod'
import { createZodDto } from '../common'

export class UpsertProxyDto extends createZodDto(
	z.object({
		id: z.string().optional(),
		protocol: z.nativeEnum(ProxyProtocol),
		host: z.string().min(1).max(255),
		port: z.number().int().min(1).max(65535),
		username: z.string().min(1).max(255),
		password: z.string().optional(),
		enabled: z.boolean().default(true),
	}),
) {}

const proxyFormatRegex =
	/^(http|https|socks5|socks4):\/\/([a-zA-Z0-9._%+-]+):([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+):(\d+)$/
export class BatchAddProxyDto extends createZodDto(
	z.object({
		proxies: z
			.string()
			.transform(proxyString =>
				proxyString
					.split('\n')
					.map(proxy => proxy.trim())
					.filter(Boolean),
			)
			.refine(proxies => proxies.length > 0, {
				message: 'Proxy list cannot be empty',
			})
			.refine(
				proxies =>
					proxies.every(proxy => {
						const match = proxy.match(proxyFormatRegex)
						if (!match) return false
						const [_, protocol, , , , port] = match
						return (
							Object.values(ProxyProtocol).includes(
								protocol.toUpperCase() as ProxyProtocol,
							) &&
							+port > 0 &&
							+port < 65536
						)
					}),
				{
					message: 'Invalid proxy format',
					params: { format: 'protocol://username:password@host:port' },
				},
			),
	}),
) {}
