import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { SessionsService } from './sessions.service.js';
import { SmsService } from './sms.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionsService, OtpService, SmsService],
  exports: [AuthService, SessionsService, OtpService],
})
export class AuthModule {}
