// 코칭 API: /api/shots/:id/route, /api/shots/:id/feedback
// (샷 상세·영상·득점 인정은 shots.controller.ts, 같은 주소 접두어를 공유)
import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { parseCoachingQuery } from './coaching-level.js';
import { CoachingService } from './coaching.service.js';

@ApiTags('코칭')
@Controller('shots')
export class CoachingController {
  constructor(private readonly coaching: CoachingService) {}

  @Get(':id/route')
  @ApiOperation({
    summary:
      '실패 샷의 난이도별 추천 경로와 실행 코칭 (두께·쿠션·회전·당점·강약은 권장값)',
  })
  @ApiQuery({
    name: 'level',
    required: false,
    enum: ['beginner', 'intermediate', 'advanced'],
  })
  @ApiQuery({
    name: 'handicap',
    required: false,
    type: Number,
    description: '목표 핸디 (≤20 초급, ≤27 중급, 그 이상 고급)',
  })
  @ApiQuery({
    name: 'playerId',
    required: false,
    type: Number,
    description: '플레이어 프로필의 목표 핸디 사용',
  })
  route(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: Record<string, unknown>,
  ) {
    return this.coaching.route(id, parseCoachingQuery(query));
  }

  @Get(':id/feedback')
  @ApiOperation({ summary: '실패 샷의 목표 핸디별 피드백 문장' })
  @ApiQuery({
    name: 'level',
    required: false,
    enum: ['beginner', 'intermediate', 'advanced'],
  })
  @ApiQuery({ name: 'handicap', required: false, type: Number })
  @ApiQuery({ name: 'playerId', required: false, type: Number })
  feedback(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: Record<string, unknown>,
  ) {
    return this.coaching.feedback(id, parseCoachingQuery(query));
  }
}
