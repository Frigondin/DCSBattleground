import { serverStore, updateServerStore, setSelectedEntityId } from '../stores/ServerStore';

describe('serverStore', () => {
  beforeEach(() => {
    serverStore.setState({
      editor_mode_on: false,
      server: null,
      entities: serverStore.getState().entities.clear(),
      offset: 0,
      sessionId: null,
      selectedEntityId: null,
    });
  });

  it('met à jour le store avec updateServerStore', () => {
    updateServerStore({ offset: 42, sessionId: 'abc' });

    const state = serverStore.getState();
    expect(state.offset).toBe(42);
    expect(state.sessionId).toBe('abc');
  });

  it('change selectedEntityId avec setSelectedEntityId', () => {
    setSelectedEntityId(123);
    expect(serverStore.getState().selectedEntityId).toBe(123);

    setSelectedEntityId(null);
    expect(serverStore.getState().selectedEntityId).toBeNull();
  });
});

