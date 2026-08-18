import { NotFoundException } from '@nestjs/common';

const InvoiceErrorCode = {
    NotFound: 'INVOICE_NOT_FOUND',
} as const;

export class InvoiceNotFoundException extends NotFoundException {
    constructor() {
        super({
            code: InvoiceErrorCode.NotFound,
            message: 'Invoice was not found',
        });
    }
}
