import { Module } from '@nestjs/common';
import { DiyController } from './diy.controller.js';

@Module({ controllers: [DiyController] })
export class DiyModule {}
