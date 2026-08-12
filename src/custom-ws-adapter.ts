
import { INestApplicationContext } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

export class CustomWsAdapter extends WsAdapter {
    constructor(app: INestApplicationContext, private readonly prefix: string) {
        super(app);
        if (!prefix) {
            throw new Error('WebSocket prefix must be provided');
        }
    }

    create(port: number, options?: any): any {
        console.log('options', options);
        if (options.path) {
            // options.path = `/${process.env.WS_PREFIX}/${options.path}`;
            options.path = `/${this.prefix}/${options.path}`;
            options.path = options.path?.replace("//", "/")
        }
        console.log("WS options.path ", options.path);
        return super.create(port, options);
    }
}
