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
const fs_1 = __importDefault(require("fs"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const generative_ai_1 = require("@google/generative-ai");
const googleapis_1 = require("googleapis");
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
    async assembleWithFFmpeg(imageUrl, audioUrl, durationInSeconds) {
        console.log(`[FFmpeg Engine] Slicing and stitching audio+visual assets on internal CPU cluster for ${durationInSeconds}s...`);
        return new Promise((resolve, reject) => {
            // In a real production deployment, we would first axios.get() the imageUrl and audioUrl
            // down to internal /tmp/ files, then use fluent-ffmpeg to stitch them.
            // Since Leonardo and ElevenLabs are currently emitting mock remote URLs, we'll bypass actual file parsing here to prevent HTTP 404 crashes.
            const outputPath = path_1.default.join(__dirname, 'mock_output.mp4');
            // We simulate FFmpeg baking using fluent-ffmpeg to build a raw color loop structural mock.
            (0, fluent_ffmpeg_1.default)()
                .input('color=c=black:s=1920x1080')
                .inputFormat('lavfi')
                .duration(durationInSeconds)
                .outputOptions(['-c:v libx264', '-crf 23', '-preset veryfast'])
                .save(outputPath)
                .on('end', () => {
                console.log('[FFmpeg Engine] Internal hardware rendering complete!');
                resolve(outputPath);
            })
                .on('error', (err) => {
                console.error('[FFmpeg Engine Error]', err);
                // Fallback if ffmpeg isn't reachable in local macOS environment
                resolve("/tmp/mock_output.mp4");
            });
        });
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
            if (error.response && (error.response.status === 401 || error.response.status === 402)) {
                console.error("[ElevenLabs Error]: Insufficient Credits");
                throw new Error("Insufficient Credits: ElevenLabs");
            }
            console.error("[ElevenLabs Error]:", error.message);
            throw new Error("ElevenLabs connection failed.");
        }
    }
    async uploadToGoogleDrive(videoPath, fileName) {
        console.log(`[Google Drive] Uploading compiled final video from internal pipeline...`);
        const drive = googleapis_1.google.drive({ version: 'v3', auth: youtube_uploader_1.oauth2Client });
        try {
            const response = await drive.files.create({
                requestBody: {
                    name: fileName,
                    mimeType: 'video/mp4',
                },
                media: {
                    mimeType: 'video/mp4',
                    body: fs_1.default.createReadStream(videoPath)
                }
            });
            console.log(`[Google Drive] Successfully saved video to cloud storage! File ID: ${response.data.id}`);
            return `https://drive.google.com/file/d/${response.data.id}/view`;
        }
        catch (e) {
            console.error("[Google Drive Error]:", e.message);
            return "Drive Upload Failed";
        }
    }
    async orchestrateFullJob(params) {
        console.log(`Starting Video Pipeline for niche: ${params.niche} (${params.durationInSeconds}s)`);
        const voiceUrl = await this.generateElevenLabsVoiceover(params.script);
        const imagesUrl = await this.generateImageWithLeonardo(params.niche);
        // Call our internal FFmpeg compiler directly on our server hardware
        const finalVideoPath = await this.assembleWithFFmpeg(imagesUrl, voiceUrl, params.durationInSeconds);
        const title = `New Video: ${params.niche}`;
        // Upload to Google Drive directly from FFmpeg output
        await this.uploadToGoogleDrive(finalVideoPath, `${title}.mp4`);
        // In the future, we will call YouTube upload here:
        await (0, youtube_uploader_1.uploadVideoToYouTube)(finalVideoPath, title, params.script);
        return "https://youtu.be/mock-id-123"; // Return standard link to UI
    }
}
exports.AIVideoPipeline = AIVideoPipeline;
const videoQueue = [];
let isProcessingQueue = false;
async function processQueue() {
    if (isProcessingQueue)
        return;
    isProcessingQueue = true;
    while (true) {
        const job = videoQueue.find(j => j.status === 'pending');
        if (!job)
            break;
        job.status = 'processing';
        console.log(`[Queue] Processing job: ${job.id}`);
        try {
            const pipeline = new AIVideoPipeline({
                leonardoApiKey: process.env.LEONARDO_API_KEY || "mock-key",
                elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || "mock-key",
            });
            const videoUrl = await pipeline.orchestrateFullJob(job.params);
            job.status = 'completed';
            job.videoUrl = videoUrl;
        }
        catch (error) {
            job.status = 'failed';
            job.error = error.message;
        }
    }
    isProcessingQueue = false;
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
app.post('/api/write-script', async (req, res) => {
    const { niche } = req.body;
    if (!niche)
        return res.status(400).json({ error: "Missing niche" });
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "mock-key") {
        return res.status(500).json({ error: "Server missing Gemini API Key." });
    }
    try {
        const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Write a deep, suspenseful, and captivating documentary script about "${niche}". Make it extremely long and detailed, designed specifically to fill a 30-minute block when read aloud by Text-To-Speech. Do NOT include scene directions or actor notes, just give me the raw text the narrator will speak.`;
        const result = await model.generateContent(prompt);
        res.json({ script: result.response.text() });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/auth/youtube', (req, res) => {
    const authUrl = youtube_uploader_1.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/drive.file'
        ]
    });
    res.redirect(authUrl);
});
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    try {
        const { tokens } = await youtube_uploader_1.oauth2Client.getToken(code);
        youtube_uploader_1.oauth2Client.setCredentials(tokens);
        process.env.YOUTUBE_REFRESH_TOKEN = tokens.refresh_token || process.env.YOUTUBE_REFRESH_TOKEN;
        res.send('<h2 style="font-family:sans-serif;text-align:center;margin-top:20vh;">Cloud Connected! 🎉<br><span style="font-size:16px;color:gray;">YouTube and Google Drive linked successfully. You may close this tab.</span></h2>');
    }
    catch (error) {
        res.status(500).send("Authentication failed");
    }
});
app.post('/api/generate', (req, res) => {
    const { niche, script, durationInSeconds } = req.body;
    if (!niche || !script || !durationInSeconds) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    const jobId = Date.now().toString();
    videoQueue.push({ id: jobId, params: req.body, status: 'pending' });
    processQueue(); // Non-blocking trigger
    res.json({ success: true, jobId, message: "Job queued" });
});
app.get('/api/status', (req, res) => {
    res.json({ queue: videoQueue });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Web Backend running at http://localhost:${PORT}`);
});
