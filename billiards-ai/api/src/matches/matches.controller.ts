// 경기 API: /api/matches
import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { resolveMediaPath, sendVideo } from '../media/media-file.js';
import { MatchesService } from './matches.service.js';

@ApiTags('경기')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  @Get()
  @ApiOperation({ summary: '경기 목록 (최근 경기 먼저)' })
  list() {
    return this.matches.list();
  }

  @Get(':id')
  @ApiOperation({ summary: '경기 정보 (상태, 점수, 영상 주소)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.matches.findOne(id);
  }

  @Get(':id/innings')
  @ApiOperation({ summary: '이닝별 샷 목록 (결과, 쿠션 횟수)' })
  innings(@Param('id', ParseIntPipe) id: number) {
    return this.matches.innings(id);
  }

  @Get(':id/video')
  @ApiOperation({ summary: '경기 전체 영상 재생 (Range 요청 지원)' })
  async video(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    sendVideo(res, resolveMediaPath(await this.matches.videoPath(id)));
  }
}
