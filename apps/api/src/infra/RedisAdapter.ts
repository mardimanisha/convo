import type Redis from 'ioredis'
import type { IRedisAdapter } from './types'

export class RedisAdapter implements IRedisAdapter {
  // A dedicated subscriber client is required because ioredis puts a connection
  // into subscriber mode once subscribe() is called — it can no longer issue
  // regular commands on that same connection.
  private subscriberClient: Redis
  private readonly listeners = new Map<string, (ch: string, msg: string) => void>()

  constructor(
    private readonly client: Redis,
    subscriberClient?: Redis
  ) {
    this.subscriberClient = subscriberClient ?? client.duplicate()
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.client.set(key, value, 'EX', ttlSeconds)
    } else {
      await this.client.set(key, value)
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key)
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds)
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message)
  }

  async subscribe(channel: string, fn: (msg: string) => void): Promise<void> {
    const wrapper = (ch: string, msg: string) => {
      if (ch === channel) fn(msg)
    }
    this.listeners.set(channel, wrapper)
    this.subscriberClient.on('message', wrapper)
    await this.subscriberClient.subscribe(channel)
  }

  async unsubscribe(channel: string): Promise<void> {
    const wrapper = this.listeners.get(channel)
    if (wrapper !== undefined) {
      this.subscriberClient.removeListener('message', wrapper)
      this.listeners.delete(channel)
    }
    await this.subscriberClient.unsubscribe(channel)
  }
}
