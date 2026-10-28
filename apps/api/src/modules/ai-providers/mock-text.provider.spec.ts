import { MockTextProvider } from './mock-text.provider';

describe('MockTextProvider', () => {
  let provider: MockTextProvider;

  beforeEach(() => {
    provider = new MockTextProvider();
  });

  it('should generate structured script with outline, scene plan, and metadata', async () => {
    const output = await provider.generateScript({
      topic: 'Docker for NestJS Developers',
      targetAudience: 'Backend Developers',
      targetDurationSeconds: 300,
      format: 'long_form',
    });

    expect(output.provider).toBe('mock');
    expect(output.title).toContain('Docker for NestJS Developers');
    expect(output.hook).toBeDefined();
    expect(output.content).toContain('HOOK');
    expect(output.outline.length).toBeGreaterThan(0);
    expect(output.scenePlan.length).toBe(6);
    expect(output.scenePlan[0].sceneNumber).toBe(1);
    expect(output.metadata.tags).toContain('youtube automation');
    expect(output.metadata.chapters?.length).toBeGreaterThan(0);
  });

  it('should adjust scene count for short-form format', async () => {
    const output = await provider.generateScript({
      topic: 'Quick Git Trick',
      targetDurationSeconds: 50,
      format: 'short',
    });

    expect(output.scenePlan.length).toBe(4);
    expect(output.scenePlan[0].durationSeconds).toBeLessThanOrEqual(15);
  });
});
