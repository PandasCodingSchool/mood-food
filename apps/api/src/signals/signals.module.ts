import { Module } from '@nestjs/common';
import { PredictionsController } from './predictions.controller.js';
import { PredictionsService } from './predictions.service.js';
import { SignalsController } from './signals.controller.js';
import { SignalsService } from './signals.service.js';

@Module({
  controllers: [SignalsController, PredictionsController],
  providers: [SignalsService, PredictionsService],
  exports: [SignalsService, PredictionsService],
})
export class SignalsModule {}
