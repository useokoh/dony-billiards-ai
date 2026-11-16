import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CoachingController } from './coaching/coaching.controller.js';
import { CoachingService } from './coaching/coaching.service.js';
import { HealthController } from './health/health.controller.js';
import { MatchesController } from './matches/matches.controller.js';
import { MatchesService } from './matches/matches.service.js';
import { PlayersController } from './players/players.controller.js';
import { PlayersService } from './players/players.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { ResultsImportService } from './results-import/results-import.service.js';
import { ShotsController } from './shots/shots.controller.js';
import { ShotsService } from './shots/shots.service.js';
import { UploadsController } from './uploads/uploads.controller.js';
import { UploadsService } from './uploads/uploads.service.js';

@Module({
  imports: [],
  controllers: [
    AppController,
    HealthController,
    MatchesController,
    ShotsController,
    CoachingController,
    PlayersController,
    UploadsController,
  ],
  providers: [
    AppService,
    PrismaService,
    MatchesService,
    ShotsService,
    CoachingService,
    PlayersService,
    ResultsImportService,
    UploadsService,
  ],
})
export class AppModule {}
