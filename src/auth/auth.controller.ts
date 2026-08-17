import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

@Controller('apiv1')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('')
  async checkAuth(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.checkAuthenticated(req);
    return res.status(result.statusCode).json(result.body);
  }

  @Public()
  @Post('login')
  async login(@Req() req: Request, @Res() res: Response) {
    const body: any = (req as any).body || {};
    const result = await this.authService.loginLikeDjango(
      req,
      res,
      body?.email,
      body?.password,
    );

    if (typeof result.body === 'string') {
      return res.status(result.statusCode).send(result.body);
    }

    return res.status(result.statusCode).json(result.body);
  }

  @Post('register')
  async register(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const result = await this.authService.registerLikeDjango(req, res, body);

    if (typeof result.body === 'string') {
      return res.status(result.statusCode).send(result.body);
    }

    return res.status(result.statusCode).json(result.body);
  }

  @Post('users/create')
  async createUser(@Body() body: any, @Req() req: Request) {
    return this.authService.createUserAndEmailPasswordLikeDjango(body, req);
  }

  @Public()
  @Post('password/reset/request')
  async requestPasswordReset(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.authService.requestPasswordResetLikeDjango(
      req,
      body?.email,
    );

    if (typeof result.body === 'string') {
      return res.status(result.statusCode).send(result.body);
    }

    return res.status(result.statusCode).json(result.body);
  }

  @Public()
  @Post('password/reset/confirm')
  async confirmPasswordReset(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.authService.confirmPasswordResetLikeDjango(
      req,
      body?.email,
      body?.otp,
      body?.new_password,
    );

    if (typeof result.body === 'string') {
      return res.status(result.statusCode).send(result.body);
    }

    return res.status(result.statusCode).json(result.body);
  }

  @Post('password/update')
  async updatePassword(@Req() req: Request, @Body() body: any) {
    return this.authService.updatePasswordAfterFirstLogin(req, body);
  }

  @Get('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.logoutLikeDjango(req, res);
    return res.status(result.statusCode).send(result.body);
  }

  @Get('users')
  async getUsers(@Req() req: Request, @Query() query: any) {
    const result = await this.authService.getAllUsers(req, query);
    return result.body ? result.body : result;
  }

  @Get('users/db')
  async getUsersFromDb(
    @Req() req: Request,
    @Res() res: Response,
    @Query() query: any,
  ) {
    const result = await this.authService.getUsersFromDb(req, query);

    if (typeof result.body === 'string') {
      return res.status(result.statusCode).send(result.body);
    }

    return res.status(result.statusCode).json(result.body);
  }

  @Post('users/temp-password/update')
  async updateTempPassword(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: any,
  ) {
    const result = await this.authService.updateUserTempPassword(req, body);

    if (typeof result.body === 'string') {
      return res.status(result.statusCode).send(result.body);
    }

    return res.status(result.statusCode).json(result.body);
  }

  @Public()
  @Get('token/refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.refreshAccessLikeDjango(req, res);

    if (typeof result.body === 'string') {
      return res.status(result.statusCode).send(result.body);
    }

    return res.status(result.statusCode).json(result.body);
  }

  @Get('send-email-otp')
  async sendEmailOtp(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.sendEmailOtpLikeDjango(req);
    return res.status(result.statusCode).json(result.body);
  }

  @Post('verify-email-otp')
  async verifyEmailOtp(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.authService.verifyEmailOtpLikeDjango(
      req,
      body?.otp,
    );

    return res.status(result.statusCode).json(result.body);
  }

  @Get('totp/create')
  async totpCreate(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.totpCreateLikeDjango(req);
    return res.status(result.statusCode).json(result.body);
  }

  @Post('totp/login')
  async totpLogin(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.authService.totpVerifyLikeDjango(
      req,
      body?.totp_token,
    );

    return res.status(result.statusCode).json(result.body);
  }

  @Get('disable-mfa')
  async disableMfa(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.disableMfaLikeDjango(req);
    return res.status(result.statusCode).json(result.body);
  }
}
