import { HttpException, HttpStatus } from '@nestjs/common';

export class QuotaExceededException extends HttpException {
  constructor(message: string) {
    super(
      {
        status: HttpStatus.FORBIDDEN,
        error: 'Storage Quota Exceeded',
        message,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
