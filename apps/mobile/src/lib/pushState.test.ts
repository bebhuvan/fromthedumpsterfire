import { describe, expect, it } from 'vitest';
import { pendingRegistration } from './pushState';

describe('pendingRegistration', () => {
  it('sends nothing when the server already has the choice', () => {
    expect(pendingRegistration({ on: true, token: 't', platform: 'android', registered: true })).toBeNull();
    expect(pendingRegistration({ on: false, token: 't', platform: 'android', registered: true })).toBeNull();
  });

  it('sends nothing without a token', () => {
    expect(pendingRegistration({ on: false, registered: false })).toBeNull();
  });

  it('retries an opt-in the server missed', () => {
    expect(pendingRegistration({ on: true, token: 't', platform: 'android', registered: false })).toEqual({ token: 't', platform: 'android', enabled: true });
  });

  it('retries an opt-out the server missed, so a reader who said no stops getting notifications', () => {
    expect(pendingRegistration({ on: false, token: 't', platform: 'android', registered: false })).toEqual({ token: 't', platform: 'android', enabled: false });
  });
});
