"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Phone, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  RefreshCw, 
  Clock, 
  Globe2, 
  MessageSquare, 
  ChevronDown, 
  ChevronUp,
  HeartPulse,
  SlidersHorizontal,
  TrendingDown,
  FileDown,
  Mail,
  FileText
} from "lucide-react";

interface ChecklistItem {
  itemKey: string;
  originalQuestion: string;
  status: string;
  extractedDetails: string;
}

interface CallAnalysis {
  overallMood: "GOOD" | "CONCERNED" | string;
  summary: string;
  checklist: ChecklistItem[];
}

interface CallRecord {
  callSid: string;
  phoneNumber: string;
  status: "INITIATED" | "IN_PROGRESS" | "COMPLETED" | string;
  scheduledAt: string;
  completedAt: string | null;
  languageDetected: string;
  rawTranscript: string | null;
  analysis: CallAnalysis | null;
}

interface OverviewData {
  summary: {
    totalCallsRouted: number;
    successfulCheckins: number;
    criticalEscalations: number;
    globalComplianceRate: number;
  };
  timestamp: string;
}

type SortOption = "DATE_DESC" | "DATE_ASC" | string;

export default function DashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCallSid, setExpandedCallSid] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("DATE_DESC");
  
  // State to manage the absolute dropdown menu container layout
  const [showExportMenu, setShowExportMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchDashboardData = async () => {
    try {
      setIsRefreshing(true);
      const [overviewRes, callsRes] = await Promise.all([
        fetch("/api/dashboard/overview"),
        fetch("/api/dashboard/calls")
      ]);

      if (!overviewRes.ok || !callsRes.ok) {
        throw new Error("Failed to fetch operational data from background services.");
      }

      const overviewData = await overviewRes.json();
      const callsData = await callsRes.json();

      setOverview(overviewData);
      setCalls(callsData.calls || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred loading the dashboard.");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Close the export toggle panel automatically if the user clicks anywhere outside the overlay bounds
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleCallExpand = (callSid: string) => {
    setExpandedCallSid(expandedCallSid === callSid ? null : callSid);
  };

  const handleDownloadPDF = () => {
    setShowExportMenu(false);
    // Let the state engine cycle layout settling before popping print parameters
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Triggers background download execution loop and redirects tab context straight to a pre-composed Gmail compose window
  const handleEmailReport = () => {
    setShowExportMenu(false);
    
    // 1. Calculate metrics metrics snapshot data block
    const totalConcerned = calls.filter(c => c.analysis?.overallMood === "CONCERNED").length;
    const formattedDate = new Date().toLocaleDateString();
    
    const subject = `AmmaCare Live Monitoring Handover Report - ${formattedDate}`;
    
    const bodyRows = [
      "AmmaCare Remote Patient Monitoring Handoff Summary Log",
      "=======================================================",
      `Report Timestamp: ${new Date().toLocaleString()}`,
      `Total Logged Check-ins: ${overview?.summary.totalCallsRouted || calls.length}`,
      `Flagged Discomfort Anomalies (CONCERNED): ${totalConcerned}`,
      `Compliance Rating: ${overview?.summary.globalComplianceRate || 0}%`,
      "",
      "[ACTION REQUIRED]: Please attach the accompanying report PDF file that just downloaded onto your machine before dispatching this message.",
      "",
      "Generated securely via AmmaCare Node UI Software Ecosystem."
    ].join("\n");

    // 2. Build explicit deep link query format directly targeted at Gmail's compose handler interface
    const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyRows)}`;

    // 3. Fire the native download mechanism first so it seamlessly drops into the doctor's asset manager tray
    setTimeout(() => {
      window.print();
    }, 50);

    // 4. Pivot target intent focus directly over to the dynamic browser tab instantiation matrix
    window.open(gmailComposeUrl, "_blank", "noopener,noreferrer");
  };

  const dynamicMoodsList = useMemo(() => {
    const moodsSet = new Set<string>();
    calls.forEach(c => {
      if (c.analysis?.overallMood) {
        moodsSet.add(c.analysis.overallMood.toUpperCase().trim());
      }
    });
    return Array.from(moodsSet);
  }, [calls]);

  const processedCalls = useMemo(() => {
    let result = [...calls];
    
    if (sortBy !== "DATE_DESC" && sortBy !== "DATE_ASC") {
      result = result.filter(c => c.analysis?.overallMood?.toUpperCase() === sortBy);
    }

    return result.sort((a, b) => {
      const timeA = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
      const timeB = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;

      if (sortBy === "DATE_ASC") return timeA - timeB;
      return timeB - timeA;
    });
  }, [calls, sortBy]);

  const dynamicChartData = useMemo(() => {
    const dailyMap: Record<string, { total: number; concerned: number }> = {};
    
    calls.forEach(call => {
      if (!call.scheduledAt || isNaN(Date.parse(call.scheduledAt))) return;
      const dateKey = new Date(call.scheduledAt).toLocaleDateString([], { month: "short", day: "numeric" });
      
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { total: 0, concerned: 0 };
      }
      dailyMap[dateKey].total += 1;
      if (call.analysis?.overallMood === "CONCERNED") {
        dailyMap[dateKey].concerned += 1;
      }
    });

    return Object.entries(dailyMap).map(([day, values]) => ({
      day,
      ...values,
      ratio: values.total > 0 ? Math.round((values.concerned / values.total) * 100) : 0
    })).slice(-7);
  }, [calls]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="flex items-center gap-3 text-slate-600 font-medium animate-pulse">
          <HeartPulse className="w-6 h-6 text-emerald-500 animate-bounce" />
          <span>Synchronizing live healthcare console...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      <style jsx global>{`
        @media print {
          body {
            background-color: #fff !important;
            color: #000 !important;
            font-size: 12px !important;
          }
          header, button, select, .no-print, [role="button"], .export-dropdown-wrapper {
            display: none !important;
          }
          main {
            padding: 0 !important;
            max-width: 100% !important;
          }
          .print-break-inside-none {
            page-break-inside: avoid !important;
          }
          .clinical-accordion-row {
            display: table-row !important;
            background-color: #fafafa !important;
          }
          .clinical-accordion-row * {
            color: #000 !important;
            background-color: transparent !important;
            border-color: #e2e8f0 !important;
          }
        }
      `}</style>

      {/* --- Header --- */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500 text-white p-2 rounded-xl shadow-md shadow-emerald-100">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">AmmaCare Live</h1>
              <p className="text-xs text-slate-500 font-medium">Remote Patient Monitoring Node (Telangana)</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Split Options Action Panel Integration Container */}
            <div className="relative export-dropdown-wrapper" ref={menuRef}>
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-100 transition active:scale-95"
              >
                <FileDown className="w-4 h-4" />
                <span>Export Report</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showExportMenu ? "rotate-180" : ""}`} />
              </button>

              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 font-sans text-sm animate-fadeIn">
                  <button
                    onClick={handleDownloadPDF}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition"
                  >
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span>Download Report PDF</span>
                  </button>
                  <button
                    onClick={handleEmailReport}
                    className="w-full px-4 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 border-t border-slate-100 flex items-center gap-2.5 transition"
                  >
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span>Email Summary Log</span>
                  </button>
                </div>
              )}
            </div>

            <button 
              onClick={fetchDashboardData}
              disabled={isRefreshing}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-emerald-500" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Sync Live"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-3 no-print">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* --- Metrics Panel --- */}
        {overview && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print-break-inside-none">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Calls Routed</span>
                <h3 className="text-3xl font-black text-slate-800">{overview.summary.totalCallsRouted}</h3>
                <p className="text-xs text-slate-500">Twilio SIP trunk routing</p>
              </div>
              <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl no-print">
                <Phone className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Successful Check-ins</span>
                <h3 className="text-3xl font-black text-emerald-600">{overview.summary.successfulCheckins}</h3>
                <p className="text-xs text-slate-500">Completed AI medical forms</p>
              </div>
              <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl no-print">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Critical Escalations</span>
                <h3 className={`text-3xl font-black ${overview.summary.criticalEscalations > 0 ? "text-amber-600" : "text-slate-800"}`}>
                  {overview.summary.criticalEscalations}
                </h3>
                <p className="text-xs text-slate-500">Urgent WhatsApp alerts</p>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 no-print">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Compliance Evaluation</span>
                <h3 className="text-3xl font-black text-slate-800">{overview.summary.globalComplianceRate}%</h3>
                <p className="text-xs text-slate-500">Protocol verification marker</p>
              </div>
              <div className="bg-purple-50 text-purple-600 p-2.5 rounded-xl no-print">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
          </section>
        )}

        {/* --- Trends Chart Block --- */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 print-break-inside-none">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 text-red-600 rounded-xl no-print">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Critical Distress Volatility Index</h2>
              <p className="text-xs text-slate-500">Realtime percentage of daily automated check-ins flagged with anomalous patient discomfort indicators</p>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 pt-4 h-48 items-end border-b border-slate-200 px-2">
            {dynamicChartData.map((dataPoint, index) => (
              <div key={index} className="flex flex-col items-center space-y-2 group h-full justify-end">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] py-1 px-2 rounded absolute mb-40 shadow-xl pointer-events-none z-10 font-bold space-y-0.5 text-center no-print">
                  <div>Distress: <span className="text-red-400">{dataPoint.ratio}%</span></div>
                  <div className="text-[9px] font-normal text-slate-400">({dataPoint.concerned}/{dataPoint.total} Calls)</div>
                </div>

                <div className="w-full bg-slate-100 rounded-t-lg h-full max-h-[140px] flex items-end overflow-hidden">
                  <div 
                    style={{ height: `${Math.max(dataPoint.ratio, dataPoint.total > 0 ? 8 : 0)}%` }} 
                    className={`w-full transition-all duration-500 rounded-t-md ${
                      dataPoint.ratio > 40 ? "bg-red-500" :
                      dataPoint.ratio > 0 ? "bg-amber-500" :
                      "bg-slate-300"
                    }`}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-400 text-center tracking-tight truncate w-full">{dataPoint.day}</span>
              </div>
            ))}
          </div>
        </section>

        {/* --- Log Table Block --- */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 no-print">
            <div>
              <h2 className="text-base font-bold text-slate-800">Operational Logging Stream</h2>
              <p className="text-xs text-slate-500">Chronological ledger of interactive patient check-ins</p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <span>Sort Metrics:</span>
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer uppercase tracking-wide"
              >
                <option value="DATE_DESC">Date: Newest First</option>
                <option value="DATE_ASC">Date: Oldest First</option>
                {dynamicMoodsList.map((mood) => (
                  <option key={mood} value={mood}>
                    {mood === "CONCERNED" ? "🚨 " : "• "} Mood: {mood} Only
                  </option>
                ))}
              </select>
              <span className="bg-slate-200/70 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
                {processedCalls.length} Nodes Filtered
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-6">Target Phone</th>
                  <th className="py-3 px-6">Operational Status</th>
                  <th className="py-3 px-6">Detected Lang</th>
                  <th className="py-3 px-6">Call Timestamp</th>
                  <th className="py-3 px-6 text-right no-print">Audit Insights</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {processedCalls.map((call) => {
                  const isExpanded = expandedCallSid === call.callSid;
                  const isConcerned = call.analysis?.overallMood === "CONCERNED";

                  return (
                    <React.Fragment key={call.callSid}>
                      <tr className={`transition-colors duration-200 print-break-inside-none ${
                        isConcerned 
                          ? "bg-red-50/70 border-l-4 border-l-red-500" 
                          : isExpanded ? "bg-slate-50" : "hover:bg-slate-50/80"
                      }`}>
                        <td className="py-4 px-6 font-semibold text-slate-700">
                          {call.phoneNumber}
                        </td>
                        <td className="py-4 px-6">
                          <span className="text-xs font-bold uppercase">
                            {call.status} {isConcerned ? "(🚨 CONCERNED)" : ""}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-xs text-slate-600 font-medium">
                          {call.languageDetected}
                        </td>
                        <td className="py-4 px-6 text-xs text-slate-500">
                          {call.scheduledAt ? new Date(call.scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "Pending"}
                        </td>
                        <td className="py-4 px-6 text-right no-print">
                          <button
                            onClick={() => toggleCallExpand(call.callSid)}
                            className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition ${
                              isExpanded ? "bg-slate-800 border-slate-800 text-white" : "bg-white text-slate-600"
                            }`}
                          >
                            <span>Review</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>

                      {/* --- ACCORDION BREAKDOWN BOX --- */}
                      {(isExpanded || true) && (
                        <tr className={`clinical-accordion-row ${isExpanded ? "" : "hidden"}`}>
                          <td colSpan={5} className="bg-slate-900 text-white p-6 border-b border-slate-800 print-break-inside-none">
                            <div className="space-y-4">
                              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                                <span className="text-xs font-mono text-slate-400">Log UID: {call.callSid}</span>
                                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                                  Patient Assessment Profile ({call.analysis?.overallMood || "N/A"})
                                </span>
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Decoded Transcript Translation</span>
                                    <p className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs leading-relaxed text-slate-200">
                                      {call.rawTranscript || "No streaming transcript files captured."}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Clinical AI Executive Summary</span>
                                    <p className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs leading-relaxed text-emerald-100">
                                      {call.analysis?.summary || "Waiting for diagnostic engine configuration parameters."}
                                    </p>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Protocol Verification Flags Matrix</span>
                                  {call.analysis?.checklist.map((item, idx) => (
                                    <div key={idx} className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs space-y-1">
                                      <div className="flex justify-between font-bold border-b border-slate-900 pb-1 text-[11px]">
                                        <span className="text-slate-400">Metric Checkpoint</span>
                                        <span className="text-emerald-400">Value: {item.status}</span>
                                      </div>
                                      <p className="text-slate-300 italic">Q: {item.originalQuestion}</p>
                                      <p className="text-slate-400"><strong className="text-slate-500">Context:</strong> {item.extractedDetails}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}