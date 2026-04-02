declare module 'ioredis-mock' {
  import type Redis from 'ioredis'
  const RedisMock: new (options?: object) => Redis
  export = RedisMock
}
