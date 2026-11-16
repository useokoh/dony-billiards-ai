// 영상 업로드 API: /api/uploads
import {
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { tmpdir } from 'node:os';
import { type UploadedVideo, UploadsService } from './uploads.service.js';

const MAX_VIDEO_BYTES = 20 * 1024 ** 3; // 20GB (2시간 1080p 영상도 넉넉히)

@ApiTags('업로드')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @ApiOperation({
    summary:
      '경기 영상 업로드 → 분석 예약. 바로 작업 id를 돌려주고 분석은 뒤에서 이어진다',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { video: { type: 'string', format: 'binary' } },
    },
  })
  // 임시 폴더에 받아 두었다가 이름을 정해 data/videos로 옮긴다.
  @UseInterceptors(
    FileInterceptor('video', {
      dest: tmpdir(),
      limits: { fileSize: MAX_VIDEO_BYTES },
    }),
  )
  upload(@UploadedFile() file: UploadedVideo | undefined) {
    return this.uploads.enqueue(file);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      '분석 진행 상태 (queued, running, done, failed). done이면 matchId로 경기 조회',
  })
  status(@Param('id') id: string) {
    return this.uploads.find(id);
  }
}
