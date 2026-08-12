// import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
// import { plainToClass } from 'class-transformer';
// import { validate } from 'class-validator';

// @Injectable()
// export class ValidationPipe implements PipeTransform<any> {
//   async transform(value: any, metadata: ArgumentMetadata) {

//     if (!metadata.metatype || !this.toValidate(metadata.metatype)) {
//       return value;
//     }

//     if (metadata.type=='body') {
//       // console.log(metadata.metatype,value)
//       const object = plainToClass(metadata.metatype, value);
//       const errors = await validate(object);

//       if (errors.length) {
//         const errorMessages = errors.map((error) => {
//           const constraints = error.constraints;
//           console.log("validationpipe error ",error)
//           const message = Object.values(constraints)[0];
//           return {
//             [error.property]: message,
//           };
//           // const message = constraints ? Object.values(constraints)[0] : 'Validation error';
//           // return {
//           //   [error.property]: message || 'Validation error',
//           // };
//         });
//         throw new BadRequestException(errorMessages);
//       }

//     }

//     return value;
//   }

//   // eslint-disable-next-line @typescript-eslint/ban-types
//   private toValidate(metatype: Function): boolean {
//     // eslint-disable-next-line @typescript-eslint/ban-types
//     const types: Function[] = [String, Boolean, Number, Array, Object];
//     return !types.includes(metatype);
//   }

// }

import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, metadata: ArgumentMetadata) {
    if (!metadata.metatype || !this.toValidate(metadata.metatype)) {
      return value;
    }

    if (metadata.type === 'body') {
      const object = plainToClass(metadata.metatype, value);
      if (typeof object !== 'string') {
        const errors = await validate(object);

        if (errors.length) {
          const errorMessages = this.formatErrorMessages(errors);
          console.log(
            'VALIDATION ERROR DETAILS:',
            JSON.stringify(errors, null, 2),
          );
          throw new BadRequestException(errorMessages);
          // throw new BadRequestException({
          //   message: 'Validation failed',
          //   errors: errorMessages,
          // });
        }

        // Ensure that the validate method exists and is a function
        if (typeof object?.validate === 'function') {
          object.validate();
        }
      }
      if (typeof object === 'string') {
        throw new BadRequestException({
          message: 'Please Submit a valid payload',
        });
      }
    }

    return value;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  // private formatErrorMessages(errors: any[]): any {
  formatErrorMessages(errors: any[]): any {
    const formattedErrors: any = {};

    for (const error of errors) {
      const property = error.property;
      const constraints = error.constraints;

      if (constraints) {
        formattedErrors[property] = Object.values(constraints).join(', ');
      } else if (error.children && error.children.length) {
        formattedErrors[property] = this.formatErrorMessages(error.children);
      }
    }

    return [formattedErrors];
  }
}

@Injectable()
export class RequiredPipe implements PipeTransform<string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!value) {
      throw new BadRequestException(`${metadata.data} is required`);
    }
    if (typeof value === 'string') {
      value = value.trim();
      if (value === '') {
        throw new BadRequestException(`${metadata.data} is required`);
      }
    }
    return value;
  }
}
