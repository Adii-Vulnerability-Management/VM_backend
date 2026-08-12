import 'dotenv/config';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { VulnerabilityDashboardModule } from './vulnerability-dashboard/vulnerability-dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    VulnerabilityDashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
