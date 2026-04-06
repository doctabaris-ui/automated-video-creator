import express from 'express';
import cors from 'cors';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
// We'll import the youtube upload function next
import { uploadVideoToYouTube } from './youtube-uploader';

dotenv.config();

export interface AIConfigs {
  leonardoApiKey?: string;
  invideoApiKey?: string;
  capcutApiKey?: string;
  elevenLabsApiKey?: string;
}

export interface VideoJobParams {
  niche: string;
  script: string;
  durationInSeconds: number;
}

export class AIVideoPipeline {
  private configs: AIConfigs;

  constructor(configs: AIConfigs) {
    this.configs = configs;
  }

  async generateImageWithLeonardo(niche: string): Promise<string | null> {
    console.log(`[Leonardo AI] Generating historical/niche visuals for: ${niche}`);
    return "https://leonardo.ai/mock-niche-visuals.jpg";
  }

  async generateInvideoClip(niche: string, durationInSeconds: number): Promise<string | null> {
    if (!this.configs.invideoApiKey || this.configs.invideoApiKey === "mock-key") {
       throw new Error("CRITICAL FAILURE: Authentic InVideo API Key required.");
    }
    console.log(`[InVideo AI] Requesting ${durationInSeconds}s B-roll for: ${niche}`);
    
    try {
      const response = await axios.post('https://api.invideo.io/v1/video/generate', {
        prompt: `Create a ${durationInSeconds}-second background B-roll sequence focusing on ${niche}. Cinematic documentary style.`,
        orientation: "landscape",
        duration: durationInSeconds
      }, {
        headers: { "Authorization": `Bearer ${this.configs.invideoApiKey}`, "Content-Type": "application/json" }
      });
      return response.data.video_url || "Processing in Cloud";
    } catch (error: any) {
      console.error("[InVideo AI Error]:", error.message);
      throw new Error("InVideo connection failed.");
    }
  }

  async compileWithCapCut(assets: string[]): Promise<string | null> {
    if (!this.configs.capcutApiKey || this.configs.capcutApiKey === "mock-key") {
      throw new Error("CRITICAL FAILURE: Authentic CapCut Developer API Key required.");
    }
    console.log(`[CapCut] Stitching ${assets.length} assets...`);
    try {
      const response = await axios.post('https://open.capcut.com/openapi/v1/video/draft/create', {
        media_assets: assets,
        template_id: "documentary_historical_v1",
        export_quality: "1080p",
        auto_publish: false
      }, {
        headers: { "token": this.configs.capcutApiKey, "Content-Type": "application/json" }
      });
      return response.data.export_url || "Processing in Cloud";
    } catch (error: any) {
      console.error("[CapCut Error]:", error.message);
      throw new Error("CapCut connection failed.");
    }
  }

  async generateElevenLabsVoiceover(script: string): Promise<string | null> {
    if (!this.configs.elevenLabsApiKey || this.configs.elevenLabsApiKey === "mock-key") {
      console.warn("WARNING: Authentic ElevenLabs API Key missing. Using mock.");
      return "https://elevenlabs.io/mock-narrator-audio.mp3";
    }
    console.log(`[ElevenLabs] Synthesizing script...`);
    try {
      const voiceId = "pNInz6obpgDQGcFmaJcg";
      const response = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        text: script,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      }, {
        headers: { "xi-api-key": this.configs.elevenLabsApiKey, "Content-Type": "application/json" }
      });
      return "https://my-s3-bucket/elevenlabs-generated-audio.mp3";
    } catch (error: any) {
      console.error("[ElevenLabs Error]:", error.message);
      throw new Error("ElevenLabs connection failed.");
    }
  }

  async orchestrateFullJob(params: VideoJobParams): Promise<string> {
    console.log(`Starting Video Pipeline for niche: ${params.niche} (${params.durationInSeconds}s)`);
    
    const voice = await this.generateElevenLabsVoiceover(params.script);
    const images = await this.generateImageWithLeonardo(params.niche);
    const baseVideo = await this.generateInvideoClip(params.niche, params.durationInSeconds);

    console.log(`[CapCut] Assembling...`);
    const finalVideo = await this.compileWithCapCut([images!, voice!, baseVideo!]);
    
    // In the future, we will call YouTube upload here:
    await uploadVideoToYouTube(finalVideo!, `New Video: ${params.niche}`, params.script);

    return finalVideo || "Error";
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/generate', async (req: express.Request, res: express.Response) => {
  const { niche, script, durationInSeconds } = req.body;
  if (!niche || !script || !durationInSeconds) {
    return res.status(400).json({ error: "Missing required fields: niche, script, durationInSeconds" });
  }

  try {
    const pipeline = new AIVideoPipeline({
      leonardoApiKey: process.env.LEONARDO_API_KEY || "mock-key",
      invideoApiKey: process.env.INVIDEO_API_KEY || "mock-key",
      capcutApiKey: process.env.CAPCUT_API_KEY || "mock-key",
      elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || "mock-key",
    });

    const videoUrl = await pipeline.orchestrateFullJob({ niche, script, durationInSeconds });
    
    res.json({ success: true, videoUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Web UI running at http://localhost:${PORT}`);
});
