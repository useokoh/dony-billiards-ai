// DB 연결: 앱 전체에서 이 서비스 하나로 SQLite를 사용한다.
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? '' }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
