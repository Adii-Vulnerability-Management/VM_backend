import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return {
      status: 'ok',
      message: this.appService.getHello(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'backend-node-dev-env',
      timestamp: new Date().toISOString(),
    };
  }
}
