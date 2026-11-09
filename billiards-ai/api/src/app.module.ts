import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health/health.controller.js';
import { MatchesController } from './matches/matches.controller.js';
import { MatchesService } from './matches/matches.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { ShotsController } from './shots/shots.controller.js';
import { ShotsService } from './shots/shots.service.js';

@Module({
  imports: [],
  controllers: [
    AppController,
    HealthController,
    MatchesController,
    ShotsController,
  ],
  providers: [AppService, PrismaService, MatchesService, ShotsService],
})
export class AppModule {}
