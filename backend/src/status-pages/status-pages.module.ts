import { Module } from '@nestjs/common';
import { PublicStatusPageController, StatusPageSettingsController } from './status-pages.controller.js';
import { StatusPagesService } from './status-pages.service.js';

@Module({ controllers: [StatusPageSettingsController, PublicStatusPageController], providers: [StatusPagesService] })
export class StatusPagesModule {}
