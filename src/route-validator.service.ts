import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef, ModulesContainer } from '@nestjs/core';

// Constants used by NestJS to store route metadata
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

@Injectable()
export class RouteValidatorService implements OnApplicationBootstrap {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly modulesContainer: ModulesContainer,
  ) {}

  onApplicationBootstrap() {
    // Retrieve all controllers from every module
    const allRoutes = this.getAllDeclaredRoutes();

    // Check for duplicates
    const duplicates = this.findDuplicates(allRoutes);

    if (duplicates.length > 0) {
      throw new Error(`Duplicate routes detected: ${duplicates.join(', ')}`);
    }

    console.log('All routes validated successfully.');
  }

  /**
   * Iterates over all modules and their controllers,
   * reads each controller's @Controller() path metadata,
   * and then each method's @Get/@Post/etc. path metadata.
   */
  private getAllDeclaredRoutes(): string[] {
    const routes: string[] = [];

    // The ModulesContainer holds references to all App modules
    for (const [_, module] of this.modulesContainer.entries()) {
      // module.controllers is a Map of controller token => InstanceWrapper
      for (const [__, wrapper] of module.controllers) {
        const { instance: controller } = wrapper;

        // If the wrapper has no instance, skip
        if (!controller) {
          continue;
        }

        // 1. Controller path (from @Controller('xxx'))
        const controllerPath =
          Reflect.getMetadata(PATH_METADATA, controller.constructor) || '';

        // 2. For each method in the controller, read its path + method
        const controllerPrototype = Object.getPrototypeOf(controller);
        const methodNames = Object.getOwnPropertyNames(controllerPrototype);

        for (const methodName of methodNames) {
          const methodHandler = controllerPrototype[methodName];
          if (typeof methodHandler !== 'function') {
            continue;
          }

          // Method path (from @Get('xxx'), @Post('xxx'), etc.)
          const methodPath =
            Reflect.getMetadata(PATH_METADATA, methodHandler) || '';
          // HTTP method metadata (RequestMethod.GET, POST, etc.)
          const requestMethod: RequestMethod | undefined = Reflect.getMetadata(
            METHOD_METADATA,
            methodHandler,
          );

          // If there's no METHOD_METADATA, it might not be an HTTP endpoint
          if (requestMethod === undefined) {
            continue;
          }

          // Construct full path: e.g. /users + /:id => /users/:id
          // Ensure you handle leading/trailing slashes consistently
          const fullPath = this.normalizePath(
            `/${controllerPath}/${methodPath}`,
          );

          routes.push(`${RequestMethod[requestMethod]} ${fullPath}`);
        }
      }
    }

    return routes;
  }

  /**
   * Normalizes path strings so you don't end up with double slashes.
   * E.g., "/users/" + "/:id" => "/users/:id".
   */
  private normalizePath(path: string): string {
    return path.replace(/\/+/g, '/').replace(/\/$/, '');
  }

  /**
   * Detect duplicates in an array of strings.
   */
  private findDuplicates(paths: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    paths.forEach((path) => {
      if (seen.has(path)) {
        duplicates.add(path);
      } else {
        seen.add(path);
      }
    });

    return Array.from(duplicates);
  }
}
