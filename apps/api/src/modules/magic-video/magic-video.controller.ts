import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MagicGenerateDto } from './dto/magic-generate.dto';
import { MagicVideoService } from './magic-video.service';
import { MagicGenerationResult } from './magic-video.interface';

@ApiTags('Magic Studio')
@Controller('magic')
export class MagicVideoController {
  constructor(private readonly magicService: MagicVideoService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'One-Prompt Video Generator: Creates script, voiceover, scene visuals, and burns captions into ready MP4',
  })
  @ApiResponse({
    status: 201,
    description: 'Finished video rendered and validated, ready for review and upload',
  })
  async generateVideo(@Body() dto: MagicGenerateDto): Promise<MagicGenerationResult> {
    return this.magicService.generateOneClickVideo(dto);
  }

  @Get('presets')
  @ApiOperation({ summary: 'Get sample viral prompts and available visual generation styles' })
  @ApiResponse({ status: 200, description: 'Presets and style configurations' })
  async getPresets() {
    return {
      styles: [
        {
          id: 'stock_broll',
          name: 'Dynamic B-Roll & Visual Accents (Pexels / Dynamic Motion)',
          description: 'Automatic high-definition vertical video footage matching script keywords',
          cost: 'Free',
        },
        {
          id: 'ai_avatar',
          name: 'AI Influencer / Virtual Host (HeyGen / D-ID)',
          description: 'Photorealistic talking avatar speaking to camera with audio lip-sync',
          cost: 'API Key Required',
        },
        {
          id: 'ai_generative',
          name: 'Generative AI Cinematic Video (Runway / Luma)',
          description: 'AI-generated video scenes based on each individual scene prompt',
          cost: 'API Key Required',
        },
        {
          id: 'motion_graphics',
          name: 'Minimalist Kinetic Motion Graphics',
          description: 'Clean typographic motion backgrounds with high-contrast subtitles',
          cost: 'Free',
        },
      ],
      sample_prompts: [
        '3 Mind-Blowing Facts About Deep Ocean Creatures You Did Not Know',
        'Top 5 AI Tools That Will Save You 10 Hours Every Single Week',
        'Why the James Webb Space Telescope Changes Everything We Know About the Universe',
        'The 1-Minute Rule for Breaking Procrastination and Rewiring Your Brain',
        'How Quantum Computers Will Break Modern Encryption in 5 Years',
      ],
    };
  }
}
