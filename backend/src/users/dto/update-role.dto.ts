import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class UpdateRoleDto {
  @ApiProperty({
    enum: UserRole,
    example: UserRole.USER,
    description: 'The new role to assign to the user',
  })
  @IsEnum(UserRole)
  role: UserRole;
}
