import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { UsersService } from './users.service.js';
import { changePasswordSchema, updateProfileSchema, type ChangePasswordDto, type UpdateProfileDto } from './users.schemas.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users/me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: Express.User) {
    return this.users.me(user.id);
  }

  @Patch()
  update(@CurrentUser() user: Express.User, @Body({ schema: updateProfileSchema }) dto: UpdateProfileDto) {
    return this.users.update(user.id, dto);
  }

  @HttpCode(204)
  @Post('password')
  async changePassword(@CurrentUser() user: Express.User, @Body({ schema: changePasswordSchema }) dto: ChangePasswordDto) {
    await this.users.changePassword(user.id, dto);
  }
}
