// 경기 API: /api/matches
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { resolveMediaPath, sendVideo } from '../media/media-file.js';
import { MatchesService, parseMatchPlayersBody } from './matches.service.js';

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

  @Patch(':id/players')
  @ApiOperation({
    summary:
      '선공·후공 플레이어 프로필 연결 (null = 해제). 코칭 난이도가 프로필 목표 핸디로 자동 적용',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        firstPlayerId: { type: 'integer', nullable: true },
        secondPlayerId: { type: 'integer', nullable: true },
      },
      example: { firstPlayerId: 1, secondPlayerId: 2 },
    },
  })
  setPlayers(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.matches.setPlayers(id, parseMatchPlayersBody(body));
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
