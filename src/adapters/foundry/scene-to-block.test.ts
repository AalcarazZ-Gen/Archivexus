import { describe, expect, it } from 'vitest';
import { mapSceneToBlock, SCENE_BLOCK_TYPE } from './scene-to-block.js';

describe('mapSceneToBlock', () => {
  it('maps a Scene to a { type: "scene", uuid, title } Block', () => {
    expect(mapSceneToBlock({ uuid: 'Scene.abc', name: 'The Docks' })).toEqual({
      type: SCENE_BLOCK_TYPE,
      uuid: 'Scene.abc',
      title: 'The Docks',
    });
  });

  it('trims the title and keeps the uuid verbatim', () => {
    const block = mapSceneToBlock({ uuid: 'Scene.xyz', name: '  Market Square  ' });
    expect(block.title).toBe('Market Square');
    expect(block.uuid).toBe('Scene.xyz');
  });

  it('produces a frozen Block (createBlock contract)', () => {
    expect(Object.isFrozen(mapSceneToBlock({ uuid: 'Scene.1', name: 'X' }))).toBe(true);
  });
});
