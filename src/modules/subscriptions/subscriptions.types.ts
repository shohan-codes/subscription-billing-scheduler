import type { Selectable } from 'kysely';
import type { SubscriptionsTable } from '../../database/database.types';

export type SubscriptionRecord = Selectable<SubscriptionsTable>;
