// 플레이어 API: /api/players
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parsePlayerBody, PlayersService } from './players.service.js';

const playerSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    currentHandicap: { type: 'integer', nullable: true },
    targetHandicap: { type: 'integer', nullable: true },
    coachingLevel: {
      type: 'string',
      nullable: true,
      enum: ['beginner', 'intermediate', 'advanced'],
    },
  },
  example: { name: '도니', currentHandicap: 18, targetHandicap: 20 },
};

@ApiTags('플레이어')
@Controller('players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get()
  @ApiOperation({ summary: '플레이어 목록' })
  list() {
    return this.players.list();
  }

  @Get(':id')
  @ApiOperation({ summary: '플레이어 프로필 (현재·목표 핸디, 코칭 난이도)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.players.findOne(id);
  }

  @Post()
  @ApiOperation({
    summary:
      '플레이어 등록. coachingLevel을 생략하면 목표 핸디에서 계산 (≤20 초급, ≤27 중급, 그 이상 고급)',
  })
  @ApiBody({ schema: { ...playerSchema, required: ['name'] } })
  create(@Body() body: unknown) {
    return this.players.create(parsePlayerBody(body, false));
  }

  @Patch(':id')
  @ApiOperation({
    summary: '보낸 필드만 수정. 목표 핸디만 바꾸면 코칭 난이도도 다시 계산',
  })
  @ApiBody({ schema: playerSchema })
  update(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return this.players.update(id, parsePlayerBody(body, true));
  }
}
