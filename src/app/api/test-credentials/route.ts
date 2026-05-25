//npm run dev http://localhost:3000/api/test-credentials

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { GoogleGenAI } from '@google/genai';
import twilio from 'twilio';

export async function GET() {
  const reports: Record<string, any> = {};

  // 1. Audit Upstash Redis Cache Connection
  try {
    const redis = Redis.fromEnv();
    await redis.set('connection_test_key', 'UPSTASH_IS_LIVE');
    const redisData = await redis.get('connection_test_key');
    reports.upstashRedis = redisData === 'UPSTASH_IS_LIVE' ? 'SUCCESS ✅' : 'FAILED ❌';
  } catch (err: any) {
    reports.upstashRedis = `FAILED ❌ (${err.message})`;
  }

  // 2. Audit Google Gemini Inference Engine
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Respond with only the word "SUCCESS"',
    });
    reports.googleGemini = response.text?.trim().includes('SUCCESS') ? 'SUCCESS ✅' : 'FAILED ❌';
  } catch (err: any) {
    reports.googleGemini = `FAILED ❌ (${err.message})`;
  }

  // 3. Audit Twilio Communication Gateway Credentials
  try {
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
    // Fetch account info to verify keys are accepted by the server
    const account = await twilioClient.api.v2010.accounts(process.env.TWILIO_ACCOUNT_SID!).fetch();
    reports.twilioGateway = account.status === 'active' ? 'SUCCESS ✅' : 'FAILED ❌';
  } catch (err: any) {
    reports.twilioGateway = `FAILED ❌ (${err.message})`;
  }

  return NextResponse.json({ 
    message: "Telugu Thodu Pre-flight Infrastructure Diagnostics", 
    results: reports 
  });
}