import { Module } from '@nestjs/common';
import { MailModule } from '../common/mail/mail.module.js';
import { InvitationsController, TeamController } from './team.controller.js';
import { TeamService } from './team.service.js';

@Module({ imports: [MailModule], controllers: [TeamController, InvitationsController], providers: [TeamService] })
export class TeamModule {}
