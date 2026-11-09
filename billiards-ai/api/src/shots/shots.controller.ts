// 샷 API: /api/shots
import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { resolveMediaPath, sendVideo } from '../media/media-file.js';
import { ShotsService } from './shots.service.js';

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

  @Get(':id/clip')
  @ApiOperation({ summary: '샷 영상 재생 (Range 요청 지원)' })
  async clip(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    sendVideo(res, resolveMediaPath(await this.shots.clipPath(id)));
  }
}
