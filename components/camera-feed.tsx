"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, Video, Square, Download, Pause, Play, Mic, MicOff, Upload, X, Move, ZoomIn, ZoomOut, Palette } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FilterType = {
  name: string;
  style: string;
};

const imageFilters: FilterType[] = [
  { name: 'Normal', style: 'none' },
  { name: 'Grayscale', style: 'grayscale(100%)' },
  { name: 'High Contrast', style: 'contrast(150%) brightness(120%)' },
  { name: 'Outline', style: 'contrast(200%) brightness(150%) invert(100%)' },
  { name: 'Sepia', style: 'sepia(100%)' },
  { name: 'Blur', style: 'blur(1px)' },
  { name: 'Sharpen', style: 'contrast(150%) brightness(100%) saturate(150%)' },
  { name: 'Invert', style: 'invert(100%)' },
  { name: 'Dark Lines', style: 'contrast(200%) brightness(50%)' },
  { name: 'Sketch', style: 'grayscale(100%) contrast(150%) brightness(120%)' },
];

export default function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [overlayImage, setOverlayImage] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [overlayPosition, setOverlayPosition] = useState({ x: 0, y: 0 });
  const [overlayScale, setOverlayScale] = useState(1);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>(imageFilters[0]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [strobeEnabled, setStrobeEnabled] = useState(false);
  const [strobeSpeed, setStrobeSpeed] = useState(500); // Speed in milliseconds
  const strobeIntervalRef = useRef<NodeJS.Timeout>();

  const downloadBlob = (blob: Blob, mimeType: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    a.href = url;
    a.download = `recording-${new Date().toISOString()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // Clean up the URL object
  };

  const getSupportedMimeType = () => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4'
    ];

    return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Your browser doesn't support camera access. Please use a modern browser.");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      
      // Stop any existing stream
      stopCamera();

      console.log("Requesting camera/audio access...");
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: isAudioEnabled
      });

      // Check if component is still mounted
      if (!videoRef.current) {
        newStream.getTracks().forEach(track => track.stop());
        return;
      }

      console.log("Access granted, setting up stream...");
      streamRef.current = newStream;
      videoRef.current.srcObject = newStream;

      // Wait for the loadedmetadata event before playing
      await new Promise((resolve) => {
        if (!videoRef.current) return;
        videoRef.current.onloadedmetadata = resolve;
      });

      if (!videoRef.current) return;
      await videoRef.current.play().catch((err) => {
        console.error("Error playing video:", err);
        throw err;
      });
      
      console.log("Video stream started playing");
      setIsLoading(false);
    } catch (err: any) {
      console.error("Camera/Audio error:", err);
      let errorMessage = "Failed to access camera/audio. ";
      
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        errorMessage += "Please grant camera/audio permission and try again.";
      } else if (err.name === "NotFoundError") {
        errorMessage += "No camera/audio device found.";
      } else if (err.name === "NotReadableError") {
        errorMessage += "Camera/audio is in use by another application.";
      } else {
        errorMessage += err.message || "Unknown error occurred.";
      }
      
      setError(errorMessage);
      setIsLoading(false);
      stopCamera(); // Clean up any partial stream
    }
  }, [stopCamera, isAudioEnabled]);

  const togglePause = useCallback(() => {
    if (!mediaRecorderRef.current) return;

    try {
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
      } else if (mediaRecorderRef.current.state === "paused") {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
      }
    } catch (err: any) {
      console.error("Pause/Resume error:", err);
      setError("Failed to pause/resume recording: " + (err.message || "Unknown error"));
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) {
      setError("No stream available");
      return;
    }

    try {
      const mimeType = getSupportedMimeType();
      if (!mimeType) {
        throw new Error("No supported recording format found");
      }

      chunksRef.current = [];
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        downloadBlob(blob, mimeType);
        chunksRef.current = [];
        setIsPaused(false);
      };

      // Request data every second to ensure we don't lose data
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setIsPaused(false);
      console.log("Recording started with MIME type:", mimeType);
    } catch (err: any) {
      console.error("Recording error:", err);
      setError("Failed to start recording: " + (err.message || "Unknown error"));
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  }, []);

  const toggleAudio = useCallback(() => {
    setIsAudioEnabled(prev => !prev);
  }, []);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setOverlayImage(e.target?.result as string);
        // Reset position and scale when new image is loaded
        setOverlayPosition({ x: 0, y: 0 });
        setOverlayScale(1);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - overlayPosition.x,
      y: e.clientY - overlayPosition.y
    });
  };

  const handleDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      setOverlayPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY * -0.01;
    const newScale = Math.min(Math.max(0.1, overlayScale + delta), 5);
    setOverlayScale(newScale);
  };

  const generateRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };

  useEffect(() => {
    document.addEventListener('mousemove', handleDrag as any);
    document.addEventListener('mouseup', handleDragEnd);
    return () => {
      document.removeEventListener('mousemove', handleDrag as any);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, dragStart]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera]);

  useEffect(() => {
    // Restart the camera stream when audio setting changes
    if (!isRecording) {
      startCamera();
    }
  }, [isAudioEnabled, startCamera, isRecording]);

  useEffect(() => {
    if (strobeEnabled) {
      strobeIntervalRef.current = setInterval(() => {
        if (overlayRef.current) {
          overlayRef.current.style.visibility = overlayRef.current.style.visibility === 'hidden' ? 'visible' : 'hidden';
        }
      }, strobeSpeed);
    } else {
      if (strobeIntervalRef.current) {
        clearInterval(strobeIntervalRef.current);
        if (overlayRef.current) {
          overlayRef.current.style.visibility = 'visible';
        }
      }
    }

    return () => {
      if (strobeIntervalRef.current) {
        clearInterval(strobeIntervalRef.current);
      }
    };
  }, [strobeEnabled, strobeSpeed]);

  return (
    <div className="fixed inset-0">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-neutral-300">Initializing camera...</p>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {overlayImage && (
        <div
         ref={overlayRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: overlayOpacity,
          }}
        >
          <div
            className="absolute cursor-move"
            style={{
              transform: `translate(${overlayPosition.x}px, ${overlayPosition.y}px) scale(${overlayScale})`,
              transformOrigin: 'center',
            }}
            onMouseDown={handleDragStart}
            onWheel={handleWheel}
          >
            <img
              src={overlayImage}
              alt="Overlay"
              className="max-w-full max-h-full pointer-events-auto"
              style={{ filter: selectedFilter.style }}
              draggable={false}
            />
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          id="image-upload"
          onChange={handleImageUpload}
        />
        <label htmlFor="image-upload">
          <Button
            variant="outline"
            size="icon"
            className="bg-white/10 backdrop-blur-sm"
            asChild
          >
            <span>
              <Upload className="h-4 w-4" />
            </span>
          </Button>
        </label>
        {overlayImage && (
          <>
            <Button
              variant="outline"
              size="icon"
              className="bg-white/10 backdrop-blur-sm"
              onClick={() => setOverlayImage(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="bg-white/10 backdrop-blur-sm"
                >
                  <Palette className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {imageFilters.map((filter) => (
                  <DropdownMenuItem
                    key={filter.name}
                    onClick={() => setSelectedFilter(filter)}
                    className={selectedFilter.name === filter.name ? 'bg-accent' : ''}
                  >
                    {filter.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="icon"
              className="bg-white/10 backdrop-blur-sm"
              onClick={() => setOverlayScale(scale => Math.min(5, scale + 0.1))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="bg-white/10 backdrop-blur-sm"
              onClick={() => setOverlayScale(scale => Math.max(0.1, scale - 0.1))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <input
              type="range"
              min="0.2"
              max="1"
              step="0.1"
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
              className="w-4 h-32 -rotate-180 bg-white/10 backdrop-blur-sm rounded-lg appearance-none cursor-pointer"
              style={{
                writingMode: 'bt-lr',
                WebkitAppearance: 'slider-vertical'
              }}
            />
          </>
        )}
      </div>

      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowGrid(!showGrid)}
          className={showGrid ? 'bg-primary text-primary-foreground' : ''}
        >
          <Square className="h-4 w-4" />
        </Button>
        <Button
          variant={isRecording ? "destructive" : "default"}
          size="icon"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isLoading}
        >
          {isRecording ? <Square className="h-4 w-4" /> : <Video className="h-4 w-4" />}
        </Button>
        {isRecording && (
          <Button
            variant="outline"
            size="icon"
            onClick={togglePause}
            disabled={isLoading}
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
        )}
        {!isRecording && (
          <Button
            variant={isAudioEnabled ? "default" : "secondary"}
            size="icon"
            onClick={toggleAudio}
            disabled={isLoading}
          >
            {isAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>
        )}{overlayImage && 
        <Button
          variant={strobeEnabled ? "destructive" : "default"}
          size="sm"
          onClick={() => setStrobeEnabled(!strobeEnabled)}
        >
          {strobeEnabled ? "Stop" : "Strobe"}
        </Button>}
        {strobeEnabled && (
          <input
            type="range"
            min="500"
            max="2000"
            value={strobeSpeed}
            onChange={(e) => setStrobeSpeed(Number(e.target.value))}
            className="w-32"
          />
        )}
        {strobeEnabled && (
          <span className="text-sm text-gray-500">
            {strobeSpeed}ms
          </span>
        )}
      </div>
 

      {showGrid && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(${generateRandomColor()} 1px, transparent 1px),
              linear-gradient(90deg, ${generateRandomColor()} 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
            opacity: 0.5,
          }}
        />
      )}

      <AlertDialog open={!!error}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Camera Access Error</AlertDialogTitle>
            <AlertDialogDescription>{error}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button onClick={startCamera} className="bg-primary hover:bg-primary/90">
              Retry
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <div className="absolute bottom-4 right-4">
        <Button
          onClick={startCamera}
          variant="secondary"
          size="icon"
          className="rounded-full shadow-lg"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}