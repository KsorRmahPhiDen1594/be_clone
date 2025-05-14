import {
	Injectable,
	MessageEvent,
	OnApplicationBootstrap,
	OnApplicationShutdown,
} from '@nestjs/common'
import { Subject, timer } from 'rxjs'

export interface SSEMessageEvent<T> extends Omit<MessageEvent, 'data'> {
	data: T | 'heartbeat'
}

export interface Subscriber<TEventData> {
	subject: Subject<SSEMessageEvent<TEventData>>
}

@Injectable()
export class SseService<T = any>
	implements OnApplicationBootstrap, OnApplicationShutdown
{
	private subscribers: Array<Subscriber<T>> = []

	constructor() {
		timer(0, 30000).subscribe(() => {
			this.sendHeartbeat()
		})
	}

	onApplicationBootstrap() {}

	onApplicationShutdown() {
		this.close()
	}

	private sendHeartbeat(): void {
		for (const subscriber of this.subscribers) {
			subscriber.subject.next({
				data: 'heartbeat',
			})
		}
	}

	close(): void {
		for (const subscriber of this.subscribers) {
			subscriber.subject.complete()
		}
		this.subscribers = []
	}

	subscribe(
		subscriberData: Omit<Subscriber<T>, 'subject'>,
	): Subject<SSEMessageEvent<T>> {
		const subject = new Subject<SSEMessageEvent<T>>()

		subject.subscribe({
			complete: () => this.removeSubscriber(subject),
			error: () => this.removeSubscriber(subject),
		})

		this.subscribers.push({
			...subscriberData,
			subject,
		})

		return subject
	}

	private removeSubscriber(subject: Subject<SSEMessageEvent<T>>): void {
		const index = this.subscribers.findIndex(s => s.subject === subject)
		if (index !== -1) {
			this.subscribers.splice(index, 1)
		}
	}
}
