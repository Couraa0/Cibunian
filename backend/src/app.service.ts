import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getRoot() {
    return {
      status: 'online',
      message: 'Selamat datang di REST API Bank Sampah RUNA (GEN APHYAH)',
      service: 'RUNA LOOP Backend',
      version: '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
      documentation: {
        swaggerUi: '/docs',
        swaggerApiDocs: '/api/docs',
        swaggerJson: '/docs-json',
      },
      endpoints: {
        root: '/',
        apiGateway: '/api',
        healthStatus: '/api/status',
        docs: '/docs',
      },
    };
  }

  getApiInfo() {
    return {
      status: 'online',
      message: 'RUNA LOOP API Gateway',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      documentation: '/docs',
      routes: {
        status: '/api/status',
        auth: {
          login: 'POST /api/auth/login',
          me: 'GET /api/auth/me',
        },
        users: '/api/users',
        households: '/api/households',
        collectionPoints: '/api/collection-points',
        categories: '/api/categories',
        buyers: '/api/buyers',
        collections: '/api/collections',
        weighing: '/api/weighing',
        inventory: '/api/inventory',
        pickups: '/api/pickups',
        marketplace: {
          listings: 'GET /api/marketplace/listings',
          requests: 'GET /api/marketplace/requests',
          sales: 'GET /api/sales',
        },
        organic: '/api/organic/batches',
        plastic: '/api/plastic/experiments',
        reports: {
          dashboard: 'GET /api/dashboard',
          reports: 'GET /api/reports',
        },
      },
    };
  }

  getStatus() {
    return {
      status: 'ok',
      service: 'GEN_APHYAH Backend (NestJS)',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
