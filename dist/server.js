"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIVideoPipeline = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
// We'll import the youtube upload function next
const youtube_uploader_1 = require("./youtube-uploader");
dotenv_1.default.config();
class AIVideoPipeline {
    configs;
    constructor(configs) {
        this.configs = configs;
    }
    async generateImageWithLeonardo(niche) {
        console.log(`[Leonardo AI] Generating historical/niche visuals for: ${niche}`);
        return "https://leonardo.ai/mock-niche-visuals.jpg";
    }
    async generateInvideoClip(niche, durationInSeconds) {
        if (!this.configs.invideoApiKey || this.configs.invideoApiKey === "mock-key") {
            throw new Error("CRITICAL FAILURE: Authentic InVideo API Key required.");
        }
        console.log(`[InVideo AI] Requesting ${durationInSeconds}s B-roll for: ${niche}`);
        try {
            const response = await axios_1.default.post('https://api.invideo.io/v1/video/generate', {
                prompt: `Create a ${durationInSeconds}-second background B-roll sequence focusing on ${niche}. Cinematic documentary style.`,
                orientation: "landscape",
                duration: durationInSeconds
            }, {
                headers: { "Authorization": `Bearer ${this.configs.invideoApiKey}`, "Content-Type": "application/json" }
            });
            return response.data.video_url || "Processing in Cloud";
        }
        catch (error) {
            console.error("[InVideo AI Error]:", error.message);
            throw new Error("InVideo connection failed.");
        }
    }
    async compileWithCapCut(assets) {
        if (!this.configs.capcutApiKey || this.configs.capcutApiKey === "mock-key") {
            throw new Error("CRITICAL FAILURE: Authentic CapCut Developer API Key required.");
        }
        console.log(`[CapCut] Stitching ${assets.length} assets...`);
        try {
            const response = await axios_1.default.post('https://open.capcut.com/openapi/v1/video/draft/create', {
                media_assets: assets,
                template_id: "documentary_historical_v1",
                export_quality: "1080p",
                auto_publish: false
            }, {
                headers: { "token": this.configs.capcutApiKey, "Content-Type": "application/json" }
            });
            return response.data.export_url || "Processing in Cloud";
        }
        catch (error) {
            console.error("[CapCut Error]:", error.message);
            throw new Error("CapCut connection failed.");
        }
    }
    async generateElevenLabsVoiceover(script) {
        if (!this.configs.elevenLabsApiKey || this.configs.elevenLabsApiKey === "mock-key") {
            console.warn("WARNING: Authentic ElevenLabs API Key missing. Using mock.");
            return "https://elevenlabs.io/mock-narrator-audio.mp3";
        }
        console.log(`[ElevenLabs] Synthesizing script...`);
        try {
            const voiceId = "pNInz6obpgDQGcFmaJcg";
            const response = await axios_1.default.post(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                text: script,
                model_id: "eleven_monolingual_v1",
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            }, {
                headers: { "xi-api-key": this.configs.elevenLabsApiKey, "Content-Type": "application/json" }
            });
            return "https://my-s3-bucket/elevenlabs-generated-audio.mp3";
        }
        catch (error) {
            console.error("[ElevenLabs Error]:", error.message);
            throw new Error("ElevenLabs connection failed.");
        }
    }
    async orchestrateFullJob(params) {
        console.log(`Starting Video Pipeline for niche: ${params.niche} (${params.durationInSeconds}s)`);
        const voice = await this.generateElevenLabsVoiceover(params.script);
        const images = await this.generateImageWithLeonardo(params.niche);
        const baseVideo = await this.generateInvideoClip(params.niche, params.durationInSeconds);
        console.log(`[CapCut] Assembling...`);
        const finalVideo = await this.compileWithCapCut([images, voice, baseVideo]);
        // In the future, we will call YouTube upload here:
        await (0, youtube_uploader_1.uploadVideoToYouTube)(finalVideo, `New Video: ${params.niche}`, params.script);
        return finalVideo || "Error";
    }
}
exports.AIVideoPipeline = AIVideoPipeline;
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
app.post('/api/generate', async (req, res) => {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web UI running at http://localhost:${PORT}`);
});
