import type Redis from 'ioredis'
import type { IRedisAdapter } from './types'

export class RedisAdapter implements IRedisAdapter {
  // A dedicated subscriber client is required because ioredis puts a connection
  // into subscriber mode once subscribe() is called — it can no longer issue
  // regular commands on that same connection.
  private subscriberClient: Redis

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
    await this.subscriberClient.subscribe(channel)
    this.subscriberClient.on('message', (ch: string, msg: string) => {
      if (ch === channel) fn(msg)
    })
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriberClient.unsubscribe(channel)
  }
}
