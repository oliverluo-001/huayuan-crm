import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

interface ErrorResponse {
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse: ErrorResponse = {
      statusCode: status,
      message:
        typeof message === 'string'
          ? message
          : (message as any).message || 'An error occurred',
      error:
        exception instanceof Error ? exception.name : 'Error',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Handle TypeORM errors
    if ((exception as any).code === 'ER_DUP_ENTRY') {
      errorResponse.statusCode = HttpStatus.BAD_REQUEST;
      errorResponse.message = '数据已存在';
    }

    console.error('[Exception]', exception);

    response.status(status).json(errorResponse);
  }
}