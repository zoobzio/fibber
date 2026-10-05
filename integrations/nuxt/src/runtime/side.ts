/**
 * Whether this code is running in the server render. Its own module so the
 * one place that asks can be answered either way under test.
 */
export const onServer = (): boolean => import.meta.server === true;
