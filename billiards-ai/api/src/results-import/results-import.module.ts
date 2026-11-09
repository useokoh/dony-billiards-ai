// 분석 결과 가져오기 기능 묶음
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResultsImportService } from './results-import.service.js';

@Module({
  providers: [PrismaService, ResultsImportService],
  exports: [ResultsImportService],
})
export class ResultsImportModule {}
