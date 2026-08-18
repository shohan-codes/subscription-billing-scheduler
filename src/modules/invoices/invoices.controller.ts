import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiRoute } from '../../common/decorators/api-route.decorator';
import {
    GetInvoiceRequest,
    GetInvoiceResponse,
    ListInvoicesRequest,
    ListInvoicesResponse,
} from './invoices.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
    constructor(private readonly service: InvoicesService) {}

    /** Lists persisted invoice snapshots with filters and cursor pagination. */
    @Get()
    @ApiRoute({
        summary: 'List invoices',
        auth: false,
        responseType: ListInvoicesResponse,
    })
    list(@Query() request: ListInvoicesRequest): Promise<ListInvoicesResponse> {
        return this.service.list(request);
    }

    /** Retrieves one invoice with its line-item snapshots and scheduler run reference. */
    @Get(':id')
    @ApiRoute({
        summary: 'Get an invoice',
        auth: false,
        notFound: true,
        responseType: GetInvoiceResponse,
    })
    get(@Param() request: GetInvoiceRequest): Promise<GetInvoiceResponse> {
        return this.service.get(request);
    }
}
