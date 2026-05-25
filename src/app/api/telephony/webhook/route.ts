import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

/**
 * POST /api/telephony/webhook
 * Intercepts the live incoming webhook event dispatched from Twilio's engine 
 * once the parent answers the phone.
 */
export async function POST(request: Request) {
  try {
    // 1. Twilio sends webhook data as URL-encoded form data (application/x-www-form-urlencoded)
    const formData = await request.formData();
    const callSid = formData.get('CallSid') as string;

    console.log(`Incoming live webhook event intercepted for CallSid: ${callSid}`);

    if (!callSid) {
      return new NextResponse(
        `<Response><Say>Error. Missing session tracking credentials.</Say></Response>`,
        { headers: { 'Content-Type': 'application/xml' } }
      );
    }

    // 2. Fetch the custom checklist configuration we saved in Upstash Redis during Day 2
    const cachedData = await redis.get(`call:${callSid}:config`);
    
    let checklistQuestion = "Namaste. This is your daily health check in. Please answer the following questions.";
    
    if (cachedData) {
      // Parse the stored data string back into a JSON object
      const config = typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData;
      
      if (config.questions && config.questions.length > 0) {
        // Grab the first question from our custom dashboard array to present to the user
        checklistQuestion = config.questions[0];
      }
      
      // Update the call state in Redis to reflect that it is now interactive
      config.status = 'IN_PROGRESS';
      await redis.set(`call:${callSid}:config`, JSON.stringify(config), { ex: 86400 });
    }

    // 3. Construct the TwiML XML Response
    // We use the 'en-IN' language code with the 'Polly.Raveena' neural voice 
    // to give it a natural, clear Indian accent.
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Raveena" language="en-IN">
        ${checklistQuestion} Please answer after the beep, and press the hash key when you are finished.
    </Say>
    <Record 
        action="${process.env.NEXT_PUBLIC_TUNNEL_URL}/api/telephony/process"
        method="POST"
        maxLength="30"
        finishOnKey="#"
        playBeep="true"
    />
    <Say voice="Polly.Raveena" language="en-IN">We did not receive your response. Goodbye.</Say>
</Response>`.trim();

    // 4. Return raw XML back to Twilio's edge server with the correct content-type header
    return new NextResponse(twimlResponse, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: any) {
    console.error("Critical Failure in Telephony Webhook Processing Pipeline:", error);
    
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>System error encountered.</Say></Response>`;
    return new NextResponse(errorTwiml, {
      headers: { 'Content-Type': 'application/xml' },
    });
  }
}

/**
 * GET /api/telephony/webhook
 * Acts as a pre-flight diagnostics endpoint to safely verify browser connectivity,
 * domain validation, and bypass Ngrok interstitial landing frames.
 */
export async function GET() {
  const testTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Raveena" language="en-IN">
        Browser verification success. The webhook endpoint is online and reachable.
    </Say>
</Response>`.trim();

  return new NextResponse(testTwiml, {
    headers: { 
      'Content-Type': 'application/xml',
      'Cache-Control': 'no-cache',
    },
  });
}