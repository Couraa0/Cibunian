import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { Express } from 'express';
import { AppModule } from './app.module.js';

// Lokal: baca backend/.env. Di Vercel variabel sudah ada di environment.
try {
  process.loadEnvFile();
} catch {
  // tidak ada file .env
}

let cachedServer: Express;

export async function createNestServer(expressInstance: Express) {
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
  );

  // Autentikasi memakai header Authorization (bukan cookie), jadi tanpa credentials.
  const origins = (process.env.CORS_ORIGIN ?? '*').split(',').map((o) => o.trim());
  const isWildcard = origins.includes('*');
  app.enableCors({
    origin: isWildcard ? true : origins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Idempotency-Key',
      'X-Device-Key',
    ],
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RUNA Circular Integration API')
    .setDescription(
      'REST API Bank Sampah RUNA: pengumpulan, stok, pengangkutan, marketplace, pilot pengolahan, dan laporan.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const swaggerCustomOptions = {
    customSiteTitle: 'RUNA Circular Integration API Documentation',
    customCssUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css',
    customJs: [
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.js',
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.js',
    ],
  };

  SwaggerModule.setup('docs', app, document, swaggerCustomOptions);
  SwaggerModule.setup('api/docs', app, document, swaggerCustomOptions);

  await app.init();
  return app;
}

// Handler serverless untuk Vercel
export default async function handler(req: any, res: any) {
  if (!cachedServer) {
    cachedServer = express();
    await createNestServer(cachedServer);
  }
  return cachedServer(req, res);
}

// Bootstrap standalone untuk development lokal (jika bukan environment Vercel)
if (process.env.VERCEL !== '1') {
  async function bootstrap() {
    const localExpress = express();
    const app = await createNestServer(localExpress);
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    console.log(`🚀 Backend server is running on http://localhost:${port}`);
    console.log(`📚 Swagger documentation available at http://localhost:${port}/docs`);
  }
  void bootstrap();
}
