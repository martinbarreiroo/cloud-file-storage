import { ApiProperty } from '@nestjs/swagger';

class UserDto {
  @ApiProperty({
    description: 'The user ID',
    example: '169a4032-2a54-45a8-a322-4c1307cf0890',
  })
  id: string;

  @ApiProperty({
    description: 'The username',
    example: 'johndoe',
  })
  username: string;

  @ApiProperty({
    description: 'The email address',
    example: 'user@example.com',
  })
  email: string;
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;

  @ApiProperty({
    description: 'User information',
    type: UserDto,
  })
  user: UserDto;
}

export class RegisterResponseDto {
  @ApiProperty({
    description: 'The user ID',
    example: '169a4032-2a54-45a8-a322-4c1307cf0890',
  })
  id: string;

  @ApiProperty({
    description: 'The username',
    example: 'johndoe',
  })
  username: string;

  @ApiProperty({
    description: 'The email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-05-05T18:39:24.480Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-05-05T18:39:24.480Z',
  })
  updatedAt: Date;
}
