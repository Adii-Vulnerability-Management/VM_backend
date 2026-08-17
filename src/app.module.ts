import 'dotenv/config';

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VulnerabilityManagementModule } from './vulnerability-management/vulnerability-management.module';
import { AuthModule } from './auth/auth.module';
import { AccessModule } from './access/access.module';
import { AuthMiddleware } from './auth-context.middleware';
import { AuthGuard } from './auth/guards/auth.guard';
import { TenantGuard } from './auth/guards/tenant.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/VM-dev',
      }),
    }),
    AuthModule,
    AccessModule,
    VulnerabilityManagementModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
