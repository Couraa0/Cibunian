import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('online');
        expect(res.body.message).toBeDefined();
        expect(res.body.documentation).toBeDefined();
      });
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('online');
        expect(res.body.routes).toBeDefined();
      });
  });

  it('/api/status (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/status')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('GEN_APHYAH Backend (NestJS)');
        expect(res.body.version).toBe('1.0.0');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
