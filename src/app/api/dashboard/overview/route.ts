import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    console.log("Compiling macro dashboard metrics from Upstash Redis clusters...");

    // 1. Scan Redis for all active call configurations
    const keys = await redis.keys('call:*:config');
    
    let totalCalls = keys.length;
    let completedCalls = 0;
    let concernedAlerts = 0;
    let totalAdherenceScore = 0;
    let countedAdherenceRecords = 0;

    // 2. Loop through records to calculate aggregates
    for (const configKey of keys) {
      const cachedConfig = await redis.get(configKey);
      if (!cachedConfig) continue;

      const config = typeof cachedConfig === 'string' ? JSON.parse(cachedConfig) : cachedConfig;
      
      if (config.status === 'COMPLETED') {
        completedCalls++;
        
        // Pull down corresponding clinical report metadata matching this CallSid
        const callSid = configKey.split(':')[1];
        const cachedReport = await redis.get(`call:${callSid}:report`);
        
        if (cachedReport) {
          const report = typeof cachedReport === 'string' ? JSON.parse(cachedReport) : cachedReport;
          
          // Track escalation counts
          if (report.overallMood === 'CONCERNED') {
            concernedAlerts++;
          }

          // Track compliance/adherence trends across questions
          if (report.customChecklistTracked) {
            report.customChecklistTracked.forEach((item: any) => {
              // Extract numeric adherence metric if it exists in your schema
              if (typeof item.adherenceScore === 'number') {
                totalAdherenceScore += item.adherenceScore;
                countedAdherenceRecords++;
              }
            });
          }
        }
      }
    }

    // 3. Compute clean baseline averages
    const averageCompliance = countedAdherenceRecords > 0 
      ? Math.round((totalAdherenceScore / countedAdherenceRecords) * 100) / 100
      : 100; // Default to perfect compliance if no tracking arrays exist yet

    const responsePayload = {
      summary: {
        totalCallsRouted: totalCalls,
        successfulCheckins: completedCalls,
        criticalEscalations: concernedAlerts,
        globalComplianceRate: averageCompliance
      },
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(responsePayload, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      }
    });

  } catch (error) {
    console.error("Critical fault executing dashboard overview aggregation matrix:", error);
    return NextResponse.json(
      { error: "Internal compilation failure on database scan operations" },
      { status: 500 }
    );
  }
}