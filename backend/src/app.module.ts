import { Module, ValidationPipe } from '@nestjs/common';
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  APP_PIPE,
} from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { BuyersController } from './buyers/buyers.controller.js';
import { CategoriesController } from './categories/categories.controller.js';
import { CollectionPointsController } from './collection-points/collection-points.controller.js';
import { CollectionsController } from './collections/collections.controller.js';
import { CollectionsService } from './collections/collections.service.js';
import { AuditInterceptor } from './common/audit.interceptor.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { HouseholdsController } from './households/households.controller.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';
import { MarketplaceController } from './marketplace/marketplace.controller.js';
import { MarketplaceService } from './marketplace/marketplace.service.js';
import { OrganicController } from './organic/organic.controller.js';
import { PickupsController } from './pickups/pickups.controller.js';
import { PlasticController } from './plastic/plastic.controller.js';
import { PrismaService } from './prisma.service.js';
import {
  ReportsController,
  ReportsService,
} from './reports/reports.controller.js';
import { SavingsController } from './savings/savings.controller.js';
import { UsersController } from './users/users.controller.js';
import { WeighingController } from './weighing/weighing.controller.js';

// ponytail: satu module untuk semua domain. Pecah menjadi module per domain
// bila ada domain yang perlu di-deploy/diuji terpisah atau tim bertambah besar.
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET belum diatur');
        // ponytail: tanpa refresh token. Bawaan 7 hari agar petugas yang lama offline tetap
        // bisa sinkron; atur JWT_EXPIRES_IN (mis. "3d", "12h") untuk sesi lebih pendek.
        // Sesi lama bisa diputus kapan saja dengan mengganti password (lihat AuthGuard).
        const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as NonNullable<
          JwtSignOptions['expiresIn']
        >;
        return { secret, signOptions: { expiresIn } };
      },
    }),
  ],
  controllers: [
    AppController,
    AuthController,
    UsersController,
    HouseholdsController,
    CollectionPointsController,
    CategoriesController,
    BuyersController,
    CollectionsController,
    WeighingController,
    SavingsController,
    InventoryController,
    PickupsController,
    MarketplaceController,
    OrganicController,
    PlasticController,
    ReportsController,
  ],
  providers: [
    AppService,
    PrismaService,
    InventoryService,
    CollectionsService,
    MarketplaceService,
    ReportsService,
    // Didaftarkan di module (bukan di main.ts) agar berlaku juga pada tes e2e.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, transform: true }),
    },
  ],
})
export class AppModule {}
