import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE = Symbol('skip-envelope');

/** Skips the global success response envelope for a controller or route. */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE, true);
