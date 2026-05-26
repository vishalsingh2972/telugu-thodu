import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { generateMedicalReport } from '@/lib/evaluator';
import { sendNriWhatsAppAlert } from '@/lib/whatsapp';

export async function POST(request: Request) {
  try {
    // 1. Parse incoming application/x-www-form-urlencoded metadata from Twilio
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;

    console.log(`Processing recorded response for CallSid: ${callSid}`);
    console.log(`Twilio Recording Hosted Address: ${recordingUrl}`);

    if (!callSid || !recordingUrl) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Error capturing response assets.</Say></Response>`,
        { headers: { 'Content-Type': 'application/xml' } }
      );
    }

    // 2. Fetch the existing call configuration from Upstash Redis
    const cachedData = await redis.get(`call:${callSid}:config`);
    if (!cachedData) {
      console.error(`No tracking config found in Redis for CallSid: ${callSid}`);
    }

    let transcriptText = "No response captured.";
    let detectedLanguage = "unknown";

    try {
      // 3. Download the raw audio recording from Twilio's cloud storage safely.
      const twilioAuthHeader = Buffer.from(
        `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
      ).toString('base64');

      console.log("Downloading authenticated voice payload from Twilio Edge servers...");
      
      const audioResponse = await fetch(`${recordingUrl}.wav`, {
        headers: {
          'Authorization': `Basic ${twilioAuthHeader}`
        }
      });

      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio from Twilio payload. Status: ${audioResponse.status}`);
      }
      const audioBlob = await audioResponse.blob();

      // 4. Packaging the payload as multipart/form-data for Sarvam AI REST Specifications
      const sarvamPayload = new FormData();
      const audioFile = new File([audioBlob], "recording.wav", { type: "audio/wav" });
      
      sarvamPayload.append('file', audioFile);
      sarvamPayload.append('model', 'saaras:v3');
      sarvamPayload.append('mode', 'translate'); 

      console.log("Dispatching audio binary packet to Sarvam AI Core Engines...");
      
      const sarvamResponse = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: {
          'api-subscription-key': process.env.SARVAM_API_KEY || ''
        },
        body: sarvamPayload
      });

      if (!sarvamResponse.ok) {
        const errText = await sarvamResponse.text();
        throw new Error(`Sarvam AI STT Pipeline rejected packet: ${sarvamResponse.status} - ${errText}`);
      }

      const sarvamData = await sarvamResponse.json();
      transcriptText = sarvamData.transcript || "Speech recognized, but empty transcript returned.";
      detectedLanguage = sarvamData.language_code || "unknown";

      console.log(`[Sarvam AI Success] Detected Language: ${detectedLanguage}`);
      console.log(`[Sarvam AI Transcript Summary]: "${transcriptText}"`);

    } catch (sttError) {
      console.error("Non-blocking pipeline exception during Audio Transcription phase:", sttError);
      transcriptText = "[Error processing audio transcription asset]";
    }

    // 5. Update call config status, trigger Gemini Medical Analysis Engine, and send WhatsApp Alert
    if (cachedData) {
      const config = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
      
      // Update the basic call tracker configurations
      config.status = 'COMPLETED';
      config.userResponseTranscript = transcriptText;
      config.userLanguageDetected = detectedLanguage;
      config.completedAt = new Date().toISOString();

      // Save the updated configuration map back to Redis
      await redis.set(`call:${callSid}:config`, JSON.stringify(config), { ex: 86400 });
      console.log(`Database transaction locked. State successfully updated to COMPLETED for call:${callSid}`);

      // Extract the original question asked (fall back to a placeholder if missing)
      const originalQuestion = config.questions?.[0] || "General health inquiry";

      console.log("Passing context data to Gemini Evaluation Pipeline...");
      // Trigger Gemini to analyze the context using your strict schemas
      const wellnessReport = await generateMedicalReport(callSid, originalQuestion, transcriptText);

      // Save the structured medical report into Redis under a dedicated report key
      await redis.set(`call:${callSid}:report`, JSON.stringify(wellnessReport), { ex: 86400 });
      console.log(`[Database Success] Structured clinical wellness report successfully written to call:${callSid}:report`);

      // --- NEW WHATSAPP DISPATCH GATEWAY ---
      // Look for the targeted destination number saved during trigger configuration setup
      // Falling back safely to your test number configuration if undefined
      const nriRecipient = config.nriPhoneNumber || config.phoneNumber || "+916303366896";

      console.log(`Routing analysis to WhatsApp distribution layer for recipient: ${nriRecipient}`);
      
      // Fire the asynchronous conditional notifier 
      await sendNriWhatsAppAlert(
        nriRecipient,
        wellnessReport.overallMood, 
        wellnessReport.aiNarrativeSummary
      );
      // -------------------------------------
    }

    // 6. Build the final TwiML instructions to gracefully conclude the call session - message that is read on the call in the end
    const finalTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Raveena" language="en-IN">
        Thank you for updating your health dashboard. Have a wonderful day ahead. Goodbye.
    </Say>
    <Hangup/>
</Response>`.trim();

    return new NextResponse(finalTwiml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: any) {
    console.error("Critical Failure in Audio Processing Pipeline Route:", error);
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>System exception cleared.</Say><Hangup/></Response>`,
      { headers: { 'Content-Type': 'application/xml' } }
    );
  }
}