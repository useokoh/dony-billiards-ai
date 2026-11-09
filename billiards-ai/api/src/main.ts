import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors(); // 개발 중 웹 화면(3000번)과 휴대폰 접속 허용

  // API 문서: http://localhost:4000/docs
  const config = new DocumentBuilder()
    .setTitle('당구 AI 경기 분석 API')
    .setVersion('0.1')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}
await bootstrap();
