import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    console.log("Extracting raw historical call timelines from Upstash cluster...");

    // 1. Scan Redis for all configuration keys
    const configKeys = await redis.keys('call:*:config');
    
    const detailedLogs = [];

    // 2. Hydrate each call configuration with its corresponding AI Report
    for (const configKey of configKeys) {
      const callSid = configKey.split(':')[1];
      
      const cachedConfig = await redis.get(configKey);
      if (!cachedConfig) continue;
      
      const config = typeof cachedConfig === 'string' ? JSON.parse(cachedConfig) : cachedConfig;
      
      // Pull down the matching structured analysis output from Gemini
      const cachedReport = await redis.get(`call:${callSid}:report`);
      const report = cachedReport 
        ? (typeof cachedReport === 'string' ? JSON.parse(cachedReport) : cachedReport)
        : null;

      // Pack everything into a unified row format for our frontend table
      detailedLogs.push({
        callSid,
        phoneNumber: config.phoneNumber,
        status: config.status,
        scheduledAt: config.scheduledAt || config.completedAt,
        completedAt: config.completedAt || null,
        languageDetected: config.userLanguageDetected || 'unknown',
        rawTranscript: config.userResponseTranscript || null,
        analysis: report ? {
          overallMood: report.overallMood,
          summary: report.aiNarrativeSummary,
          checklist: report.customChecklistTracked || []
        } : null
      });
    }

    // 3. Sort chronologically (Most recent calls at the top)
    detailedLogs.sort((a, b) => {
      const dateA = new Date(a.scheduledAt || 0).getTime();
      const dateB = new Date(b.scheduledAt || 0).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({
      count: detailedLogs.length,
      calls: detailedLogs
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });

  } catch (error) {
    console.error("Critical failure compiling dashboard history pipeline:", error);
    return NextResponse.json(
      { error: "Internal engine fault compiling chronological call registries" },
      { status: 500 }
    );
  }
}