import { Injectable } from '@nestjs/common';
import {
  GenerateScriptInput,
  GeneratedScriptOutput,
  TextGenerationProvider,
} from './text-generation.provider';
import { SceneItem, VideoMetadataPayload } from '../../database/entities/script.entity';

@Injectable()
export class MockTextProvider implements TextGenerationProvider {
  readonly providerName = 'mock';

  async generateScript(input: GenerateScriptInput): Promise<GeneratedScriptOutput> {
    const topic = input.topic || 'Original Technical Guide';
    const audience = input.targetAudience || 'Developers & Tech Enthusiasts';
    const isShort = input.format === 'short';
    const duration = input.targetDurationSeconds || (isShort ? 55 : 300);

    const outline = isShort
      ? [
          'High-impact problem hook',
          'The single key insight or technique',
          'Actionable demonstration',
          'Call to action / takeaway',
        ]
      : [
          '00:00 - The Hook & Core Problem',
          '00:45 - Why Conventional Solutions Fail',
          '01:30 - The Proven Architecture / Pattern',
          '03:00 - Practical Implementation Walkthrough',
          '04:15 - Key Gotchas & Optimization',
          '04:45 - Summary & Next Steps',
        ];

    const hook = `Have you ever wondered why most approaches to ${topic} end up creating more friction than they solve? Here is the exact methodology that changes everything.`;

    const content = isShort
      ? `[HOOK]\n${hook}\n\n[CORE INSIGHT]\nThe secret isn't more complexity—it's establishing clear boundaries from day one.\n\n[DEMO]\nNotice how isolating the core logic makes your workflow 10x more resilient.\n\n[CTA]\nDrop a comment with your biggest bottleneck and follow for more engineering breakdowns.`
      : `[SECTION 1: INTRODUCTION & HOOK]\n${hook}\nToday, we're doing a comprehensive deep dive tailored for ${audience}.\n\n[SECTION 2: THE PROBLEM WITH CONVENTIONAL WORKFLOWS]\nMost creators make the mistake of jumping directly into production without verifying provenance or structuring modular components. This leads to costly rework and quota issues.\n\n[SECTION 3: THE PROVEN FRAMEWORK]\nBy enforcing strict safety gates—human script approval, verified asset licensing, and local rendering—we guarantee reproducible quality with zero unauthorized third-party content.\n\n[SECTION 4: PRACTICAL STEP-BY-STEP]\nStep 1: Capture and research factual source references.\nStep 2: Generate and refine the scene-by-scene script outline.\nStep 3: Synchronize high-quality narration with tailored visual assets.\nStep 4: Execute local FFmpeg rendering and review FFprobe output metrics.\n\n[SECTION 5: SUMMARY & ACTIONABLE TAKEAWAY]\nAlways keep control over your workflow and verify every asset before staging a private upload. Subscribe for more production engineering tutorials.`;

    const scenePlan = await this.generateScenePlan(content, duration);
    const metadata = await this.generateMetadata(topic, content);

    return {
      title: `${topic}: The Complete Production Blueprint`,
      hook,
      content,
      outline,
      scenePlan,
      metadata,
      provider: 'mock',
      model: 'mock-engine-v1',
    };
  }

  async generateScenePlan(
    scriptContent: string,
    targetDurationSeconds: number,
  ): Promise<SceneItem[]> {
    const isShort = targetDurationSeconds <= 60;
    const sceneCount = isShort ? 4 : 6;
    const sceneDuration = Math.round(targetDurationSeconds / sceneCount);

    const scenes: SceneItem[] = [
      {
        sceneNumber: 1,
        durationSeconds: sceneDuration,
        visualDescription: 'Kinetic typography with high-contrast animated question card over dark abstract background',
        onScreenText: 'THE CORE BOTTLENECK',
        narrationSnippet: 'Have you ever wondered why most approaches end up creating more friction than they solve?',
        suggestedAssetType: 'graphic',
      },
      {
        sceneNumber: 2,
        durationSeconds: sceneDuration,
        visualDescription: 'Screen recording showing common architectural failure or workflow bottleneck',
        onScreenText: 'WHY STANDARD ATTEMPTS FAIL',
        narrationSnippet: 'Most creators make the mistake of skipping provenance verification...',
        suggestedAssetType: 'image',
      },
      {
        sceneNumber: 3,
        durationSeconds: sceneDuration,
        visualDescription: 'Clean modular architecture diagram animating boxes and arrows for safety gates',
        onScreenText: 'THE MODULAR FRAMEWORK',
        narrationSnippet: 'By enforcing strict safety gates, we guarantee reproducible quality...',
        suggestedAssetType: 'graphic',
      },
      {
        sceneNumber: 4,
        durationSeconds: sceneDuration,
        visualDescription: 'Smooth screen demonstration showing step-by-step editor and pipeline walkthrough',
        onScreenText: 'STEP-BY-STEP IMPLEMENTATION',
        narrationSnippet: 'Step 1: Capture and research source references. Step 2: Generate scene outline.',
        suggestedAssetType: 'video',
      },
    ];

    if (!isShort) {
      scenes.push(
        {
          sceneNumber: 5,
          durationSeconds: sceneDuration,
          visualDescription: 'Visual comparison table showing before vs after performance benchmarks',
          onScreenText: 'VERIFIED RESULTS',
          narrationSnippet: 'Notice how isolating core logic makes workflow resilient and predictable.',
          suggestedAssetType: 'image',
        },
        {
          sceneNumber: 6,
          durationSeconds: sceneDuration,
          visualDescription: 'Outro card with channel branding, key summary bullet points, and subscribe callout',
          onScreenText: 'KEY TAKEAWAYS & NEXT STEPS',
          narrationSnippet: 'Always keep control over your workflow before private staging.',
          suggestedAssetType: 'graphic',
        },
      );
    }

    return scenes;
  }

  async generateMetadata(
    title: string,
    scriptContent: string,
  ): Promise<VideoMetadataPayload> {
    const cleanTopic = title.replace(/[:]/g, '');
    return {
      title: `${cleanTopic} - Step-by-Step Practical Blueprint`,
      description: `In this video, we break down ${cleanTopic} from first principles with actionable examples.\n\n📌 Timestamps:\n00:00 - The Core Hook\n00:45 - The Conventional Mistake\n01:30 - The Proven Architecture\n03:00 - Step-by-Step Walkthrough\n04:30 - Key Takeaways\n\n🔒 Safety Note: All assets and demonstrations are original and locally verified.\n\n#YouTubeAutomation #Engineering #VideoProduction`,
      tags: [
        'youtube automation',
        'tutorial',
        'software engineering',
        'content creation',
        'production blueprint',
        'faceless channel',
      ],
      chapters: [
        { timestamp: '00:00', title: 'The Core Hook' },
        { timestamp: '00:45', title: 'The Conventional Mistake' },
        { timestamp: '01:30', title: 'The Proven Architecture' },
        { timestamp: '03:00', title: 'Step-by-Step Walkthrough' },
        { timestamp: '04:30', title: 'Key Takeaways' },
      ],
      suggestedThumbnailConcept:
        'High contrast dark background with bold yellow text "THE FIX", split screen showing chaotic workflow on left vs sleek pipeline on right',
    };
  }
}
