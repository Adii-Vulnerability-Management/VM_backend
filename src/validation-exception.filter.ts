import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  WsExceptionFilter,
} from '@nestjs/common';

@Catch(HttpException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();

    if (exception.getStatus() === HttpStatus.BAD_REQUEST) {
      const errorResponse = {
        message: 'Validation failed',
        errors: exception.getResponse(),
      };

      response.status(HttpStatus.BAD_REQUEST).json(errorResponse);
    }
  }
}

import { WsException } from '@nestjs/websockets';
import { MongoError } from 'mongodb';
import { Error as MongooseError } from 'mongoose';

@Catch(MongoError, MongooseError, WsException, Error) // Catch both MongoError and MongooseError
export class WebSocketExceptionFilter implements WsExceptionFilter {
  catch(
    exception:
      MongoError | MongooseError | WsException | Error | BadRequestException,
    host: ArgumentsHost,
  ) {
    const client = host.switchToWs().getClient();

    console.log(exception);

    let status = 500;
    let message = 'Something Went Wrong!',
      errors: any;

    if (exception instanceof MongoError) {
      switch (exception.code) {
        case 11000: // MongoDB duplicate key error code
          status = HttpStatus.CONFLICT; // 409 Conflict
          message = 'Duplicate Key Error';
          if (exception['keyPattern']) {
            const dynamicProperties = Object.keys(exception['keyPattern']);
            errors = {
              message: dynamicProperties.map((propertyName) => ({
                [propertyName]: `The ${[propertyName]} with value '${exception['keyValue'][propertyName]}' already exists.`,
              })),
              error: 'Conflict',
              statusCode: status,
            };
          } else if (exception['writeErrors']) {
            const duplicateKeyError = exception['writeErrors'].find(
              (writeError) => writeError.err.code === 11000,
            );
            let error_message = 'Something Went Wrong!';

            if (duplicateKeyError) {
              console.log('duplicateKeyError', duplicateKeyError);
              console.log('duplicateKeyError', duplicateKeyError.err.keyValue);
              error_message = duplicateKeyError.err.errmsg;
            }
            const matches = exception.message.match(
              /index: (.+?) dup key: { (.+?) }/,
            );
            if (matches && matches.length > 2) {
              try {
                const [dkey, dvalue] = matches[2]
                  .split(':')
                  .map((item) => item.trim().replace(/['"]/g, ''));
                error_message = `The ${[dkey]} with value '${dvalue}' already exists.`;
              } catch (error) {}
            }
            errors = {
              message: `${error_message}`,
              error: 'Conflict',
              statusCode: status,
            };
          }
          break;
        default:
          break;
      }
    } else if (exception instanceof MongooseError) {
      status = HttpStatus.BAD_REQUEST; // 400 Bad Request
      message = 'Validation failed';
      // console.log(exception.message);
      // console.log(Object.keys(exception['errors']))
      if (exception['errors']) {
        const dynamicProperties = Object.keys(exception['errors']);
        errors = {
          message: dynamicProperties.map((propertyName) => ({
            [propertyName]: `${exception['errors'][propertyName]}`,
          })),
          error: 'Bad Request',
          statusCode: status,
        };
      } else if (exception['path']) {
        errors = {
          message: [{ [exception['path']]: exception.message }],
          error: 'Bad Request',
          statusCode: status,
        };
      } else {
        message = exception.message;
      }
    } else if (
      (exception as BadRequestException) instanceof BadRequestException
    ) {
      const badRequestException = exception as BadRequestException;
      status = HttpStatus.BAD_REQUEST;
      message = 'Bad Request';
      errors = badRequestException.getResponse();
    } else if (exception instanceof Error) {
      status = HttpStatus.BAD_REQUEST;
      message = exception.message;
    }

    if (errors) {
      client.emit('error', { message, errors });
      client.send(JSON.stringify({ message, errors }));
      client.close();
    } else {
      client.emit('error', { message });
      client.send(JSON.stringify({ message }));
      client.close();
    }
  }
}
