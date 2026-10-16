import { Module } from '@nestjs/common';
import { SwiggyModule } from '../swiggy/swiggy.module.js';
import { BrainController } from './brain.controller.js';

@Module({ imports: [SwiggyModule], controllers: [BrainController] })
export class BrainModule {}
