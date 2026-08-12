import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// @Schema({ strict: false, timestamps: true, collection: 'resource_url_routes' })f
@Schema({ timestamps: true, collection: 'resource_url_routes' })
export class ResourceUrlRoute extends Document {  

    @Prop({ required: true, unique: true })
    resource_id: number;

    @Prop({ required: true })
    resource_name: string;

    @Prop()
    url_route_access: string[];

    @Prop({ required: true, default: false })
    is_deleted: boolean;

}

// export type ResourceUrlRouteDocument = ResourceUrlRoute & Document;

export const ResourceUrlRouteSchema = SchemaFactory.createForClass(ResourceUrlRoute);
