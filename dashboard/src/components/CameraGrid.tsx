"use client";

import { useState, useEffect, useRef } from "react";
import { Camera, Maximize2, Minimize2, AlertTriangle, WifiOff, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface CameraFeed {
  camera_id: string;
  name: string;
  data: string;
}

interface AlertData {
  id: string;
  message: string;
  timestamp: string;
  camera_id: string;
}

interface WsPayload {
  type: string;
  cameras: CameraFeed[];
  alert: AlertData | null;
  audio: string | null;
}

export default function CameraGrid() {
  const { t } = useLanguage();
  const [cameras, setCameras] = useState<CameraFeed[]>([]);
  const [alertCam, setAlertCam] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [maximizedCam, setMaximizedCam] = useState<CameraFeed | null>(null);
  const maximizedCamRef = useRef<CameraFeed | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const alertTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const playSiren = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sine";
      const now = ctx.currentTime;
      
      // Realistic security siren alarm frequency sweep
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.linearRampToValueAtTime(950, now + 0.35);
      osc.frequency.linearRampToValueAtTime(580, now + 0.7);
      osc.frequency.linearRampToValueAtTime(950, now + 1.05);
      osc.frequency.linearRampToValueAtTime(580, now + 1.4);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 1.2);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.4);
      
      osc.start(now);
      osc.stop(now + 1.4);
    } catch (e) {
      console.error("Synthetic siren play error:", e);
    }
  };

  useEffect(() => {
    let ws: WebSocket;
    let reconnectInterval: NodeJS.Timeout;

    const connectWebSocket = () => {
      const wsUrl = process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace("http", "ws") + "/ws" : "ws://localhost:8000/ws";
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log("WebSocket connected");
      };

      ws.onmessage = (event) => {
        try {
          const payload: WsPayload = JSON.parse(event.data);
          if (payload.type === "multi_frame") {
            setCameras(payload.cameras);
            
            // Update maximized camera if it exists
            if (maximizedCamRef.current) {
              const updatedCam = payload.cameras.find(c => c.camera_id === maximizedCamRef.current?.camera_id);
              if (updatedCam) {
                setMaximizedCam(updatedCam);
                maximizedCamRef.current = updatedCam;
              }
            }
            
            if (payload.alert) {
              setAlertCam(payload.alert.camera_id);
              setAlertMessage(payload.alert.message);
              
              // Play dynamic synthetic alarm sound
              playSiren();
              
              if (alertTimeoutRef.current) {
                clearTimeout(alertTimeoutRef.current);
              }
              alertTimeoutRef.current = setTimeout(() => {
                setAlertCam(null);
                setAlertMessage("");
              }, 3000);
            }
          }
        } catch (err) {
          console.error("Error parsing WS data", err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log("WebSocket disconnected. Reconnecting...");
        reconnectInterval = setTimeout(connectWebSocket, 3000);
      };
      
      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        // The onclose handler will handle reconnection
      };
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectInterval);
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
      if (ws) ws.close();
    };
  }, []);

  // Sync maximizedCam state with ref
  useEffect(() => {
    maximizedCamRef.current = maximizedCam;
  }, [maximizedCam]);

  // Handle ESC key to close maximized view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && maximizedCam) {
        setMaximizedCam(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [maximizedCam]);

  return (
    <div className="mb-6">
      {!isConnected && (
        <div className="mb-4 p-3 bg-danger/20 border border-danger text-danger rounded flex items-center gap-2 text-sm">
          <WifiOff className="w-5 h-5" />
          <span>{t("disconnected")}</span>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cameras.length === 0 && isConnected ? (
          <div className="col-span-1 lg:col-span-2 text-center p-10 text-foreground/50 border border-glass-border border-dashed rounded-lg">
            {t("noActiveCameras")}
          </div>
        ) : (
          cameras.map((cam) => {
            const isAlerting = alertCam === cam.camera_id;
            return (
              <div 
                key={cam.camera_id} 
                className={`glass-panel overflow-hidden relative group transition-all duration-300 ${
                  isAlerting ? "alert-pulse ring-2 ring-danger" : ""
                }`}
              >
                <div className="absolute top-0 left-0 right-0 glass-header p-2 flex justify-between items-center z-10">
                  <div className="flex items-center gap-2">
                    <Camera className={`w-4 h-4 ${isAlerting ? "text-danger" : "text-brand"}`} />
                    <span className="text-sm font-semibold">{cam.name}</span>
                  </div>
                  <div className="flex gap-2">
                    {isAlerting && (
                      <span className="flex items-center gap-1 text-xs text-danger font-bold animate-pulse bg-danger/20 px-2 rounded">
                        <AlertTriangle className="w-3 h-3" />
                        {alertMessage}
                      </span>
                    )}
                    <button 
                      className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer"
                      onClick={() => setMaximizedCam(cam)}
                    >
                      <Maximize2 className="w-4 h-4 text-white/70" />
                    </button>
                  </div>
                </div>
                
                <div 
                  className="aspect-video bg-black/40 relative flex items-center justify-center overflow-hidden cursor-pointer"
                  onClick={() => setMaximizedCam(cam)}
                >
                  <img 
                    src={`data:image/jpeg;base64,${cam.data}`} 
                    alt={cam.name}
                    className="w-full h-full object-contain"
                  />
                  {isAlerting && (
                    <div className="absolute inset-0 border-4 border-danger/50 z-20 pointer-events-none"></div>
                  )}
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors pointer-events-none flex items-center justify-center opacity-0 hover:opacity-100">
                    <Maximize2 className="w-12 h-12 text-white/50" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Maximized Camera Modal */}
      {maximizedCam && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
          <div className="glass-header p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Camera className={`w-5 h-5 ${alertCam === maximizedCam.camera_id ? "text-danger" : "text-brand"}`} />
              <span className="text-lg font-semibold">{maximizedCam.name}</span>
              {alertCam === maximizedCam.camera_id && (
                <span className="flex items-center gap-1 text-sm text-danger font-bold animate-pulse bg-danger/20 px-3 py-1 rounded">
                  <AlertTriangle className="w-4 h-4" />
                  {alertMessage}
                </span>
              )}
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setMaximizedCam(null);
              }}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-6 h-6 text-white/70" />
            </button>
          </div>
          
          <div className="flex-1 relative flex items-center justify-center bg-black">
            <img 
              src={`data:image/jpeg;base64,${maximizedCam.data}`} 
              alt={maximizedCam.name}
              className="max-w-full max-h-full object-contain"
            />
            {alertCam === maximizedCam.camera_id && (
              <div className="absolute inset-0 border-8 border-danger/50 z-20 pointer-events-none"></div>
            )}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg text-white/70 text-sm">
              {t("pressEscToClose")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
