import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('melaporkan status online dan tautan dokumentasi', () => {
      const root = appController.getRoot();
      expect(root.status).toBe('online');
      expect(root.documentation.swaggerUi).toBe('/docs');
    });
  });
});
