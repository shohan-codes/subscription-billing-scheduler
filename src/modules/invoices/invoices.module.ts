import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { DatabaseModule } from '../../database/database.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { InvoicesAction } from './invoices.action';
import { InvoicesController } from './invoices.controller';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

@Module({
    imports: [CommonModule, DatabaseModule, SubscriptionsModule],
    controllers: [InvoicesController],
    providers: [InvoicesService, InvoicesAction, InvoicesRepository],
    exports: [InvoicesService],
})
export class InvoicesModule {}
