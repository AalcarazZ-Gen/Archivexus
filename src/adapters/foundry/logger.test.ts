import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('prefixes info messages with the module id and logs via console.log', () => {
    const log = createLogger('archivexus');
    log.info('Initializing');
    expect(logSpy).toHaveBeenCalledWith('archivexus |', 'Initializing');
  });

  it('prefixes warn messages with the module id and logs via console.warn', () => {
    const log = createLogger('archivexus');
    log.warn('Something looked off');
    expect(warnSpy).toHaveBeenCalledWith('archivexus |', 'Something looked off');
  });

  it('prefixes error messages with the module id and logs via console.error', () => {
    const log = createLogger('archivexus');
    log.error('Something failed');
    expect(errorSpy).toHaveBeenCalledWith('archivexus |', 'Something failed');
  });

  it('reuses the same module id prefix across calls from one logger', () => {
    const log = createLogger('other-module');
    log.info('first');
    log.info('second');
    expect(logSpy).toHaveBeenNthCalledWith(1, 'other-module |', 'first');
    expect(logSpy).toHaveBeenNthCalledWith(2, 'other-module |', 'second');
  });
});
