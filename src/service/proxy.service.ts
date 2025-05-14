import { faker } from '@faker-js/faker'
import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { Proxy } from '@prisma/client'
import axios, { AxiosInstance } from 'axios'
import axiosRetry from 'axios-retry'
import { formatProxy, getProxyAgent } from '../common'
import { PrismaService } from './prisma.service'
import { TelegramService } from './telegram.service'

interface ProxySession {
	proxyId: string
	instance: AxiosInstance
}

@Injectable()
export class ProxyService implements OnApplicationBootstrap {
	private readonly proxies: Proxy[] = []
	private readonly sessionMap = new Map<string, ProxySession>()

	constructor(
		private readonly prismaService: PrismaService,
		private readonly telegramService: TelegramService,
	) {}

	async onApplicationBootstrap(): Promise<void> {
		await this.refreshProxies()
	}

	async refreshProxies(): Promise<void> {
		const proxies = await this.prismaService.proxy.findMany({
			where: { enabled: true },
		})
		this.proxies.splice(0, this.proxies.length, ...proxies)
	}

	async getAxiosInstance(sessionId?: string): Promise<AxiosInstance> {
		let session = sessionId ? this.sessionMap.get(sessionId) : undefined

		if (!session || !this.isProxyAvailable(session.proxyId)) {
			const proxy = this.pickRandomProxy()

			if (!proxy) {
				return axios.create()
			}

			const agent = getProxyAgent(proxy)
			const instance = axios.create({
				httpsAgent: agent,
				httpAgent: agent,
			})

			axiosRetry(instance, { retries: 3 })

			session = {
				proxyId: proxy.id,
				instance,
			}

			if (sessionId) {
				this.sessionMap.set(sessionId, session)
			}
		}

		try {
			await session.instance.get('https://checkip.amazonaws.com/')
			return session.instance
		} catch (error) {
			if (sessionId) {
				this.sessionMap.delete(sessionId)
			}

			const disabledProxy = await this.prismaService.proxy.update({
				where: { id: session.proxyId },
				data: { enabled: false },
			})

			await this.telegramService.sendToOperator(
				`Proxy ${formatProxy(disabledProxy)} is disabled due to failure.`,
				{ emoji: 'sos' },
			)
			await this.refreshProxies()
			return this.getAxiosInstance(sessionId)
		}
	}

	private pickRandomProxy(): Proxy | undefined {
		const enabledProxies = this.proxies.filter(proxy => proxy.enabled)
		if (enabledProxies.length > 0) {
			return faker.helpers.arrayElement(enabledProxies)
		}
		return undefined
	}

	private isProxyAvailable(proxyId: string): boolean {
		return this.proxies.some(proxy => proxy.id === proxyId && proxy.enabled)
	}
}
