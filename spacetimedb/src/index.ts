// SpacetimeDB module entry (Part 2). `spacetime build/publish` reads this file.
// Every named export must be a spacetime export (reducer/view); helpers stay internal.
import { spacetimedb } from './schema';

export default spacetimedb;
export * from './reducers/admin';
export * from './reducers/reports';
export * from './reducers/verification';
export * from './reducers/affected';
export * from './reducers/worker';
export * from './reducers/scheduled';
export * from './reducers/notices';
export * from './reducers/blobs';
export * from './reducers/geocode';
export * from './reducers/accounts';
export * from './reducers/email_admin';
export * from './reducers/security';
export * from './views';
export * from './views_service';
export * from './views_web';
export * from './views_account';
export * from './views_security';
