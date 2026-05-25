import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { redis } from '@/lib/redis';
import { CallConfigSchema } from '@/lib/schemas';

// Initialize the Twilio client using our verified environment configurations
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Establish default fallback check-in questions if none are passed in the request body
    const incomingQuestions = body.questions && body.questions.length > 0 
      ? body.questions 
      : [
          "Namaste amma, did you take your morning blood pressure medication today?",
          "Have you eaten your lunch on time?",
          "Are you experiencing any unexpected joint pain or dizziness right now?"
        ];

    // 2. Enforce type-safety on incoming variables via our Day 1 Zod validation layer
    const validationResult = CallConfigSchema.safeParse({
      phoneNumber: body.phoneNumber,
      questions: incomingQuestions,
      status: 'INITIATED'
    });

    if (!validationResult.success) {
      return NextResponse.json({ 
        success: false, 
        error: "Invalid request payload match", 
        details: validationResult.error.format() 
      }, { status: 400 });
    }

    const { phoneNumber, questions } = validationResult.data;

    // 3. Construct the Webhook callback path that Twilio will reach out to when the user answers
    // This points directly to the Ngrok public tunnel we configured inside your environment vars
    const webhookUrl = `${process.env.NEXT_PUBLIC_TUNNEL_URL}/api/telephony/webhook`;

    if (!process.env.NEXT_PUBLIC_TUNNEL_URL) {
      return NextResponse.json({ 
        success: false, 
        error: "Missing NEXT_PUBLIC_TUNNEL_URL setup in environment files" 
      }, { status: 500 });
    }

    // 4. Dispatch the Outbound Call Command to the Twilio REST Telephony Edge
    const call = await twilioClient.calls.create({
      url: webhookUrl,
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER!,
      method: 'POST'
    });

    // 5. Atomic State Cache Storage
    // Save your custom question parameters inside Upstash Redis tied directly to this unique call ID
    const redisCachePayload = {
      phoneNumber,
      questions,
      status: 'INITIATED',
      createdAt: new Date().toISOString()
    };

    // Store configuration data with a 24-hour expiration safety limit (86400 seconds)
    await redis.set(`call:${call.sid}:config`, JSON.stringify(redisCachePayload), { ex: 86400 });

    // 6. Respond with the live tracking information
    return NextResponse.json({
      success: true,
      message: "Outbound telephony session initiated successfully",
      callSid: call.sid,
      trackingKey: `call:${call.sid}:config`
    });

  } catch (error: any) {
    console.error("Critical Failure in Outbound Trigger Route:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Internal Server Exception encountered during session initialization", 
      message: error.message 
    }, { status: 500 });
  }
}