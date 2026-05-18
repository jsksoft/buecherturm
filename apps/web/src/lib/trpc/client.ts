import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@buecherturm/api';

export const trpc = createTRPCReact<AppRouter>();
