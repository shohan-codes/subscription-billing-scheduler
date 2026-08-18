import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { DatabaseModule } from '../../database/database.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

@Module({
    imports: [CommonModule, DatabaseModule],
    controllers: [InvoicesController],
    providers: [InvoicesService, InvoicesRepository],
})
export class InvoicesModule {}
