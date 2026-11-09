// 샷 API: /api/shots
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
import { parseConfirmBody, ShotsService } from './shots.service.js';

@ApiTags('샷')
@Controller('shots')
export class ShotsController {
  constructor(private readonly shots: ShotsService) {}

  @Get(':id')
  @ApiOperation({
    summary: '샷 상세 (쿠션·공 맞힘 순서, 실패 원인, 영상 위치)',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.shots.findOne(id);
  }

  @Get(':id/trajectory')
  @ApiOperation({
    summary:
      '샷 궤적 (공별 좌표 0~1, 샷 시작 배치). 화면에 실제 경로를 그릴 때 사용',
  })
  trajectory(@Param('id', ParseIntPipe) id: number) {
    return this.shots.trajectory(id);
  }

  @Get(':id/clip')
  @ApiOperation({ summary: '샷 영상 재생 (Range 요청 지원)' })
  async clip(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    sendVideo(res, resolveMediaPath(await this.shots.clipPath(id)));
  }

  @Patch(':id')
  @ApiOperation({
    summary: '득점 인정(true)/불인정(false)/확인 취소(null), 점수 다시 계산',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['scoreConfirmed'],
      properties: { scoreConfirmed: { type: 'boolean', nullable: true } },
      example: { scoreConfirmed: true },
    },
  })
  confirm(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.shots.confirm(id, parseConfirmBody(body));
  }
}
